-- Notifications & Reports — Phase 5: Leads, Opportunities, Tasks, Site
-- milestones and Procurement events; project/site recipients; daily overdue
-- checks. Additive only; every trigger is failure-isolated.

-- 0. Linter: pin search_path on the small helpers from Phases 3–4 --------
ALTER FUNCTION public.notif_source_of(jsonb) SET search_path TO 'public';
ALTER FUNCTION public.notif_fmt_date(date) SET search_path TO 'public';
ALTER FUNCTION public.notif_fmt_time(timestamptz) SET search_path TO 'public';

-- 1. New recipient types ------------------------------------------------------
ALTER TABLE public.notification_rules DROP CONSTRAINT IF EXISTS notification_rules_receiver_type_check;
ALTER TABLE public.notification_rules ADD CONSTRAINT notification_rules_receiver_type_check
  CHECK (receiver_type IN ('employee','manager','hierarchy','admin','role','specific_user','project_members','site_team'));

-- Which extra recipient types make sense for an event (shown in the editor).
ALTER TABLE public.notification_event_types
  ADD COLUMN IF NOT EXISTS extra_receivers text[] NOT NULL DEFAULT '{}';

DROP FUNCTION IF EXISTS public.notif_resolve_recipients(text, text, uuid, uuid, boolean);
CREATE OR REPLACE FUNCTION public.notif_resolve_recipients(
  p_receiver_type text,
  p_receiver_role text,
  p_receiver_user_id uuid,
  p_actor uuid,
  p_include_secondary boolean DEFAULT false,
  p_project_id uuid DEFAULT NULL,
  p_site_id uuid DEFAULT NULL
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
    UNION ALL
    SELECT pm.user_id FROM public.pm_project_members pm
      WHERE p_receiver_type = 'project_members' AND pm.project_id = p_project_id
    UNION ALL
    SELECT sa.user_id FROM public.site_assignments sa
      WHERE p_receiver_type = 'site_team' AND sa.site_id = p_site_id
  ) r
  JOIN public.users u ON u.id = r.id AND u.is_active
  WHERE r.id IS NOT NULL;
$$;
REVOKE EXECUTE ON FUNCTION public.notif_resolve_recipients(text, text, uuid, uuid, boolean, uuid, uuid) FROM PUBLIC, anon, authenticated;

-- 2. Engine: project/site context + optional exclusion of the person acting --
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
  v_project  uuid;
  v_site     uuid;
  v_exclude  uuid;
BEGIN
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.notification_rules
      WHERE source_table = p_source_table AND event_code = p_event_code AND is_active
    ) THEN
      RETURN;
    END IF;

    BEGIN v_record  := p_record_id::uuid; EXCEPTION WHEN others THEN v_record := NULL; END;
    BEGIN v_project := NULLIF(p_metadata->>'project_id', '')::uuid; EXCEPTION WHEN others THEN v_project := NULL; END;
    BEGIN v_site    := NULLIF(p_metadata->>'site_id', '')::uuid; EXCEPTION WHEN others THEN v_site := NULL; END;
    BEGIN v_exclude := NULLIF(p_metadata->>'exclude_user_id', '')::uuid; EXCEPTION WHEN others THEN v_exclude := NULL; END;

    SELECT COALESCE(full_name, username, email) INTO v_actor FROM public.users WHERE id = p_actor_user_id;
    SELECT module_label INTO v_module FROM public.notification_event_types
      WHERE source_table = p_source_table AND event_code = p_event_code;

    v_ctx := jsonb_build_object(
               'user_name', COALESCE(v_actor, 'Someone'),
               'module_name', COALESCE(v_module, initcap(replace(p_source_table, '_', ' ')))
             ) || (COALESCE(p_metadata, '{}'::jsonb) - 'exclude_user_id');

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
             p_actor_user_id, v_rule.include_secondary_manager, v_project, v_site) AS rid
      WHERE v_exclude IS NULL OR rid <> v_exclude;
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

-- Preview keeps its signature; project/site recipients depend on each record.
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
         COALESCE(p_sample_actor, auth.uid()), p_include_secondary, NULL, NULL) AS rid
  JOIN public.users u ON u.id = rid
  ORDER BY 2;
END;
$$;

-- Test send: sample values for every token (old + new modules).
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
    'travel_distance_km', '12.4', 'travel_time_mins', '35', 'location', 'Bengaluru', 'rejection_reason', 'Sample reason',
    'lead_name', 'Sample Lead', 'company', 'ABC Cables Pvt Ltd', 'lead_status', 'Qualified', 'old_status', 'New',
    'assigned_by', 'Sample Manager', 'value', '₹5,00,000.00',
    'opportunity_name', 'Sample Opportunity', 'customer', 'ABC Cables Pvt Ltd', 'stage', 'Negotiation',
    'old_stage', 'Proposal', 'probability', '60', 'close_date', '30-Sep-2026',
    'task_title', 'Sample task', 'project_name', 'Sample Project', 'due_date', '15-Sep-2026', 'priority', 'High',
    'commenter_name', 'Sample Colleague', 'comment', 'Looks good, please proceed.', 'file_name', 'drawing.pdf',
    'milestone_name', 'Cabling – Phase 1', 'site_name', 'Sample Site', 'end_date', '12-Sep-2026', 'percent_complete', '70',
    'po_number', 'PO-0001', 'vendor', 'Sample Vendor', 'grn_number', 'GRN-0001', 'receipt_date', '11-Sep-2026',
    'invoice_number', 'INV-0001', 'invoice_date', '11-Sep-2026', 'payment_date', '11-Sep-2026', 'reference', 'UTR123456'
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

-- 3. Shared formatting --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notif_fmt_money(p numeric, p_currency text DEFAULT NULL)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public'
AS $$
  SELECT CASE WHEN p IS NULL THEN ''
    WHEN COALESCE(upper(p_currency), 'INR') IN ('INR', '₹', '') THEN '₹' || to_char(p, 'FM99,99,99,99,990.00')
    ELSE upper(p_currency) || ' ' || to_char(p, 'FM999,999,999,990.00') END
$$;

-- 4. Activities: add project/site so "Project members" / "Site team" work ----
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
      'project_id', NEW.project_id,
      'site_id', NEW.site_id,
      'route', '/activities');
    PERFORM public.emit_notification_event(v_event, 'activity_events', NEW.id::text, NEW.user_id, v_ctx);
  EXCEPTION WHEN others THEN
    RAISE WARNING 'notif_trg_activity_events suppressed: %', SQLERRM;
  END;
  RETURN NEW;
END;
$$;

-- 5. Leads --------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notif_trg_leads()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_ctx jsonb; v_owner uuid := COALESCE(NEW.owner_id, NEW.created_by);
  v_status text; v_old_status text; v_by uuid := auth.uid();
BEGIN
  BEGIN
    SELECT name INTO v_status FROM public.master_lead_statuses WHERE id = NEW.lead_status_id;
    IF TG_OP = 'UPDATE' THEN
      SELECT name INTO v_old_status FROM public.master_lead_statuses WHERE id = OLD.lead_status_id;
    END IF;
    v_ctx := jsonb_build_object(
      'record_name', NEW.name,
      'lead_name', NEW.name,
      'company', COALESCE(NEW.company, ''),
      'lead_status', COALESCE(v_status, ''),
      'old_status', COALESCE(v_old_status, ''),
      'value', public.notif_fmt_money(COALESCE(NEW.opportunity_value, NEW.indicative_budget)),
      'assigned_by', COALESCE(public.notif_user_name(v_by), ''),
      'route', '/leads/' || NEW.id);

    IF TG_OP = 'INSERT' THEN
      PERFORM public.emit_notification_event('RECORD_CREATED', 'leads', NEW.id::text, v_owner, v_ctx);
      IF NEW.owner_id IS NOT NULL THEN
        PERFORM public.emit_notification_event('LEAD_ASSIGNED', 'leads', NEW.id::text, NEW.owner_id,
          v_ctx || jsonb_build_object('exclude_user_id', v_by));
      END IF;
    ELSE
      IF NEW.owner_id IS NOT NULL AND NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN
        PERFORM public.emit_notification_event('LEAD_ASSIGNED', 'leads', NEW.id::text, NEW.owner_id,
          v_ctx || jsonb_build_object('exclude_user_id', v_by));
      END IF;
      IF NEW.lead_status_id IS DISTINCT FROM OLD.lead_status_id THEN
        PERFORM public.emit_notification_event('LEAD_STATUS_CHANGED', 'leads', NEW.id::text, v_owner, v_ctx);
      END IF;
      IF NEW.converted_at IS NOT NULL AND OLD.converted_at IS NULL THEN
        PERFORM public.emit_notification_event('LEAD_CONVERTED', 'leads', NEW.id::text, v_owner, v_ctx);
      END IF;
    END IF;
  EXCEPTION WHEN others THEN
    RAISE WARNING 'notif_trg_leads suppressed: %', SQLERRM;
  END;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_notif_leads ON public.leads;
CREATE TRIGGER trg_notif_leads
  AFTER INSERT OR UPDATE OF owner_id, lead_status_id, converted_at ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.notif_trg_leads();

-- 6. Opportunities ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notif_trg_customer_opportunities()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_ctx jsonb; v_owner uuid := COALESCE(NEW.owner_id, NEW.created_by); v_customer text;
BEGIN
  BEGIN
    SELECT name INTO v_customer FROM public.customers WHERE id = NEW.customer_id;
    v_ctx := jsonb_build_object(
      'record_name', NEW.name,
      'opportunity_name', NEW.name,
      'customer', COALESCE(v_customer, ''),
      'amount', public.notif_fmt_money(NEW.amount, NEW.currency),
      'stage', COALESCE(NEW.stage, ''),
      'old_stage', CASE WHEN TG_OP = 'UPDATE' THEN COALESCE(OLD.stage, '') ELSE '' END,
      'probability', COALESCE(NEW.probability::text, ''),
      'close_date', COALESCE(public.notif_fmt_date(NEW.close_date), ''),
      'route', '/reports');

    IF TG_OP = 'INSERT' THEN
      PERFORM public.emit_notification_event('RECORD_CREATED', 'customer_opportunities', NEW.id::text, v_owner, v_ctx);
    ELSIF NEW.stage IS DISTINCT FROM OLD.stage THEN
      PERFORM public.emit_notification_event('OPPORTUNITY_STAGE_CHANGED', 'customer_opportunities', NEW.id::text, v_owner, v_ctx);
      IF NEW.stage ILIKE '%won%' THEN
        PERFORM public.emit_notification_event('OPPORTUNITY_WON', 'customer_opportunities', NEW.id::text, v_owner, v_ctx);
      ELSIF NEW.stage ILIKE '%lost%' THEN
        PERFORM public.emit_notification_event('OPPORTUNITY_LOST', 'customer_opportunities', NEW.id::text, v_owner, v_ctx);
      END IF;
    END IF;
  EXCEPTION WHEN others THEN
    RAISE WARNING 'notif_trg_customer_opportunities suppressed: %', SQLERRM;
  END;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_notif_customer_opportunities ON public.customer_opportunities;
CREATE TRIGGER trg_notif_customer_opportunities
  AFTER INSERT OR UPDATE OF stage ON public.customer_opportunities
  FOR EACH ROW EXECUTE FUNCTION public.notif_trg_customer_opportunities();

-- 7. Tasks, comments, files ---------------------------------------------------
CREATE OR REPLACE FUNCTION public.notif_task_ctx(p_task_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT jsonb_build_object(
    'record_name', t.title,
    'task_title', t.title,
    'project_name', COALESCE(p.name, ''),
    'due_date', COALESCE(public.notif_fmt_date(t.due_date), ''),
    'priority', initcap(t.priority::text),
    'status', initcap(replace(t.status::text, '_', ' ')),
    'project_id', t.project_id,
    'route', '/projects/' || t.project_id)
  FROM public.pm_tasks t
  LEFT JOIN public.pm_projects p ON p.id = t.project_id
  WHERE t.id = p_task_id
$$;
REVOKE EXECUTE ON FUNCTION public.notif_task_ctx(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.notif_trg_pm_tasks()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_ctx jsonb; v_person uuid := COALESCE(NEW.assignee_id, NEW.created_by); v_by uuid := auth.uid();
BEGIN
  BEGIN
    v_ctx := public.notif_task_ctx(NEW.id)
      || jsonb_build_object('assigned_by', COALESCE(public.notif_user_name(v_by), ''));
    IF NEW.assignee_id IS NOT NULL
       AND (TG_OP = 'INSERT' OR NEW.assignee_id IS DISTINCT FROM OLD.assignee_id) THEN
      PERFORM public.emit_notification_event('TASK_ASSIGNED', 'pm_tasks', NEW.id::text, NEW.assignee_id,
        v_ctx || jsonb_build_object('exclude_user_id', v_by));
    END IF;
    IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
      PERFORM public.emit_notification_event('TASK_STATUS_CHANGED', 'pm_tasks', NEW.id::text, v_person, v_ctx);
      IF NEW.status::text = 'done' THEN
        PERFORM public.emit_notification_event('TASK_COMPLETED', 'pm_tasks', NEW.id::text, v_person, v_ctx);
      END IF;
    END IF;
    IF NEW.is_blocked AND (TG_OP = 'INSERT' OR NOT COALESCE(OLD.is_blocked, false)) THEN
      PERFORM public.emit_notification_event('TASK_BLOCKED', 'pm_tasks', NEW.id::text, v_person,
        v_ctx || jsonb_build_object('reason', COALESCE(NEW.block_reason, '')));
    END IF;
  EXCEPTION WHEN others THEN
    RAISE WARNING 'notif_trg_pm_tasks suppressed: %', SQLERRM;
  END;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_notif_pm_tasks ON public.pm_tasks;
CREATE TRIGGER trg_notif_pm_tasks
  AFTER INSERT OR UPDATE OF assignee_id, status, is_blocked ON public.pm_tasks
  FOR EACH ROW EXECUTE FUNCTION public.notif_trg_pm_tasks();

CREATE OR REPLACE FUNCTION public.notif_trg_pm_task_comments()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_person uuid;
BEGIN
  BEGIN
    SELECT COALESCE(assignee_id, created_by) INTO v_person FROM public.pm_tasks WHERE id = NEW.task_id;
    PERFORM public.emit_notification_event('COMMENT_ADDED', 'pm_tasks', NEW.task_id::text, v_person,
      public.notif_task_ctx(NEW.task_id) || jsonb_build_object(
        'commenter_name', COALESCE(public.notif_user_name(NEW.user_id), ''),
        'comment', left(COALESCE(NEW.content, ''), 200),
        'exclude_user_id', NEW.user_id));
  EXCEPTION WHEN others THEN
    RAISE WARNING 'notif_trg_pm_task_comments suppressed: %', SQLERRM;
  END;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_notif_pm_task_comments ON public.pm_task_comments;
CREATE TRIGGER trg_notif_pm_task_comments
  AFTER INSERT ON public.pm_task_comments
  FOR EACH ROW EXECUTE FUNCTION public.notif_trg_pm_task_comments();

CREATE OR REPLACE FUNCTION public.notif_trg_pm_task_attachments()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_person uuid;
BEGIN
  BEGIN
    SELECT COALESCE(assignee_id, created_by) INTO v_person FROM public.pm_tasks WHERE id = NEW.task_id;
    PERFORM public.emit_notification_event('FILE_UPLOADED', 'pm_tasks', NEW.task_id::text, v_person,
      public.notif_task_ctx(NEW.task_id) || jsonb_build_object(
        'commenter_name', COALESCE(public.notif_user_name(NEW.uploaded_by), ''),
        'file_name', COALESCE(NEW.file_name, ''),
        'exclude_user_id', NEW.uploaded_by));
  EXCEPTION WHEN others THEN
    RAISE WARNING 'notif_trg_pm_task_attachments suppressed: %', SQLERRM;
  END;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_notif_pm_task_attachments ON public.pm_task_attachments;
CREATE TRIGGER trg_notif_pm_task_attachments
  AFTER INSERT ON public.pm_task_attachments
  FOR EACH ROW EXECUTE FUNCTION public.notif_trg_pm_task_attachments();

-- 8. Site milestones ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notif_milestone_ctx(p_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT jsonb_build_object(
    'record_name', m.name,
    'milestone_name', m.name,
    'site_name', COALESCE(s.site_name, ''),
    'end_date', public.notif_fmt_date(m.end_date),
    'percent_complete', round(COALESCE(m.percent_complete, 0))::text,
    'status', COALESCE(m.status, ''),
    'site_id', m.site_id,
    'route', '/sites')
  FROM public.site_milestones m
  LEFT JOIN public.project_sites s ON s.id = m.site_id
  WHERE m.id = p_id
$$;
REVOKE EXECUTE ON FUNCTION public.notif_milestone_ctx(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.notif_trg_site_milestones()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_ctx jsonb;
BEGIN
  BEGIN
    IF NOT COALESCE(NEW.is_active, true) THEN RETURN NEW; END IF;
    v_ctx := public.notif_milestone_ctx(NEW.id);
    IF NEW.at_risk AND (TG_OP = 'INSERT' OR NOT COALESCE(OLD.at_risk, false)) THEN
      PERFORM public.emit_notification_event('MILESTONE_AT_RISK', 'site_milestones', NEW.id::text, NULL, v_ctx);
    END IF;
    IF TG_OP = 'UPDATE' AND (
         (COALESCE(NEW.percent_complete, 0) >= 100 AND COALESCE(OLD.percent_complete, 0) < 100)
      OR (NEW.status ILIKE 'complete%' AND COALESCE(OLD.status, '') NOT ILIKE 'complete%')) THEN
      PERFORM public.emit_notification_event('MILESTONE_COMPLETED', 'site_milestones', NEW.id::text, NULL, v_ctx);
    END IF;
  EXCEPTION WHEN others THEN
    RAISE WARNING 'notif_trg_site_milestones suppressed: %', SQLERRM;
  END;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_notif_site_milestones ON public.site_milestones;
CREATE TRIGGER trg_notif_site_milestones
  AFTER INSERT OR UPDATE OF at_risk, percent_complete, status ON public.site_milestones
  FOR EACH ROW EXECUTE FUNCTION public.notif_trg_site_milestones();

-- 9. Procurement (POs, GRNs, invoices, payments) -----------------------------
CREATE OR REPLACE FUNCTION public.notif_po_ctx(p_po_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT jsonb_build_object(
    'record_name', COALESCE(o.po_number, 'Purchase order'),
    'po_number', COALESCE(o.po_number, 'Draft PO'),
    'vendor', COALESCE(v.name, ''),
    'site_name', COALESCE(s.site_name, ''),
    'status', COALESCE(o.status, ''),
    'amount', public.notif_fmt_money(o.total_amount),
    'site_id', o.site_id,
    'route', '/reports')
  FROM public.procurement_orders o
  LEFT JOIN public.vendors v ON v.id = o.vendor_id
  LEFT JOIN public.project_sites s ON s.id = o.site_id
  WHERE o.id = p_po_id
$$;
REVOKE EXECUTE ON FUNCTION public.notif_po_ctx(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.notif_trg_procurement_orders()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_ctx jsonb;
BEGIN
  BEGIN
    v_ctx := public.notif_po_ctx(NEW.id);
    IF TG_OP = 'INSERT' THEN
      PERFORM public.emit_notification_event('RECORD_CREATED', 'procurement_orders', NEW.id::text, NEW.created_by, v_ctx);
    ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
      PERFORM public.emit_notification_event('PO_STATUS_CHANGED', 'procurement_orders', NEW.id::text, NEW.created_by,
        v_ctx || jsonb_build_object('old_status', COALESCE(OLD.status, '')));
    END IF;
  EXCEPTION WHEN others THEN
    RAISE WARNING 'notif_trg_procurement_orders suppressed: %', SQLERRM;
  END;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_notif_procurement_orders ON public.procurement_orders;
CREATE TRIGGER trg_notif_procurement_orders
  AFTER INSERT OR UPDATE OF status ON public.procurement_orders
  FOR EACH ROW EXECUTE FUNCTION public.notif_trg_procurement_orders();

CREATE OR REPLACE FUNCTION public.notif_trg_procurement_grns()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_by uuid;
BEGIN
  BEGIN
    SELECT created_by INTO v_by FROM public.procurement_orders WHERE id = NEW.po_id;
    PERFORM public.emit_notification_event('GRN_RECEIVED', 'procurement_orders', NEW.po_id::text, v_by,
      public.notif_po_ctx(NEW.po_id) || jsonb_build_object(
        'grn_number', COALESCE(NEW.grn_number, ''),
        'receipt_date', public.notif_fmt_date(NEW.receipt_date),
        'commenter_name', COALESCE(public.notif_user_name(COALESCE(NEW.received_by, NEW.created_by)), '')));
  EXCEPTION WHEN others THEN
    RAISE WARNING 'notif_trg_procurement_grns suppressed: %', SQLERRM;
  END;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_notif_procurement_grns ON public.procurement_grns;
CREATE TRIGGER trg_notif_procurement_grns
  AFTER INSERT ON public.procurement_grns
  FOR EACH ROW EXECUTE FUNCTION public.notif_trg_procurement_grns();

CREATE OR REPLACE FUNCTION public.notif_trg_procurement_invoices()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_by uuid;
BEGIN
  BEGIN
    SELECT created_by INTO v_by FROM public.procurement_orders WHERE id = NEW.po_id;
    PERFORM public.emit_notification_event('INVOICE_ADDED', 'procurement_orders', NEW.po_id::text, v_by,
      public.notif_po_ctx(NEW.po_id) || jsonb_build_object(
        'invoice_number', COALESCE(NEW.invoice_number, ''),
        'invoice_date', public.notif_fmt_date(NEW.invoice_date),
        'amount', public.notif_fmt_money(NEW.invoice_amount)));
  EXCEPTION WHEN others THEN
    RAISE WARNING 'notif_trg_procurement_invoices suppressed: %', SQLERRM;
  END;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_notif_procurement_invoices ON public.procurement_invoices;
CREATE TRIGGER trg_notif_procurement_invoices
  AFTER INSERT ON public.procurement_invoices
  FOR EACH ROW EXECUTE FUNCTION public.notif_trg_procurement_invoices();

CREATE OR REPLACE FUNCTION public.notif_trg_procurement_invoice_payments()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_po uuid; v_by uuid; v_inv text;
BEGIN
  BEGIN
    SELECT i.po_id, i.invoice_number INTO v_po, v_inv FROM public.procurement_invoices i WHERE i.id = NEW.invoice_id;
    SELECT created_by INTO v_by FROM public.procurement_orders WHERE id = v_po;
    PERFORM public.emit_notification_event('PAYMENT_RECORDED', 'procurement_orders', v_po::text, v_by,
      public.notif_po_ctx(v_po) || jsonb_build_object(
        'invoice_number', COALESCE(v_inv, ''),
        'amount', public.notif_fmt_money(NEW.amount),
        'payment_date', COALESCE(public.notif_fmt_date(NEW.payment_date::date), ''),
        'reference', COALESCE(NEW.reference_number, '')));
  EXCEPTION WHEN others THEN
    RAISE WARNING 'notif_trg_procurement_invoice_payments suppressed: %', SQLERRM;
  END;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_notif_procurement_invoice_payments ON public.procurement_invoice_payments;
CREATE TRIGGER trg_notif_procurement_invoice_payments
  AFTER INSERT ON public.procurement_invoice_payments
  FOR EACH ROW EXECUTE FUNCTION public.notif_trg_procurement_invoice_payments();

-- 10. Daily checks (09:00 IST): overdue milestones and tasks, once each ----
CREATE OR REPLACE FUNCTION public.notif_daily_checks()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_yesterday date := ((now() AT TIME ZONE 'Asia/Kolkata')::date - 1);
  r record;
BEGIN
  FOR r IN
    SELECT m.id FROM public.site_milestones m
    WHERE COALESCE(m.is_active, true)
      AND m.end_date = v_yesterday
      AND COALESCE(m.percent_complete, 0) < 100
      AND COALESCE(m.status, '') NOT ILIKE 'complete%'
  LOOP
    PERFORM public.emit_notification_event('MILESTONE_OVERDUE', 'site_milestones', r.id::text, NULL,
      public.notif_milestone_ctx(r.id));
  END LOOP;

  FOR r IN
    SELECT t.id, COALESCE(t.assignee_id, t.created_by) AS person FROM public.pm_tasks t
    WHERE t.due_date = v_yesterday
      AND t.status::text NOT IN ('done', 'cancelled')
  LOOP
    PERFORM public.emit_notification_event('TASK_OVERDUE', 'pm_tasks', r.id::text, r.person,
      public.notif_task_ctx(r.id));
  END LOOP;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.notif_daily_checks() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'notif-daily-checks';
  PERFORM cron.schedule('notif-daily-checks', '30 3 * * *', 'SELECT public.notif_daily_checks();');
EXCEPTION WHEN others THEN
  RAISE WARNING 'notif-daily-checks not scheduled: %', SQLERRM;
END $$;

-- 11. Catalogue ---------------------------------------------------------------
UPDATE public.notification_event_types SET extra_receivers = ARRAY['project_members','site_team']
WHERE source_table = 'activity_events';

INSERT INTO public.notification_event_types
  (source_table, event_code, module_label, label, description, tokens, app_already_notifies, sort_order, extra_receivers)
VALUES
  ('leads', 'RECORD_CREATED', 'Leads', 'Lead created', 'A new lead is added',
    ARRAY['user_name','lead_name','company','lead_status','value'], false, 60, '{}'),
  ('leads', 'LEAD_ASSIGNED', 'Leads', 'Lead assigned', 'A lead is assigned to a new owner (the owner is "the employee")',
    ARRAY['user_name','lead_name','company','assigned_by','value'], false, 61, '{}'),
  ('leads', 'LEAD_STATUS_CHANGED', 'Leads', 'Lead status changed', 'A lead moves to a different status',
    ARRAY['user_name','lead_name','company','lead_status','old_status'], false, 62, '{}'),
  ('leads', 'LEAD_CONVERTED', 'Leads', 'Lead converted', 'A lead is converted to a customer',
    ARRAY['user_name','lead_name','company','value'], false, 63, '{}'),
  ('customer_opportunities', 'RECORD_CREATED', 'Opportunities', 'Opportunity created', 'A new opportunity is added',
    ARRAY['user_name','opportunity_name','customer','amount','stage','close_date'], false, 70, '{}'),
  ('customer_opportunities', 'OPPORTUNITY_STAGE_CHANGED', 'Opportunities', 'Stage changed', 'An opportunity moves to another stage',
    ARRAY['user_name','opportunity_name','customer','amount','stage','old_stage','probability'], false, 71, '{}'),
  ('customer_opportunities', 'OPPORTUNITY_WON', 'Opportunities', 'Opportunity won', 'Stage changes to a "won" stage',
    ARRAY['user_name','opportunity_name','customer','amount','stage'], false, 72, '{}'),
  ('customer_opportunities', 'OPPORTUNITY_LOST', 'Opportunities', 'Opportunity lost', 'Stage changes to a "lost" stage',
    ARRAY['user_name','opportunity_name','customer','amount','stage'], false, 73, '{}'),
  ('pm_tasks', 'TASK_ASSIGNED', 'Tasks', 'Task assigned', 'A task is assigned (the assignee is "the employee")',
    ARRAY['user_name','task_title','project_name','due_date','priority','assigned_by'], false, 80, ARRAY['project_members']),
  ('pm_tasks', 'TASK_STATUS_CHANGED', 'Tasks', 'Task status changed', 'A task moves to another status',
    ARRAY['user_name','task_title','project_name','status','due_date'], false, 81, ARRAY['project_members']),
  ('pm_tasks', 'TASK_COMPLETED', 'Tasks', 'Task completed', 'A task is marked done',
    ARRAY['user_name','task_title','project_name'], false, 82, ARRAY['project_members']),
  ('pm_tasks', 'TASK_BLOCKED', 'Tasks', 'Task blocked', 'A task is flagged as blocked',
    ARRAY['user_name','task_title','project_name','reason'], false, 83, ARRAY['project_members']),
  ('pm_tasks', 'TASK_OVERDUE', 'Tasks', 'Task overdue', 'Checked daily at 9:00 AM — due yesterday and not done',
    ARRAY['user_name','task_title','project_name','due_date','status'], false, 84, ARRAY['project_members']),
  ('pm_tasks', 'COMMENT_ADDED', 'Tasks', 'Comment added', 'Someone comments on a task (they are not notified themselves)',
    ARRAY['user_name','task_title','project_name','commenter_name','comment'], false, 85, ARRAY['project_members']),
  ('pm_tasks', 'FILE_UPLOADED', 'Tasks', 'File uploaded', 'Someone attaches a file to a task',
    ARRAY['user_name','task_title','project_name','commenter_name','file_name'], false, 86, ARRAY['project_members']),
  ('site_milestones', 'MILESTONE_AT_RISK', 'Site milestones', 'Milestone at risk', 'A milestone is flagged at risk',
    ARRAY['milestone_name','site_name','end_date','percent_complete'], false, 90, ARRAY['site_team']),
  ('site_milestones', 'MILESTONE_COMPLETED', 'Site milestones', 'Milestone completed', 'A milestone reaches 100% or completed',
    ARRAY['milestone_name','site_name','end_date'], false, 91, ARRAY['site_team']),
  ('site_milestones', 'MILESTONE_OVERDUE', 'Site milestones', 'Milestone overdue', 'Checked daily at 9:00 AM — ended yesterday and not complete',
    ARRAY['milestone_name','site_name','end_date','percent_complete'], false, 92, ARRAY['site_team']),
  ('procurement_orders', 'RECORD_CREATED', 'Procurement', 'PO / requisition created', 'A purchase order or requisition is raised',
    ARRAY['user_name','po_number','vendor','site_name','amount','status'], false, 100, ARRAY['site_team']),
  ('procurement_orders', 'PO_STATUS_CHANGED', 'Procurement', 'PO status changed', 'A purchase order changes status',
    ARRAY['user_name','po_number','vendor','site_name','status','old_status'], false, 101, ARRAY['site_team']),
  ('procurement_orders', 'GRN_RECEIVED', 'Procurement', 'Goods received (GRN)', 'Goods are received against a PO',
    ARRAY['user_name','po_number','vendor','site_name','grn_number','receipt_date','commenter_name'], false, 102, ARRAY['site_team']),
  ('procurement_orders', 'INVOICE_ADDED', 'Procurement', 'Invoice added', 'A vendor invoice is recorded',
    ARRAY['user_name','po_number','vendor','invoice_number','invoice_date','amount'], false, 103, ARRAY['site_team']),
  ('procurement_orders', 'PAYMENT_RECORDED', 'Procurement', 'Payment recorded', 'A payment is recorded against an invoice',
    ARRAY['user_name','po_number','vendor','invoice_number','amount','payment_date','reference'], false, 104, ARRAY['site_team'])
ON CONFLICT (source_table, event_code) DO UPDATE SET
  module_label = EXCLUDED.module_label, label = EXCLUDED.label, description = EXCLUDED.description,
  tokens = EXCLUDED.tokens, app_already_notifies = EXCLUDED.app_already_notifies,
  sort_order = EXCLUDED.sort_order, extra_receivers = EXCLUDED.extra_receivers;

-- 12. Starter rules (all OFF) -------------------------------------------------
INSERT INTO public.notification_rules
  (name, source_table, event_code, title_template, message_template, receiver_type, notification_channel, is_active)
SELECT v.* FROM (VALUES
  ('Lead assigned → new owner', 'leads', 'LEAD_ASSIGNED',
   'New lead assigned: {lead_name}', '{assigned_by} assigned you the lead {lead_name} ({company}).',
   'employee', 'in_app_push', false),
  ('Opportunity won → admins', 'customer_opportunities', 'OPPORTUNITY_WON',
   'Opportunity won: {opportunity_name}', '{user_name} won {opportunity_name} with {customer} worth {amount}.',
   'admin', 'in_app_push', false),
  ('Task assigned → assignee', 'pm_tasks', 'TASK_ASSIGNED',
   'New task: {task_title}', '{assigned_by} assigned you "{task_title}" in {project_name}. Due {due_date}.',
   'employee', 'in_app_push', false),
  ('Task comment → assignee', 'pm_tasks', 'COMMENT_ADDED',
   'New comment on {task_title}', '{commenter_name}: {comment}',
   'employee', 'in_app', false),
  ('Milestone at risk → site team', 'site_milestones', 'MILESTONE_AT_RISK',
   'Milestone at risk: {milestone_name}', '{milestone_name} at {site_name} is at risk ({percent_complete}% done, due {end_date}).',
   'site_team', 'in_app_push', false),
  ('Milestone overdue → admins', 'site_milestones', 'MILESTONE_OVERDUE',
   'Milestone overdue: {milestone_name}', '{milestone_name} at {site_name} was due {end_date} and is {percent_complete}% complete.',
   'admin', 'in_app_push', false),
  ('Goods received → admins', 'procurement_orders', 'GRN_RECEIVED',
   'Goods received: {po_number}', 'Goods from {vendor} were received for {po_number} at {site_name} on {receipt_date}.',
   'admin', 'in_app', false)
) AS v(name, source_table, event_code, title_template, message_template, receiver_type, notification_channel, is_active)
WHERE NOT EXISTS (SELECT 1 FROM public.notification_rules r WHERE r.name = v.name);
