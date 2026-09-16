import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, X, Clock, Loader2, IndianRupee, CheckCircle2, XCircle, Eye, ChevronLeft, ChevronRight, Users, Car, Utensils, Receipt, ChartNoAxesColumnIncreasing, CircleDollarSign } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useDaApplicable } from '@/hooks/useDaApplicable';
import { format, subMonths, addMonths, parse, endOfMonth } from 'date-fns';
import { toast } from 'sonner';
import RejectionReasonDialog from '@/components/RejectionReasonDialog';
import ExpenseReportGenerator from '@/components/expenses/ExpenseReportGenerator';

interface TeamExpense {
  id: string;
  user_id: string;
  category: string;
  custom_category: string | null;
  amount: number;
  description: string | null;
  expense_date: string;
  status: string;
  bill_url: string | null;
  rejection_reason: string | null;
  employee_name: string;
}

export default function TeamExpenseSummary() {
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [expenses, setExpenses] = useState<TeamExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [summariesLoading, setSummariesLoading] = useState(false);
  const { daApplicable } = useDaApplicable();
  const [memberSummaries, setMemberSummaries] = useState<Array<{ user_id: string; name: string; ta: number; da: number; additional: number; total: number; present_days: number; total_km: number }>>([]);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showRejectionDialog, setShowRejectionDialog] = useState(false);
  const [rejectionTargetId, setRejectionTargetId] = useState<string | null>(null);
  const [rejectionView, setRejectionView] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  const currentMonthDate = parse(`${selectedMonth}-01`, 'yyyy-MM-dd', new Date());
  const monthLabel = format(currentMonthDate, 'MMMM yyyy');

  const goToPrevMonth = () => setSelectedMonth(format(subMonths(currentMonthDate, 1), 'yyyy-MM'));
  const goToNextMonth = () => {
    const next = addMonths(currentMonthDate, 1);
    if (next <= new Date()) setSelectedMonth(format(next, 'yyyy-MM'));
  };

  useEffect(() => {
    fetchTeamExpenses();
  }, [selectedMonth]);

  const fetchTeamExpenses = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Check if admin
      const { data: roleData } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('role', 'admin')
        .maybeSingle();
      const userIsAdmin = !!roleData;
      setIsAdmin(userIsAdmin);

      let subIds: string[] = [];
      let nameMap = new Map<string, string>();

      if (userIsAdmin) {
        const { data: allUsers } = await supabase
          .from('users')
          .select('id, full_name');
        subIds = allUsers?.filter(u => u.id !== user.id).map(u => u.id) || [];
        nameMap = new Map(allUsers?.map(u => [u.id, u.full_name || 'Unknown']) || []);
      } else {
        // Use hierarchy RPC so nested reportees are included (matches RLS)
        const { data: hier } = await supabase.rpc('get_user_hierarchy', { _manager_id: user.id });
        subIds = (hier || []).map((r: any) => r.user_id).filter((id: string) => id !== user.id);
        if (subIds.length > 0) {
          const { data: subUsers } = await supabase
            .from('users')
            .select('id, full_name')
            .in('id', subIds);
          nameMap = new Map(subUsers?.map(s => [s.id, s.full_name || 'Unknown']) || []);
        }
      }

      if (subIds.length === 0) {
        setExpenses([]);
        setMemberSummaries([]);
        setLoading(false);
        return;
      }

      // Full month end (handles Feb 28/29)
      const startDate = `${selectedMonth}-01`;
      const endDate = format(endOfMonth(parse(startDate, 'yyyy-MM-dd', new Date())), 'yyyy-MM-dd');

      const { data } = await supabase
        .from('additional_expenses')
        .select('*')
        .in('user_id', subIds)
        .gte('expense_date', startDate)
        .lte('expense_date', endDate)
        .order('expense_date', { ascending: false });

      setExpenses(
        (data || []).map(e => ({
          ...e,
          employee_name: nameMap.get(e.user_id) || 'Unknown',
        })) as TeamExpense[]
      );

      // Per-member TA/DA/Additional summaries via RPC
      setSummariesLoading(true);
      const summaries = await Promise.all(
        subIds.map(async (uid) => {
          const { data: sum } = await supabase.rpc('get_monthly_expense_summary' as any, {
            _user_id: uid,
            _year_month: selectedMonth,
          });
          const s = (sum || {}) as any;
          const ta = Number(s.ta || 0);
          const da = Number(s.da || 0);
          const additional = Number(s.additional_approved || 0) + Number(s.additional_pending || 0);
          return {
            user_id: uid,
            name: nameMap.get(uid) || 'Unknown',
            ta,
            da,
            additional,
            total: Number(s.total || ta + da + additional),
            present_days: Number(s.present_days || 0),
            total_km: Number(s.total_km || 0),
          };
        })
      );
      setMemberSummaries(summaries.sort((a, b) => b.total - a.total));
      setSummariesLoading(false);
    } catch (error) {
      console.error('Error fetching team expenses:', error);
      toast.error('Failed to load team expenses');
    } finally {
      setLoading(false);
    }
  };


  const handleApprove = async (id: string) => {
    setActionLoading(id);
    try {
      const exp = expenses.find(e => e.id === id);
      const { error } = await supabase.from('additional_expenses').update({ status: 'approved' }).eq('id', id);
      if (error) throw error;

      if (exp) {
        await supabase.rpc('send_notification', {
          user_id_param: exp.user_id,
          title_param: 'Expense Approved',
          message_param: `Your expense of ₹${exp.amount} (${exp.category === 'Other' ? exp.custom_category : exp.category}) has been approved.`,
          type_param: 'expense_decision',
          related_table_param: 'additional_expenses',
        });
      }

      toast.success('Expense approved');
      setExpenses(prev => prev.map(e => e.id === id ? { ...e, status: 'approved' } : e));
    } catch (error) {
      console.error('Error:', error);
      toast.error('Failed to approve expense');
    } finally {
      setActionLoading(null);
    }
  };

  const handleRejectClick = (id: string) => {
    setRejectionTargetId(id);
    setShowRejectionDialog(true);
  };

  const handleConfirmRejection = async (reason: string) => {
    if (!rejectionTargetId) return;
    setActionLoading(rejectionTargetId);
    try {
      const exp = expenses.find(e => e.id === rejectionTargetId);
      const { error } = await supabase.from('additional_expenses')
        .update({ status: 'rejected', rejection_reason: reason })
        .eq('id', rejectionTargetId);
      if (error) throw error;

      if (exp) {
        await supabase.rpc('send_notification', {
          user_id_param: exp.user_id,
          title_param: 'Expense Rejected',
          message_param: `Your expense of ₹${exp.amount} (${exp.category === 'Other' ? exp.custom_category : exp.category}) has been rejected. Reason: ${reason}`,
          type_param: 'expense_decision',
          related_table_param: 'additional_expenses',
        });
      }

      toast.success('Expense rejected');
      setExpenses(prev => prev.map(e => e.id === rejectionTargetId ? { ...e, status: 'rejected', rejection_reason: reason } : e));
    } catch (error) {
      console.error('Error:', error);
      toast.error('Failed to reject expense');
    } finally {
      setActionLoading(null);
      setRejectionTargetId(null);
    }
  };

  // Computed stats
  const totalSubmitted = expenses.reduce((s, e) => s + Number(e.amount), 0);
  const totalApproved = expenses.filter(e => e.status === 'approved').reduce((s, e) => s + Number(e.amount), 0);
  const pendingExpenses = expenses.filter(e => e.status === 'submitted' || e.status === 'pending');
  const totalPending = pendingExpenses.reduce((s, e) => s + Number(e.amount), 0);
  const totalRejected = expenses.filter(e => e.status === 'rejected').reduce((s, e) => s + Number(e.amount), 0);
  const approvedExpenses = expenses.filter(e => e.status === 'approved');
  const rejectedExpenses = expenses.filter(e => e.status === 'rejected');

  // Group by user for overview
  const expensesByUser = useMemo(() => {
    const map = new Map<string, { name: string; total: number; approved: number; pending: number; rejected: number; count: number }>();
    expenses.forEach(e => {
      const entry = map.get(e.user_id) || { name: e.employee_name, total: 0, approved: 0, pending: 0, rejected: 0, count: 0 };
      const amt = Number(e.amount);
      entry.total += amt;
      entry.count += 1;
      if (e.status === 'approved') entry.approved += amt;
      else if (e.status === 'rejected') entry.rejected += amt;
      else entry.pending += amt;
      map.set(e.user_id, entry);
    });
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [expenses]);

  const statusBadge = (status: string) => {
    switch (status) {
      case 'approved': return <Badge className="bg-success/10 text-success hover:bg-success/15"><CheckCircle2 className="h-3 w-3 mr-1" />Approved</Badge>;
      case 'rejected': return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Rejected</Badge>;
      default: return <Badge className="bg-warning/10 text-warning hover:bg-warning/15"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold sm:text-2xl">Team expenses</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">Review claims and approve what's pending.</p>
        </div>
        <div className="flex items-center justify-between gap-2 rounded-sm border bg-card p-1 shadow-card sm:justify-center">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={goToPrevMonth} aria-label="Previous month">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-[132px] text-center text-sm font-semibold">{monthLabel}</span>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={goToNextMonth} disabled={addMonths(currentMonthDate, 1) > new Date()} aria-label="Next month">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      ) : (() => {
        const teamTA = memberSummaries.reduce((s, m) => s + m.ta, 0);
        const teamDA = daApplicable ? memberSummaries.reduce((s, m) => s + m.da, 0) : 0;
        const teamAdd = memberSummaries.reduce((s, m) => s + m.additional, 0);
        const teamTotal = teamTA + teamDA + teamAdd;
        const expenseShares = [
          { label: 'Travel (TA)', value: teamTA, color: 'bg-info' },
          ...(daApplicable ? [{ label: 'Daily (DA)', value: teamDA, color: 'bg-success' }] : []),
          { label: 'Additional', value: teamAdd, color: 'bg-accent' },
        ];
        const approvalShares = [
          { label: 'Approved', value: totalApproved, count: approvedExpenses.length, color: 'bg-success' },
          { label: 'Pending', value: totalPending, count: pendingExpenses.length, color: 'bg-warning' },
          { label: 'Rejected', value: totalRejected, count: rejectedExpenses.length, color: 'bg-destructive' },
        ];
        const percent = (value: number, total: number) => total > 0 ? Math.round((value / total) * 100) : 0;
        const renderExpense = (exp: TeamExpense) => (
          <Card key={exp.id} className="rounded-sm shadow-card transition-shadow hover:shadow-elevated">
            <CardContent className="space-y-3 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{exp.employee_name}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {exp.category === 'Other' ? exp.custom_category : exp.category} • {format(new Date(exp.expense_date), 'dd MMM yyyy')}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="flex items-center font-bold"><IndianRupee className="h-3 w-3" />{Number(exp.amount).toFixed(0)}</span>
                  {statusBadge(exp.status)}
                </div>
              </div>
              {exp.description && <p className="text-sm text-muted-foreground">{exp.description}</p>}
              {(exp.status === 'pending' || exp.status === 'submitted') && (
                <div className="flex gap-2 pt-1">
                  <Button size="sm" className="flex-1 bg-success text-success-foreground hover:bg-success/90" disabled={actionLoading === exp.id} onClick={() => handleApprove(exp.id)}>
                    {actionLoading === exp.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="mr-1 h-4 w-4" />}Approve
                  </Button>
                  <Button size="sm" variant="destructive" className="flex-1" disabled={actionLoading === exp.id} onClick={() => handleRejectClick(exp.id)}>
                    <X className="mr-1 h-4 w-4" />Reject
                  </Button>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                {exp.status === 'rejected' && exp.rejection_reason && (
                  <Button variant="ghost" size="sm" onClick={() => setRejectionView(exp.rejection_reason)}><Eye className="mr-1 h-3 w-3" />View Reason</Button>
                )}
                {exp.bill_url && (
                  <Button variant="ghost" size="sm" onClick={() => exp.bill_url && window.open(exp.bill_url, '_blank')}><Eye className="mr-1 h-3 w-3" />Receipt</Button>
                )}
              </div>
            </CardContent>
          </Card>
        );

        return (
          <div className="space-y-6">
            <section aria-labelledby="expense-summary-heading">
              <h3 id="expense-summary-heading" className="sr-only">Expense summary</h3>
              <div className={`grid grid-cols-2 gap-3 ${daApplicable ? 'lg:grid-cols-4' : 'lg:grid-cols-3'}`}>
                <Card className="col-span-2 rounded-sm border-primary/15 bg-primary/5 shadow-card lg:col-span-1">
                  <CardContent className="flex h-full min-h-[116px] flex-col justify-between p-4">
                    <div className="flex items-center justify-between"><p className="text-xs font-semibold text-primary">Grand Total</p><CircleDollarSign className="h-5 w-5 text-primary" /></div>
                    <p className="text-2xl font-bold">₹{teamTotal.toFixed(0)}</p>
                    <p className="text-xs text-muted-foreground">{daApplicable ? 'TA + DA + Additional' : 'TA + Additional'}</p>
                  </CardContent>
                </Card>
                <Card className="rounded-sm border-info/20 bg-info/10 shadow-card"><CardContent className="flex min-h-[116px] flex-col justify-between p-4"><div className="flex items-center justify-between"><p className="text-xs font-semibold text-info">Travel (TA)</p><Car className="h-5 w-5 text-info" /></div><p className="text-xl font-bold text-info">₹{teamTA.toFixed(0)}</p><p className="text-xs text-muted-foreground">Team total</p></CardContent></Card>
                {daApplicable && <Card className="rounded-sm border-success/20 bg-success/10 shadow-card"><CardContent className="flex min-h-[116px] flex-col justify-between p-4"><div className="flex items-center justify-between"><p className="text-xs font-semibold text-success">Daily (DA)</p><Utensils className="h-5 w-5 text-success" /></div><p className="text-xl font-bold text-success">₹{teamDA.toFixed(0)}</p><p className="text-xs text-muted-foreground">Team total</p></CardContent></Card>}
                <Card className="rounded-sm border-accent/25 bg-accent/10 shadow-card"><CardContent className="flex min-h-[116px] flex-col justify-between p-4"><div className="flex items-center justify-between"><p className="text-xs font-semibold text-accent">Additional</p><Receipt className="h-5 w-5 text-accent" /></div><p className="text-xl font-bold text-accent">₹{teamAdd.toFixed(0)}</p><p className="text-xs text-muted-foreground">{expenses.length} claims</p></CardContent></Card>
              </div>
            </section>

            <section aria-labelledby="approval-status-heading">
              <div className="mb-3 flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-success" /><h3 id="approval-status-heading" className="text-sm font-semibold">Approval Status</h3></div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {approvalShares.map((item) => (
                  <Card key={item.label} className="rounded-sm shadow-card"><CardContent className="p-4"><div className="flex items-center justify-between"><div><p className="text-xs text-muted-foreground">{item.label}</p><p className="mt-1 text-lg font-bold">₹{item.value.toFixed(0)}</p><p className="text-xs text-muted-foreground">{item.count} claim{item.count === 1 ? '' : 's'}</p></div><span className={`h-9 w-1 rounded-full ${item.color}`} /></div></CardContent></Card>
                ))}
              </div>
            </section>

            <section className="grid gap-4 lg:grid-cols-2" aria-label="Expense insights">
              <Card className="rounded-sm shadow-card"><CardContent className="p-4 sm:p-5"><div className="mb-4 flex items-center gap-2"><ChartNoAxesColumnIncreasing className="h-4 w-4 text-info" /><h3 className="text-sm font-semibold">Expense Breakdown</h3></div><div className="space-y-4">{expenseShares.map((item) => { const share = percent(item.value, teamTotal); return <div key={item.label}><div className="mb-1.5 flex justify-between text-xs"><span>{item.label}</span><span className="font-semibold">{share}%</span></div><div className="h-2 overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full transition-[width] duration-300 motion-reduce:transition-none ${item.color}`} style={{ width: `${share}%` }} /></div></div>; })}</div></CardContent></Card>
              <Card className="rounded-sm shadow-card"><CardContent className="p-4 sm:p-5"><div className="mb-4 flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-success" /><h3 className="text-sm font-semibold">Approval Progress</h3></div><div className="space-y-4">{approvalShares.map((item) => { const share = percent(item.value, totalSubmitted); return <div key={item.label}><div className="mb-1.5 flex justify-between text-xs"><span>{item.label}</span><span className="font-semibold">{share}%</span></div><div className="h-2 overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full transition-[width] duration-300 motion-reduce:transition-none ${item.color}`} style={{ width: `${share}%` }} /></div></div>; })}</div></CardContent></Card>
            </section>

            <section className="rounded-sm border bg-card p-4 shadow-card sm:p-5"><ExpenseReportGenerator isAdmin={isAdmin} /></section>

            <section aria-labelledby="pending-approvals-heading">
              <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between"><div><h3 id="pending-approvals-heading" className="text-lg font-bold">Pending Approvals</h3></div><p className="text-xs text-muted-foreground">{pendingExpenses.length} expense{pendingExpenses.length === 1 ? '' : 's'} awaiting review</p></div>
              {pendingExpenses.length === 0 ? <Card className="rounded-sm border-dashed shadow-none"><CardContent className="py-8 text-center text-sm text-muted-foreground">No pending approvals for this month.</CardContent></Card> : <div className="grid gap-3 lg:grid-cols-2">{pendingExpenses.map(renderExpense)}</div>}
            </section>

            {(approvedExpenses.length > 0 || rejectedExpenses.length > 0) && <section aria-labelledby="recent-activity-heading"><h3 id="recent-activity-heading" className="mb-3 text-sm font-semibold">Recent Expense Activity</h3><div className="grid gap-3 lg:grid-cols-2">{[...approvedExpenses, ...rejectedExpenses].map(renderExpense)}</div></section>}

            <section aria-labelledby="team-expenses-heading">
              <div className="mb-3 flex items-center gap-2"><Users className="h-4 w-4 text-info" /><h3 id="team-expenses-heading" className="text-sm font-semibold">Expenses by Team Member</h3></div>
              {summariesLoading ? <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div> : memberSummaries.length === 0 ? <Card className="rounded-sm border-dashed shadow-none"><CardContent className="py-8 text-center text-sm text-muted-foreground">No team members found.</CardContent></Card> : <div className="grid gap-3 lg:grid-cols-2">{memberSummaries.map((u) => <Card key={u.user_id} className="rounded-sm shadow-card"><CardContent className="p-4"><div className="mb-3 flex items-center justify-between gap-3"><div><p className="text-sm font-semibold">{u.name}</p><p className="text-xs text-muted-foreground">{u.present_days} present · {u.total_km.toFixed(1)} km</p></div><span className="text-sm font-bold">₹{(daApplicable ? u.total : u.total - u.da).toFixed(0)}</span></div><div className={`grid ${daApplicable ? 'grid-cols-3' : 'grid-cols-2'} gap-2 text-xs`}><div className="rounded-sm bg-info/10 p-2 text-center text-info"><p className="text-xs">TA</p><p className="font-semibold">₹{u.ta.toFixed(0)}</p></div>{daApplicable && <div className="rounded-sm bg-success/10 p-2 text-center text-success"><p className="text-xs">DA</p><p className="font-semibold">₹{u.da.toFixed(0)}</p></div>}<div className="rounded-sm bg-accent/10 p-2 text-center text-accent"><p className="text-xs">Add</p><p className="font-semibold">₹{u.additional.toFixed(0)}</p></div></div></CardContent></Card>)}</div>}
            </section>
          </div>
        );
      })()}

      <RejectionReasonDialog
        isOpen={showRejectionDialog}
        onClose={() => { setShowRejectionDialog(false); setRejectionTargetId(null); }}
        onConfirm={handleConfirmRejection}
      />

      {/* Rejection Reason View */}
      {rejectionView && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/50" onClick={() => setRejectionView(null)}>
          <Card className="max-w-sm mx-4" onClick={e => e.stopPropagation()}>
            <CardContent className="p-4">
              <p className="font-semibold text-destructive mb-2">Rejection Reason</p>
              <p className="text-sm">{rejectionView}</p>
              <Button variant="outline" size="sm" className="mt-3 w-full" onClick={() => setRejectionView(null)}>Close</Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
