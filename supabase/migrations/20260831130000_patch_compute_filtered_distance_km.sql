-- Parity patch for the GPS distance fallback used by payroll.
--
-- SOURCE-OF-TRUTH HIERARCHY (keep in sync with src/utils/gpsDistance.ts):
--   1. attendance.total_distance_km — locked at check-out by the production
--      trajectory engine (validated + road-snapped). AUTHORITATIVE for payroll;
--      get_monthly_expense_summary prefers it whenever present.
--   2. This function — a fallback/compatibility APPROXIMATION used only for
--      days that were never checked out. It is intentionally NOT a full port
--      of the TypeScript trajectory engine (no stationary centroid clustering,
--      no hold/degraded logic, no road snapping); it exists so the fallback
--      cannot produce an obviously inflated number.
--
-- Changes vs the previous version (aligning with the engine defaults):
--   * accuracy IS NULL rows are KEPT with an assumed 50 m accuracy instead of
--     being dropped (historical rows must not erase a day's distance);
--   * legs across a tracking gap (> 180 s) are NO LONGER summed — a blackout
--     is not observed road travel (the app classifies bridged gap distance
--     separately as estimated);
--   * speed cap tightened 160 → 120 km/h (engine SOFT_SPEED_THRESHOLD_KMH;
--     SQL has no reported-speed corroboration, so the conservative cap applies).

CREATE OR REPLACE FUNCTION public.compute_filtered_distance_km(_user_id uuid, _date date)
RETURNS numeric
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  MAX_ACCURACY_METERS constant numeric := 150;
  NULL_ACCURACY_FALLBACK_METERS constant numeric := 50;
  MIN_MOVE_METERS_FLOOR constant numeric := 10;
  MAX_SPEED_KMH constant numeric := 120;
  MAX_TIME_GAP_SECONDS constant numeric := 180;
  PING_PONG_OUTLIER_M constant numeric := 300;
  PING_PONG_RETURN_M constant numeric := 150;

  r RECORD;
  cleaned jsonb := '[]'::jsonb;
  prev jsonb;
  dist_m numeric;
  required_m numeric;
  gap_sec numeric;
  speed_kmh numeric;

  deduped jsonb := '[]'::jsonb;
  i int;
  n int;
  curr jsonb;
  nxt jsonb;
  out_m numeric;
  back_m numeric;
  span_m numeric;

  total_m numeric := 0;
BEGIN
  -- Pass 1: accuracy gate (null kept with fallback) + stateful sequential filter
  FOR r IN
    SELECT latitude::numeric AS lat, longitude::numeric AS lng,
           COALESCE(accuracy::numeric, NULL_ACCURACY_FALLBACK_METERS) AS acc,
           timestamp AS ts
    FROM public.gps_tracking
    WHERE user_id = _user_id
      AND date::date = _date
      AND COALESCE(accuracy, NULL_ACCURACY_FALLBACK_METERS) <= MAX_ACCURACY_METERS
    ORDER BY timestamp ASC
  LOOP
    IF jsonb_array_length(cleaned) = 0 THEN
      cleaned := cleaned || jsonb_build_object('lat', r.lat, 'lng', r.lng, 'acc', r.acc, 'ts', r.ts, 'gap', false);
      CONTINUE;
    END IF;

    prev := cleaned -> (jsonb_array_length(cleaned) - 1);

    dist_m := 6371000 * 2 * asin(sqrt(
      power(sin(radians((r.lat - (prev->>'lat')::numeric) / 2)), 2) +
      cos(radians((prev->>'lat')::numeric)) * cos(radians(r.lat)) *
      power(sin(radians((r.lng - (prev->>'lng')::numeric) / 2)), 2)
    ));

    required_m := GREATEST(MIN_MOVE_METERS_FLOOR,
      (prev->>'acc')::numeric + r.acc);

    IF dist_m < required_m THEN
      CONTINUE; -- stationary jitter, do not advance anchor
    END IF;

    gap_sec := EXTRACT(EPOCH FROM (r.ts - (prev->>'ts')::timestamptz));

    IF gap_sec > MAX_TIME_GAP_SECONDS THEN
      -- Tracking gap: keep the point as a new segment start but flag it so
      -- the leg INTO it is never summed as observed travel.
      cleaned := cleaned || jsonb_build_object('lat', r.lat, 'lng', r.lng, 'acc', r.acc, 'ts', r.ts, 'gap', true);
      CONTINUE;
    END IF;

    speed_kmh := CASE WHEN gap_sec > 0 THEN (dist_m / 1000.0) / (gap_sec / 3600.0) ELSE 0 END;

    IF speed_kmh <= MAX_SPEED_KMH THEN
      cleaned := cleaned || jsonb_build_object('lat', r.lat, 'lng', r.lng, 'acc', r.acc, 'ts', r.ts, 'gap', false);
    END IF;
  END LOOP;

  -- Pass 2: ping-pong outlier removal
  n := jsonb_array_length(cleaned);
  i := 0;
  WHILE i < n LOOP
    curr := cleaned -> i;
    prev := CASE WHEN jsonb_array_length(deduped) > 0
                 THEN deduped -> (jsonb_array_length(deduped) - 1) ELSE NULL END;
    nxt := CASE WHEN i + 1 < n THEN cleaned -> (i + 1) ELSE NULL END;

    IF prev IS NOT NULL AND nxt IS NOT NULL THEN
      out_m := 6371000 * 2 * asin(sqrt(
        power(sin(radians(((curr->>'lat')::numeric - (prev->>'lat')::numeric) / 2)), 2) +
        cos(radians((prev->>'lat')::numeric)) * cos(radians((curr->>'lat')::numeric)) *
        power(sin(radians(((curr->>'lng')::numeric - (prev->>'lng')::numeric) / 2)), 2)
      ));
      back_m := 6371000 * 2 * asin(sqrt(
        power(sin(radians(((nxt->>'lat')::numeric - (curr->>'lat')::numeric) / 2)), 2) +
        cos(radians((curr->>'lat')::numeric)) * cos(radians((nxt->>'lat')::numeric)) *
        power(sin(radians(((nxt->>'lng')::numeric - (curr->>'lng')::numeric) / 2)), 2)
      ));
      span_m := 6371000 * 2 * asin(sqrt(
        power(sin(radians(((nxt->>'lat')::numeric - (prev->>'lat')::numeric) / 2)), 2) +
        cos(radians((prev->>'lat')::numeric)) * cos(radians((nxt->>'lat')::numeric)) *
        power(sin(radians(((nxt->>'lng')::numeric - (prev->>'lng')::numeric) / 2)), 2)
      ));
      IF out_m >= PING_PONG_OUTLIER_M AND back_m >= PING_PONG_OUTLIER_M AND span_m <= PING_PONG_RETURN_M THEN
        i := i + 1;
        CONTINUE;
      END IF;
    END IF;

    deduped := deduped || curr;
    i := i + 1;
  END LOOP;

  -- Distance sum: intra-segment legs only (gap-start legs excluded)
  n := jsonb_array_length(deduped);
  i := 1;
  WHILE i < n LOOP
    prev := deduped -> (i - 1);
    curr := deduped -> i;
    IF (curr->>'gap')::boolean IS NOT TRUE THEN
      total_m := total_m + 6371000 * 2 * asin(sqrt(
        power(sin(radians(((curr->>'lat')::numeric - (prev->>'lat')::numeric) / 2)), 2) +
        cos(radians((prev->>'lat')::numeric)) * cos(radians((curr->>'lat')::numeric)) *
        power(sin(radians(((curr->>'lng')::numeric - (prev->>'lng')::numeric) / 2)), 2)
      ));
    END IF;
    i := i + 1;
  END LOOP;

  RETURN ROUND(total_m / 1000.0, 4);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.compute_filtered_distance_km(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.compute_filtered_distance_km(uuid, date) TO authenticated, service_role;
