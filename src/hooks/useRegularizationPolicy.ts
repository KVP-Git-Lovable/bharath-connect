import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface RegularizationPolicy {
  id: string;
  monthly_limit: number;
  daily_limit: number;
  max_backdate_days: number;
  approval_mode: string;
  auto_approve_within_hours: number | null;
  post_approval_status: string;
  require_reason: boolean;
}

export function useRegularizationPolicy() {
  const [policy, setPolicy] = useState<RegularizationPolicy | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchPolicy = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await supabase.from('regularization_policy' as any).select('*').limit(1).maybeSingle();
      setPolicy(data as any as RegularizationPolicy | null);
    } catch (err) {
      console.error('Error fetching regularization policy:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPolicy(); }, [fetchPolicy]);

  const savePolicy = async (data: Partial<RegularizationPolicy>) => {
    try {
      if (policy?.id) {
        const { error } = await supabase.from('regularization_policy' as any).update(data as any).eq('id', policy.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('regularization_policy' as any).insert(data as any);
        if (error) throw error;
      }
      toast.success('Regularization policy saved');
      await fetchPolicy();
    } catch {
      toast.error('Failed to save regularization policy');
    }
  };

  return { policy, loading, savePolicy, refetch: fetchPolicy };
}
