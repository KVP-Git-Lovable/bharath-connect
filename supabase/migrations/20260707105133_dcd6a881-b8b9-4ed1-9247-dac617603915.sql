ALTER TABLE public.customer_opportunities ALTER COLUMN customer_id DROP NOT NULL;
ALTER TABLE public.customer_contacts ALTER COLUMN customer_id DROP NOT NULL;
ALTER TABLE public.customer_activities ALTER COLUMN customer_id DROP NOT NULL;
ALTER TABLE public.customer_documents ALTER COLUMN customer_id DROP NOT NULL;