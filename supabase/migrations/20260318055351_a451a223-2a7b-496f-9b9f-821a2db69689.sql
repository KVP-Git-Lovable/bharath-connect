ALTER TABLE public.project_sites ADD COLUMN IF NOT EXISTS start_date date NOT NULL DEFAULT CURRENT_DATE;
ALTER TABLE public.project_sites ADD COLUMN IF NOT EXISTS end_date date;