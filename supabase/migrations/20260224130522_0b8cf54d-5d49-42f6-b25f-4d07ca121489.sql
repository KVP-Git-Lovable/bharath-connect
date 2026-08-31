
-- =============================================
-- Migration 2-9: Complete Database Schema
-- =============================================

-- ========== EMPLOYEES ==========
CREATE TYPE public.employee_doc_type AS ENUM ('address_proof', 'id_proof', 'other');

CREATE TABLE public.employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  monthly_salary DECIMAL(12,2) DEFAULT 0,
  daily_da_allowance DECIMAL(10,2) DEFAULT 0,
  manager_id UUID REFERENCES auth.users(id),
  secondary_manager_id UUID REFERENCES auth.users(id),
  hq TEXT,
  date_of_joining DATE,
  date_of_exit DATE,
  alternate_email TEXT,
  address TEXT,
  education TEXT,
  emergency_contact_number TEXT,
  photo_url TEXT,
  band TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own employee record" ON public.employees FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Admins can view all employees" ON public.employees FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can insert employees" ON public.employees FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update employees" ON public.employees FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete employees" ON public.employees FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_employees_updated_at BEFORE UPDATE ON public.employees FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.employee_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  doc_type employee_doc_type NOT NULL DEFAULT 'other',
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  content_type TEXT,
  uploaded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.employee_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own docs" ON public.employee_documents FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Admins can manage docs" ON public.employee_documents FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- ========== ATTENDANCE & LEAVE ==========
CREATE TABLE public.attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  check_in_time TIMESTAMPTZ,
  check_out_time TIMESTAMPTZ,
  check_in_location JSONB,
  check_out_location JSONB,
  check_in_photo_url TEXT,
  check_out_photo_url TEXT,
  status TEXT NOT NULL DEFAULT 'present',
  total_hours DECIMAL(5,2),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own attendance" ON public.attendance FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Admins can view all attendance" ON public.attendance FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can insert own attendance" ON public.attendance FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own attendance" ON public.attendance FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Admins can manage attendance" ON public.attendance FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER update_attendance_updated_at BEFORE UPDATE ON public.attendance FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.holidays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  holiday_name TEXT NOT NULL,
  description TEXT,
  year INTEGER NOT NULL DEFAULT EXTRACT(YEAR FROM CURRENT_DATE),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.holidays ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view holidays" ON public.holidays FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage holidays" ON public.holidays FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.leave_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  max_days INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.leave_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view leave types" ON public.leave_types FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage leave types" ON public.leave_types FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.leave_balance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  leave_type_id UUID REFERENCES public.leave_types(id) ON DELETE CASCADE NOT NULL,
  opening_balance DECIMAL(5,1) NOT NULL DEFAULT 0,
  used_balance DECIMAL(5,1) NOT NULL DEFAULT 0,
  remaining_balance DECIMAL(5,1) GENERATED ALWAYS AS (opening_balance - used_balance) STORED,
  year INTEGER NOT NULL DEFAULT EXTRACT(YEAR FROM CURRENT_DATE),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.leave_balance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own leave balance" ON public.leave_balance FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Admins can manage leave balance" ON public.leave_balance FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.leave_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  leave_type_id UUID REFERENCES public.leave_types(id) NOT NULL,
  from_date DATE NOT NULL,
  to_date DATE NOT NULL,
  total_days DECIMAL(5,1) NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.leave_applications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own leave apps" ON public.leave_applications FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can insert own leave apps" ON public.leave_applications FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Admins can manage leave apps" ON public.leave_applications FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER update_leave_applications_updated_at BEFORE UPDATE ON public.leave_applications FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.regularization_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  date DATE NOT NULL,
  request_type TEXT NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  approved_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.regularization_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own regularization" ON public.regularization_requests FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can insert own regularization" ON public.regularization_requests FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Admins can manage regularization" ON public.regularization_requests FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- ========== VISITS & RETAILERS ==========
CREATE TABLE public.retailers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  beat_id TEXT,
  name TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  category TEXT,
  priority TEXT DEFAULT 'medium',
  latitude DECIMAL(10,8),
  longitude DECIMAL(11,8),
  last_visit_date DATE,
  order_value DECIMAL(12,2) DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  notes TEXT,
  location_tag TEXT,
  retail_type TEXT,
  potential TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.retailers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own retailers" ON public.retailers FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can manage own retailers" ON public.retailers FOR ALL TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Admins can manage all retailers" ON public.retailers FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER update_retailers_updated_at BEFORE UPDATE ON public.retailers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.beat_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  plan_date DATE NOT NULL,
  beat_id TEXT,
  beat_name TEXT,
  beat_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.beat_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own beat plans" ON public.beat_plans FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can manage own beat plans" ON public.beat_plans FOR ALL TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Admins can manage all beat plans" ON public.beat_plans FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  retailer_id UUID REFERENCES public.retailers(id),
  planned_date DATE,
  status TEXT NOT NULL DEFAULT 'planned',
  check_in_time TIMESTAMPTZ,
  check_in_location JSONB,
  check_in_photo_url TEXT,
  location_match_in BOOLEAN,
  check_out_time TIMESTAMPTZ,
  check_out_location JSONB,
  check_out_photo_url TEXT,
  location_match_out BOOLEAN,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.visits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own visits" ON public.visits FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can manage own visits" ON public.visits FOR ALL TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Admins can manage all visits" ON public.visits FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER update_visits_updated_at BEFORE UPDATE ON public.visits FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  visit_id UUID REFERENCES public.visits(id),
  retailer_name TEXT,
  subtotal DECIMAL(12,2) DEFAULT 0,
  discount_amount DECIMAL(12,2) DEFAULT 0,
  total_amount DECIMAL(12,2) DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own orders" ON public.orders FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can manage own orders" ON public.orders FOR ALL TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Admins can manage all orders" ON public.orders FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE NOT NULL,
  product_id UUID,
  product_name TEXT NOT NULL,
  category TEXT,
  rate DECIMAL(10,2) NOT NULL DEFAULT 0,
  unit TEXT,
  quantity INTEGER NOT NULL DEFAULT 1,
  total DECIMAL(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own order items" ON public.order_items FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.orders WHERE orders.id = order_items.order_id AND orders.user_id = auth.uid())
);
CREATE POLICY "Admins can manage all order items" ON public.order_items FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- ========== EXPENSES ==========
CREATE TABLE public.additional_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  category TEXT NOT NULL,
  custom_category TEXT,
  amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  description TEXT,
  bill_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.additional_expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own expenses" ON public.additional_expenses FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can insert own expenses" ON public.additional_expenses FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Admins can manage all expenses" ON public.additional_expenses FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER update_expenses_updated_at BEFORE UPDATE ON public.additional_expenses FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.expense_master_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ta_type TEXT NOT NULL DEFAULT 'fixed',
  fixed_ta_amount DECIMAL(10,2) DEFAULT 0,
  da_type TEXT NOT NULL DEFAULT 'fixed',
  fixed_da_amount DECIMAL(10,2) DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.expense_master_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view expense config" ON public.expense_master_config FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage expense config" ON public.expense_master_config FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.beat_allowances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  beat_id TEXT NOT NULL,
  beat_name TEXT NOT NULL,
  ta_amount DECIMAL(10,2) DEFAULT 0,
  da_amount DECIMAL(10,2) DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.beat_allowances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view beat allowances" ON public.beat_allowances FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage beat allowances" ON public.beat_allowances FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- ========== GPS TRACKING ==========
CREATE TABLE public.gps_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  latitude DECIMAL(10,8) NOT NULL,
  longitude DECIMAL(11,8) NOT NULL,
  accuracy DECIMAL(8,2),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  speed DECIMAL(8,2),
  heading DECIMAL(6,2)
);

ALTER TABLE public.gps_tracking ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own GPS" ON public.gps_tracking FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can insert own GPS" ON public.gps_tracking FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Admins can view all GPS" ON public.gps_tracking FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_gps_tracking_user_date ON public.gps_tracking(user_id, date);
CREATE INDEX idx_gps_tracking_timestamp ON public.gps_tracking(timestamp);

CREATE TABLE public.gps_tracking_stops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  latitude DECIMAL(10,8) NOT NULL,
  longitude DECIMAL(11,8) NOT NULL,
  reason TEXT,
  duration_minutes INTEGER,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.gps_tracking_stops ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own stops" ON public.gps_tracking_stops FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can insert own stops" ON public.gps_tracking_stops FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Admins can view all stops" ON public.gps_tracking_stops FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

ALTER PUBLICATION supabase_realtime ADD TABLE public.gps_tracking;

-- ========== SECURITY PROFILES ==========
CREATE TABLE public.security_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  is_system BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.security_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view security profiles" ON public.security_profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage security profiles" ON public.security_profiles FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER update_security_profiles_updated_at BEFORE UPDATE ON public.security_profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.user_security_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  profile_id UUID REFERENCES public.security_profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_security_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own security profile" ON public.user_security_profiles FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Admins can manage user security profiles" ON public.user_security_profiles FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.profile_object_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES public.security_profiles(id) ON DELETE CASCADE NOT NULL,
  object_name TEXT NOT NULL,
  can_read BOOLEAN NOT NULL DEFAULT false,
  can_create BOOLEAN NOT NULL DEFAULT false,
  can_edit BOOLEAN NOT NULL DEFAULT false,
  can_delete BOOLEAN NOT NULL DEFAULT false,
  can_view_all BOOLEAN NOT NULL DEFAULT false,
  can_modify_all BOOLEAN NOT NULL DEFAULT false,
  UNIQUE(profile_id, object_name)
);

ALTER TABLE public.profile_object_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view permissions" ON public.profile_object_permissions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage permissions" ON public.profile_object_permissions FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- get_subordinate_users recursive CTE function
CREATE OR REPLACE FUNCTION public.get_subordinate_users(_manager_id UUID)
RETURNS TABLE(user_id UUID, level INTEGER)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH RECURSIVE subordinates AS (
    SELECT e.user_id, 1 AS level
    FROM public.employees e
    WHERE e.manager_id = _manager_id
    UNION ALL
    SELECT e.user_id, s.level + 1
    FROM public.employees e
    INNER JOIN subordinates s ON e.manager_id = s.user_id
    WHERE s.level < 10
  )
  SELECT * FROM subordinates
$$;

-- can_access_object permission check function
CREATE OR REPLACE FUNCTION public.can_access_object(_user_id UUID, _object_name TEXT, _permission TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_security_profiles usp
    JOIN public.profile_object_permissions pop ON pop.profile_id = usp.profile_id
    WHERE usp.user_id = _user_id
      AND pop.object_name = _object_name
      AND (
        (_permission = 'read' AND pop.can_read) OR
        (_permission = 'create' AND pop.can_create) OR
        (_permission = 'edit' AND pop.can_edit) OR
        (_permission = 'delete' AND pop.can_delete) OR
        (_permission = 'view_all' AND pop.can_view_all) OR
        (_permission = 'modify_all' AND pop.can_modify_all)
      )
  )
$$;

-- ========== PRODUCTS ==========
CREATE TABLE public.product_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view categories" ON public.product_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage categories" ON public.product_categories FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku TEXT,
  name TEXT NOT NULL,
  description TEXT,
  category_id UUID REFERENCES public.product_categories(id),
  rate DECIMAL(10,2) NOT NULL DEFAULT 0,
  unit TEXT DEFAULT 'pcs',
  closing_stock INTEGER DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  product_number TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view products" ON public.products FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage products" ON public.products FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.product_schemes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES public.products(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  scheme_type TEXT NOT NULL DEFAULT 'discount',
  condition_quantity INTEGER,
  discount_percentage DECIMAL(5,2),
  discount_amount DECIMAL(10,2),
  free_quantity INTEGER,
  is_active BOOLEAN NOT NULL DEFAULT true,
  start_date DATE,
  end_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.product_schemes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view schemes" ON public.product_schemes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage schemes" ON public.product_schemes FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- ========== ACTIVITY EVENTS ==========
CREATE TABLE public.activity_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  activity_type TEXT NOT NULL,
  activity_name TEXT NOT NULL,
  activity_date DATE NOT NULL DEFAULT CURRENT_DATE,
  duration_type TEXT,
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  from_date DATE,
  to_date DATE,
  total_days DECIMAL(5,1),
  half_day_type TEXT,
  remarks TEXT,
  retailer_id UUID REFERENCES public.retailers(id),
  visit_id UUID REFERENCES public.visits(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.activity_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own activities" ON public.activity_events FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can insert own activities" ON public.activity_events FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Admins can manage all activities" ON public.activity_events FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- ========== COMPANY PROFILE ==========
CREATE TABLE public.company_profile (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name TEXT NOT NULL DEFAULT 'Bharath Builders',
  address TEXT,
  phone TEXT,
  email TEXT,
  logo_url TEXT,
  bank_name TEXT,
  bank_account TEXT,
  bank_ifsc TEXT,
  gst_number TEXT,
  pan_number TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.company_profile ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view company profile" ON public.company_profile FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage company profile" ON public.company_profile FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER update_company_profile_updated_at BEFORE UPDATE ON public.company_profile FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ========== STORAGE BUCKETS ==========
INSERT INTO storage.buckets (id, name, public) VALUES ('employee-photos', 'employee-photos', false);
INSERT INTO storage.buckets (id, name, public) VALUES ('employee-docs', 'employee-docs', false);
INSERT INTO storage.buckets (id, name, public) VALUES ('attendance-photos', 'attendance-photos', false);
INSERT INTO storage.buckets (id, name, public) VALUES ('visit-photos', 'visit-photos', false);
INSERT INTO storage.buckets (id, name, public) VALUES ('expense-bills', 'expense-bills', false);

-- Storage policies for employee-photos
CREATE POLICY "Users can view own employee photos" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'employee-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Admins can view all employee photos" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'employee-photos' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can upload employee photos" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'employee-photos' AND public.has_role(auth.uid(), 'admin'));

-- Storage policies for attendance-photos
CREATE POLICY "Users can upload own attendance photos" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'attendance-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can view own attendance photos" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'attendance-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Storage policies for visit-photos
CREATE POLICY "Users can upload own visit photos" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'visit-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can view own visit photos" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'visit-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Storage policies for expense-bills
CREATE POLICY "Users can upload own expense bills" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'expense-bills' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can view own expense bills" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'expense-bills' AND auth.uid()::text = (storage.foldername(name))[1]);

-- ========== DEFAULT SECURITY PROFILES ==========
INSERT INTO public.security_profiles (name, description, is_system) VALUES
  ('System Administrator', 'Full access to all modules and data', true),
  ('Sales Manager', 'Access to team data, approvals, and reports', true),
  ('Field Sales Executive', 'Standard field user access', true),
  ('Data Viewer', 'Read-only access to reports and data', true);

-- Default permissions for System Administrator
INSERT INTO public.profile_object_permissions (profile_id, object_name, can_read, can_create, can_edit, can_delete, can_view_all, can_modify_all)
SELECT sp.id, obj.name, true, true, true, true, true, true
FROM public.security_profiles sp
CROSS JOIN (VALUES ('retailers'), ('orders'), ('visits'), ('products'), ('territories'), ('attendance'), ('expenses'), ('beats'), ('distributors'), ('invoices')) AS obj(name)
WHERE sp.name = 'System Administrator';

-- Default permissions for Sales Manager
INSERT INTO public.profile_object_permissions (profile_id, object_name, can_read, can_create, can_edit, can_delete, can_view_all, can_modify_all)
SELECT sp.id, obj.name, true, true, true, false, true, false
FROM public.security_profiles sp
CROSS JOIN (VALUES ('retailers'), ('orders'), ('visits'), ('products'), ('attendance'), ('expenses'), ('beats')) AS obj(name)
WHERE sp.name = 'Sales Manager';

-- Default permissions for Field Sales Executive
INSERT INTO public.profile_object_permissions (profile_id, object_name, can_read, can_create, can_edit, can_delete, can_view_all, can_modify_all)
SELECT sp.id, obj.name, true, true, true, false, false, false
FROM public.security_profiles sp
CROSS JOIN (VALUES ('retailers'), ('orders'), ('visits'), ('products'), ('attendance'), ('expenses'), ('beats')) AS obj(name)
WHERE sp.name = 'Field Sales Executive';

-- Default permissions for Data Viewer
INSERT INTO public.profile_object_permissions (profile_id, object_name, can_read, can_create, can_edit, can_delete, can_view_all, can_modify_all)
SELECT sp.id, obj.name, true, false, false, false, true, false
FROM public.security_profiles sp
CROSS JOIN (VALUES ('retailers'), ('orders'), ('visits'), ('products'), ('attendance'), ('expenses'), ('beats')) AS obj(name)
WHERE sp.name = 'Data Viewer';

-- Insert default company profile
INSERT INTO public.company_profile (company_name) VALUES ('Bharath Builders');

-- Insert default expense config
INSERT INTO public.expense_master_config (ta_type, fixed_ta_amount, da_type, fixed_da_amount) VALUES ('fixed', 0, 'fixed', 0);

-- Insert default leave types
INSERT INTO public.leave_types (name, description, max_days) VALUES
  ('Casual Leave', 'For personal matters', 12),
  ('Sick Leave', 'For medical reasons', 12),
  ('Earned Leave', 'Accumulated leave', 15),
  ('Compensatory Off', 'For extra working days', 5);
