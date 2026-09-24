CREATE TABLE public.expense_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  claim_date date NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','approved','rejected')),
  approver_id uuid,
  total_amount numeric NOT NULL DEFAULT 0,
  notes text,
  submitted_at timestamptz,
  decided_at timestamptz,
  decided_by uuid,
  rejection_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, claim_date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expense_claims TO authenticated;
GRANT ALL ON public.expense_claims TO service_role;
ALTER TABLE public.expense_claims ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.expense_claim_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id uuid NOT NULL REFERENCES public.expense_claims(id) ON DELETE CASCADE,
  line_type text NOT NULL CHECK (line_type IN ('travel','meeting','petty_cash','expense')),
  activity_id uuid,
  expense_id uuid REFERENCES public.additional_expenses(id) ON DELETE SET NULL,
  description text,
  distance_km numeric,
  minutes integer,
  amount numeric NOT NULL DEFAULT 0,
  bill_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.expense_claim_lines(claim_id);
CREATE UNIQUE INDEX expense_claim_lines_expense_uniq ON public.expense_claim_lines(expense_id) WHERE expense_id IS NOT NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expense_claim_lines TO authenticated;
GRANT ALL ON public.expense_claim_lines TO service_role;
ALTER TABLE public.expense_claim_lines ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.can_view_claim_user(_owner uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _owner = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (SELECT 1 FROM public.get_user_hierarchy(auth.uid()) h WHERE h.user_id = _owner)
$$;

CREATE POLICY "claims view" ON public.expense_claims FOR SELECT TO authenticated
  USING (public.can_view_claim_user(user_id) OR approver_id = auth.uid());
CREATE POLICY "claims insert own" ON public.expense_claims FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND status = 'draft');
CREATE POLICY "claims edit own draft" ON public.expense_claims FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND status IN ('draft','rejected'))
  WITH CHECK (user_id = auth.uid() AND status IN ('draft','rejected'));
CREATE POLICY "claims delete own draft" ON public.expense_claims FOR DELETE TO authenticated
  USING (user_id = auth.uid() AND status IN ('draft','rejected'));
CREATE POLICY "claims admin" ON public.expense_claims FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "lines view" ON public.expense_claim_lines FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.expense_claims c WHERE c.id = claim_id AND (public.can_view_claim_user(c.user_id) OR c.approver_id = auth.uid())));
CREATE POLICY "lines edit own draft" ON public.expense_claim_lines FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.expense_claims c WHERE c.id = claim_id AND c.user_id = auth.uid() AND c.status IN ('draft','rejected')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.expense_claims c WHERE c.id = claim_id AND c.user_id = auth.uid() AND c.status IN ('draft','rejected')));
CREATE POLICY "lines admin" ON public.expense_claim_lines FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_expense_claims_updated BEFORE UPDATE ON public.expense_claims
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.submit_expense_claim(_claim_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.expense_claims; v_mgr uuid; v_total numeric;
BEGIN
  SELECT * INTO c FROM public.expense_claims WHERE id = _claim_id;
  IF c.id IS NULL OR c.user_id <> auth.uid() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF c.status NOT IN ('draft','rejected') THEN RAISE EXCEPTION 'Claim already submitted'; END IF;
  SELECT COALESCE(sum(amount),0) INTO v_total FROM public.expense_claim_lines WHERE claim_id = _claim_id;
  SELECT reporting_manager_id INTO v_mgr FROM public.users WHERE id = c.user_id;
  UPDATE public.expense_claims SET status='submitted', approver_id=v_mgr, total_amount=v_total,
    submitted_at=now(), rejection_reason=NULL, decided_at=NULL, decided_by=NULL WHERE id=_claim_id;
  IF v_mgr IS NOT NULL THEN
    PERFORM public.send_notification(v_mgr, 'Expense claim submitted',
      public.notif_user_name(c.user_id) || ' submitted a claim for ' || to_char(c.claim_date,'DD Mon YYYY') || ' (Rs ' || v_total || ')',
      'expense', 'expense_claims', _claim_id);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.decide_expense_claim(_claim_id uuid, _approve boolean, _reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.expense_claims; v_status text;
BEGIN
  SELECT * INTO c FROM public.expense_claims WHERE id = _claim_id;
  IF c.id IS NULL THEN RAISE EXCEPTION 'Claim not found'; END IF;
  IF c.status <> 'submitted' THEN RAISE EXCEPTION 'Claim is not awaiting approval'; END IF;
  IF c.user_id = auth.uid() AND NOT public.has_role(auth.uid(),'admin'::app_role) THEN RAISE EXCEPTION 'You cannot approve your own claim'; END IF;
  IF NOT (c.approver_id = auth.uid() OR public.has_role(auth.uid(),'admin'::app_role)
          OR EXISTS (SELECT 1 FROM public.get_user_hierarchy(auth.uid()) h WHERE h.user_id = c.user_id)) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  v_status := CASE WHEN _approve THEN 'approved' ELSE 'rejected' END;
  UPDATE public.expense_claims SET status=v_status, decided_at=now(), decided_by=auth.uid(),
    rejection_reason=CASE WHEN _approve THEN NULL ELSE _reason END WHERE id=_claim_id;
  UPDATE public.additional_expenses e SET status=v_status,
    rejection_reason=CASE WHEN _approve THEN NULL ELSE _reason END
    FROM public.expense_claim_lines l WHERE l.claim_id=_claim_id AND l.expense_id=e.id;
  PERFORM public.send_notification(c.user_id, 'Expense claim ' || v_status,
    'Your claim for ' || to_char(c.claim_date,'DD Mon YYYY') || ' was ' || v_status || COALESCE(': ' || _reason, ''),
    'expense', 'expense_claims', _claim_id);
END $$;

GRANT EXECUTE ON FUNCTION public.submit_expense_claim(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decide_expense_claim(uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_claim_user(uuid) TO authenticated;