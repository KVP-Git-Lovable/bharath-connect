import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  type PolicyResult,
  logPolicyError,
  GLOBAL_LEAVE_POLICY_DEFAULTS,
} from '@/utils/policyDefaults';

export interface GlobalLeavePolicy {
  id: string;
  is_enabled: boolean;
  reset_cycle: string;
  custom_reset_date: string | null;
  allow_negative_balance: boolean;
  max_negative_limit: number;
  enable_carry_forward: boolean;
  max_carry_forward_limit: number;
  carry_forward_expiry_months: number | null;
  min_notice_period_days: number;
  max_continuous_leave_days: number | null;
  allow_backdated_leave: boolean;
  max_backdate_days: number;
  enable_half_day: boolean;
  enable_sandwich_rule: boolean;
  created_at: string;
  updated_at: string;
}

export interface LeaveTypeOverride {
  id: string;
  leave_type_id: string;
  override_enabled: boolean;
  allow_negative_balance: boolean | null;
  max_negative_limit: number | null;
  enable_carry_forward: boolean | null;
  max_carry_forward_limit: number | null;
  carry_forward_expiry_months: number | null;
  custom_reset_cycle: string | null;
  created_at: string;
  updated_at: string;
}

export const useGlobalLeavePolicy = () => {
  return useQuery<PolicyResult<GlobalLeavePolicy>>({
    queryKey: ['global-leave-policy'],
    queryFn: async (): Promise<PolicyResult<GlobalLeavePolicy>> => {
      // 1. Try to read existing row
      const { data, error } = await supabase
        .from('global_leave_policy')
        .select('*')
        .limit(1)
        .maybeSingle();

      if (error) {
        logPolicyError('global_leave_policy fetch', error);
        return { data: null, error, isFallback: false };
      }

      if (data) {
        return { data: data as GlobalLeavePolicy, error: null, isFallback: false };
      }

      // 2. Auto-seed default row
      const { data: newRow, error: insertError } = await supabase
        .from('global_leave_policy')
        .insert(GLOBAL_LEAVE_POLICY_DEFAULTS)
        .select()
        .single();

      if (insertError) {
        logPolicyError('global_leave_policy auto-seed', insertError);

        // 3. Retry fetch (another request may have inserted)
        const { data: retryData } = await supabase
          .from('global_leave_policy')
          .select('*')
          .limit(1)
          .maybeSingle();

        return {
          data: (retryData as GlobalLeavePolicy) || null,
          error: insertError,
          isFallback: true,
        };
      }

      return { data: newRow as GlobalLeavePolicy, error: null, isFallback: false };
    },
    staleTime: 5 * 60 * 1000,
  });
};

export const useLeaveTypeOverrides = () => {
  return useQuery({
    queryKey: ['leave-type-overrides'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leave_type_policy_override')
        .select('*');
      if (error) {
        logPolicyError('leave_type_policy_override fetch', error);
        return [] as LeaveTypeOverride[];
      }
      return (data || []) as LeaveTypeOverride[];
    },
    staleTime: 5 * 60 * 1000,
  });
};

export interface EffectiveLeavePolicy {
  is_enabled: boolean;
  enable_half_day: boolean;
  allow_backdated_leave: boolean;
  max_backdate_days: number;
  min_notice_period_days: number;
  max_continuous_leave_days: number | null;
  allow_negative_balance: boolean;
  max_negative_limit: number;
  enable_carry_forward: boolean;
  max_carry_forward_limit: number;
  enable_sandwich_rule: boolean;
}

/**
 * @deprecated Use useEffectiveLeavePolicy which resolves via server-side RPC.
 * Kept for LeavePolicyConfig admin UI that still needs raw global + overrides.
 */
export function getEffectivePolicy(
  global: GlobalLeavePolicy,
  overrides: LeaveTypeOverride[],
  leaveTypeId: string
): EffectiveLeavePolicy {
  const override = overrides.find(
    (o) => o.leave_type_id === leaveTypeId && o.override_enabled
  );

  return {
    is_enabled: global.is_enabled,
    enable_half_day: global.enable_half_day,
    enable_sandwich_rule: global.enable_sandwich_rule,
    allow_backdated_leave: global.allow_backdated_leave,
    max_backdate_days: global.max_backdate_days,
    min_notice_period_days: global.min_notice_period_days,
    max_continuous_leave_days: global.max_continuous_leave_days,
    allow_negative_balance: override?.allow_negative_balance ?? global.allow_negative_balance,
    max_negative_limit: override?.max_negative_limit ?? global.max_negative_limit,
    enable_carry_forward: override?.enable_carry_forward ?? global.enable_carry_forward,
    max_carry_forward_limit: override?.max_carry_forward_limit ?? global.max_carry_forward_limit,
  };
}

// ─── Server-Side Policy Resolution (Phase 1) ───────────────────────

export interface DateConstraints {
  allow_half_day: boolean;
  allow_backdated_leave: boolean;
  max_backdate_date: string;
  min_notice_date: string;
  min_notice_period_days: number;
  max_continuous_days: number | null;
  is_enabled: boolean;
  allow_negative_balance: boolean;
  max_negative_limit: number;
}

export interface ValidationResult {
  is_valid: boolean;
  error_code?: string;
  error_message?: string;
  days_requested?: number;
  balance_after?: number;
  current_balance?: number;
  sandwich_days?: number;
}

/**
 * Resolves effective leave policy via server-side DB function.
 * Merges global + override layers server-side — zero client logic.
 */
export const useEffectiveLeavePolicy = (leaveTypeId: string) => {
  const { data: result, isLoading: globalLoading } = useGlobalLeavePolicy();
  const globalPolicy = result?.data ?? null;

  const { data: constraints, isLoading: constraintsLoading } = useQuery<DateConstraints | null>({
    queryKey: ['leave-date-constraints', leaveTypeId],
    queryFn: async () => {
      if (!leaveTypeId) return null;
      
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const { data, error } = await supabase.rpc('get_leave_date_constraints', {
        p_user_id: user.id,
        p_leave_type_id: leaveTypeId,
      });

      if (error) {
        logPolicyError('get_leave_date_constraints RPC', error);
        return null;
      }

      if (data && typeof data === 'object' && 'error' in (data as object)) {
        return null;
      }

      return data as unknown as DateConstraints;
    },
    enabled: !!leaveTypeId,
    staleTime: 2 * 60 * 1000,
  });

  // Map constraints to EffectiveLeavePolicy shape for backward compat
  const effectivePolicy: EffectiveLeavePolicy | null = constraints ? {
    is_enabled: constraints.is_enabled,
    enable_half_day: constraints.allow_half_day,
    enable_sandwich_rule: false, // not exposed in constraints
    allow_backdated_leave: constraints.allow_backdated_leave,
    max_backdate_days: (constraints as any).max_backdate_days ?? 0,
    min_notice_period_days: constraints.min_notice_period_days,
    max_continuous_leave_days: constraints.max_continuous_days,
    allow_negative_balance: constraints.allow_negative_balance,
    max_negative_limit: constraints.max_negative_limit,
    enable_carry_forward: false,
    max_carry_forward_limit: 0,
  } : null;

  return {
    policy: effectivePolicy,
    constraints,
    isLoading: globalLoading || constraintsLoading,
    globalPolicy,
  };
};

/**
 * Validate a leave request server-side via RPC.
 * Returns structured result — frontend just shows the message.
 */
export const validateLeaveRequestRPC = async (
  userId: string,
  leaveTypeId: string,
  startDate: string,
  endDate: string,
  isHalfDay: boolean = false
): Promise<ValidationResult> => {
  const { data, error } = await supabase.rpc('validate_leave_request', {
    p_user_id: userId,
    p_leave_type_id: leaveTypeId,
    p_start_date: startDate,
    p_end_date: endDate,
    p_is_half_day: isHalfDay,
  });

  if (error) {
    return {
      is_valid: false,
      error_code: 'RPC_ERROR',
      error_message: error.message,
    };
  }

  return data as unknown as ValidationResult;
};
