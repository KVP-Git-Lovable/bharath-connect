
GRANT SELECT ON public.permission_definitions TO authenticated;
GRANT ALL ON public.permission_definitions TO service_role;

INSERT INTO public.permission_definitions (name, label, type, parent_module, sort_order) VALUES
  -- Modules
  ('module_admin_panel',   'Admin Panel',        'module', NULL, 10),
  ('module_attendance',    'Attendance',         'module', NULL, 20),
  ('module_activities',    'Activities',         'module', NULL, 30),
  ('module_expenses',      'Expenses',           'module', NULL, 40),
  ('module_gps_tracking',  'GPS Tracking',       'module', NULL, 50),
  ('module_procurement',   'Procurement',        'module', NULL, 60),
  ('security',             'Security & Access',  'module', NULL, 70),

  -- Attendance
  ('field_attendance_photo',        'Attendance Photo',       'field',  'module_attendance', 21),
  ('field_attendance_location',     'Location',               'field',  'module_attendance', 22),
  ('action_attendance_regularize',  'Regularize Attendance',  'action', 'module_attendance', 23),
  ('action_attendance_approve',     'Approve Leave/Reg.',     'action', 'module_attendance', 24),
  ('widget_leave_balance',          'Leave Balance Widget',   'widget', 'module_attendance', 25),
  ('widget_team_attendance',        'Team Attendance Widget', 'widget', 'module_attendance', 26),

  -- Activities
  ('field_activity_photos',    'Activity Photos',    'field',  'module_activities', 31),
  ('field_activity_location',  'Activity Location',  'field',  'module_activities', 32),
  ('action_activity_create',   'Create Activity',    'action', 'module_activities', 33),
  ('action_activity_close',    'Close Activity',     'action', 'module_activities', 34),
  ('widget_today_activities',  'Today Activities',   'widget', 'module_activities', 35),

  -- Expenses
  ('field_expense_bill',       'Expense Bill',       'field',  'module_expenses', 41),
  ('field_expense_amount',     'Amount',             'field',  'module_expenses', 42),
  ('action_expense_submit',    'Submit Expense',     'action', 'module_expenses', 43),
  ('action_expense_approve',   'Approve Expense',    'action', 'module_expenses', 44),
  ('widget_pending_expenses',  'Pending Expenses',   'widget', 'module_expenses', 45),

  -- GPS Tracking
  ('field_gps_route',      'Route History',   'field',  'module_gps_tracking', 51),
  ('action_gps_export',    'Export Routes',   'action', 'module_gps_tracking', 52),
  ('widget_live_map',      'Live Team Map',   'widget', 'module_gps_tracking', 53),

  -- Procurement
  ('field_po_pricing',       'PO Pricing',         'field',  'module_procurement', 61),
  ('field_vendor_details',   'Vendor Details',     'field',  'module_procurement', 62),
  ('action_po_create',       'Create PO',          'action', 'module_procurement', 63),
  ('action_po_approve',      'Approve PO',         'action', 'module_procurement', 64),
  ('action_grn_create',      'Create GRN',         'action', 'module_procurement', 65),
  ('widget_procurement_summary','Procurement Summary','widget','module_procurement', 66),

  -- Admin Panel
  ('field_admin_user_email',    'User Email',          'field',  'module_admin_panel', 11),
  ('field_admin_user_salary',   'Salary Info',         'field',  'module_admin_panel', 12),
  ('action_admin_create_user',  'Create User',         'action', 'module_admin_panel', 13),
  ('action_admin_delete_user',  'Delete User',         'action', 'module_admin_panel', 14),
  ('action_admin_reset_password','Reset Password',     'action', 'module_admin_panel', 15),
  ('widget_admin_kpi',          'Admin KPI Widget',    'widget', 'module_admin_panel', 16),

  -- Security
  ('action_security_manage_profiles', 'Manage Security Profiles', 'action', 'security', 71),
  ('action_security_assign_users',    'Assign Users to Profiles', 'action', 'security', 72)
ON CONFLICT (name) DO UPDATE
SET label = EXCLUDED.label,
    type = EXCLUDED.type,
    parent_module = EXCLUDED.parent_module,
    sort_order = EXCLUDED.sort_order,
    is_active = true;
