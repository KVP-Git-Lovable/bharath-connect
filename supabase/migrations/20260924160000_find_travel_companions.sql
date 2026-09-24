-- Who else went to the same place at the same time.
--
-- A rep can only SELECT their own activities, so they cannot discover that a
-- colleague was on the same trip. This answers that one narrow question
-- without widening that policy: it returns a colleague's name and the id of
-- the activity to link to, and nothing else about their record.
--
-- The caller must own the activity they are asking about, so this cannot be
-- used to browse other people's days.
--
-- Read-only. Creates no table and changes no data. Safe to re-run.

CREATE OR REPLACE FUNCTION public.find_travel_companions(_activity_id uuid)
RETURNS TABLE (
  activity_id uuid,
  user_id uuid,
  full_name text,
  activity_label text,
  start_time timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH me AS (
    SELECT a.* FROM public.activity_events a
    WHERE a.id = _activity_id
      AND (a.user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role))
  )
  SELECT
    o.id,
    o.user_id,
    COALESCE(u.full_name, 'Unnamed'),
    NULLIF(concat_ws(' · ', o.activity_code, o.activity_name), ''),
    o.start_time
  FROM me
  JOIN public.activity_events o
    ON o.user_id <> me.user_id
   AND o.activity_date = me.activity_date
   -- Same destination, however this activity records one.
   AND (
        (me.lead_id     IS NOT NULL AND o.lead_id     = me.lead_id)
     OR (me.site_id     IS NOT NULL AND o.site_id     = me.site_id)
     OR (me.customer_id IS NOT NULL AND o.customer_id = me.customer_id)
   )
  JOIN public.users u ON u.id = o.user_id AND u.is_active
  ORDER BY o.start_time NULLS LAST
  LIMIT 20;
$$;

REVOKE EXECUTE ON FUNCTION public.find_travel_companions(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.find_travel_companions(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.find_travel_companions(uuid) IS
  'Colleagues with an activity at the same destination on the same day, for linking a shared journey. Caller must own the activity.';
