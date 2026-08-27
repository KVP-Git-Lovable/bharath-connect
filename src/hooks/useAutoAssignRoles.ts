import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentUser } from './useCurrentUser';

/**
 * Auto-assigns current user to their security profile if not already assigned.
 * This ensures roles display correctly even if the migration hasn't run yet.
 */
export function useAutoAssignRoles() {
  const { user } = useCurrentUser();
  const assignedRef = useRef(false);

  useEffect(() => {
    if (!user || assignedRef.current) return;

    const assignRole = async () => {
      try {
        // Check if user already has a security profile assignment
        const { data: existing } = await supabase
          .from('user_security_profiles')
          .select('id')
          .eq('user_id', user.id)
          .maybeSingle();

        if (existing) {
          console.log('User already has security profile assignment:', user.id);
          assignedRef.current = true;
          return;
        }

        // Get user's current role
        const { data: userData } = await supabase
          .from('users')
          .select('role_id')
          .eq('id', user.id)
          .maybeSingle();

        if (!userData?.role_id) {
          console.log('User has no role assigned:', user.id);
          assignedRef.current = true;
          return;
        }

        // Get role name
        const { data: roleData } = await supabase
          .from('roles')
          .select('name')
          .eq('id', userData.role_id)
          .maybeSingle();

        if (!roleData?.name) {
          console.log('Role not found for role_id:', userData.role_id);
          assignedRef.current = true;
          return;
        }

        // Map role name to security profile name
        const roleToProfileMap: Record<string, string[]> = {
          'Admin': ['Administrator', 'System Administrator'],
          'Sales Manager': ['Sales Manager'],
          'Field User': ['Field Sales Executive'],
          'Data Viewer': ['Data Viewer'],
        };

        const profileNames = roleToProfileMap[roleData.name];
        if (!profileNames?.length) {
          console.log('No security profile mapping for role:', roleData.name);
          assignedRef.current = true;
          return;
        }

        // Get security profile ID
        const { data: profileMatches } = await supabase
          .from('security_profiles')
          .select('id, name')
          .in('name', profileNames)
          .limit(1);

        const profileData = profileMatches?.[0];
        if (!profileData?.id) {
          console.log('Security profile not found:', profileNames);
          assignedRef.current = true;
          return;
        }

        // Assign user to security profile
        const { error } = await supabase
          .from('user_security_profiles')
          .insert({
            user_id: user.id,
            profile_id: profileData.id,
          });

        if (error) {
          console.error('Failed to assign security profile:', error);
        } else {
          console.log('Successfully assigned security profile:', {
            userId: user.id,
            roleName: roleData.name,
            profileName: profileData.name,
          });
        }
      } catch (err) {
        console.error('Error in useAutoAssignRoles:', err);
      } finally {
        assignedRef.current = true;
      }
    };

    assignRole();
  }, [user]);
}
