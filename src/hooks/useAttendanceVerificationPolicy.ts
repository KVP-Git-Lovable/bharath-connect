import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export const FACE_VERIFICATION_KEY = 'face_verification_required';
export const GPS_VERIFICATION_KEY = 'gps_verification_required';

export interface AttendanceVerificationPolicy {
  faceVerificationRequired: boolean;
  gpsVerificationRequired: boolean;
}

const DEFAULTS: AttendanceVerificationPolicy = {
  faceVerificationRequired: true,
  gpsVerificationRequired: true,
};

const toBool = (value: unknown, fallback: boolean): boolean => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value === 'true';
  if (value && typeof value === 'object' && 'enabled' in (value as any)) {
    return Boolean((value as any).enabled);
  }
  return fallback;
};

export const useAttendanceVerificationPolicy = () => {
  return useQuery<AttendanceVerificationPolicy>({
    queryKey: ['attendance-verification-policy'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('attendance_policy')
        .select('policy_key, policy_value')
        .in('policy_key', [FACE_VERIFICATION_KEY, GPS_VERIFICATION_KEY]);

      if (error) {
        console.error('attendance_policy fetch failed:', error);
        return DEFAULTS;
      }

      const rows = data || [];
      const face = rows.find((r) => r.policy_key === FACE_VERIFICATION_KEY);
      const gps = rows.find((r) => r.policy_key === GPS_VERIFICATION_KEY);

      return {
        faceVerificationRequired: toBool(face?.policy_value, DEFAULTS.faceVerificationRequired),
        gpsVerificationRequired: toBool(gps?.policy_value, DEFAULTS.gpsVerificationRequired),
      };
    },
    staleTime: 5 * 60 * 1000,
  });
};

export const saveAttendanceVerificationPolicy = async (policy: AttendanceVerificationPolicy) => {
  const now = new Date().toISOString();
  const rows = [
    { policy_key: FACE_VERIFICATION_KEY, policy_value: policy.faceVerificationRequired, updated_at: now },
    { policy_key: GPS_VERIFICATION_KEY, policy_value: policy.gpsVerificationRequired, updated_at: now },
  ];

  for (const row of rows) {
    const { data: existing } = await supabase
      .from('attendance_policy')
      .select('id')
      .eq('policy_key', row.policy_key)
      .maybeSingle();

    if (existing?.id) {
      const { error } = await supabase
        .from('attendance_policy')
        .update({ policy_value: row.policy_value, updated_at: row.updated_at })
        .eq('id', existing.id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from('attendance_policy').insert(row);
      if (error) throw error;
    }
  }
};
