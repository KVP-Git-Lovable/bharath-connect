
-- Approval Workflows table
CREATE TABLE public.expense_approval_workflows (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  approval_type TEXT NOT NULL DEFAULT 'sequential',
  steps INTEGER NOT NULL DEFAULT 1,
  is_default BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.expense_approval_workflows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage workflows" ON public.expense_approval_workflows FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Authenticated can view workflows" ON public.expense_approval_workflows FOR SELECT TO authenticated USING (true);

-- Approval Rules table
CREATE TABLE public.expense_approval_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  rule_name TEXT NOT NULL,
  condition_type TEXT NOT NULL DEFAULT 'amount_range',
  min_amount NUMERIC DEFAULT NULL,
  max_amount NUMERIC DEFAULT NULL,
  category_id UUID REFERENCES public.expense_categories(id) ON DELETE SET NULL DEFAULT NULL,
  workflow_id UUID REFERENCES public.expense_approval_workflows(id) ON DELETE CASCADE NOT NULL,
  priority INTEGER NOT NULL DEFAULT 100,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.expense_approval_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage rules" ON public.expense_approval_rules FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Authenticated can view rules" ON public.expense_approval_rules FOR SELECT TO authenticated USING (true);

-- Policy notes column on expense_policy
ALTER TABLE public.expense_policy ADD COLUMN IF NOT EXISTS policy_notes TEXT DEFAULT NULL;

-- Insert a default workflow
INSERT INTO public.expense_approval_workflows (name, approval_type, steps, is_default) VALUES ('Manager Approval', 'sequential', 1, true);
