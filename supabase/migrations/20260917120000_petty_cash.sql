-- Petty Cash: cash advances issued to employees (replaces the Additional Expenses Policy card in Expense Master).
-- "Spent" is not stored: the app sums the employee's approved additional_expenses between issued_on and settled_on (or today).

CREATE TABLE IF NOT EXISTS public.petty_cash_advances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  amount numeric NOT NULL DEFAULT 0 CHECK (amount >= 0),
  issued_on date NOT NULL DEFAULT CURRENT_DATE,
  payment_mode text NOT NULL DEFAULT 'cash' CHECK (payment_mode IN ('cash','upi','bank')),
  purpose text,
  reference_no text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','settled')),
  settled_on date,
  settlement_note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS petty_cash_advances_user_idx ON public.petty_cash_advances(user_id, issued_on DESC);

-- Every money movement on an advance (initial issue and each top-up), for audit.
CREATE TABLE IF NOT EXISTS public.petty_cash_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  advance_id uuid NOT NULL REFERENCES public.petty_cash_advances(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('issue','topup')),
  amount numeric NOT NULL CHECK (amount > 0),
  txn_date date NOT NULL DEFAULT CURRENT_DATE,
  payment_mode text NOT NULL DEFAULT 'cash' CHECK (payment_mode IN ('cash','upi','bank')),
  reference_no text,
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS petty_cash_transactions_advance_idx ON public.petty_cash_transactions(advance_id);

ALTER TABLE public.petty_cash_advances ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "petty_cash_advances admin all" ON public.petty_cash_advances;
CREATE POLICY "petty_cash_advances admin all" ON public.petty_cash_advances FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "petty_cash_advances own read" ON public.petty_cash_advances;
CREATE POLICY "petty_cash_advances own read" ON public.petty_cash_advances FOR SELECT TO authenticated
USING (user_id = auth.uid());

ALTER TABLE public.petty_cash_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "petty_cash_transactions admin all" ON public.petty_cash_transactions;
CREATE POLICY "petty_cash_transactions admin all" ON public.petty_cash_transactions FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "petty_cash_transactions own read" ON public.petty_cash_transactions;
CREATE POLICY "petty_cash_transactions own read" ON public.petty_cash_transactions FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.petty_cash_advances a WHERE a.id = advance_id AND a.user_id = auth.uid()));

DROP TRIGGER IF EXISTS update_petty_cash_advances_updated_at ON public.petty_cash_advances;
CREATE TRIGGER update_petty_cash_advances_updated_at BEFORE UPDATE ON public.petty_cash_advances
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
