-- Insert all permission definitions as full-access for System Administrator profile
INSERT INTO profile_object_permissions (profile_id, object_name, permission_type, can_read, can_create, can_edit, can_delete, can_view_all, can_modify_all)
SELECT 
  '045a3e21-4787-4436-9684-7ae290df2890',
  pd.name,
  pd.type,
  true, true, true, true, true, true
FROM permission_definitions pd
WHERE pd.is_active = true
AND pd.name NOT IN (
  SELECT pop.object_name FROM profile_object_permissions pop 
  WHERE pop.profile_id = '045a3e21-4787-4436-9684-7ae290df2890'
)
ON CONFLICT DO NOTHING;