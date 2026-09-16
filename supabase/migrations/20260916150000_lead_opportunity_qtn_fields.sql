-- Opportunity Highlight: add Enq Rcd Dt / Qtn No / Qtn Date / Value without
-- GST, matching the "Format C - Enquiry Followup Register" the sales team
-- already tracks in Excel. Indicative Budget is left in place (still used
-- by lead scoring and historical data) -- it's just no longer collected
-- from this form.
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS enquiry_received_date date,
  ADD COLUMN IF NOT EXISTS quotation_number text,
  ADD COLUMN IF NOT EXISTS quotation_date date,
  ADD COLUMN IF NOT EXISTS value_without_gst numeric;

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
    'enquiry_received_date','quotation_number','quotation_date','value_without_gst',
    'target_first_contact_date','actual_first_contact_date','target_conversion_date','owner_id'
  ];
  labels jsonb := jsonb_build_object(
    'name','Name','title','Designation','company','Company','email','Email','phone','Phone',
    'website','Website','address','Address','industry','Industry','lead_source_id','Source',
    'related_event_id','Related Event','contact_role','Contact Role',
    'researched_information','Requirement Overview','indicative_budget','Indicative Budget',
    'opportunity_value','Opportunity Value','opportunity_close_date','Close Date',
    'opportunity_probability','Probability of Win',
    'enquiry_received_date','Enq Rcd Dt','quotation_number','Qtn No','quotation_date','Qtn Date',
    'value_without_gst','Value without GST',
    'target_first_contact_date','Target First Contact',
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
