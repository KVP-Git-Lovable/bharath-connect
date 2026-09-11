-- lovable-cron-fallback-reviewed: 96 runs/day; report subscriptions fire at user-chosen times of day, so due-checks must run at 15-minute granularity to honour the configured fire_time
-- Notifications & Reports — Phase 6: Report Subscriptions
-- A subscription schedules one of SBEE's reports. At each run every recipient
-- gets a notification (in-app + optional push) with headline numbers for
-- their own team, and a link that opens the full report for that exact
-- period. Additive only.

-- 1. Tables -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.report_subscriptions (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name               text        NOT NULL,
  module             text        NOT NULL
    CHECK (module IN ('attendance','activities','leave','expenses','travel-expense','leads','opportunities','procurement')),
  saved_report_name  text,
  report_config      jsonb       NOT NULL DEFAULT '{}'::jsonb,
  period             text        NOT NULL DEFAULT 'yesterday'
    CHECK (period IN ('today','yesterday','last_7_days','current_week','last_week','month_to_date','last_month')),
  cadence            text        NOT NULL DEFAULT 'daily'
    CHECK (cadence IN ('daily','mon_fri','mon_sat','weekly','monthly')),
  fire_time          time        NOT NULL DEFAULT '09:00',
  fire_weekday       int         CHECK (fire_weekday BETWEEN 1 AND 7),
  fire_monthday      int         CHECK (fire_monthday BETWEEN 1 AND 31),
  timezone           text        NOT NULL DEFAULT 'Asia/Kolkata',
  recipient_mode     text        NOT NULL DEFAULT 'users'
    CHECK (recipient_mode IN ('users','role','admins','managers')),
  recipient_user_ids uuid[]      NOT NULL DEFAULT '{}',
  recipient_role     text,
  push_to_phone      boolean     NOT NULL DEFAULT true,
  status             text        NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused')),
  next_run_at        timestamptz,
  last_run_at        timestamptz,
  created_by         uuid,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_report_subscriptions_due
  ON public.report_subscriptions (next_run_at) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS public.report_delivery_log (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid        NOT NULL REFERENCES public.report_subscriptions(id) ON DELETE CASCADE,
  run_key         text        NOT NULL,
  is_manual       boolean     NOT NULL DEFAULT false,
  period_from     date,
  period_to       date,
  recipients      int         NOT NULL DEFAULT 0,
  status          text        NOT NULL DEFAULT 'running' CHECK (status IN ('running','sent','no_recipients','failed')),
  error           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (subscription_id, run_key)
);
CREATE INDEX IF NOT EXISTS idx_report_delivery_log_created ON public.report_delivery_log (created_at DESC);

ALTER TABLE public.report_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_delivery_log  ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.report_subscriptions TO authenticated;
GRANT SELECT ON public.report_delivery_log TO authenticated;
GRANT ALL ON public.report_subscriptions, public.report_delivery_log TO service_role;

DROP POLICY IF EXISTS "Managers manage report subscriptions" ON public.report_subscriptions;
CREATE POLICY "Managers manage report subscriptions" ON public.report_subscriptions
  FOR ALL TO authenticated
  USING (public.notif_can_manage(auth.uid()))
  WITH CHECK (public.notif_can_manage(auth.uid()));

DROP POLICY IF EXISTS "Managers read report delivery log" ON public.report_delivery_log;
CREATE POLICY "Managers read report delivery log" ON public.report_delivery_log
  FOR SELECT TO authenticated USING (public.notif_can_manage(auth.uid()));

-- 2. Scheduling maths ---------------------------------------------------------
-- Next fire time strictly after p_after, in the subscription's timezone.
CREATE OR REPLACE FUNCTION public.report_next_run(
  p_cadence text, p_fire_time time, p_weekday int, p_monthday int, p_tz text, p_after timestamptz
)
RETURNS timestamptz
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_tz   text := COALESCE(NULLIF(p_tz, ''), 'Asia/Kolkata');
  v_day  date := (p_after AT TIME ZONE v_tz)::date;
  v_ts   timestamptz;
  v_last int;
  i      int;
BEGIN
  FOR i IN 0..400 LOOP
    v_last := extract(day FROM (date_trunc('month', v_day) + interval '1 month - 1 day'))::int;
    IF (p_cadence = 'daily')
       OR (p_cadence = 'mon_fri' AND extract(isodow FROM v_day) <= 5)
       OR (p_cadence = 'mon_sat' AND extract(isodow FROM v_day) <= 6)
       OR (p_cadence = 'weekly'  AND extract(isodow FROM v_day) = COALESCE(p_weekday, 1))
       OR (p_cadence = 'monthly' AND extract(day FROM v_day) = LEAST(COALESCE(p_monthday, 1), v_last)) THEN
      v_ts := (v_day + COALESCE(p_fire_time, '09:00'::time)) AT TIME ZONE v_tz;
      IF v_ts > p_after THEN
        RETURN v_ts;
      END IF;
    END IF;
    v_day := v_day + 1;
  END LOOP;
  RETURN NULL;
END;
$$;

-- Report period for a run, as local dates.
CREATE OR REPLACE FUNCTION public.report_period(p_period text, p_run_at timestamptz, p_tz text)
RETURNS TABLE (period_from date, period_to date)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  WITH d AS (SELECT (p_run_at AT TIME ZONE COALESCE(NULLIF(p_tz, ''), 'Asia/Kolkata'))::date AS today)
  SELECT
    CASE p_period
      WHEN 'today'         THEN today
      WHEN 'yesterday'     THEN today - 1
      WHEN 'last_7_days'   THEN today - 7
      WHEN 'current_week'  THEN date_trunc('week', today)::date
      WHEN 'last_week'     THEN (date_trunc('week', today) - interval '7 days')::date
      WHEN 'month_to_date' THEN date_trunc('month', today)::date
      WHEN 'last_month'    THEN (date_trunc('month', today) - interval '1 month')::date
    END,
    CASE p_period
      WHEN 'today'         THEN today
      WHEN 'yesterday'     THEN today - 1
      WHEN 'last_7_days'   THEN today - 1
      WHEN 'current_week'  THEN today
      WHEN 'last_week'     THEN (date_trunc('week', today) - interval '1 day')::date
      WHEN 'month_to_date' THEN today
      WHEN 'last_month'    THEN (date_trunc('month', today) - interval '1 day')::date
    END
  FROM d;
$$;

CREATE OR REPLACE FUNCTION public.report_period_label(p_from date, p_to date)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN p_from = p_to THEN to_char(p_from, 'DD Mon YYYY')
    WHEN date_trunc('month', p_from) = date_trunc('month', p_to)
      THEN to_char(p_from, 'DD') || '–' || to_char(p_to, 'DD Mon YYYY')
    ELSE to_char(p_from, 'DD Mon') || ' – ' || to_char(p_to, 'DD Mon YYYY')
  END
$$;

-- Keep next_run_at in step with the schedule on every insert/update.
CREATE OR REPLACE FUNCTION public.report_subscriptions_set_next_run()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status = 'active' AND (
       TG_OP = 'INSERT'
    OR NEW.next_run_at IS NULL
    OR OLD.status IS DISTINCT FROM NEW.status
    OR OLD.cadence IS DISTINCT FROM NEW.cadence
    OR OLD.fire_time IS DISTINCT FROM NEW.fire_time
    OR OLD.fire_weekday IS DISTINCT FROM NEW.fire_weekday
    OR OLD.fire_monthday IS DISTINCT FROM NEW.fire_monthday
    OR OLD.timezone IS DISTINCT FROM NEW.timezone) THEN
    NEW.next_run_at := public.report_next_run(NEW.cadence, NEW.fire_time, NEW.fire_weekday,
                                              NEW.fire_monthday, NEW.timezone, now());
  ELSIF NEW.status = 'paused' THEN
    NEW.next_run_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_report_subscriptions_next_run ON public.report_subscriptions;
CREATE TRIGGER trg_report_subscriptions_next_run
  BEFORE INSERT OR UPDATE ON public.report_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.report_subscriptions_set_next_run();

DROP TRIGGER IF EXISTS trg_report_subscriptions_updated_at ON public.report_subscriptions;
CREATE TRIGGER trg_report_subscriptions_updated_at
  BEFORE UPDATE ON public.report_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Scope + headline numbers ---------------------------------------------------
-- Admins see everyone; anyone else sees themselves and their reporting tree.
CREATE OR REPLACE FUNCTION public.report_scope_users(p_viewer uuid)
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT u.id FROM public.users u
  WHERE u.is_active AND public.has_role(p_viewer, 'admin')
  UNION
  SELECT p_viewer
  UNION
  SELECT s.user_id FROM public.get_subordinate_users(p_viewer) s
  WHERE NOT public.has_role(p_viewer, 'admin');
$$;
REVOKE EXECUTE ON FUNCTION public.report_scope_users(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.report_summary_text(p_module text, p_from date, p_to date, p_viewer uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_ids uuid[];
  a bigint; b bigint; c bigint; d bigint;
  n1 numeric; n2 numeric;
BEGIN
  SELECT array_agg(x) INTO v_ids FROM public.report_scope_users(p_viewer) x;
  v_ids := COALESCE(v_ids, '{}');

  IF p_module = 'attendance' THEN
    SELECT count(*), count(DISTINCT user_id), round(avg(total_hours)::numeric, 1)
      INTO a, b, n1
      FROM public.attendance
      WHERE date BETWEEN p_from AND p_to AND check_in_time IS NOT NULL AND user_id = ANY (v_ids);
    RETURN format('%s check-in%s by %s %s', a, CASE WHEN a = 1 THEN '' ELSE 's' END, b,
                  CASE WHEN b = 1 THEN 'person' ELSE 'people' END)
        || CASE WHEN n1 IS NOT NULL THEN format(' · avg %s h', n1) ELSE '' END || '.';

  ELSIF p_module = 'activities' THEN
    SELECT count(*), count(*) FILTER (WHERE status = 'completed'), round(COALESCE(sum(travel_distance_km), 0)::numeric, 0)
      INTO a, b, n1
      FROM public.activity_events
      WHERE activity_date BETWEEN p_from AND p_to AND user_id = ANY (v_ids);
    RETURN format('%s activit%s (%s completed) · %s km travelled.', a, CASE WHEN a = 1 THEN 'y' ELSE 'ies' END, b, n1);

  ELSIF p_module = 'leave' THEN
    SELECT count(*), count(*) FILTER (WHERE lower(status) = 'approved'),
           count(*) FILTER (WHERE lower(status) = 'pending'), count(*) FILTER (WHERE lower(status) = 'rejected')
      INTO a, b, c, d
      FROM public.leave_applications
      WHERE from_date <= p_to AND to_date >= p_from AND user_id = ANY (v_ids);
    RETURN format('%s leave request%s: %s approved, %s pending, %s rejected.', a, CASE WHEN a = 1 THEN '' ELSE 's' END, b, c, d);

  ELSIF p_module = 'expenses' THEN
    SELECT count(*), COALESCE(sum(amount), 0), COALESCE(sum(amount) FILTER (WHERE lower(status) = 'approved'), 0)
      INTO a, n1, n2
      FROM public.additional_expenses
      WHERE expense_date BETWEEN p_from AND p_to AND user_id = ANY (v_ids);
    RETURN format('%s expense%s · %s claimed (%s approved).', a, CASE WHEN a = 1 THEN '' ELSE 's' END,
                  public.notif_fmt_money(n1), public.notif_fmt_money(n2));

  ELSIF p_module = 'travel-expense' THEN
    SELECT round(COALESCE(sum(total_distance_km), 0)::numeric, 0), count(DISTINCT user_id)
      INTO n1, b
      FROM public.attendance
      WHERE date BETWEEN p_from AND p_to AND user_id = ANY (v_ids);
    RETURN format('%s km travelled by %s %s.', n1, b, CASE WHEN b = 1 THEN 'person' ELSE 'people' END);

  ELSIF p_module = 'leads' THEN
    SELECT count(*), count(*) FILTER (WHERE converted_at IS NOT NULL)
      INTO a, b
      FROM public.leads
      WHERE (created_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN p_from AND p_to
        AND COALESCE(owner_id, created_by) = ANY (v_ids);
    RETURN format('%s new lead%s · %s converted.', a, CASE WHEN a = 1 THEN '' ELSE 's' END, b);

  ELSIF p_module = 'opportunities' THEN
    SELECT count(*), COALESCE(sum(amount), 0) INTO a, n1
      FROM public.customer_opportunities
      WHERE (created_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN p_from AND p_to
        AND COALESCE(owner_id, created_by) = ANY (v_ids);
    SELECT count(*), COALESCE(sum(amount), 0) INTO b, n2
      FROM public.customer_opportunities
      WHERE stage ILIKE '%won%'
        AND (stage_changed_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN p_from AND p_to
        AND COALESCE(owner_id, created_by) = ANY (v_ids);
    RETURN format('%s new opportunit%s worth %s · %s won (%s).', a, CASE WHEN a = 1 THEN 'y' ELSE 'ies' END,
                  public.notif_fmt_money(n1), b, public.notif_fmt_money(n2));

  ELSIF p_module = 'procurement' THEN
    SELECT count(*), COALESCE(sum(total_amount), 0) INTO a, n1
      FROM public.procurement_orders
      WHERE order_date BETWEEN p_from AND p_to
        AND (public.has_role(p_viewer, 'admin') OR created_by = ANY (v_ids));
    RETURN format('%s purchase order%s worth %s.', a, CASE WHEN a = 1 THEN '' ELSE 's' END, public.notif_fmt_money(n1));
  END IF;

  RETURN '';
END;
$$;
REVOKE EXECUTE ON FUNCTION public.report_summary_text(text, date, date, uuid) FROM PUBLIC, anon, authenticated;

-- 4. Recipients -----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.report_recipients(p_mode text, p_role text, p_user_ids uuid[])
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT DISTINCT r.id FROM (
    SELECT unnest(COALESCE(p_user_ids, '{}')) AS id WHERE p_mode = 'users'
    UNION ALL
    SELECT usp.user_id FROM public.user_security_profiles usp
      JOIN public.security_profiles sp ON sp.id = usp.profile_id
      WHERE p_mode = 'role' AND sp.name = p_role
    UNION ALL
    SELECT ur.user_id FROM public.user_roles ur WHERE p_mode = 'admins' AND ur.role = 'admin'
    UNION ALL
    SELECT DISTINCT e.manager_id FROM public.employees e WHERE p_mode = 'managers' AND e.manager_id IS NOT NULL
  ) r
  JOIN public.users u ON u.id = r.id AND u.is_active;
$$;
REVOKE EXECUTE ON FUNCTION public.report_recipients(text, text, uuid[]) FROM PUBLIC, anon, authenticated;

-- 5. Delivery ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.report_deliver(p_sub_id uuid, p_run_key text, p_run_at timestamptz, p_manual boolean)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  s        public.report_subscriptions%ROWTYPE;
  v_log    uuid;
  v_from   date;
  v_to     date;
  v_label  text;
  v_count  int := 0;
  v_rid    uuid;
  v_nid    uuid;
  v_sum    text;
BEGIN
  SELECT * INTO s FROM public.report_subscriptions WHERE id = p_sub_id;
  IF NOT FOUND THEN RETURN 0; END IF;

  INSERT INTO public.report_delivery_log (subscription_id, run_key, is_manual)
  VALUES (p_sub_id, p_run_key, p_manual)
  ON CONFLICT (subscription_id, run_key) DO NOTHING
  RETURNING id INTO v_log;
  IF v_log IS NULL THEN RETURN 0; END IF;  -- this run was already delivered

  BEGIN
    SELECT period_from, period_to INTO v_from, v_to FROM public.report_period(s.period, p_run_at, s.timezone);
    v_label := public.report_period_label(v_from, v_to);

    PERFORM set_config('sbee.notif_engine', 'on', true);
    FOR v_rid IN SELECT public.report_recipients(s.recipient_mode, s.recipient_role, s.recipient_user_ids) LOOP
      v_nid := gen_random_uuid();
      v_sum := public.report_summary_text(s.module, v_from, v_to, v_rid);
      INSERT INTO public.notifications (id, user_id, title, message, type, related_table, metadata)
      VALUES (
        v_nid, v_rid,
        s.name || ' · ' || v_label,
        trim(COALESCE(v_sum, '') || ' Tap to open the full report.'),
        'report', 'report_subscriptions',
        jsonb_build_object(
          'source', 'report',
          'subscription_id', s.id,
          'subscription_name', s.name,
          'module', s.module,
          'period_from', v_from,
          'period_to', v_to,
          'report_config', s.report_config,
          'is_test', p_manual,
          'route', '/reports?n=' || v_nid,
          'push_to_phone', s.push_to_phone)
      );
      v_count := v_count + 1;
    END LOOP;
    PERFORM set_config('sbee.notif_engine', 'off', true);

    UPDATE public.report_delivery_log
      SET period_from = v_from, period_to = v_to, recipients = v_count,
          status = CASE WHEN v_count > 0 THEN 'sent' ELSE 'no_recipients' END
      WHERE id = v_log;
    UPDATE public.report_subscriptions SET last_run_at = now() WHERE id = p_sub_id;
  EXCEPTION WHEN others THEN
    PERFORM set_config('sbee.notif_engine', 'off', true);
    UPDATE public.report_delivery_log SET status = 'failed', error = SQLERRM WHERE id = v_log;
    RETURN 0;
  END;
  RETURN v_count;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.report_deliver(uuid, text, timestamptz, boolean) FROM PUBLIC, anon, authenticated;

-- Called by cron every 15 minutes.
CREATE OR REPLACE FUNCTION public.report_dispatch_due()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r      record;
  v_sent int := 0;
BEGIN
  FOR r IN
    SELECT id, next_run_at, timezone, cadence, fire_time, fire_weekday, fire_monthday
    FROM public.report_subscriptions
    WHERE status = 'active' AND next_run_at IS NOT NULL AND next_run_at <= now()
    ORDER BY next_run_at
    FOR UPDATE SKIP LOCKED
  LOOP
    v_sent := v_sent + public.report_deliver(
      r.id, to_char(r.next_run_at AT TIME ZONE r.timezone, 'YYYY-MM-DD"T"HH24:MI'), r.next_run_at, false);
    UPDATE public.report_subscriptions
      SET next_run_at = public.report_next_run(r.cadence, r.fire_time, r.fire_weekday, r.fire_monthday,
                                               r.timezone, greatest(now(), r.next_run_at))
      WHERE id = r.id;
  END LOOP;
  RETURN v_sent;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.report_dispatch_due() FROM PUBLIC, anon, authenticated;

-- 6. Admin helpers ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.report_run_now(p_sub_id uuid)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.notif_can_manage(auth.uid()) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  RETURN public.report_deliver(p_sub_id, 'manual:' || to_char(clock_timestamp(), 'YYYY-MM-DD"T"HH24:MI:SS.US'), now(), true);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.report_run_now(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_run_now(uuid) TO authenticated;

-- Live preview for the editor: next run, period covered, recipients.
CREATE OR REPLACE FUNCTION public.report_subscription_preview(
  p_cadence text, p_fire_time time, p_weekday int, p_monthday int, p_period text,
  p_mode text, p_role text, p_user_ids uuid[], p_tz text DEFAULT 'Asia/Kolkata'
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_next timestamptz; v_from date; v_to date; v_names jsonb;
BEGIN
  IF NOT public.notif_can_manage(auth.uid()) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  v_next := public.report_next_run(p_cadence, p_fire_time, p_weekday, p_monthday, p_tz, now());
  IF v_next IS NOT NULL THEN
    SELECT period_from, period_to INTO v_from, v_to FROM public.report_period(p_period, v_next, p_tz);
  END IF;
  SELECT COALESCE(jsonb_agg(COALESCE(u.full_name, u.email) ORDER BY u.full_name), '[]'::jsonb) INTO v_names
  FROM public.report_recipients(p_mode, p_role, p_user_ids) rid
  JOIN public.users u ON u.id = rid;
  RETURN jsonb_build_object(
    'next_run_at', v_next,
    'period_from', v_from,
    'period_to', v_to,
    'period_label', CASE WHEN v_from IS NOT NULL THEN public.report_period_label(v_from, v_to) END,
    'recipients', v_names);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.report_subscription_preview(text, time, int, int, text, text, text, uuid[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_subscription_preview(text, time, int, int, text, text, text, uuid[], text) TO authenticated;

-- 7. Scheduler ----------------------------------------------------------------------
DO $$
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'report-dispatcher-15min';
  PERFORM cron.schedule('report-dispatcher-15min', '*/15 * * * *', 'SELECT public.report_dispatch_due();');
EXCEPTION WHEN others THEN
  RAISE WARNING 'report-dispatcher-15min not scheduled: %', SQLERRM;
END $$;