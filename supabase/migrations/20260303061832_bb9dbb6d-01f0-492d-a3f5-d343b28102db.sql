
-- 1. Create expense_categories table
CREATE TABLE public.expense_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  monthly_limit NUMERIC NULL,
  daily_limit NUMERIC NULL,
  receipt_required_above NUMERIC NULL,
  auto_approval_limit NUMERIC NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage expense categories"
  ON public.expense_categories FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated can view expense categories"
  ON public.expense_categories FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE TRIGGER update_expense_categories_updated_at
  BEFORE UPDATE ON public.expense_categories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed default categories
INSERT INTO public.expense_categories (name) VALUES
  ('Travel'), ('Food'), ('Lodging'), ('Internet'), ('Fuel'), ('Telephone Expense'), ('Stay'), ('Other');

-- 2. Create expense_policy table (single-row config)
CREATE TABLE public.expense_policy (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  submission_deadline INTEGER NOT NULL DEFAULT 5,
  allow_backdate BOOLEAN NOT NULL DEFAULT true,
  max_back_days INTEGER NOT NULL DEFAULT 30,
  multi_level_approval BOOLEAN NOT NULL DEFAULT false,
  month_lock_enabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.expense_policy ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage expense policy"
  ON public.expense_policy FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated can view expense policy"
  ON public.expense_policy FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE TRIGGER update_expense_policy_updated_at
  BEFORE UPDATE ON public.expense_policy
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default policy row
INSERT INTO public.expense_policy (submission_deadline, allow_backdate, max_back_days, multi_level_approval, month_lock_enabled)
VALUES (5, true, 30, false, false);

-- 3. Alter additional_expenses table
ALTER TABLE public.additional_expenses
  ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES public.expense_categories(id),
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS month_key TEXT;
