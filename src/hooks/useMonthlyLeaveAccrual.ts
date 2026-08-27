import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface MonthlyAccrual {
  id: string;
  user_id: string;
  leave_type_id: string;
  year: number;
  month: number;
  allocated: number;
  carried_forward: number;
  used: number;
}

export function useMonthlyLeaveAccrual(year?: number, month?: number) {
  const [accruals, setAccruals] = useState<MonthlyAccrual[]>([]);
  const [loading, setLoading] = useState(true);

  const currentYear = year ?? new Date().getFullYear();
  const currentMonth = month ?? (new Date().getMonth() + 1);

  const fetchAccruals = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('monthly_leave_accrual' as any)
        .select('*')
        .eq('user_id', user.id)
        .eq('year', currentYear)
        .eq('month', currentMonth);

      if (error) throw error;
      setAccruals((data || []) as any as MonthlyAccrual[]);
    } catch (err) {
      console.error('Error fetching monthly accruals:', err);
    } finally {
      setLoading(false);
    }
  }, [currentYear, currentMonth]);

  useEffect(() => { fetchAccruals(); }, [fetchAccruals]);

  const recalculate = async (userId?: string) => {
    try {
      const { error } = await supabase.rpc('recalculate_monthly_leave_accruals' as any, {
        _target_user_id: userId || null,
      });
      if (error) throw error;
      await fetchAccruals();
      return true;
    } catch (err) {
      console.error('Error recalculating:', err);
      return false;
    }
  };

  return { accruals, loading, refetch: fetchAccruals, recalculate };
}
