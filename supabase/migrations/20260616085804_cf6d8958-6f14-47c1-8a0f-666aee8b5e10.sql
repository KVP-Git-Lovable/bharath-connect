ALTER TABLE public.project_sites
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'planned',
  ADD COLUMN IF NOT EXISTS attachment_urls text[] NOT NULL DEFAULT '{}';

-- Backfill status from existing is_active flag where helpful
UPDATE public.project_sites SET status = 'planned' WHERE status IS NULL;