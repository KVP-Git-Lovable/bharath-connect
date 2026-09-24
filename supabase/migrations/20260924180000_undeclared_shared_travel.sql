-- The approver's backstop for a journey nobody declared.
--
-- Phases 1 and 2 let a rep say they shared a ride. This finds the pairs where
-- neither of them said so: two people, same destination, same day, both still
-- marked 'solo', and both being paid for the trip. That is either two genuine
-- separate journeys or one journey claimed twice, and only the approver can
-- tell which — so this reports, it never adjusts an amount.
--
-- A manager cannot SELECT a reportee's activities (see
-- restrict_lead_activity_visibility.sql), and a pair by definition spans two
-- people, so this has to run as definer. It is scoped to exactly who the
-- caller may already approve for: everyone if admin, otherwise their own
-- reporting line.
--
-- Read-only. Creates no table and changes no data. Safe to re-run.

CREATE OR REPLACE FUNCTION public.find_undeclared_shared_travel(_year_month text)
RETURNS TABLE (
  activity_date date,
  destination text,
  a_activity_id uuid,
  a_user_id uuid,
  a_name text,
  a_amount numeric,
  b_activity_id uuid,
  b_user_id uuid,
  b_name text,
  b_amount numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH visible AS (
    -- An admin approves for everyone.
    SELECT u.id FROM public.users u
    WHERE public.has_role(auth.uid(), 'admin'::app_role)
    UNION
    -- Everyone else, only their own reporting line — the same set they
    -- already see in Team expenses.
    SELECT h.user_id FROM public.get_user_hierarchy(auth.uid()) h
  ),
  leg AS (
    SELECT a.id, a.user_id, a.activity_date, a.activity_name,
           a.lead_id, a.site_id, a.customer_id, a.manual_fare_amount
    FROM public.activity_events a
    WHERE a.user_id IN (SELECT id FROM visible)
      AND to_char(a.activity_date, 'YYYY-MM') = _year_month
      -- Anyone who declared a role has already been handled.
      AND a.travel_role = 'solo'
      AND (a.lead_id IS NOT NULL OR a.site_id IS NOT NULL OR a.customer_id IS NOT NULL)
  ),
  pair AS (
    -- a.id < b.id so one journey is reported once, not once from each side.
    SELECT x.id AS a_id, x.user_id AS a_user, y.id AS b_id, y.user_id AS b_user,
           x.activity_date,
           COALESCE(l.name, s.site_name, c.name, x.activity_name) AS destination,
           x.manual_fare_amount AS a_fare, y.manual_fare_amount AS b_fare
    FROM leg x
    JOIN leg y
      ON y.activity_date = x.activity_date
     AND y.user_id <> x.user_id
     AND x.id < y.id
     AND (
          (x.lead_id     IS NOT NULL AND y.lead_id     = x.lead_id)
       OR (x.site_id     IS NOT NULL AND y.site_id     = x.site_id)
       OR (x.customer_id IS NOT NULL AND y.customer_id = x.customer_id)
     )
    LEFT JOIN public.leads l         ON l.id = x.lead_id
    LEFT JOIN public.project_sites s ON s.id = x.site_id
    LEFT JOIN public.customers c     ON c.id = x.customer_id
  )
  SELECT p.activity_date,
         p.destination,
         p.a_id, p.a_user, COALESCE(ua.full_name, 'Unnamed'), amt_a.v,
         p.b_id, p.b_user, COALESCE(ub.full_name, 'Unnamed'), amt_b.v
  FROM pair p
  JOIN public.users ua ON ua.id = p.a_user AND ua.is_active
  JOIN public.users ub ON ub.id = p.b_user AND ub.is_active
  -- Priced with the same rules as payroll, and only for the handful of pairs
  -- that got this far, so the per-activity call stays cheap.
  CROSS JOIN LATERAL (
    SELECT COALESCE(p.a_fare, (public.get_activity_travel_expense(p.a_id) ->> 'amount')::numeric) AS v
  ) amt_a
  CROSS JOIN LATERAL (
    SELECT COALESCE(p.b_fare, (public.get_activity_travel_expense(p.b_id) ->> 'amount')::numeric) AS v
  ) amt_b
  -- Only worth an approver's time if both sides are actually being paid.
  WHERE amt_a.v > 0 AND amt_b.v > 0
  ORDER BY p.activity_date DESC, p.destination
  LIMIT 100;
$$;

REVOKE EXECUTE ON FUNCTION public.find_undeclared_shared_travel(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.find_undeclared_shared_travel(text) TO authenticated, service_role;

COMMENT ON FUNCTION public.find_undeclared_shared_travel(text) IS
  'Pairs of colleagues paid separately for what looks like one journey, for the approver to check. Scoped to the caller''s reporting line, or all users for an admin.';
