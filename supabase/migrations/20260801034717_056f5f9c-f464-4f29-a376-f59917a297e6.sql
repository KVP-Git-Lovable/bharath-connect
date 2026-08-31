ALTER TABLE public.customer_documents
  ADD COLUMN IF NOT EXISTS doc_type text,
  ADD COLUMN IF NOT EXISTS updated_by uuid;

CREATE POLICY "Authenticated can insert lead audit entries"
ON public.lead_audit_log
FOR INSERT
TO authenticated
WITH CHECK (actor_id = auth.uid());

GRANT SELECT, INSERT ON public.lead_audit_log TO authenticated;