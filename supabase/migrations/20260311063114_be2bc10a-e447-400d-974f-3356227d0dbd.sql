
-- Dynamic permission definitions table
CREATE TABLE public.permission_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  label text NOT NULL,
  type text NOT NULL CHECK (type IN ('module', 'field', 'action', 'widget')),
  parent_module text REFERENCES public.permission_definitions(name) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.permission_definitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage permission_definitions"
ON public.permission_definitions FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated can view permission_definitions"
ON public.permission_definitions FOR SELECT
TO authenticated
USING (true);

-- Seed modules
INSERT INTO public.permission_definitions (name, label, type, parent_module, sort_order) VALUES
  -- Modules
  ('module_admin_panel', 'Admin Panel', 'module', NULL, 1),
  ('module_attendance', 'Attendance', 'module', NULL, 2),
  ('module_activities', 'Activities', 'module', NULL, 3),
  ('module_expenses', 'Expenses', 'module', NULL, 4),
  ('module_gps_tracking', 'GPS Tracking', 'module', NULL, 5),

  -- Admin Panel fields
  ('field_admin_dashboard', 'Dashboard', 'field', 'module_admin_panel', 1),
  ('field_admin_user_management', 'User Management', 'field', 'module_admin_panel', 2),
  ('field_admin_attendance_mgmt', 'Attendance Management', 'field', 'module_admin_panel', 3),
  ('field_admin_expense_mgmt', 'Expense Management', 'field', 'module_admin_panel', 4),
  ('field_admin_gps_tracking', 'GPS Tracking', 'field', 'module_admin_panel', 5),
  ('field_admin_security_access', 'Security & Access', 'field', 'module_admin_panel', 6),
  ('field_admin_company_profile', 'Company Profile', 'field', 'module_admin_panel', 7),

  -- Admin Panel actions
  ('action_admin_create_user', 'Create User', 'action', 'module_admin_panel', 1),
  ('action_admin_edit_user', 'Edit User', 'action', 'module_admin_panel', 2),
  ('action_admin_delete_user', 'Delete User', 'action', 'module_admin_panel', 3),
  ('action_admin_manage_holidays', 'Manage Holidays', 'action', 'module_admin_panel', 4),
  ('action_admin_manage_leave_types', 'Manage Leave Types', 'action', 'module_admin_panel', 5),
  ('action_admin_approve_expense', 'Approve Expense', 'action', 'module_admin_panel', 6),
  ('action_admin_manage_profiles', 'Manage Security Profiles', 'action', 'module_admin_panel', 7),

  -- Admin Panel widgets
  ('widget_admin_user_list', 'User List Widget', 'widget', 'module_admin_panel', 1),
  ('widget_admin_attendance_overview', 'Attendance Overview Widget', 'widget', 'module_admin_panel', 2),
  ('widget_admin_expense_summary', 'Expense Summary Widget', 'widget', 'module_admin_panel', 3),

  -- Attendance fields
  ('field_attendance_check_in_time', 'Check-in Time', 'field', 'module_attendance', 1),
  ('field_attendance_check_out_time', 'Check-out Time', 'field', 'module_attendance', 2),
  ('field_attendance_total_hours', 'Total Hours', 'field', 'module_attendance', 3),
  ('field_attendance_location', 'Location', 'field', 'module_attendance', 4),
  ('field_attendance_photo', 'Photo', 'field', 'module_attendance', 5),
  ('field_attendance_face_verification', 'Face Verification', 'field', 'module_attendance', 6),

  -- Attendance actions
  ('action_attendance_check_in', 'Check In', 'action', 'module_attendance', 1),
  ('action_attendance_check_out', 'Check Out', 'action', 'module_attendance', 2),
  ('action_attendance_regularize', 'Request Regularization', 'action', 'module_attendance', 3),

  -- Attendance widgets
  ('widget_attendance_calendar', 'Attendance Calendar', 'widget', 'module_attendance', 1),
  ('widget_attendance_records_table', 'Attendance Records Table', 'widget', 'module_attendance', 2),
  ('widget_attendance_summary_cards', 'Summary Cards', 'widget', 'module_attendance', 3),

  -- Activities fields
  ('field_activity_name', 'Activity Name', 'field', 'module_activities', 1),
  ('field_activity_type', 'Activity Type', 'field', 'module_activities', 2),
  ('field_activity_duration', 'Duration', 'field', 'module_activities', 3),
  ('field_activity_location', 'Location', 'field', 'module_activities', 4),
  ('field_activity_attachments', 'Attachments', 'field', 'module_activities', 5),

  -- Activities actions
  ('action_activity_log', 'Log Activity', 'action', 'module_activities', 1),
  ('action_activity_manage_types', 'Manage Activity Types', 'action', 'module_activities', 2),

  -- Activities widgets
  ('widget_activity_list', 'Activity List', 'widget', 'module_activities', 1),
  ('widget_activity_summary', 'Activity Summary', 'widget', 'module_activities', 2),

  -- Expenses fields
  ('field_expense_amount', 'Amount', 'field', 'module_expenses', 1),
  ('field_expense_category', 'Category', 'field', 'module_expenses', 2),
  ('field_expense_date', 'Date', 'field', 'module_expenses', 3),
  ('field_expense_receipt', 'Receipt', 'field', 'module_expenses', 4),
  ('field_expense_status', 'Status', 'field', 'module_expenses', 5),

  -- Expenses actions
  ('action_expense_submit', 'Submit Expense', 'action', 'module_expenses', 1),
  ('action_expense_approve', 'Approve Expense', 'action', 'module_expenses', 2),
  ('action_expense_reject', 'Reject Expense', 'action', 'module_expenses', 3),

  -- Expenses widgets
  ('widget_expense_summary', 'Expense Summary', 'widget', 'module_expenses', 1),
  ('widget_expense_list', 'Expense List', 'widget', 'module_expenses', 2),

  -- GPS Tracking fields
  ('field_gps_location', 'Location', 'field', 'module_gps_tracking', 1),
  ('field_gps_route', 'Route', 'field', 'module_gps_tracking', 2),
  ('field_gps_stops', 'Stops', 'field', 'module_gps_tracking', 3),

  -- GPS Tracking actions
  ('action_gps_start_tracking', 'Start Tracking', 'action', 'module_gps_tracking', 1),
  ('action_gps_view_history', 'View History', 'action', 'module_gps_tracking', 2),

  -- GPS Tracking widgets
  ('widget_gps_map', 'GPS Map', 'widget', 'module_gps_tracking', 1),
  ('widget_gps_timeline', 'GPS Timeline', 'widget', 'module_gps_tracking', 2);
