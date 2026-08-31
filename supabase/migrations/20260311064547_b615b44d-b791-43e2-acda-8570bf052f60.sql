
-- Remove admin panel fields that don't correspond to actual admin module cards
DELETE FROM permission_definitions WHERE name IN ('field_admin_dashboard', 'field_admin_gps_tracking');

-- Add Project / Site Master field under Admin Panel
INSERT INTO permission_definitions (name, label, type, parent_module, sort_order, is_active)
VALUES ('field_admin_site_master', 'Project / Site Master', 'field', 'module_admin_panel', 7, true)
ON CONFLICT DO NOTHING;

-- Reorder remaining admin panel fields to be sequential
UPDATE permission_definitions SET sort_order = 1 WHERE name = 'field_admin_user_management';
UPDATE permission_definitions SET sort_order = 2 WHERE name = 'field_admin_attendance_mgmt';
UPDATE permission_definitions SET sort_order = 3 WHERE name = 'field_admin_expense_mgmt';
UPDATE permission_definitions SET sort_order = 4 WHERE name = 'field_admin_security_access';
UPDATE permission_definitions SET sort_order = 5 WHERE name = 'field_admin_company_profile';
UPDATE permission_definitions SET sort_order = 6 WHERE name = 'field_admin_site_master';
