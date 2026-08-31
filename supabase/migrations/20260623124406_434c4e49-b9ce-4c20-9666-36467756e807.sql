-- Add multi-vendor support and requisition notes to procurement orders
ALTER TABLE public.procurement_orders
  ADD COLUMN IF NOT EXISTS vendor_ids uuid[],
  ADD COLUMN IF NOT EXISTS requisition_notes text;

-- Sequence + trigger to auto-generate PO numbers once a requisition is approved
CREATE SEQUENCE IF NOT EXISTS public.po_number_seq START 1;

CREATE OR REPLACE FUNCTION public.set_po_number()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  -- Generate a PO number the first time the order leaves the Requisition stage
  IF NEW.po_number IS NULL AND NEW.status <> 'Requisition' THEN
    NEW.po_number := 'PO-' || lpad(nextval('public.po_number_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_po_number ON public.procurement_orders;
CREATE TRIGGER trg_set_po_number
BEFORE INSERT OR UPDATE ON public.procurement_orders
FOR EACH ROW EXECUTE FUNCTION public.set_po_number();