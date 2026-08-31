
-- Add hierarchical permission columns
ALTER TABLE profile_object_permissions 
  ADD COLUMN IF NOT EXISTS permission_type TEXT NOT NULL DEFAULT 'module',
  ADD COLUMN IF NOT EXISTS parent_module TEXT;

-- Drop old unique constraint and add new one that includes permission_type
ALTER TABLE profile_object_permissions 
  DROP CONSTRAINT IF EXISTS profile_object_permissions_profile_id_object_name_key;

ALTER TABLE profile_object_permissions 
  ADD CONSTRAINT profile_object_permissions_profile_id_object_name_ptype_key 
  UNIQUE (profile_id, object_name, permission_type);
