-- Weekly Distance Report for Google Maps API Pricing
-- Shows total KM, average per user, and estimated API costs
-- Query last 7 days of GPS data

WITH ordered_points AS (
  -- Order GPS points chronologically and calculate distance between consecutive points
  SELECT
    gt.user_id,
    u.full_name,
    u.email,
    gt.latitude,
    gt.longitude,
    gt.timestamp,
    LAG(gt.latitude) OVER (PARTITION BY gt.user_id ORDER BY gt.timestamp) as prev_latitude,
    LAG(gt.longitude) OVER (PARTITION BY gt.user_id ORDER BY gt.timestamp) as prev_longitude,
    LAG(gt.timestamp) OVER (PARTITION BY gt.user_id ORDER BY gt.timestamp) as prev_timestamp
  FROM public.gps_tracking gt
  LEFT JOIN public.users u ON gt.user_id = u.id
  WHERE gt.date >= CURRENT_DATE - INTERVAL '7 days'
    AND gt.date <= CURRENT_DATE
),
distance_segments AS (
  -- Calculate distance for each segment between consecutive points
  SELECT
    user_id,
    full_name,
    email,
    timestamp,
    CASE
      WHEN prev_latitude IS NOT NULL AND prev_longitude IS NOT NULL
      THEN
        -- Haversine formula: distance in km
        6371 * 2 * ASIN(SQRT(
          POWER(SIN((RADIANS(latitude) - RADIANS(prev_latitude)) / 2), 2) +
          COS(RADIANS(prev_latitude)) * COS(RADIANS(latitude)) *
          POWER(SIN((RADIANS(longitude) - RADIANS(prev_longitude)) / 2), 2)
        ))
      ELSE 0
    END as segment_distance_km
  FROM ordered_points
),
user_distances AS (
  -- Sum distances by user and get other stats
  SELECT
    user_id,
    full_name,
    email,
    COUNT(*) as gps_points_count,
    COUNT(DISTINCT DATE(timestamp)) as active_days,
    ROUND(COALESCE(SUM(segment_distance_km), 0)::NUMERIC, 2) as distance_km
  FROM distance_segments
  GROUP BY user_id, full_name, email
)
SELECT
  'Weekly Summary' as report_type,
  (CURRENT_DATE - INTERVAL '7 days')::TEXT as week_start_date,
  CURRENT_DATE::TEXT as week_end_date,
  COUNT(*)::INTEGER as total_users,
  ROUND(SUM(distance_km)::NUMERIC, 2) as total_distance_km,
  ROUND((SUM(distance_km) * 0.621371)::NUMERIC, 2) as total_distance_miles,
  ROUND((SUM(distance_km) / NULLIF(COUNT(*), 0))::NUMERIC, 2) as avg_distance_per_user_km,
  ROUND((SUM(distance_km) * 0.621371 / NULLIF(COUNT(*), 0))::NUMERIC, 2) as avg_distance_per_user_miles,
  SUM(gps_points_count)::INTEGER as total_gps_points,
  ROUND((SUM(gps_points_count) * 0.005)::NUMERIC, 2) as api_cost_from_requests_usd,
  ROUND((SUM(distance_km) * 0.001)::NUMERIC, 2) as api_cost_from_distance_usd,
  ROUND((SUM(gps_points_count) * 0.005 + SUM(distance_km) * 0.001)::NUMERIC, 2) as total_api_cost_usd
FROM user_distances
UNION ALL
-- Detailed breakdown by user
SELECT
  COALESCE(full_name, email) as report_type,
  (CURRENT_DATE - INTERVAL '7 days')::TEXT as week_start_date,
  CURRENT_DATE::TEXT as week_end_date,
  1::INTEGER as total_users,
  distance_km as total_distance_km,
  ROUND((distance_km * 0.621371)::NUMERIC, 2) as total_distance_miles,
  distance_km as avg_distance_per_user_km,
  ROUND((distance_km * 0.621371)::NUMERIC, 2) as avg_distance_per_user_miles,
  gps_points_count::INTEGER as total_gps_points,
  ROUND((gps_points_count::NUMERIC * 0.005), 4) as api_cost_from_requests_usd,
  ROUND((distance_km * 0.001)::NUMERIC, 4) as api_cost_from_distance_usd,
  ROUND((gps_points_count::NUMERIC * 0.005 + distance_km * 0.001)::NUMERIC, 4) as total_api_cost_usd
FROM user_distances
ORDER BY
  CASE WHEN report_type = 'Weekly Summary' THEN 0 ELSE 1 END,
  total_distance_km DESC;
