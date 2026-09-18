-- User-wise Android app-usage tracking.
--
-- Two tables, deliberately:
--   app_usage_sessions   one row per process launch; carries the lifecycle
--                        facts (status, close reason, app/OS version) and a
--                        trigger-derived totals cache
--   app_usage_intervals  one row per foreground and per background segment;
--                        carries the time
--
-- Three states exist in the capture layer, and only two are ever stored:
-- foreground (an Activity is started), background (the process is alive with no
-- Activity started), and not-running (no process at all). Not-running is never
-- written -- it is simply the gap between rows. That is what keeps background
-- time honest: it can only ever be time the process was actually alive, so a
-- phone in a drawer overnight after a force stop contributes nothing.
--
-- BACKGROUND TIME IS NOT CAPPED. A background interval runs from the moment the
-- app leaves the foreground until it comes back, or until the process dies. On
-- a beat day the location foreground service legitimately keeps the process
-- alive for hours, and that is recorded as real background time -- the
-- gps_service_recent flag is there so reporting can separate it. If a per-gap
-- cap is ever wanted, add it as a policy function and bump usage_policy_version
-- rather than rewriting history.
--
-- DAY ATTRIBUTION: a GPS fix is a point, so stamping gps_tracking.date works.
-- A usage interval is a duration, and one running 23:40 -> 00:20 belongs to two
-- days. The client therefore splits intervals at LOCAL midnight before upload
-- and stamps each half with its own local `date`, the same way gps_tracking
-- carries a capture-time local date. All duration reporting aggregates
-- app_usage_intervals.date; app_usage_sessions.date is the day a session BEGAN
-- and is only valid for counting sessions.

-- ============================================================== sessions ====

CREATE TABLE public.app_usage_sessions (
  -- Client-supplied: the device generates it before any network round trip so
  -- the offline queue can insert intervals that reference it.
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  device_id uuid NOT NULL,
  started_at timestamptz NOT NULL,
  ended_at timestamptz,
  date date NOT NULL,                       -- LOCAL calendar day of started_at
  tz_offset_minutes smallint NOT NULL,
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','closed','reconciled','abandoned')),
  end_reason text,
  end_confidence text
    CHECK (end_confidence IS NULL OR end_confidence IN ('observed','exit_record','inferred')),
  exit_reason_code integer,
  exit_importance integer,
  uncertainty_ms bigint NOT NULL DEFAULT 0,
  -- Derived caches, maintained by trigger from app_usage_intervals. They are
  -- deliberately NOT in the client's UPDATE grant.
  foreground_seconds integer NOT NULL DEFAULT 0 CHECK (foreground_seconds >= 0),
  background_seconds integer NOT NULL DEFAULT 0 CHECK (background_seconds >= 0),
  interval_count integer NOT NULL DEFAULT 0 CHECK (interval_count BETWEEN 0 AND 2000),
  last_heartbeat_at timestamptz,
  app_version text,
  os_version text,
  device_model text,
  platform text NOT NULL DEFAULT 'android',
  boot_id uuid,
  pid integer,
  source text NOT NULL DEFAULT 'native' CHECK (source IN ('native','web')),
  usage_policy_version smallint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),   -- SERVER clock: skew detector
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT app_usage_sessions_time_order
    CHECK (ended_at IS NULL OR ended_at >= started_at),
  CONSTRAINT app_usage_sessions_sealed_is_complete
    CHECK (status = 'open' OR (ended_at IS NOT NULL AND end_reason IS NOT NULL))
);

CREATE INDEX idx_app_usage_sessions_user_date
  ON public.app_usage_sessions (user_id, date);
CREATE INDEX idx_app_usage_sessions_user_started
  ON public.app_usage_sessions (user_id, started_at DESC);
-- Reconcile-on-next-launch looks up "is anything still open for this device".
CREATE INDEX idx_app_usage_sessions_open
  ON public.app_usage_sessions (user_id, device_id) WHERE status = 'open';

CREATE TRIGGER trg_app_usage_sessions_updated_at
  BEFORE UPDATE ON public.app_usage_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================= intervals ====

CREATE TABLE public.app_usage_intervals (
  -- DETERMINISTIC, derived on the client from
  -- (device_id, session_id, boot_id, start_elapsed, kind, day). A replayed
  -- offline batch therefore produces the same id, and the upsert's
  -- ON CONFLICT DO NOTHING makes double-counting structurally impossible
  -- rather than merely unlikely.
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES public.app_usage_sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,  -- denormalised for RLS + index
  device_id uuid NOT NULL,
  seq integer NOT NULL CHECK (seq >= 1),
  kind text NOT NULL CHECK (kind IN ('foreground','background')),
  started_at timestamptz NOT NULL,
  ended_at timestamptz NOT NULL,
  date date NOT NULL,                       -- LOCAL day; always the day of started_at
  tz_offset_minutes smallint NOT NULL,
  duration_seconds integer GENERATED ALWAYS AS
    (GREATEST(0, (EXTRACT(EPOCH FROM (ended_at - started_at)))::integer)) STORED,
  interactive_ms bigint,                    -- foreground only: time actually topmost
  coalesced_count integer NOT NULL DEFAULT 0,
  source text NOT NULL DEFAULT 'observed'
    CHECK (source IN ('observed','heartbeat','reconciled','web')),
  end_confidence text NOT NULL DEFAULT 'observed'
    CHECK (end_confidence IN ('observed','exit_record','inferred')),
  uncertainty_ms bigint NOT NULL DEFAULT 0,
  start_reason text,
  end_reason text,
  is_midnight_split boolean NOT NULL DEFAULT false,
  gps_service_recent boolean,               -- was the location FGS alive at the time
  clock_jump_ms bigint NOT NULL DEFAULT 0,
  boot_id uuid,
  app_version text,
  os_version text,
  created_at timestamptz NOT NULL DEFAULT now(),   -- SERVER clock
  CONSTRAINT app_usage_intervals_time_order CHECK (ended_at >= started_at),
  CONSTRAINT app_usage_intervals_sane_length
    CHECK (ended_at - started_at <= interval '24 hours'),
  CONSTRAINT app_usage_intervals_seq_unique UNIQUE (session_id, seq, kind, date)
);

-- Mirrors idx_gps_tracking_user_date: same access pattern, same shape.
CREATE INDEX idx_app_usage_intervals_user_date
  ON public.app_usage_intervals (user_id, date);
-- Covering index: this is what makes get_app_usage_summary an index-only scan.
CREATE INDEX idx_app_usage_intervals_user_date_kind
  ON public.app_usage_intervals (user_id, date, kind) INCLUDE (duration_seconds);
CREATE INDEX idx_app_usage_intervals_session
  ON public.app_usage_intervals (session_id, seq);

-- ====================================================== totals maintenance ==

-- SECURITY DEFINER so it can write totals the client has no grant on. The cache
-- therefore cannot drift from the interval rows it is derived from.
CREATE OR REPLACE FUNCTION public.app_usage_recalc_session()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_session uuid := COALESCE(NEW.session_id, OLD.session_id);
BEGIN
  UPDATE public.app_usage_sessions s
     SET foreground_seconds = COALESCE(a.fg, 0),
         background_seconds = COALESCE(a.bg, 0),
         interval_count     = COALESCE(a.n, 0),
         updated_at         = now()
    FROM (
      SELECT SUM(duration_seconds) FILTER (WHERE kind = 'foreground') AS fg,
             SUM(duration_seconds) FILTER (WHERE kind = 'background') AS bg,
             COUNT(*) AS n
        FROM public.app_usage_intervals
       WHERE session_id = v_session
    ) a
   WHERE s.id = v_session;
  RETURN NULL;
END
$function$;

REVOKE EXECUTE ON FUNCTION public.app_usage_recalc_session() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_app_usage_recalc
  AFTER INSERT OR UPDATE OR DELETE ON public.app_usage_intervals
  FOR EACH ROW EXECUTE FUNCTION public.app_usage_recalc_session();

-- ==================================================== grants and policies ===

GRANT SELECT, INSERT ON public.app_usage_sessions  TO authenticated;
GRANT SELECT, INSERT ON public.app_usage_intervals TO authenticated;

-- Append-then-seal. Postgres RLS is row-scoped, not column-scoped, so this
-- explicit column list is the ONLY thing stopping a client from rewriting
-- foreground_seconds while sealing a session. Any future migration that widens
-- it is the regression to watch for.
GRANT UPDATE (ended_at, status, end_reason, end_confidence, exit_reason_code,
              exit_importance, uncertainty_ms, last_heartbeat_at)
  ON public.app_usage_sessions TO authenticated;

GRANT ALL ON public.app_usage_sessions  TO service_role;
GRANT ALL ON public.app_usage_intervals TO service_role;
-- No DELETE for authenticated: retention runs as service_role.

ALTER TABLE public.app_usage_sessions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_usage_intervals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users insert own app usage sessions"
  ON public.app_usage_sessions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users read own app usage sessions"
  ON public.app_usage_sessions FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins read all app usage sessions"
  ON public.app_usage_sessions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Managers read team app usage sessions"
  ON public.app_usage_sessions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.get_user_hierarchy(auth.uid()) h
                 WHERE h.user_id = app_usage_sessions.user_id));

-- USING requires status = 'open', so a sealed session is immutable to every
-- non-service role.
CREATE POLICY "Users seal own open app usage sessions"
  ON public.app_usage_sessions FOR UPDATE TO authenticated
  USING (auth.uid() = user_id AND status = 'open')
  WITH CHECK (auth.uid() = user_id);

-- The parent check stops a client parenting its intervals onto someone else's
-- session id.
CREATE POLICY "Users insert own app usage intervals"
  ON public.app_usage_intervals FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM public.app_usage_sessions s
                 WHERE s.id = app_usage_intervals.session_id
                   AND s.user_id = auth.uid())
  );

CREATE POLICY "Users read own app usage intervals"
  ON public.app_usage_intervals FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins read all app usage intervals"
  ON public.app_usage_intervals FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Managers read team app usage intervals"
  ON public.app_usage_intervals FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.get_user_hierarchy(auth.uid()) h
                 WHERE h.user_id = app_usage_intervals.user_id));

-- ============================================================ read path =====

-- One row per LOCAL day, so the same function serves the two summary cards and
-- daily/weekly/monthly/date-range reporting without a second RPC.
--
-- Deliberately not a client-side sum over raw rows: PostgREST caps a select at
-- 1000 rows, and a month for a 15-person team is tens of thousands. The page
-- already carries a hand-rolled pager for GPS whose truncation flag is not
-- surfaced in the UI; repeating that here would put a silent truncation hazard
-- on a number whose entire value is that it is exact.
CREATE OR REPLACE FUNCTION public.get_app_usage_summary(
  _user_id uuid,
  _from date,
  _to date
)
RETURNS TABLE (
  day date,
  foreground_seconds bigint,
  background_seconds bigint,
  session_count bigint,
  device_count bigint,
  inferred_seconds bigint,
  first_foreground_at timestamptz,
  last_foreground_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF _user_id IS DISTINCT FROM auth.uid()
     AND NOT public.has_role(auth.uid(), 'admin'::public.app_role)
     AND NOT EXISTS (SELECT 1 FROM public.get_user_hierarchy(auth.uid()) h
                     WHERE h.user_id = _user_id)
  THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF _from IS NULL OR _to IS NULL OR _to < _from THEN
    RAISE EXCEPTION 'Invalid date range';
  END IF;

  IF (_to - _from) > 400 THEN
    RAISE EXCEPTION 'Date range too wide';
  END IF;

  RETURN QUERY
  SELECT
    i.date AS day,
    COALESCE(SUM(i.duration_seconds) FILTER (WHERE i.kind = 'foreground'), 0)::bigint,
    COALESCE(SUM(i.duration_seconds) FILTER (WHERE i.kind = 'background'), 0)::bigint,
    COUNT(DISTINCT i.session_id)::bigint,
    COUNT(DISTINCT i.device_id)::bigint,
    COALESCE(SUM(i.duration_seconds) FILTER (WHERE i.end_confidence = 'inferred'), 0)::bigint,
    MIN(i.started_at) FILTER (WHERE i.kind = 'foreground'),
    MAX(i.ended_at)   FILTER (WHERE i.kind = 'foreground')
  FROM public.app_usage_intervals i
  WHERE i.user_id = _user_id
    AND i.date BETWEEN _from AND _to
  GROUP BY i.date
  ORDER BY i.date;
END
$function$;

REVOKE EXECUTE ON FUNCTION public.get_app_usage_summary(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_app_usage_summary(uuid, date, date) TO authenticated, service_role;

-- ======================================================= permission registry =

-- Registry only for now: GPSTracking.tsx gates on the module, not on fields, so
-- nothing enforces this yet. Registered so it is visible to admins and is not a
-- later schema surprise.
INSERT INTO public.permission_definitions (name, label, type, parent_module, sort_order)
VALUES ('field_gps_app_usage', 'App Usage', 'field', 'module_gps_tracking', 4)
ON CONFLICT (name) DO NOTHING;
