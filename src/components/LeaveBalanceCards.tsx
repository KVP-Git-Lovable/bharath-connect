import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import LeaveApplicationModal from './LeaveApplicationModal';
import { Button } from '@/components/ui/button';
import { CalendarDays, ArrowRight } from 'lucide-react';

interface LeaveTypeBalance {
  leave_type_id: string;
  leave_type_name: string;
  opening_balance: number;
  used_balance: number;
  remaining_balance: number;
  monthly_allocated: number;
  carried_forward: number;
  monthly_used: number;
}

interface LeaveBalanceCardsProps {
  refreshTrigger?: number;
  onApplicationSubmitted?: () => void;
}

const getLeaveTypeColor = (name: string): string => {
  const colors = [
    'bg-[hsl(var(--info))]/20 text-[hsl(var(--info))]',
    'bg-[hsl(var(--success))]/20 text-[hsl(var(--success))]',
    'bg-warning/20 text-warning',
    'bg-destructive/20 text-destructive',
    'bg-accent/20 text-accent-foreground',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
};

const getInitials = (name: string): string =>
  name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const LeaveBalanceCards: React.FC<LeaveBalanceCardsProps> = ({ refreshTrigger, onApplicationSubmitted }) => {
  const [balances, setBalances] = useState<LeaveTypeBalance[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchBalances = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setIsLoading(true);
    try {
      const currentYear = new Date().getFullYear();
      const currentMonth = new Date().getMonth() + 1;

      const [leaveTypesRes, balancesRes, accrualRes] = await Promise.all([
        supabase.from('leave_types').select('id, name').eq('is_active', true).order('name'),
        supabase.from('leave_balance').select('leave_type_id, opening_balance, used_balance, remaining_balance').eq('user_id', user.id).eq('year', currentYear),
        supabase.from('monthly_leave_accrual' as any).select('*').eq('user_id', user.id).eq('year', currentYear).eq('month', currentMonth),
      ]);

      const leaveTypes = leaveTypesRes.data;
      const userBalances = balancesRes.data;
      const monthlyAccruals = (accrualRes.data || []) as any[];

      if (!leaveTypes) { setBalances([]); return; }

      const result: LeaveTypeBalance[] = leaveTypes.map(lt => {
        const balance = userBalances?.find(b => b.leave_type_id === lt.id);
        const accrual = monthlyAccruals.find((a: any) => a.leave_type_id === lt.id);
        return {
          leave_type_id: lt.id,
          leave_type_name: lt.name,
          opening_balance: balance?.opening_balance || 0,
          used_balance: balance?.used_balance || 0,
          remaining_balance: balance?.remaining_balance ?? (balance ? (balance.opening_balance - balance.used_balance) : 0),
          monthly_allocated: accrual?.allocated || 0,
          carried_forward: accrual?.carried_forward || 0,
          monthly_used: accrual?.used || 0,
        };
      });
      setBalances(result);
    } catch (error) {
      console.error('Error fetching leave balances:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchBalances(); }, [refreshTrigger]);

  const handleApplicationSubmitted = () => {
    fetchBalances();
    onApplicationSubmitted?.();
  };

  const currentMonth = new Date().getMonth(); // 0-indexed
  const prevMonthName = monthNames[currentMonth === 0 ? 11 : currentMonth - 1];

  if (isLoading) return <Card><CardContent className="py-8"><div className="flex items-center justify-center"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" /></div></CardContent></Card>;

  if (balances.length === 0) return <Card><CardContent className="py-8 text-center text-muted-foreground"><CalendarDays className="h-10 w-10 mx-auto mb-3 opacity-40" /><p className="text-sm font-medium">No leave balances allocated</p><p className="text-xs mt-1">Your leave balances have not been initialized for this year. Please contact your administrator.</p></CardContent></Card>;

  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base font-semibold">Leave Balance</CardTitle></CardHeader>
      <CardContent className="p-0">
        <div className="divide-y divide-border">
          {balances.map(balance => {
            const colorClass = getLeaveTypeColor(balance.leave_type_name);
            const monthlyRemaining = balance.carried_forward + balance.monthly_allocated - balance.monthly_used;
            return (
              <div key={balance.leave_type_id} className="px-4 py-4 sm:px-6">
                <div className="flex items-center gap-3">
                  <div className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center text-xs font-bold ${colorClass}`}>
                    {getInitials(balance.leave_type_name)}
                  </div>
                  <p className="font-medium text-sm flex-1 min-w-0 truncate">{balance.leave_type_name}</p>
                  {balance.remaining_balance > 0 && (
                    <LeaveApplicationModal
                      defaultLeaveTypeId={balance.leave_type_id}
                      onApplicationSubmitted={handleApplicationSubmitted}
                      trigger={<Button variant="outline" size="sm" className="text-xs whitespace-nowrap h-8">Apply Leave</Button>}
                    />
                  )}
                </div>
                {/* Overall balance */}
                <div className="flex items-center gap-6 mt-2 ml-[52px]">
                  <div>
                    <p className="text-[11px] text-muted-foreground">Available</p>
                    <p className={`text-sm font-bold ${balance.remaining_balance > 0 ? 'text-[hsl(var(--success))]' : 'text-muted-foreground'}`}>
                      {balance.remaining_balance} {balance.remaining_balance === 1 ? 'day' : 'days'}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground">Booked</p>
                    <p className="text-sm font-bold text-foreground">{balance.used_balance} {balance.used_balance === 1 ? 'day' : 'days'}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground">Allocated</p>
                    <p className="text-sm font-bold text-foreground">{balance.opening_balance}</p>
                  </div>
                </div>
                {/* Monthly breakdown */}
                {(balance.monthly_allocated > 0 || balance.carried_forward > 0) && (
                  <div className="ml-[52px] mt-2 flex items-center gap-1 flex-wrap">
                    {balance.carried_forward > 0 && (
                      <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                        <ArrowRight className="h-3 w-3" />
                        {balance.carried_forward} carried from {prevMonthName}
                      </span>
                    )}
                    {balance.monthly_allocated > 0 && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                        +{balance.monthly_allocated}/mo
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};

export default LeaveBalanceCards;
