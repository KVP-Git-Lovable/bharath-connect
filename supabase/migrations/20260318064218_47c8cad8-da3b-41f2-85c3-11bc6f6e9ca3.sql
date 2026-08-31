
-- Add My Team module
INSERT INTO permission_definitions (name, label, type, parent_module, sort_order, is_active)
VALUES 
  ('module_my_team', 'My Team', 'module', NULL, 6, true)
ON CONFLICT DO NOTHING;

-- Add My Team fields
INSERT INTO permission_definitions (name, label, type, parent_module, sort_order, is_active)
VALUES
  ('field_my_team_member_name', 'Member Name', 'field', 'module_my_team', 1, true),
  ('field_my_team_phone', 'Phone Number', 'field', 'module_my_team', 2, true),
  ('field_my_team_status', 'Status', 'field', 'module_my_team', 3, true),
  ('field_my_team_site', 'Assigned Site', 'field', 'module_my_team', 4, true)
ON CONFLICT DO NOTHING;

-- Add My Team actions
INSERT INTO permission_definitions (name, label, type, parent_module, sort_order, is_active)
VALUES
  ('action_my_team_call', 'Call Member', 'action', 'module_my_team', 1, true),
  ('action_my_team_view_details', 'View Details', 'action', 'module_my_team', 2, true)
ON CONFLICT DO NOTHING;

-- Add My Team widgets
INSERT INTO permission_definitions (name, label, type, parent_module, sort_order, is_active)
VALUES
  ('widget_my_team_list', 'Team List', 'widget', 'module_my_team', 1, true),
  ('widget_my_team_search', 'Team Search', 'widget', 'module_my_team', 2, true)
ON CONFLICT DO NOTHING;

-- Deactivate Project/Site Master from Admin Panel fields
UPDATE permission_definitions 
SET is_active = false, updated_at = now()
WHERE name = 'field_admin_site_master';
