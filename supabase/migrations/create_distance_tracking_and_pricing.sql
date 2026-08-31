-- Create tables and functions for distance tracking and Google Maps API usage billing

-- 1. Track Google Maps API usage for billing
CREATE TABLE IF NOT EXISTS public.google_maps_api_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  api_type TEXT NOT NULL, -- 'snap_gps_route', 'directions', 'roads'
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  request_count INTEGER NOT NULL DEFAULT 1,
  distance_meters DECIMAL(12,2), -- For distance-based APIs
  cost_usd DECIMAL(10,4), -- Calculated cost
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.google_maps_api_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view API usage" ON public.google_maps_api_usage FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Admins can manage API usage" ON public.google_maps_api_usage FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- 2. Function to calculate weekly distance summary
CREATE OR REPLACE FUNCTION public.get_weekly_distance_summary(_start_date DATE DEFAULT NULL, _end_date DATE DEFAULT NULL)
RETURNS TABLE (
  summary_date DATE,
  total_users INTEGER,
  total_distance_km DECIMAL,
  average_distance_per_user_km DECIMAL,
  average_distance_per_user_miles DECIMAL,
  api_requests_count INTEGER,
  estimated_api_cost_usd DECIMAL
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start_date DATE;
  v_end_date DATE;
BEGIN
  -- Set defaults: last week if not provided
  v_start_date := COALESCE(_start_date, CURRENT_DATE - INTERVAL '7 days');
  v_end_date := COALESCE(_end_date, CURRENT_DATE);

  RETURN QUERY
  SELECT
    CURRENT_DATE as summary_date,
    COUNT(DISTINCT gt.user_id)::INTEGER as total_users,
    COALESCE(SUM(CAST(SUBSTRING(rt.snapped_distance FROM '\d+\.\d+') AS DECIMAL)) / 1000, 0)::DECIMAL as total_distance_km,
    CASE
      WHEN COUNT(DISTINCT gt.user_id) > 0
      THEN (COALESCE(SUM(CAST(SUBSTRING(rt.snapped_distance FROM '\d+\.\d+') AS DECIMAL)) / 1000, 0) / COUNT(DISTINCT gt.user_id))::DECIMAL
      ELSE 0::DECIMAL
    END as average_distance_per_user_km,
    CASE
      WHEN COUNT(DISTINCT gt.user_id) > 0
      THEN (COALESCE(SUM(CAST(SUBSTRING(rt.snapped_distance FROM '\d+\.\d+') AS DECIMAL)) / 1000, 0) * 0.621371 / COUNT(DISTINCT gt.user_id))::DECIMAL
      ELSE 0::DECIMAL
    END as average_distance_per_user_miles,
    COUNT(*)::INTEGER as api_requests_count,
    (COUNT(*) * 0.005)::DECIMAL as estimated_api_cost_usd -- Rough estimate: $0.005 per request
  FROM public.gps_tracking gt
  LEFT JOIN public.google_maps_api_usage gmau ON gt.date = gmau.date AND gt.user_id = gmau.user_id AND gmau.api_type = 'snap_gps_route'
  LEFT JOIN json_to_record((SELECT json_object_agg('snapped_distance', distance_meters) FROM public.google_maps_api_usage WHERE api_type = 'snap_gps_route' AND date BETWEEN v_start_date AND v_end_date)) AS rt(snapped_distance TEXT) ON TRUE
  WHERE gt.date BETWEEN v_start_date AND v_end_date;
END;
$$;

-- 3. Function to log Google Maps API usage
CREATE OR REPLACE FUNCTION public.log_google_maps_usage(
  _api_type TEXT,
  _user_id UUID,
  _distance_meters DECIMAL DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cost_usd DECIMAL;
  v_date DATE;
BEGIN
  v_date := CURRENT_DATE;

  -- Calculate cost based on API type
  -- Google Maps Routes API: ~$0.005 per request + distance charges
  v_cost_usd := CASE
    WHEN _api_type = 'snap_gps_route' THEN 0.005 -- Base cost per snap request
    WHEN _api_type = 'directions' THEN 0.01
    WHEN _api_type = 'roads' THEN 0.01
    ELSE 0.01
  END;

  -- Add distance-based cost for snap_gps_route if distance provided
  IF _api_type = 'snap_gps_route' AND _distance_meters IS NOT NULL THEN
    v_cost_usd := v_cost_usd + (_distance_meters / 1000 * 0.001); -- $0.001 per km
  END IF;

  -- Log or update usage
  INSERT INTO public.google_maps_api_usage (date, api_type, user_id, request_count, distance_meters, cost_usd)
  VALUES (v_date, _api_type, _user_id, 1, _distance_meters, v_cost_usd)
  ON CONFLICT (date, api_type, user_id) DO UPDATE
  SET
    request_count = google_maps_api_usage.request_count + 1,
    distance_meters = COALESCE(google_maps_api_usage.distance_meters, 0) + COALESCE(_distance_meters, 0),
    cost_usd = google_maps_api_usage.cost_usd + v_cost_usd,
    updated_at = NOW();
END;
$$;

-- 4. Simpler view for weekly analytics
CREATE OR REPLACE VIEW public.weekly_distance_report AS
SELECT
  DATE_TRUNC('week', gt.date)::DATE as week_start,
  COUNT(DISTINCT gt.user_id) as total_users,
  COUNT(DISTINCT gt.date) as active_days,
  ROUND(SUM(gt.distance_km)::NUMERIC, 2) as total_distance_km,
  ROUND(AVG(gt.distance_km)::NUMERIC, 2) as avg_distance_per_user_km,
  ROUND(COUNT(*)::NUMERIC / NULLIF(COUNT(DISTINCT gt.user_id), 0), 0)::INTEGER as avg_points_per_user
FROM (
  SELECT
    date,
    user_id,
    EXTRACT(DAY FROM date) as day,
    COUNT(*) as point_count,
    -- Haversine distance calculation
    ROUND(
      SUM(
        CASE
          WHEN LAG(latitude) OVER (PARTITION BY user_id, date ORDER BY timestamp) IS NOT NULL
          THEN
            6371000 * 2 * ASIN(SQRT(
              POWER(SIN((RADIANS(latitude) - RADIANS(LAG(latitude) OVER (PARTITION BY user_id, date ORDER BY timestamp))) / 2), 2) +
              COS(RADIANS(LAG(latitude) OVER (PARTITION BY user_id, date ORDER BY timestamp))) * COS(RADIANS(latitude)) *
              POWER(SIN((RADIANS(longitude) - RADIANS(LAG(longitude) OVER (PARTITION BY user_id, date ORDER BY timestamp))) / 2), 2)
            )) / 1000
          ELSE 0
        END
      )::NUMERIC, 2
    ) as distance_km
  FROM public.gps_tracking
  GROUP BY date, user_id
) gt
GROUP BY DATE_TRUNC('week', gt.date);

GRANT SELECT ON public.weekly_distance_report TO authenticated;
