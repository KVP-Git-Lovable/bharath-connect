ALTER TABLE public.procurement_vendor_feedback
  ADD CONSTRAINT procurement_vendor_feedback_po_id_fkey
  FOREIGN KEY (po_id) REFERENCES public.procurement_orders(id) ON DELETE SET NULL;