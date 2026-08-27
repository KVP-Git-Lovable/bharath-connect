import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Search, RefreshCw, Download, Edit, Plus, Users, FileSpreadsheet, CalendarClock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useMonthlyLeaveAccrual } from '@/hooks/useMonthlyLeaveAccrual';
import { downloadCSVString } from '@/utils/nativeDownload';

interface LeaveBalance {
  id: string; user_id: string; leave_type_id: string; opening_balance: number; used_balance: number; remaining_balance: number | null; year: number;
  profiles?: { full_name: string }; leave_types?: { name: string };
}

const LeaveBalancesManager = () => {
  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<{ id: string; name: string; annual_quota: number; accrual_type: string }[]>([]);
  const [users, setUsers] = useState<{ id: string; full_name: string }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterLeaveType, setFilterLeaveType] = useState('all');
  const [filterYear, setFilterYear] = useState(new Date().getFullYear().toString());
  const [isInitializing, setIsInitializing] = useState(false);
  const [isRecalcMonthly, setIsRecalcMonthly] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingBalance, setEditingBalance] = useState<LeaveBalance | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState({ user_id: '', leave_type_id: '', opening_balance: 0, used_balance: 0 });
  const [employeeDOJs, setEmployeeDOJs] = useState<Record<string, string | null>>({});
  const { recalculate } = useMonthlyLeaveAccrual();

  const currentYear = new Date().getFullYear();
  const years = [currentYear - 1, currentYear, currentYear + 1];

  useEffect(() => { fetchData(); }, [filterYear, filterLeaveType]);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const { data: ltData } = await supabase.from('leave_types').select('id, name, annual_quota, accrual_type').eq('is_active', true).order('name');
      const { data: usersData } = await supabase.from('users').select('id, full_name').eq('is_active', true).order('full_name');
      const { data: employeesData } = await supabase.from('employees').select('user_id, date_of_joining');
      const dojMap: Record<string, string | null> = {};
      (employeesData || []).forEach(e => { dojMap[e.user_id] = e.date_of_joining; });
      setEmployeeDOJs(dojMap);
      setLeaveTypes(ltData || []);
      setUsers(usersData || []);

      let query = supabase.from('leave_balance').select('*').eq('year', parseInt(filterYear));
      if (filterLeaveType !== 'all') query = query.eq('leave_type_id', filterLeaveType);
      const { data: balanceData, error } = await query;
      if (error) throw error;

      const enriched = (balanceData || []).map(b => ({
        ...b, profiles: usersData?.find(u => u.id === b.user_id), leave_types: ltData?.find(lt => lt.id === b.leave_type_id),
      }));
      setBalances(enriched);
    } catch (error) { toast.error('Failed to load leave balances'); } finally { setIsLoading(false); }
  };

  // Core calculation: derive allocated balance from annual_quota, accrual_type, and DOJ
  const calculateAllocatedBalance = (annualQuota: number, accrualType: string, year: number, userId: string): number => {
    const doj = employeeDOJs[userId];
    const dojDate = doj ? new Date(doj) : null;
    const now = new Date();

    // Determine eligible months in the given year (full year entitlement from DOJ)
    let eligibleMonths: number;
    if (dojDate && dojDate.getFullYear() === year) {
      // Joined this year: months from DOJ month to December
      const startMonth = dojDate.getMonth() + 1; // 1-indexed
      eligibleMonths = Math.max(0, 12 - startMonth + 1);
    } else if (dojDate && dojDate.getFullYear() > year) {
      // DOJ is in a future year relative to the filter year
      eligibleMonths = 0;
    } else {
      // Joined before this year (or no DOJ recorded): full 12 months
      eligibleMonths = 12;
    }

    if (accrualType === 'monthly') {
      return Math.floor((annualQuota / 12) * eligibleMonths);
    }
    // Yearly accrual
    if (dojDate && dojDate.getFullYear() === year) {
      // Prorate for year of joining
      return Math.floor((annualQuota / 12) * eligibleMonths);
    }
    if (dojDate && dojDate.getFullYear() > year) {
      return 0;
    }
    return annualQuota;
  };

  const handleInitializeBalances = async () => {
    setIsInitializing(true);
    try {
      if (!leaveTypes.length) { toast.error('No active leave types found.'); return; }
      const { data: activeUsers } = await supabase.from('users').select('id').eq('is_active', true);
      if (!activeUsers?.length) { toast.error('No active users found'); return; }

      const year = parseInt(filterYear);
      const inserts = activeUsers.flatMap(user => leaveTypes.map(lt => {
        const allocatedBalance = calculateAllocatedBalance(lt.annual_quota, lt.accrual_type, year, user.id);
        return {
          user_id: user.id, leave_type_id: lt.id,
          opening_balance: allocatedBalance,
          used_balance: 0, year,
        };
      }));

      const { error } = await supabase.from('leave_balance').upsert(inserts, { onConflict: 'user_id,leave_type_id,year', ignoreDuplicates: false });
      if (error) throw error;
      toast.success(`Initialized balances for ${activeUsers.length} users`);
      fetchData();
    } catch (error) { toast.error('Failed to initialize leave balances'); } finally { setIsInitializing(false); }
  };

  const handleRecalculateBalances = async () => {
    setIsInitializing(true);
    try {
      const year = parseInt(filterYear);
      // Fetch approved leave applications for the year to calculate used days
      const { data: applications } = await supabase.from('leave_applications').select('user_id, leave_type_id, total_days').eq('status', 'approved').gte('from_date', `${year}-01-01`).lte('to_date', `${year}-12-31`);
      const usedDaysMap: Record<string, number> = {};
      for (const app of applications || []) {
        const key = `${app.user_id}_${app.leave_type_id}`;
        usedDaysMap[key] = (usedDaysMap[key] || 0) + Number(app.total_days || 0);
      }
      // Recalculate each balance row
      for (const balance of balances) {
        const key = `${balance.user_id}_${balance.leave_type_id}`;
        const lt = leaveTypes.find(l => l.id === balance.leave_type_id);
        const allocatedBalance = lt
          ? calculateAllocatedBalance(lt.annual_quota, lt.accrual_type, year, balance.user_id)
          : balance.opening_balance;
        const usedBalance = usedDaysMap[key] || 0;
        await supabase.from('leave_balance').update({ opening_balance: allocatedBalance, used_balance: usedBalance }).eq('id', balance.id);
      }
      toast.success('Balances recalculated successfully');
      fetchData();
    } catch (error) { toast.error('Failed to recalculate balances'); } finally { setIsInitializing(false); }
  };

  const handleSaveBalance = async () => {
    if (!formData.user_id || !formData.leave_type_id) { toast.error('Please fill all required fields'); return; }
    setIsSaving(true);
    try {
      const data = { ...formData, year: parseInt(filterYear) };
      if (editingBalance) {
        const { error } = await supabase.from('leave_balance').update(data).eq('id', editingBalance.id);
        if (error) throw error;
        toast.success('Balance updated');
      } else {
        const { error } = await supabase.from('leave_balance').insert(data);
        if (error) { if (error.code === '23505') { toast.error('Balance already exists'); return; } throw error; }
        toast.success('Balance created');
      }
      setIsDialogOpen(false);
      fetchData();
    } catch (error) { toast.error('Failed to save balance'); } finally { setIsSaving(false); }
  };

  const handleExport = () => {
    const csv = ['Employee,Leave Type,Opening,Used,Remaining,Year', ...filteredBalances.map(b => [b.profiles?.full_name || 'Unknown', b.leave_types?.name || 'Unknown', b.opening_balance, b.used_balance, b.remaining_balance || 0, b.year].join(','))].join('\n');
    downloadCSVString(csv, `leave_balances_${filterYear}.csv`);
  };

  const filteredBalances = balances.filter(b => !searchQuery || b.profiles?.full_name?.toLowerCase().includes(searchQuery.toLowerCase()));

  if (isLoading) return <div className="flex items-center justify-center py-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div><CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" />Leave Balances</CardTitle><CardDescription>Manage employee leave balances and entitlements</CardDescription></div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" onClick={handleInitializeBalances} disabled={isInitializing}><Plus className="h-4 w-4 mr-2" />Initialize Year</Button>
              <Button variant="outline" onClick={handleRecalculateBalances} disabled={isInitializing}><RefreshCw className={`h-4 w-4 mr-2 ${isInitializing ? 'animate-spin' : ''}`} />Recalculate</Button>
              <Button variant="default" onClick={async () => {
                setIsRecalcMonthly(true);
                const ok = await recalculate();
                if (ok) { toast.success('Monthly accruals recalculated with carry-forward'); fetchData(); }
                else toast.error('Failed to recalculate monthly accruals');
                setIsRecalcMonthly(false);
              }} disabled={isRecalcMonthly}><CalendarClock className={`h-4 w-4 mr-2 ${isRecalcMonthly ? 'animate-spin' : ''}`} />Recalculate Monthly</Button>
              <Button variant="outline" onClick={handleExport}><Download className="h-4 w-4 mr-2" />Export</Button>
              <Button onClick={() => { setEditingBalance(null); setFormData({ user_id: '', leave_type_id: '', opening_balance: 0, used_balance: 0 }); setIsDialogOpen(true); }}><Plus className="h-4 w-4 mr-2" />Add Balance</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-4 mb-6">
            <div className="relative flex-1 min-w-[200px]"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder="Search by employee name..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10" /></div>
            <Select value={filterLeaveType} onValueChange={setFilterLeaveType}><SelectTrigger className="w-[180px]"><SelectValue placeholder="Leave Type" /></SelectTrigger><SelectContent><SelectItem value="all">All Leave Types</SelectItem>{leaveTypes.map(lt => <SelectItem key={lt.id} value={lt.id}>{lt.name}</SelectItem>)}</SelectContent></Select>
            <Select value={filterYear} onValueChange={setFilterYear}><SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger><SelectContent>{years.map(y => <SelectItem key={y} value={y.toString()}>{y}</SelectItem>)}</SelectContent></Select>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-muted/50 rounded-lg p-4"><div className="text-sm text-muted-foreground">Total Employees</div><div className="text-2xl font-bold">{new Set(balances.map(b => b.user_id)).size}</div></div>
            <div className="bg-muted/50 rounded-lg p-4"><div className="text-sm text-muted-foreground">Total Records</div><div className="text-2xl font-bold">{balances.length}</div></div>
            <div className="bg-muted/50 rounded-lg p-4"><div className="text-sm text-muted-foreground">Total Allocated</div><div className="text-2xl font-bold">{Math.round(balances.reduce((s, b) => s + b.opening_balance, 0))} days</div></div>
            <div className="bg-muted/50 rounded-lg p-4"><div className="text-sm text-muted-foreground">Total Used</div><div className="text-2xl font-bold">{Math.round(balances.reduce((s, b) => s + b.used_balance, 0))} days</div></div>
          </div>

          {filteredBalances.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground"><FileSpreadsheet className="h-12 w-12 mx-auto mb-4 opacity-50" /><p>No leave balances found for {filterYear}</p></div>
          ) : (
            <Table>
              <TableHeader><TableRow><TableHead>Employee</TableHead><TableHead>Leave Type</TableHead><TableHead className="text-center">Opening</TableHead><TableHead className="text-center">Used</TableHead><TableHead className="text-center">Remaining</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader>
              <TableBody>
                {filteredBalances.map(b => (
                  <TableRow key={b.id}>
                    <TableCell className="font-medium">{b.profiles?.full_name || 'Unknown'}</TableCell>
                    <TableCell>{b.leave_types?.name || 'Unknown'}</TableCell>
                    <TableCell className="text-center"><Badge variant="secondary">{b.opening_balance}</Badge></TableCell>
                    <TableCell className="text-center"><Badge variant="outline">{b.used_balance}</Badge></TableCell>
                    <TableCell className="text-center"><Badge className={(b.remaining_balance || 0) <= 0 ? 'bg-destructive/20 text-destructive' : (b.remaining_balance || 0) <= 3 ? 'bg-warning/20 text-warning' : 'bg-[hsl(var(--success))]/20 text-[hsl(var(--success))]'}>{b.remaining_balance || 0}</Badge></TableCell>
                    <TableCell><Button variant="outline" size="sm" onClick={() => { setEditingBalance(b); setFormData({ user_id: b.user_id, leave_type_id: b.leave_type_id, opening_balance: b.opening_balance, used_balance: b.used_balance }); setIsDialogOpen(true); }}><Edit className="h-4 w-4" /></Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editingBalance ? 'Edit Balance' : 'Add Balance'}</DialogTitle><DialogDescription>Configure leave balance for an employee</DialogDescription></DialogHeader>
          <div className="space-y-4">
            <div><Label>Employee</Label><Select value={formData.user_id} onValueChange={v => setFormData({...formData, user_id: v})} disabled={!!editingBalance}><SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger><SelectContent>{users.map(u => <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Leave Type</Label><Select value={formData.leave_type_id} onValueChange={v => setFormData({...formData, leave_type_id: v})} disabled={!!editingBalance}><SelectTrigger><SelectValue placeholder="Select leave type" /></SelectTrigger><SelectContent>{leaveTypes.map(lt => <SelectItem key={lt.id} value={lt.id}>{lt.name}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Opening Balance</Label><Input type="number" value={formData.opening_balance} onChange={e => setFormData({...formData, opening_balance: parseInt(e.target.value) || 0})} min={0} /></div>
            <div><Label>Used Balance</Label><Input type="number" value={formData.used_balance} onChange={e => setFormData({...formData, used_balance: parseInt(e.target.value) || 0})} min={0} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button><Button onClick={handleSaveBalance} disabled={isSaving}>{isSaving ? 'Saving...' : 'Save'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default LeaveBalancesManager;
