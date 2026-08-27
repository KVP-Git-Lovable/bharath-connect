import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Download, Search } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { downloadCSV } from '@/utils/fileDownloader';
import { toast } from 'sonner';

interface ReportRow {
  user_id: string;
  full_name: string;
  date: string;
  status: string;
  check_in_time: string | null;
  check_out_time: string | null;
  total_hours: number | null;
}

const AttendanceReportGenerator = () => {
  const [fromDate, setFromDate] = useState(format(new Date(), 'yyyy-MM-01'));
  const [toDate, setToDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [selectedUser, setSelectedUser] = useState('all');
  const [users, setUsers] = useState<{ id: string; full_name: string }[]>([]);
  const [reportData, setReportData] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.from('users').select('id, full_name').eq('is_active', true).order('full_name')
      .then(({ data }) => setUsers(data || []));
  }, []);

  const generateReport = async () => {
    setLoading(true);
    try {
      let query = supabase.from('attendance').select('user_id, date, status, check_in_time, check_out_time, total_hours')
        .gte('date', fromDate).lte('date', toDate).order('date', { ascending: true });

      if (selectedUser !== 'all') query = query.eq('user_id', selectedUser);

      const { data, error } = await query;
      if (error) throw error;

      const userIds = [...new Set(data?.map(r => r.user_id) || [])];
      const { data: profiles } = await supabase.from('users').select('id, full_name').in('id', userIds.length ? userIds : ['__none__']);

      const enriched: ReportRow[] = (data || []).map(r => ({
        ...r,
        full_name: profiles?.find(p => p.id === r.user_id)?.full_name || 'Unknown',
      }));

      setReportData(enriched);
      if (!enriched.length) toast.info('No attendance records found for the selected period');
    } catch {
      toast.error('Failed to generate report');
    } finally {
      setLoading(false);
    }
  };

  const handleExportCSV = async () => {
    if (!reportData.length) { toast.error('No data to export'); return; }
    try {
      const csvData = reportData.map(r => ({
        'Employee': r.full_name,
        'Date': r.date,
        'Status': r.status,
        'Check In': r.check_in_time ? format(new Date(r.check_in_time), 'HH:mm') : '--',
        'Check Out': r.check_out_time ? format(new Date(r.check_out_time), 'HH:mm') : '--',
        'Total Hours': r.total_hours?.toFixed(2) || '--',
      }));
      await downloadCSV(csvData, `attendance-report-${fromDate}-to-${toDate}.csv`);
      toast.success('Report exported');
    } catch (err) {
      console.error('CSV export error:', err);
      toast.error('Failed to export report');
    }
  };

  const getStatusBadge = (status: string) => {
    const map: Record<string, string> = {
      present: 'bg-green-100 text-green-800',
      absent: 'bg-red-100 text-red-800',
      leave: 'bg-blue-100 text-blue-800',
      half_day_leave: 'bg-orange-100 text-orange-800',
      late: 'bg-yellow-100 text-yellow-800',
      regularized: 'bg-purple-100 text-purple-800',
    };
    return <Badge className={map[status] || 'bg-muted text-muted-foreground'}>{status.replace(/_/g, ' ')}</Badge>;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Attendance Report</CardTitle>
        <CardDescription>Generate and export attendance reports by date range</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div>
            <Label className="text-xs">From Date</Label>
            <Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">To Date</Label>
            <Input type="date" value={toDate} onChange={e => setToDate(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Employee</Label>
            <Select value={selectedUser} onValueChange={setSelectedUser}>
              <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Employees</SelectItem>
                {users.map(u => <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end gap-2">
            <Button onClick={generateReport} disabled={loading}>
              <Search className="h-4 w-4 mr-1" />{loading ? 'Loading...' : 'Generate'}
            </Button>
            <Button variant="outline" onClick={handleExportCSV} disabled={!reportData.length}>
              <Download className="h-4 w-4 mr-1" />Export CSV
            </Button>
          </div>
        </div>

        {reportData.length > 0 && (
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Check In</TableHead>
                  <TableHead>Check Out</TableHead>
                  <TableHead>Hours</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reportData.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{r.full_name}</TableCell>
                    <TableCell>{format(new Date(r.date), 'MMM dd, yyyy')}</TableCell>
                    <TableCell>{getStatusBadge(r.status)}</TableCell>
                    <TableCell>{r.check_in_time ? format(new Date(r.check_in_time), 'HH:mm') : '--'}</TableCell>
                    <TableCell>{r.check_out_time ? format(new Date(r.check_out_time), 'HH:mm') : '--'}</TableCell>
                    <TableCell>{r.total_hours?.toFixed(2) || '--'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default AttendanceReportGenerator;
