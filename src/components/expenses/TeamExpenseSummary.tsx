import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Check, X, Clock, Loader2, IndianRupee, CheckCircle2, XCircle, Eye, ChevronLeft, ChevronRight, Users, Car, Utensils, Receipt } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
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
      case 'approved': return <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"><CheckCircle2 className="h-3 w-3 mr-1" />Approved</Badge>;
      case 'rejected': return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Rejected</Badge>;
      default: return <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
    }
  };

  return (
    <div className="space-y-4">
      {/* Shared Month Navigation */}
      <div className="flex items-center justify-center gap-3">
        <Button variant="outline" size="icon" className="h-8 w-8" onClick={goToPrevMonth}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm font-semibold min-w-[140px] text-center">{monthLabel}</span>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          onClick={goToNextMonth}
          disabled={addMonths(currentMonthDate, 1) > new Date()}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <Tabs defaultValue="approvals" className="w-full">
        <TabsList className="w-full">
          <TabsTrigger value="approvals" className="flex-1">Approvals</TabsTrigger>
          <TabsTrigger value="overview" className="flex-1">Overview</TabsTrigger>
        </TabsList>

        {/* ═══ APPROVALS TAB ═══ */}
        <TabsContent value="approvals">
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
          ) : pendingExpenses.length === 0 && expenses.length === 0 ? (
            <Card><CardContent className="py-8 text-center text-muted-foreground">No team expenses for this month.</CardContent></Card>
          ) : (
            <div className="space-y-3 mt-2">
              {pendingExpenses.length > 0 && (
                <Card className="border-yellow-200 bg-yellow-50 dark:border-yellow-900 dark:bg-yellow-950/30">
                  <CardContent className="p-3 text-center">
                    <p className="text-sm font-medium text-yellow-800 dark:text-yellow-400">
                      {pendingExpenses.length} expense{pendingExpenses.length !== 1 ? 's' : ''} awaiting your approval
                    </p>
                  </CardContent>
                </Card>
              )}

              {expenses.map(exp => (
                <Card key={exp.id}>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-semibold">{exp.employee_name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {exp.category === 'Other' ? exp.custom_category : exp.category} • {format(new Date(exp.expense_date), 'dd MMM yyyy')}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className="font-bold flex items-center"><IndianRupee className="h-3 w-3" />{Number(exp.amount).toFixed(0)}</span>
                        {statusBadge(exp.status)}
                      </div>
                    </div>

                    {exp.description && <p className="text-sm text-muted-foreground">{exp.description}</p>}

                    {(exp.status === 'pending' || exp.status === 'submitted') && (
                      <div className="flex gap-2 pt-1">
                        <Button size="sm" className="flex-1 bg-green-600 hover:bg-green-700" disabled={actionLoading === exp.id}
                          onClick={() => handleApprove(exp.id)}>
                          {actionLoading === exp.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4 mr-1" />}Approve
                        </Button>
                        <Button size="sm" variant="destructive" className="flex-1" disabled={actionLoading === exp.id}
                          onClick={() => handleRejectClick(exp.id)}>
                          <X className="h-4 w-4 mr-1" />Reject
                        </Button>
                      </div>
                    )}

                    <div className="flex gap-2">
                      {exp.status === 'rejected' && exp.rejection_reason && (
                        <Button variant="ghost" size="sm" onClick={() => setRejectionView(exp.rejection_reason)}>
                          <Eye className="h-3 w-3 mr-1" />View Reason
                        </Button>
                      )}
                      {exp.bill_url && (
                        <Button variant="ghost" size="sm" onClick={() => window.open(exp.bill_url!, '_blank')}>
                          <Eye className="h-3 w-3 mr-1" />Receipt
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ═══ OVERVIEW TAB ═══ */}
        <TabsContent value="overview">
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
          ) : (
            <div className="space-y-4 mt-2">
              {/* Team-wide TA/DA/Additional Totals */}
              {(() => {
                const teamTA = memberSummaries.reduce((s, m) => s + m.ta, 0);
                const teamDA = memberSummaries.reduce((s, m) => s + m.da, 0);
                const teamAdd = memberSummaries.reduce((s, m) => s + m.additional, 0);
                const teamTotal = teamTA + teamDA + teamAdd;
                return (
                  <div className="grid grid-cols-2 gap-3">
                    <Card>
                      <CardContent className="p-4 text-center">
                        <p className="text-xs text-blue-600 dark:text-blue-400 flex items-center justify-center gap-1"><Car className="h-3 w-3" />Travel (TA)</p>
                        <p className="text-lg font-bold text-blue-600 dark:text-blue-400">₹{teamTA.toFixed(0)}</p>
                        <p className="text-xs text-muted-foreground">Team total</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-4 text-center">
                        <p className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center justify-center gap-1"><Utensils className="h-3 w-3" />Daily (DA)</p>
                        <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">₹{teamDA.toFixed(0)}</p>
                        <p className="text-xs text-muted-foreground">Team total</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-4 text-center">
                        <p className="text-xs text-purple-600 dark:text-purple-400 flex items-center justify-center gap-1"><Receipt className="h-3 w-3" />Additional</p>
                        <p className="text-lg font-bold text-purple-600 dark:text-purple-400">₹{teamAdd.toFixed(0)}</p>
                        <p className="text-xs text-muted-foreground">{expenses.length} claims</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-4 text-center">
                        <p className="text-xs text-muted-foreground">Grand Total</p>
                        <p className="text-lg font-bold">₹{teamTotal.toFixed(0)}</p>
                        <p className="text-xs text-muted-foreground">TA + DA + Add</p>
                      </CardContent>
                    </Card>
                  </div>
                );
              })()}

              {/* Approval Status Cards (additional expenses) */}
              <div className="grid grid-cols-3 gap-3">
                <Card>
                  <CardContent className="p-3 text-center">
                    <p className="text-xs text-green-600 dark:text-green-400">Approved</p>
                    <p className="text-base font-bold text-green-600 dark:text-green-400">₹{totalApproved.toFixed(0)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-3 text-center">
                    <p className="text-xs text-yellow-600 dark:text-yellow-400">Pending</p>
                    <p className="text-base font-bold text-yellow-600 dark:text-yellow-400">₹{totalPending.toFixed(0)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-3 text-center">
                    <p className="text-xs text-destructive">Rejected</p>
                    <p className="text-base font-bold text-destructive">₹{totalRejected.toFixed(0)}</p>
                  </CardContent>
                </Card>
              </div>

              {/* Per-member TA/DA/Additional breakdown */}
              <div>
                <h3 className="text-sm font-semibold mb-2 flex items-center gap-1"><Users className="h-4 w-4" />Expenses by Team Member</h3>
                {summariesLoading ? (
                  <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                ) : memberSummaries.length === 0 ? (
                  <Card><CardContent className="py-6 text-center text-muted-foreground text-sm">No team members found.</CardContent></Card>
                ) : (
                  <div className="space-y-2">
                    {memberSummaries.map((u) => (
                      <Card key={u.user_id}>
                        <CardContent className="p-3">
                          <div className="flex items-center justify-between mb-2">
                            <div>
                              <p className="font-semibold text-sm">{u.name}</p>
                              <p className="text-[11px] text-muted-foreground">{u.present_days} present · {u.total_km.toFixed(1)} km</p>
                            </div>
                            <span className="font-bold text-sm">₹{u.total.toFixed(0)}</span>
                          </div>
                          <div className="grid grid-cols-3 gap-2 text-xs">
                            <div className="rounded bg-blue-50 dark:bg-blue-950/30 p-1.5 text-center">
                              <p className="text-[10px] text-blue-600 dark:text-blue-400">TA</p>
                              <p className="font-semibold text-blue-700 dark:text-blue-300">₹{u.ta.toFixed(0)}</p>
                            </div>
                            <div className="rounded bg-emerald-50 dark:bg-emerald-950/30 p-1.5 text-center">
                              <p className="text-[10px] text-emerald-600 dark:text-emerald-400">DA</p>
                              <p className="font-semibold text-emerald-700 dark:text-emerald-300">₹{u.da.toFixed(0)}</p>
                            </div>
                            <div className="rounded bg-purple-50 dark:bg-purple-950/30 p-1.5 text-center">
                              <p className="text-[10px] text-purple-600 dark:text-purple-400">Add</p>
                              <p className="font-semibold text-purple-700 dark:text-purple-300">₹{u.additional.toFixed(0)}</p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>

              {/* Report Generator */}
              <ExpenseReportGenerator isAdmin={isAdmin} />
            </div>

          )}
        </TabsContent>
      </Tabs>

      <RejectionReasonDialog
        isOpen={showRejectionDialog}
        onClose={() => { setShowRejectionDialog(false); setRejectionTargetId(null); }}
        onConfirm={handleConfirmRejection}
      />

      {/* Rejection Reason View */}
      {rejectionView && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setRejectionView(null)}>
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
