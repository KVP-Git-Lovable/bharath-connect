-- Notifications & Reports — Phase 3: Notification Center rules engine
-- Additive only. A trigger failure can never block the business write.
-- Seeded rules are inactive; admins switch them on from the UI.

-- 0. Who can manage rules: admins or users with the Admin Panel module ------
CREATE OR REPLACE FUNCTION public.notif_can_manage(p_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT p_user IS NOT NULL AND (
    public.has_role(p_user, 'admin')
    OR public.can_access_object(p_user, 'module_admin_panel', 'read')
  );
$$;
REVOKE EXECUTE ON FUNCTION public.notif_can_manage(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.notif_can_manage(uuid) TO authenticated;

-- 1. Event catalogue --------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notification_event_types (
  id                   uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  source_table         text    NOT NULL,
  event_code           text    NOT NULL,
  module_label         text    NOT NULL,
  label                text    NOT NULL,
  description          text,
  tokens               text[]  NOT NULL DEFAULT '{}',
  app_already_notifies boolean NOT NULL DEFAULT false,
  sort_order           int     NOT NULL DEFAULT 0,
  is_active            boolean NOT NULL DEFAULT true,
  UNIQUE (source_table, event_code)
);

-- 2. Rules ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notification_rules (
  id                        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                      text        NOT NULL,
  source_table              text        NOT NULL,
  event_code                text        NOT NULL,
  title_template            text        NOT NULL DEFAULT '',
  message_template          text        NOT NULL DEFAULT '',
  receiver_type             text        NOT NULL DEFAULT 'manager'
    CHECK (receiver_type IN ('employee','manager','hierarchy','admin','role','specific_user')),
  receiver_role             text,
  receiver_user_id          uuid,
  include_secondary_manager boolean     NOT NULL DEFAULT false,
  notification_channel      text        NOT NULL DEFAULT 'in_app_push'
    CHECK (notification_channel IN ('in_app','in_app_push')),
  timezone                  text        NOT NULL DEFAULT 'Asia/Kolkata',
  is_active                 boolean     NOT NULL DEFAULT false,
  created_by                uuid,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notification_rules_lookup
  ON public.notification_rules (source_table, event_code) WHERE is_active;

-- 3. Event log (only events that matched at least one active rule) ----------
CREATE TABLE IF NOT EXISTS public.notification_event_log (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_code            text        NOT NULL,
  source_table          text        NOT NULL,
  record_id             text,
  actor_user_id         uuid,
  metadata              jsonb       NOT NULL DEFAULT '{}'::jsonb,
  rules_matched         int         NOT NULL DEFAULT 0,
  notifications_created int         NOT NULL DEFAULT 0,
  created_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notification_event_log_created
  ON public.notification_event_log (created_at DESC);

-- 4. RLS ----------------------------------------------------------------------
ALTER TABLE public.notification_event_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_rules       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_event_log   ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.notification_event_types TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_rules TO authenticated;
GRANT SELECT ON public.notification_event_log TO authenticated;
GRANT ALL ON public.notification_event_types, public.notification_rules, public.notification_event_log TO service_role;

DROP POLICY IF EXISTS "Managers read event types" ON public.notification_event_types;
CREATE POLICY "Managers read event types" ON public.notification_event_types
  FOR SELECT TO authenticated USING (public.notif_can_manage(auth.uid()));

DROP POLICY IF EXISTS "Managers manage rules" ON public.notification_rules;
CREATE POLICY "Managers manage rules" ON public.notification_rules
  FOR ALL TO authenticated
  USING (public.notif_can_manage(auth.uid()))
  WITH CHECK (public.notif_can_manage(auth.uid()));

DROP POLICY IF EXISTS "Managers read event log" ON public.notification_event_log;
CREATE POLICY "Managers read event log" ON public.notification_event_log
  FOR SELECT TO authenticated USING (public.notif_can_manage(auth.uid()));

DROP TRIGGER IF EXISTS trg_notification_rules_updated_at ON public.notification_rules;
CREATE TRIGGER trg_notification_rules_updated_at
  BEFORE UPDATE ON public.notification_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5. Template filling -------------------------------------------------------
-- Context tokens first (so a record can override), then built-in date/time.
CREATE OR REPLACE FUNCTION public.notif_fill(p_template text, p_ctx jsonb, p_tz text DEFAULT 'Asia/Kolkata')
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_out text := COALESCE(p_template, '');
  v_now timestamp := (now() AT TIME ZONE COALESCE(NULLIF(p_tz, ''), 'Asia/Kolkata'));
  v_key text;
  v_val text;
BEGIN
  IF p_ctx IS NOT NULL THEN
    FOR v_key, v_val IN SELECT key, value FROM jsonb_each_text(p_ctx) LOOP
      v_out := replace(v_out, '{' || v_key || '}', COALESCE(v_val, ''));
    END LOOP;
  END IF;
  v_out := replace(v_out, '{date}',      to_char(v_now, 'DD-Mon-YYYY'));
  v_out := replace(v_out, '{time}',      to_char(v_now, 'HH12:MI AM'));
  v_out := replace(v_out, '{time_24}',   to_char(v_now, 'HH24:MI'));
  v_out := replace(v_out, '{weekday}',   to_char(v_now, 'FMDay'));
  v_out := replace(v_out, '{datetime}',  to_char(v_now, 'DD-Mon-YYYY HH12:MI AM'));
  RETURN v_out;
END;
$$;

-- 6. Recipient resolution ---------------------------------------------------
-- employees.manager_id holds the manager's user id (as in get_subordinate_users).
CREATE OR REPLACE FUNCTION public.notif_managers_up_chain(p_user uuid, p_include_secondary boolean DEFAULT false)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH RECURSIVE chain(user_id, depth, path) AS (
    SELECT e.manager_id, 1, ARRAY[p_user, e.manager_id]
    FROM public.employees e
    WHERE e.user_id = p_user AND e.manager_id IS NOT NULL
    UNION ALL
    SELECT e.manager_id, c.depth + 1, c.path || e.manager_id
    FROM chain c
    JOIN public.employees e ON e.user_id = c.user_id
    WHERE e.manager_id IS NOT NULL
      AND c.depth < 10
      AND NOT (e.manager_id = ANY (c.path))
  )
  SELECT user_id FROM chain
  UNION
  SELECT e.secondary_manager_id FROM public.employees e
  WHERE p_include_secondary AND e.user_id = p_user AND e.secondary_manager_id IS NOT NULL;
$$;
REVOKE EXECUTE ON FUNCTION public.notif_managers_up_chain(uuid, boolean) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.notif_resolve_recipients(
  p_receiver_type text,
  p_receiver_role text,
  p_receiver_user_id uuid,
  p_actor uuid,
  p_include_secondary boolean DEFAULT false
)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT DISTINCT r.id
  FROM (
    SELECT p_actor AS id WHERE p_receiver_type = 'employee'
    UNION ALL
    SELECT e.manager_id FROM public.employees e
      WHERE p_receiver_type = 'manager' AND e.user_id = p_actor
    UNION ALL
    SELECT e.secondary_manager_id FROM public.employees e
      WHERE p_receiver_type = 'manager' AND p_include_secondary AND e.user_id = p_actor
    UNION ALL
    SELECT public.notif_managers_up_chain(p_actor, p_include_secondary)
      WHERE p_receiver_type = 'hierarchy'
    UNION ALL
    SELECT ur.user_id FROM public.user_roles ur
      WHERE p_receiver_type = 'admin' AND ur.role = 'admin'
    UNION ALL
    SELECT usp.user_id FROM public.user_security_profiles usp
      JOIN public.security_profiles sp ON sp.id = usp.profile_id
      WHERE p_receiver_type = 'role' AND sp.name = p_receiver_role
    UNION ALL
    SELECT p_receiver_user_id WHERE p_receiver_type = 'specific_user'
  ) r
  JOIN public.users u ON u.id = r.id AND u.is_active
  WHERE r.id IS NOT NULL;
$$;
REVOKE EXECUTE ON FUNCTION public.notif_resolve_recipients(text, text, uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;

-- 7. The engine ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.emit_notification_event(
  p_event_code text,
  p_source_table text,
  p_record_id text,
  p_actor_user_id uuid,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_rule     record;
  v_ctx      jsonb;
  v_meta     jsonb;
  v_title    text;
  v_message  text;
  v_rules    int := 0;
  v_created  int := 0;
  v_n        int;
  v_record   uuid;
  v_actor    text;
  v_module   text;
BEGIN
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.notification_rules
      WHERE source_table = p_source_table AND event_code = p_event_code AND is_active
    ) THEN
      RETURN;
    END IF;

    BEGIN v_record := p_record_id::uuid; EXCEPTION WHEN others THEN v_record := NULL; END;
    SELECT COALESCE(full_name, username, email) INTO v_actor FROM public.users WHERE id = p_actor_user_id;
    SELECT module_label INTO v_module FROM public.notification_event_types
      WHERE source_table = p_source_table AND event_code = p_event_code;

    v_ctx := jsonb_build_object(
               'user_name', COALESCE(v_actor, 'Someone'),
               'module_name', COALESCE(v_module, initcap(replace(p_source_table, '_', ' ')))
             ) || COALESCE(p_metadata, '{}'::jsonb);

    PERFORM set_config('sbee.notif_engine', 'on', true);

    FOR v_rule IN
      SELECT * FROM public.notification_rules
      WHERE source_table = p_source_table AND event_code = p_event_code AND is_active
      ORDER BY created_at
    LOOP
      v_rules := v_rules + 1;
      v_title   := NULLIF(public.notif_fill(v_rule.title_template, v_ctx, v_rule.timezone), '');
      v_message := public.notif_fill(v_rule.message_template, v_ctx, v_rule.timezone);
      v_meta := v_ctx || jsonb_build_object(
        'source', 'rules_engine',
        'rule_id', v_rule.id,
        'rule_name', v_rule.name,
        'event_code', p_event_code,
        'source_table', p_source_table,
        'record_id', p_record_id,
        'push_to_phone', (v_rule.notification_channel = 'in_app_push')
      );

      INSERT INTO public.notifications (user_id, title, message, type, related_table, related_id, metadata)
      SELECT rid, COALESCE(v_title, v_rule.name), COALESCE(v_message, ''), lower(p_event_code),
             p_source_table, v_record, v_meta
      FROM public.notif_resolve_recipients(
             v_rule.receiver_type, v_rule.receiver_role, v_rule.receiver_user_id,
             p_actor_user_id, v_rule.include_secondary_manager) AS rid;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      v_created := v_created + v_n;
    END LOOP;

    PERFORM set_config('sbee.notif_engine', 'off', true);

    INSERT INTO public.notification_event_log
      (event_code, source_table, record_id, actor_user_id, metadata, rules_matched, notifications_created)
    VALUES (p_event_code, p_source_table, p_record_id, p_actor_user_id, COALESCE(p_metadata, '{}'::jsonb), v_rules, v_created);
  EXCEPTION WHEN others THEN
    PERFORM set_config('sbee.notif_engine', 'off', true);
    RAISE WARNING 'emit_notification_event(%, %) suppressed: % [%] — business write preserved',
      p_event_code, p_source_table, SQLERRM, SQLSTATE;
  END;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.emit_notification_event(text, text, text, uuid, jsonb) FROM PUBLIC, anon, authenticated;

-- 8. Admin helpers: recipient preview and test send --------------------------
CREATE OR REPLACE FUNCTION public.notif_preview_recipients(
  p_receiver_type text,
  p_receiver_role text DEFAULT NULL,
  p_receiver_user_id uuid DEFAULT NULL,
  p_sample_actor uuid DEFAULT NULL,
  p_include_secondary boolean DEFAULT false
)
RETURNS TABLE (id uuid, name text, email text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.notif_can_manage(auth.uid()) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  RETURN QUERY
  SELECT u.id, COALESCE(u.full_name, u.username, u.email)::text, u.email::text
  FROM public.notif_resolve_recipients(
         p_receiver_type, p_receiver_role, p_receiver_user_id,
         COALESCE(p_sample_actor, auth.uid()), p_include_secondary) AS rid
  JOIN public.users u ON u.id = rid
  ORDER BY 2;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.notif_preview_recipients(text, text, uuid, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.notif_preview_recipients(text, text, uuid, uuid, boolean) TO authenticated;

-- Sends the rule's notification to the caller only, filled with sample values.
CREATE OR REPLACE FUNCTION public.notify_send_test(p_rule_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_rule record;
  v_ctx  jsonb;
  v_me   uuid := auth.uid();
  v_name text;
  v_id   uuid;
BEGIN
  IF NOT public.notif_can_manage(v_me) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  SELECT * INTO v_rule FROM public.notification_rules WHERE id = p_rule_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Rule not found'; END IF;

  SELECT COALESCE(full_name, username, email) INTO v_name FROM public.users WHERE id = v_me;
  v_ctx := jsonb_build_object(
    'user_name', COALESCE(v_name, 'Test User'), 'module_name', 'Test',
    'record_name', 'Sample record', 'status', 'approved', 'approver_name', 'Sample Manager',
    'leave_type', 'Casual Leave', 'from_date', '15-Sep-2026', 'to_date', '16-Sep-2026', 'days', '2',
    'reason', 'Sample reason', 'request_type', 'Missed check-out', 'request_date', '10-Sep-2026',
    'amount', '₹1,250.00', 'category', 'Travel', 'expense_date', '10-Sep-2026',
    'activity_name', 'Site visit – Sample Customer', 'activity_type', 'Visit', 'activity_date', '11-Sep-2026',
    'check_in_time', '09:05 AM', 'check_out_time', '06:40 PM', 'total_hours', '9.6',
    'travel_distance_km', '12.4', 'travel_time_mins', '35', 'location', 'Bengaluru', 'rejection_reason', 'Sample reason'
  );

  PERFORM set_config('sbee.notif_engine', 'on', true);
  INSERT INTO public.notifications (user_id, title, message, type, related_table, metadata)
  VALUES (
    v_me,
    '[Test] ' || COALESCE(NULLIF(public.notif_fill(v_rule.title_template, v_ctx, v_rule.timezone), ''), v_rule.name),
    public.notif_fill(v_rule.message_template, v_ctx, v_rule.timezone),
    'rule_test', v_rule.source_table,
    v_ctx || jsonb_build_object('source', 'rules_engine', 'rule_id', v_rule.id, 'rule_name', v_rule.name,
      'event_code', v_rule.event_code, 'source_table', v_rule.source_table, 'is_test', true,
      'route', '/admin/notification-rules',
      'push_to_phone', (v_rule.notification_channel = 'in_app_push'))
  )
  RETURNING id INTO v_id;
  PERFORM set_config('sbee.notif_engine', 'off', true);

  RETURN jsonb_build_object('notification_id', v_id, 'push', v_rule.notification_channel = 'in_app_push');
END;
$$;
REVOKE EXECUTE ON FUNCTION public.notify_send_test(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.notify_send_test(uuid) TO authenticated;

-- 9. Formatting helpers for triggers ----------------------------------------
CREATE OR REPLACE FUNCTION public.notif_fmt_date(p date)
RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT to_char(p, 'DD-Mon-YYYY') $$;

CREATE OR REPLACE FUNCTION public.notif_fmt_time(p timestamptz)
RETURNS text LANGUAGE sql STABLE AS $$ SELECT to_char(p AT TIME ZONE 'Asia/Kolkata', 'HH12:MI AM') $$;

CREATE OR REPLACE FUNCTION public.notif_user_name(p uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT COALESCE(full_name, username, email) FROM public.users WHERE id = p $$;
REVOKE EXECUTE ON FUNCTION public.notif_user_name(uuid) FROM PUBLIC, anon, authenticated;

-- 10. Module triggers ---------------------------------------------------------

-- Attendance: day started / day ended
CREATE OR REPLACE FUNCTION public.notif_trg_attendance()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_ctx jsonb;
BEGIN
  BEGIN
    v_ctx := jsonb_build_object(
      'record_name', 'Attendance ' || public.notif_fmt_date(NEW.date),
      'attendance_date', public.notif_fmt_date(NEW.date),
      'status', COALESCE(NEW.status, ''),
      'check_in_time', COALESCE(public.notif_fmt_time(NEW.check_in_time), ''),
      'check_out_time', COALESCE(public.notif_fmt_time(NEW.check_out_time), ''),
      'total_hours', COALESCE(round(NEW.total_hours::numeric, 1)::text, ''),
      'location', COALESCE(NEW.check_in_address, ''),
      'route', '/attendance');
    IF NEW.check_in_time IS NOT NULL AND (TG_OP = 'INSERT' OR OLD.check_in_time IS NULL) THEN
      PERFORM public.emit_notification_event('CHECK_IN', 'attendance', NEW.id::text, NEW.user_id, v_ctx);
    END IF;
    IF NEW.check_out_time IS NOT NULL AND (TG_OP = 'INSERT' OR OLD.check_out_time IS NULL) THEN
      v_ctx := v_ctx || jsonb_build_object('location', COALESCE(NEW.check_out_address, ''));
      PERFORM public.emit_notification_event('CHECK_OUT', 'attendance', NEW.id::text, NEW.user_id, v_ctx);
    END IF;
  EXCEPTION WHEN others THEN
    RAISE WARNING 'notif_trg_attendance suppressed: %', SQLERRM;
  END;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_notif_attendance ON public.attendance;
CREATE TRIGGER trg_notif_attendance
  AFTER INSERT OR UPDATE OF check_in_time, check_out_time ON public.attendance
  FOR EACH ROW EXECUTE FUNCTION public.notif_trg_attendance();

-- Leave: applied / approved / rejected / cancelled
CREATE OR REPLACE FUNCTION public.notif_trg_leave_applications()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_ctx jsonb; v_event text; v_type text;
BEGIN
  BEGIN
    IF TG_OP = 'INSERT' THEN
      v_event := 'RECORD_CREATED';
    ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
      v_event := CASE lower(NEW.status)
        WHEN 'approved'  THEN 'RECORD_APPROVED'
        WHEN 'rejected'  THEN 'RECORD_REJECTED'
        WHEN 'cancelled' THEN 'RECORD_CANCELLED'
        ELSE NULL END;
    END IF;
    IF v_event IS NULL THEN RETURN NEW; END IF;

    SELECT name INTO v_type FROM public.leave_types WHERE id = NEW.leave_type_id;
    v_ctx := jsonb_build_object(
      'record_name', COALESCE(v_type, 'Leave') || ' request',
      'leave_type', COALESCE(v_type, 'Leave'),
      'from_date', public.notif_fmt_date(NEW.from_date),
      'to_date', public.notif_fmt_date(NEW.to_date),
      'days', trim(to_char(NEW.total_days, 'FM999990.##')),
      'reason', COALESCE(NEW.reason, ''),
      'status', COALESCE(NEW.status, ''),
      'approver_name', COALESCE(public.notif_user_name(COALESCE(NEW.approved_by, auth.uid())), ''),
      'route', CASE WHEN v_event = 'RECORD_CREATED' THEN '/pending-approvals' ELSE '/attendance' END);
    PERFORM public.emit_notification_event(v_event, 'leave_applications', NEW.id::text, NEW.user_id, v_ctx);
  EXCEPTION WHEN others THEN
    RAISE WARNING 'notif_trg_leave_applications suppressed: %', SQLERRM;
  END;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_notif_leave_applications ON public.leave_applications;
CREATE TRIGGER trg_notif_leave_applications
  AFTER INSERT OR UPDATE OF status ON public.leave_applications
  FOR EACH ROW EXECUTE FUNCTION public.notif_trg_leave_applications();

-- Regularization: requested / approved / rejected
CREATE OR REPLACE FUNCTION public.notif_trg_regularization_requests()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_ctx jsonb; v_event text;
BEGIN
  BEGIN
    IF TG_OP = 'INSERT' THEN
      v_event := 'RECORD_CREATED';
    ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
      v_event := CASE lower(NEW.status)
        WHEN 'approved' THEN 'RECORD_APPROVED'
        WHEN 'rejected' THEN 'RECORD_REJECTED'
        ELSE NULL END;
    END IF;
    IF v_event IS NULL THEN RETURN NEW; END IF;

    v_ctx := jsonb_build_object(
      'record_name', 'Regularization ' || public.notif_fmt_date(COALESCE(NEW.attendance_date, NEW.date)),
      'request_type', initcap(replace(COALESCE(NEW.request_type, ''), '_', ' ')),
      'request_date', public.notif_fmt_date(COALESCE(NEW.attendance_date, NEW.date)),
      'reason', COALESCE(NEW.reason, ''),
      'rejection_reason', COALESCE(NEW.rejection_reason, ''),
      'status', COALESCE(NEW.status, ''),
      'approver_name', COALESCE(public.notif_user_name(COALESCE(NEW.approved_by, auth.uid())), ''),
      'route', CASE WHEN v_event = 'RECORD_CREATED' THEN '/pending-approvals' ELSE '/attendance' END);
    PERFORM public.emit_notification_event(v_event, 'regularization_requests', NEW.id::text, NEW.user_id, v_ctx);
  EXCEPTION WHEN others THEN
    RAISE WARNING 'notif_trg_regularization_requests suppressed: %', SQLERRM;
  END;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_notif_regularization_requests ON public.regularization_requests;
CREATE TRIGGER trg_notif_regularization_requests
  AFTER INSERT OR UPDATE OF status ON public.regularization_requests
  FOR EACH ROW EXECUTE FUNCTION public.notif_trg_regularization_requests();

-- Expenses: submitted / approved / rejected
CREATE OR REPLACE FUNCTION public.notif_trg_additional_expenses()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_ctx jsonb; v_event text; v_new text := lower(COALESCE(NEW.status, ''));
BEGIN
  BEGIN
    IF v_new IN ('submitted', 'pending')
       AND (TG_OP = 'INSERT' OR lower(COALESCE(OLD.status, '')) NOT IN ('submitted', 'pending')) THEN
      v_event := 'RECORD_CREATED';
    ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
      v_event := CASE v_new
        WHEN 'approved' THEN 'RECORD_APPROVED'
        WHEN 'rejected' THEN 'RECORD_REJECTED'
        ELSE NULL END;
    END IF;
    IF v_event IS NULL THEN RETURN NEW; END IF;

    v_ctx := jsonb_build_object(
      'record_name', 'Expense ' || public.notif_fmt_date(NEW.expense_date),
      'amount', '₹' || to_char(NEW.amount, 'FM99,99,99,990.00'),
      'category', COALESCE(NULLIF(NEW.custom_category, ''), NEW.category, ''),
      'expense_date', public.notif_fmt_date(NEW.expense_date),
      'reason', COALESCE(NEW.description, ''),
      'rejection_reason', COALESCE(NEW.rejection_reason, ''),
      'status', COALESCE(NEW.status, ''),
      'approver_name', COALESCE(public.notif_user_name(auth.uid()), ''),
      'route', '/expenses');
    PERFORM public.emit_notification_event(v_event, 'additional_expenses', NEW.id::text, NEW.user_id, v_ctx);
  EXCEPTION WHEN others THEN
    RAISE WARNING 'notif_trg_additional_expenses suppressed: %', SQLERRM;
  END;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_notif_additional_expenses ON public.additional_expenses;
CREATE TRIGGER trg_notif_additional_expenses
  AFTER INSERT OR UPDATE OF status ON public.additional_expenses
  FOR EACH ROW EXECUTE FUNCTION public.notif_trg_additional_expenses();

-- Activities: planned / checked in / completed
CREATE OR REPLACE FUNCTION public.notif_trg_activity_events()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_ctx jsonb; v_event text; v_new text := lower(COALESCE(NEW.status, ''));
BEGIN
  BEGIN
    IF TG_OP = 'INSERT' THEN
      v_event := CASE v_new WHEN 'completed' THEN 'ACTIVITY_COMPLETED'
                            WHEN 'in_progress' THEN 'ACTIVITY_CHECKED_IN'
                            ELSE 'RECORD_CREATED' END;
    ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
      v_event := CASE v_new WHEN 'in_progress' THEN 'ACTIVITY_CHECKED_IN'
                            WHEN 'completed' THEN 'ACTIVITY_COMPLETED'
                            ELSE NULL END;
    END IF;
    IF v_event IS NULL THEN RETURN NEW; END IF;

    v_ctx := jsonb_build_object(
      'record_name', COALESCE(NEW.activity_name, 'Activity'),
      'activity_name', COALESCE(NEW.activity_name, 'Activity'),
      'activity_type', initcap(replace(COALESCE(NEW.activity_type, ''), '_', ' ')),
      'activity_date', public.notif_fmt_date(NEW.activity_date),
      'status', initcap(replace(COALESCE(NEW.status, ''), '_', ' ')),
      'location', COALESCE(NEW.location_address, ''),
      'outcome', COALESCE(NEW.outcome, ''),
      'travel_distance_km', COALESCE(round(NEW.travel_distance_km::numeric, 1)::text, ''),
      'travel_time_mins', COALESCE(NEW.travel_time_mins::text, ''),
      'route', '/activities');
    PERFORM public.emit_notification_event(v_event, 'activity_events', NEW.id::text, NEW.user_id, v_ctx);
  EXCEPTION WHEN others THEN
    RAISE WARNING 'notif_trg_activity_events suppressed: %', SQLERRM;
  END;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_notif_activity_events ON public.activity_events;
CREATE TRIGGER trg_notif_activity_events
  AFTER INSERT OR UPDATE OF status ON public.activity_events
  FOR EACH ROW EXECUTE FUNCTION public.notif_trg_activity_events();

-- 11. Catalogue seed (SBEE launch modules) ---------------------------------
INSERT INTO public.notification_event_types
  (source_table, event_code, module_label, label, description, tokens, app_already_notifies, sort_order)
VALUES
  ('attendance', 'CHECK_IN', 'Attendance', 'Day started', 'Employee checks in for the day',
    ARRAY['user_name','attendance_date','check_in_time','location','status'], false, 10),
  ('attendance', 'CHECK_OUT', 'Attendance', 'Day ended', 'Employee checks out for the day',
    ARRAY['user_name','attendance_date','check_in_time','check_out_time','total_hours','location'], false, 11),
  ('leave_applications', 'RECORD_CREATED', 'Leave', 'Leave applied', 'Employee applies for leave',
    ARRAY['user_name','leave_type','from_date','to_date','days','reason'], true, 20),
  ('leave_applications', 'RECORD_APPROVED', 'Leave', 'Leave approved', 'Leave request approved',
    ARRAY['user_name','leave_type','from_date','to_date','days','approver_name'], true, 21),
  ('leave_applications', 'RECORD_REJECTED', 'Leave', 'Leave rejected', 'Leave request rejected',
    ARRAY['user_name','leave_type','from_date','to_date','days','approver_name'], true, 22),
  ('leave_applications', 'RECORD_CANCELLED', 'Leave', 'Leave cancelled', 'Leave request cancelled',
    ARRAY['user_name','leave_type','from_date','to_date','days'], false, 23),
  ('regularization_requests', 'RECORD_CREATED', 'Regularization', 'Regularization requested', 'Employee requests an attendance correction',
    ARRAY['user_name','request_type','request_date','reason'], true, 30),
  ('regularization_requests', 'RECORD_APPROVED', 'Regularization', 'Regularization approved', 'Attendance correction approved',
    ARRAY['user_name','request_type','request_date','approver_name'], true, 31),
  ('regularization_requests', 'RECORD_REJECTED', 'Regularization', 'Regularization rejected', 'Attendance correction rejected',
    ARRAY['user_name','request_type','request_date','approver_name','rejection_reason'], true, 32),
  ('additional_expenses', 'RECORD_CREATED', 'Expenses', 'Expense submitted', 'Employee submits an expense',
    ARRAY['user_name','amount','category','expense_date','reason'], false, 40),
  ('additional_expenses', 'RECORD_APPROVED', 'Expenses', 'Expense approved', 'Expense approved',
    ARRAY['user_name','amount','category','expense_date','approver_name'], false, 41),
  ('additional_expenses', 'RECORD_REJECTED', 'Expenses', 'Expense rejected', 'Expense rejected',
    ARRAY['user_name','amount','category','expense_date','approver_name','rejection_reason'], false, 42),
  ('activity_events', 'RECORD_CREATED', 'Activities', 'Activity planned', 'A new activity is created',
    ARRAY['user_name','activity_name','activity_type','activity_date','location'], false, 50),
  ('activity_events', 'ACTIVITY_CHECKED_IN', 'Activities', 'Activity check-in', 'Employee checks in to an activity',
    ARRAY['user_name','activity_name','activity_type','activity_date','location','travel_distance_km','travel_time_mins'], true, 51),
  ('activity_events', 'ACTIVITY_COMPLETED', 'Activities', 'Activity completed', 'Employee checks out of an activity',
    ARRAY['user_name','activity_name','activity_type','activity_date','location','outcome'], false, 52)
ON CONFLICT (source_table, event_code) DO UPDATE SET
  module_label = EXCLUDED.module_label, label = EXCLUDED.label, description = EXCLUDED.description,
  tokens = EXCLUDED.tokens, app_already_notifies = EXCLUDED.app_already_notifies, sort_order = EXCLUDED.sort_order;

-- 12. Starter rules (all OFF) -------------------------------------------------
INSERT INTO public.notification_rules
  (name, source_table, event_code, title_template, message_template, receiver_type, notification_channel, is_active)
SELECT v.* FROM (VALUES
  ('Expense submitted → manager', 'additional_expenses', 'RECORD_CREATED',
   'Expense submitted: {amount}', '{user_name} submitted a {category} expense of {amount} for {expense_date}.',
   'manager', 'in_app_push', false),
  ('Expense decision → employee', 'additional_expenses', 'RECORD_APPROVED',
   'Expense approved: {amount}', 'Your {category} expense of {amount} for {expense_date} was approved by {approver_name}.',
   'employee', 'in_app_push', false),
  ('Expense rejected → employee', 'additional_expenses', 'RECORD_REJECTED',
   'Expense rejected: {amount}', 'Your {category} expense of {amount} for {expense_date} was rejected. Reason: {rejection_reason}',
   'employee', 'in_app_push', false),
  ('Activity completed → manager', 'activity_events', 'ACTIVITY_COMPLETED',
   'Activity completed: {activity_name}', '{user_name} completed "{activity_name}" ({activity_type}) on {activity_date}.',
   'manager', 'in_app', false),
  ('Day started → manager', 'attendance', 'CHECK_IN',
   '{user_name} started the day', '{user_name} checked in at {check_in_time} on {attendance_date}.',
   'manager', 'in_app', false),
  ('Leave cancelled → manager', 'leave_applications', 'RECORD_CANCELLED',
   'Leave cancelled: {user_name}', '{user_name} cancelled {leave_type} from {from_date} to {to_date}.',
   'manager', 'in_app_push', false)
) AS v(name, source_table, event_code, title_template, message_template, receiver_type, notification_channel, is_active)
WHERE NOT EXISTS (SELECT 1 FROM public.notification_rules r WHERE r.name = v.name);