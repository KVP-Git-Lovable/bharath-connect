import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  type PolicyResult,
  logPolicyError,
  REGULARIZATION_POLICY_DEFAULTS,
} from '@/utils/policyDefaults';

export interface RegularizationPolicy {
  id: string;
  is_enabled: boolean;
  monthly_limit: number | null;
  daily_limit: number;
  allow_checkin_edit: boolean;
  allow_checkout_edit: boolean;
  allow_status_edit: boolean;
  reason_mandatory: boolean;
  max_backdate_days: number;
  allow_previous_month: boolean;
  restrict_after_payroll_lock: boolean;
  approval_mode: string;
  update_attendance_on_approval: boolean;
  recalculate_hours: boolean;
  adjust_leave_balance: boolean;
  created_at: string;
  updated_at: string;
}

export const useRegularizationPolicy = () => {
  return useQuery<PolicyResult<RegularizationPolicy>>({
    queryKey: ['regularization-policy'],
    queryFn: async (): Promise<PolicyResult<RegularizationPolicy>> => {
      const { data, error } = await supabase
        .from('regularization_policy')
        .select('*')
        .limit(1)
        .maybeSingle();

      if (error) {
        logPolicyError('regularization_policy fetch', error);
        return { data: null, error, isFallback: false };
      }

      if (data) {
        return { data: data as RegularizationPolicy, error: null, isFallback: false };
      }

      // Auto-seed
      const { data: newRow, error: insertError } = await supabase
        .from('regularization_policy')
        .insert(REGULARIZATION_POLICY_DEFAULTS)
        .select()
        .single();

      if (insertError) {
        logPolicyError('regularization_policy auto-seed', insertError);

        const { data: retryData } = await supabase
          .from('regularization_policy')
          .select('*')
          .limit(1)
          .maybeSingle();

        return {
          data: (retryData as RegularizationPolicy) || null,
          error: insertError,
          isFallback: true,
        };
      }

      return { data: newRow as RegularizationPolicy, error: null, isFallback: false };
    },
    staleTime: 5 * 60 * 1000,
  });
};
