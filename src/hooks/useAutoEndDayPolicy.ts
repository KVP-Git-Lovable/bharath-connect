import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  type PolicyResult,
  logPolicyError,
  AUTO_END_DAY_POLICY_DEFAULTS,
} from '@/utils/policyDefaults';

export interface AutoEndDayPolicy {
  id: string;
  is_enabled: boolean;
  auto_close_time: string;
  timezone: string;
  last_activity_source: 'all_activity' | 'last_order_only' | 'last_click';
  pre_warning_enabled: boolean;
  pre_warning_minutes_before: number;
  pre_warning_time: string;
  close_in_progress_visits: boolean;
  cancel_planned_visits: boolean;
  mark_unproductive: boolean;
  created_at: string;
  updated_at: string;
}

export const useAutoEndDayPolicy = () => {
  return useQuery<PolicyResult<AutoEndDayPolicy>>({
    queryKey: ['auto-end-day-policy'],
    queryFn: async (): Promise<PolicyResult<AutoEndDayPolicy>> => {
      const { data, error } = await supabase
        .from('auto_end_day_policy')
        .select('*')
        .limit(1)
        .maybeSingle();

      if (error) {
        logPolicyError('auto_end_day_policy fetch', error);
        return { data: null, error, isFallback: false };
      }

      if (data) {
        return { data: data as AutoEndDayPolicy, error: null, isFallback: false };
      }

      // Auto-seed
      const { data: newRow, error: insertError } = await supabase
        .from('auto_end_day_policy')
        .insert(AUTO_END_DAY_POLICY_DEFAULTS)
        .select()
        .single();

      if (insertError) {
        logPolicyError('auto_end_day_policy auto-seed', insertError);

        const { data: retryData } = await supabase
          .from('auto_end_day_policy')
          .select('*')
          .limit(1)
          .maybeSingle();

        return {
          data: (retryData as AutoEndDayPolicy) || null,
          error: insertError,
          isFallback: true,
        };
      }

      return { data: newRow as AutoEndDayPolicy, error: null, isFallback: false };
    },
    staleTime: 5 * 60 * 1000,
  });
};

export const useUpdateAutoEndDayPolicy = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (updates: Partial<AutoEndDayPolicy> & { id: string }) => {
      const { id, ...rest } = updates;
      const { data, error } = await supabase
        .from('auto_end_day_policy')
        .update({ ...rest, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auto-end-day-policy'] });
      toast.success('Auto End Day policy saved successfully');
    },
    onError: (error) => {
      toast.error('Failed to save policy: ' + error.message);
    },
  });
};
