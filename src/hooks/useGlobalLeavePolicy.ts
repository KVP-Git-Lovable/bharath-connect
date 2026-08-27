import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface GlobalLeavePolicy {
  id: string;
  reset_cycle: string;
  allow_negative_balance: boolean;
  max_negative_days: number;
  carry_forward_enabled: boolean;
  max_carry_forward_days: number;
  sandwich_rule_enabled: boolean;
  half_day_enabled: boolean;
  allow_backdated_leave: boolean;
  max_backdate_days: number;
  notice_period_days: number;
  max_continuous_days: number;
}

export interface LeaveTypePolicyOverride {
  id: string;
  leave_type_id: string;
  override_negative_balance: boolean | null;
  max_negative_days: number | null;
  override_carry_forward: boolean | null;
  max_carry_forward_days: number | null;
  custom_reset_cycle: string | null;
  min_notice_days: number | null;
  max_continuous_days: number | null;
}

const defaultPolicy: Omit<GlobalLeavePolicy, 'id'> = {
  reset_cycle: 'calendar_year',
  allow_negative_balance: false,
  max_negative_days: 0,
  carry_forward_enabled: false,
  max_carry_forward_days: 0,
  sandwich_rule_enabled: false,
  half_day_enabled: true,
  allow_backdated_leave: true,
  max_backdate_days: 30,
  notice_period_days: 0,
  max_continuous_days: 30,
};

export function useGlobalLeavePolicy() {
  const [policy, setPolicy] = useState<GlobalLeavePolicy | null>(null);
  const [overrides, setOverrides] = useState<LeaveTypePolicyOverride[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPolicy = useCallback(async () => {
    setLoading(true);
    try {
      const [policyRes, overridesRes] = await Promise.all([
        supabase.from('global_leave_policy' as any).select('*').limit(1).maybeSingle(),
        supabase.from('leave_type_policy_override' as any).select('*'),
      ]);
      setPolicy(policyRes.data as any as GlobalLeavePolicy | null);
      setOverrides((overridesRes.data || []) as any as LeaveTypePolicyOverride[]);
    } catch (err) {
      console.error('Error fetching global leave policy:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPolicy(); }, [fetchPolicy]);

  const savePolicy = async (data: Partial<GlobalLeavePolicy>) => {
    try {
      if (policy?.id) {
        const { error } = await supabase.from('global_leave_policy' as any).update(data as any).eq('id', policy.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('global_leave_policy' as any).insert(data as any);
        if (error) throw error;
      }
      toast.success('Leave policy saved');
      await fetchPolicy();
    } catch {
      toast.error('Failed to save leave policy');
    }
  };

  const saveOverride = async (leaveTypeId: string, data: Partial<LeaveTypePolicyOverride>) => {
    try {
      const existing = overrides.find(o => o.leave_type_id === leaveTypeId);
      if (existing) {
        const { error } = await supabase.from('leave_type_policy_override' as any).update(data as any).eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('leave_type_policy_override' as any).insert({ leave_type_id: leaveTypeId, ...data } as any);
        if (error) throw error;
      }
      toast.success('Override saved');
      await fetchPolicy();
    } catch {
      toast.error('Failed to save override');
    }
  };

  const deleteOverride = async (leaveTypeId: string) => {
    try {
      const { error } = await supabase.from('leave_type_policy_override' as any).delete().eq('leave_type_id', leaveTypeId);
      if (error) throw error;
      toast.success('Override removed');
      await fetchPolicy();
    } catch {
      toast.error('Failed to remove override');
    }
  };

  const getEffectivePolicy = (leaveTypeId: string) => {
    const base = policy || defaultPolicy as GlobalLeavePolicy;
    const override = overrides.find(o => o.leave_type_id === leaveTypeId);
    if (!override) return base;
    return {
      ...base,
      allow_negative_balance: override.override_negative_balance ?? base.allow_negative_balance,
      max_negative_days: override.max_negative_days ?? base.max_negative_days,
      carry_forward_enabled: override.override_carry_forward ?? base.carry_forward_enabled,
      max_carry_forward_days: override.max_carry_forward_days ?? base.max_carry_forward_days,
      reset_cycle: override.custom_reset_cycle ?? base.reset_cycle,
      notice_period_days: override.min_notice_days ?? base.notice_period_days,
      max_continuous_days: override.max_continuous_days ?? base.max_continuous_days,
    };
  };

  return { policy, overrides, loading, savePolicy, saveOverride, deleteOverride, getEffectivePolicy, refetch: fetchPolicy };
}
