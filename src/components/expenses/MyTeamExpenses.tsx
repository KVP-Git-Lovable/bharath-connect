import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Check, X, Clock, Loader2, IndianRupee, CheckCircle2, XCircle, Eye } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { format, subMonths } from 'date-fns';
import { toast } from 'sonner';
import RejectionReasonDialog from '@/components/RejectionReasonDialog';

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

export default function MyTeamExpenses() {
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [statusFilter, setStatusFilter] = useState('all');
  const [expenses, setExpenses] = useState<TeamExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showRejectionDialog, setShowRejectionDialog] = useState(false);
  const [rejectionTargetId, setRejectionTargetId] = useState<string | null>(null);
  const [rejectionView, setRejectionView] = useState<string | null>(null);

  const months = Array.from({ length: 12 }, (_, i) => {
    const d = subMonths(new Date(), i);
    return { value: format(d, 'yyyy-MM'), label: format(d, 'MMM yyyy') };
  });

  useEffect(() => {
    fetchTeamExpenses();
  }, [selectedMonth]);

  const fetchTeamExpenses = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: subordinates } = await supabase
        .from('users')
        .select('id, full_name')
        .eq('reporting_manager_id', user.id);

      const subIds = subordinates?.map(s => s.id) || [];
      const nameMap = new Map(subordinates?.map(s => [s.id, s.full_name || 'Unknown']) || []);

      if (subIds.length === 0) {
        setExpenses([]);
        setLoading(false);
        return;
      }

      const { data } = await supabase
        .from('additional_expenses')
        .select('*')
        .in('user_id', subIds)
        .gte('expense_date', `${selectedMonth}-01`)
        .lte('expense_date', `${selectedMonth}-31`)
        .order('expense_date', { ascending: false });

      setExpenses(
        (data || []).map(e => ({
          ...e,
          employee_name: nameMap.get(e.user_id) || 'Unknown',
        })) as TeamExpense[]
      );
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

  const filtered = statusFilter === 'all' ? expenses : expenses.filter(e => e.status === statusFilter);

  const statusBadge = (status: string) => {
    switch (status) {
      case 'approved': return <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"><CheckCircle2 className="h-3 w-3 mr-1" />Approved</Badge>;
      case 'rejected': return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Rejected</Badge>;
      default: return <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
    }
  };

  const pendingCount = expenses.filter(e => e.status === 'submitted' || e.status === 'pending').length;

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <Select value={selectedMonth} onValueChange={setSelectedMonth}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>{months.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="submitted">Submitted</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Summary */}
      {pendingCount > 0 && (
        <Card className="border-yellow-200 bg-yellow-50 dark:border-yellow-900 dark:bg-yellow-950/30">
          <CardContent className="p-3 text-center">
            <p className="text-sm font-medium text-yellow-800 dark:text-yellow-400">{pendingCount} expense{pendingCount !== 1 ? 's' : ''} awaiting your approval</p>
          </CardContent>
        </Card>
      )}

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground">No team expenses found for this period.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {filtered.map(exp => (
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

                {/* Actions for pending/submitted */}
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

                {/* Show rejection reason */}
                {exp.status === 'rejected' && exp.rejection_reason && (
                  <Button variant="ghost" size="sm" onClick={() => setRejectionView(exp.rejection_reason)}>
                    <Eye className="h-3 w-3 mr-1" />View Reason
                  </Button>
                )}

                {/* Receipt link */}
                {exp.bill_url && (
                  <Button variant="ghost" size="sm" onClick={() => window.open(exp.bill_url!, '_blank')}>
                    <Eye className="h-3 w-3 mr-1" />Receipt
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

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
