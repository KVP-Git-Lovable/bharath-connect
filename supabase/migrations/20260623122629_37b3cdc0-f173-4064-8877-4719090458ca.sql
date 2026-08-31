ALTER TABLE public.procurement_orders ALTER COLUMN status SET DEFAULT 'Requisition';
UPDATE public.procurement_orders SET status = 'Requisition' WHERE status = 'Draft';
UPDATE public.procurement_orders SET status = 'Requisition Approved' WHERE status = 'Vendor Identified';