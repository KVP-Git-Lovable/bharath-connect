ALTER TABLE public.lead_audit_log ADD COLUMN IF NOT EXISTS field_name text;

CREATE OR REPLACE FUNCTION public.lead_audit_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from text;
  v_to text;
  f text;
  fields text[] := ARRAY[
    'name','title','company','email','phone','website','address','industry',
    'lead_source_id','related_event_id','contact_role','researched_information',
    'indicative_budget','opportunity_value','opportunity_close_date','opportunity_probability',
    'target_first_contact_date','actual_first_contact_date','target_conversion_date','owner_id'
  ];
  labels jsonb := jsonb_build_object(
    'name','Name','title','Designation','company','Company','email','Email','phone','Phone',
    'website','Website','address','Address','industry','Industry','lead_source_id','Source',
    'related_event_id','Related Event','contact_role','Contact Role',
    'researched_information','Requirement Overview','indicative_budget','Indicative Budget',
    'opportunity_value','Opportunity Value','opportunity_close_date','Close Date',
    'opportunity_probability','Probability of Win','target_first_contact_date','Target First Contact',
    'actual_first_contact_date','Actual First Contact','target_conversion_date','Target Conversion',
    'owner_id','Owner'
  );
  old_j jsonb;
  new_j jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.lead_audit_log (lead_id, actor_id, action, to_value, field_name)
    VALUES (NEW.id, auth.uid(), 'created', (SELECT name FROM public.master_lead_statuses WHERE id = NEW.lead_status_id), 'Status');
    RETURN NEW;
  END IF;

  IF COALESCE(NEW.lead_status_id::text,'') IS DISTINCT FROM COALESCE(OLD.lead_status_id::text,'') THEN
    SELECT name INTO v_from FROM public.master_lead_statuses WHERE id = OLD.lead_status_id;
    SELECT name INTO v_to FROM public.master_lead_statuses WHERE id = NEW.lead_status_id;
    INSERT INTO public.lead_audit_log (lead_id, actor_id, action, from_value, to_value, field_name)
    VALUES (NEW.id, auth.uid(), 'status_change', v_from, v_to, 'Status');
  END IF;

  old_j := to_jsonb(OLD);
  new_j := to_jsonb(NEW);
  FOREACH f IN ARRAY fields LOOP
    IF COALESCE(old_j->>f,'') IS DISTINCT FROM COALESCE(new_j->>f,'') THEN
      INSERT INTO public.lead_audit_log (lead_id, actor_id, action, from_value, to_value, field_name)
      VALUES (NEW.id, auth.uid(), 'field_change', old_j->>f, new_j->>f, COALESCE(labels->>f, f));
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.lead_activity_audit_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  f text;
  fields text[] := ARRAY['activity_name','activity_type','activity_date','description','outcome','status','next_follow_up','next_follow_up_date'];
  labels jsonb := jsonb_build_object(
    'activity_name','Activity Name','activity_type','Activity Type','activity_date','Activity Date',
    'description','Activity Comment','outcome','Outcome','status','Activity Status',
    'next_follow_up','Next Follow-up','next_follow_up_date','Next Follow-up Date'
  );
  old_j jsonb;
  new_j jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.lead_id IS NOT NULL THEN
      INSERT INTO public.lead_audit_log (lead_id, actor_id, action, to_value, field_name)
      VALUES (NEW.lead_id, auth.uid(), 'activity_created', COALESCE(NEW.activity_name, NEW.activity_type), 'Activity');
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.lead_id IS NOT NULL THEN
      INSERT INTO public.lead_audit_log (lead_id, actor_id, action, from_value, field_name)
      VALUES (OLD.lead_id, auth.uid(), 'activity_deleted', COALESCE(OLD.activity_name, OLD.activity_type), 'Activity');
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.lead_id IS NULL THEN RETURN NEW; END IF;

  old_j := to_jsonb(OLD);
  new_j := to_jsonb(NEW);
  FOREACH f IN ARRAY fields LOOP
    IF COALESCE(old_j->>f,'') IS DISTINCT FROM COALESCE(new_j->>f,'') THEN
      INSERT INTO public.lead_audit_log (lead_id, actor_id, action, from_value, to_value, field_name)
      VALUES (NEW.lead_id, auth.uid(), 'activity_change', old_j->>f, new_j->>f,
              COALESCE(labels->>f, f) || ' · ' || COALESCE(NEW.activity_name, NEW.activity_type, 'Activity'));
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS lead_activity_audit ON public.activity_events;
CREATE TRIGGER lead_activity_audit
AFTER INSERT OR UPDATE OR DELETE ON public.activity_events
FOR EACH ROW EXECUTE FUNCTION public.lead_activity_audit_trigger();