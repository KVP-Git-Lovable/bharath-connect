ALTER TABLE public.project_sites ADD COLUMN flag text DEFAULT 'green';
ALTER TABLE public.project_sites ADD CONSTRAINT project_sites_flag_check CHECK (flag IN ('red', 'orange', 'green'));