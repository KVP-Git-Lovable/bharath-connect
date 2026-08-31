-- Add foreign key constraints for leads table user references
-- This enables Supabase PostgREST to automatically join user data

ALTER TABLE public.leads
ADD CONSTRAINT fk_leads_owner_id
  FOREIGN KEY (owner_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.leads
ADD CONSTRAINT fk_leads_created_by
  FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;

-- Create indexes for better query performance
CREATE INDEX idx_leads_owner ON public.leads(owner_id);
CREATE INDEX idx_leads_created_by ON public.leads(created_by);
