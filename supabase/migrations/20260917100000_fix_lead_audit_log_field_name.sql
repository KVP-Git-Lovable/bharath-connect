-- lead_audit_trigger() writes a field_name column that an earlier migration
-- (20260827170244) was supposed to have added to lead_audit_log. That
-- column doesn't actually exist on this database, causing every lead
-- create/update to fail with "column field_name does not exist". Patching
-- it defensively here rather than relying on migration history matching
-- the live schema.
ALTER TABLE public.lead_audit_log ADD COLUMN IF NOT EXISTS field_name text;
