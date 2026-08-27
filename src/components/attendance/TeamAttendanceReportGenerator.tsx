import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Download, Search, FileSpreadsheet, FileText, X, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import { downloadXLSX as downloadXLSXNative, downloadPDF as downloadPDFNative } from '@/utils/nativeDownload';

interface ReportRow {
  user_id: string;
  full_name: string;
  date: string;
  status: string;
  check_in_time: string | null;
  check_out_time: string | null;
  check_in_address: string | null;
  total_hours: number | null;
}

interface Props {
  onClose: () => void;
}

export default function TeamAttendanceReportGenerator({ onClose }: Props) {
  const [fromDate, setFromDate] = useState(format(new Date(), 'yyyy-MM-01'));
  const [toDate, setToDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [selectedUser, setSelectedUser] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [teamMembers, setTeamMembers] = useState<{ id: string; full_name: string }[]>([]);
  const [reportData, setReportData] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Check admin
      const { data: roles } = await supabase.from('user_roles').select('role').eq('user_id', user.id);
      const admin = roles?.some((r: any) => r.role === 'admin') || false;
      setIsAdmin(admin);

      if (admin) {
        const { data } = await supabase.from('users').select('id, full_name').eq('is_active', true).order('full_name');
        setTeamMembers((data || []).filter(u => u.id !== user.id));
      } else {
        const { data: subs } = await supabase.rpc('get_user_hierarchy', { _manager_id: user.id });
        if (subs?.length) {
          const subIds = subs.map((s: any) => s.user_id);
          const { data } = await supabase.from('users').select('id, full_name').in('id', subIds).eq('is_active', true).order('full_name');
          setTeamMembers(data || []);
        }
      }
    };
    init();
  }, []);

  const generateReport = async () => {
    if (!teamMembers.length) return;
    setLoading(true);
    try {
      const targetIds = selectedUser === 'all' ? teamMembers.map(m => m.id) : [selectedUser];

      let query = supabase
        .from('attendance')
        .select('user_id, date, status, check_in_time, check_out_time, check_in_address, total_hours')
        .in('user_id', targetIds)
        .gte('date', fromDate)
        .lte('date', toDate)
        .order('date', { ascending: true });

      if (selectedStatus !== 'all') query = query.eq('status', selectedStatus);

      const { data, error } = await query;
      if (error) throw error;

      const nameMap = new Map(teamMembers.map(m => [m.id, m.full_name]));
      const enriched: ReportRow[] = (data || []).map(r => ({
        ...r,
        full_name: nameMap.get(r.user_id) || 'Unknown',
      }));

      setReportData(enriched);
      if (!enriched.length) toast.info('No attendance records found');
    } catch {
      toast.error('Failed to generate report');
    } finally {
      setLoading(false);
    }
  };

  const summary = useMemo(() => {
    const totalHours = reportData.reduce((sum, r) => sum + (r.total_hours || 0), 0);
    const present = reportData.filter(r => r.status === 'present' || r.status === 'regularized').length;
    const absent = reportData.filter(r => r.status === 'absent').length;
    const leave = reportData.filter(r => r.status === 'leave' || r.status === 'half_day_leave').length;
    return { totalHours, present, absent, leave, total: reportData.length };
  }, [reportData]);

  const formatRow = (r: ReportRow) => ({
    'Employee': r.full_name,
    'Date': r.date,
    'Status': r.status.replace(/_/g, ' '),
    'Check In': r.check_in_time ? format(new Date(r.check_in_time), 'HH:mm') : '--',
    'Check Out': r.check_out_time ? format(new Date(r.check_out_time), 'HH:mm') : '--',
    'Total Hours': r.total_hours?.toFixed(2) || '--',
    'Location': r.check_in_address || '--',
  });

  const downloadExcel = async () => {
    if (!reportData.length) return;
    try {
      const rows = reportData.map(formatRow);
      rows.push({
        'Employee': 'TOTAL',
        'Date': '',
        'Status': `${summary.present} Present, ${summary.absent} Absent, ${summary.leave} Leave`,
        'Check In': '',
        'Check Out': '',
        'Total Hours': summary.totalHours.toFixed(2),
        'Location': '',
      });
      const ws = XLSX.utils.json_to_sheet(rows);
      const colWidths = Object.keys(rows[0]).map(k => ({ wch: Math.max(k.length, 14) }));
      ws['!cols'] = colWidths;
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Attendance Report');
      await downloadXLSXNative(wb, `Team_Attendance_${fromDate}_to_${toDate}.xlsx`);
      toast.success('Excel report downloaded');
    } catch (err) {
      console.error('Excel download error:', err);
      toast.error('Failed to download Excel report');
    }
  };

  const downloadPDF = async () => {
    if (!reportData.length) return;
    try {
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      doc.setFontSize(16);
      doc.text('Team Attendance Report', 14, 15);
      doc.setFontSize(10);
      doc.text(`Period: ${fromDate} to ${toDate}`, 14, 22);
      doc.text(`Generated: ${format(new Date(), 'PPpp')}`, 14, 27);

      const headers = ['Employee', 'Date', 'Status', 'Check In', 'Check Out', 'Hours', 'Location'];
      const colX = [14, 60, 95, 130, 155, 180, 200];
      let y = 36;

      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      headers.forEach((h, i) => doc.text(h, colX[i], y));
      y += 2;
      doc.line(14, y, 283, y);
      y += 5;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      reportData.forEach(r => {
        if (y > 190) { doc.addPage(); y = 20; }
        const row = formatRow(r);
        const vals = Object.values(row);
        vals.forEach((v, i) => {
          const text = String(v).substring(0, colX[i + 1] ? Math.floor((colX[i + 1] - colX[i]) / 2) : 40);
          doc.text(text, colX[i], y);
        });
        y += 6;
      });

      y += 4;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.text(`Summary: ${summary.present} Present | ${summary.absent} Absent | ${summary.leave} Leave | Total Hours: ${summary.totalHours.toFixed(2)}`, 14, y);

      await downloadPDFNative(doc, `Team_Attendance_${fromDate}_to_${toDate}.pdf`);
      toast.success('PDF report downloaded');
    } catch (err) {
      console.error('PDF download error:', err);
      toast.error('Failed to download PDF report');
    }
  };

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      present: 'bg-[hsl(150,35%,93%)] text-[hsl(150,45%,30%)]',
      regularized: 'bg-[hsl(270,30%,93%)] text-[hsl(270,40%,35%)]',
      absent: 'bg-[hsl(0,40%,94%)] text-[hsl(0,45%,35%)]',
      leave: 'bg-[hsl(210,40%,93%)] text-[hsl(210,45%,35%)]',
      half_day_leave: 'bg-[hsl(35,50%,93%)] text-[hsl(35,45%,35%)]',
      late: 'bg-[hsl(45,50%,93%)] text-[hsl(45,45%,35%)]',
    };
    return <Badge className={`border-0 ${map[status] || 'bg-muted text-muted-foreground'}`}>{status.replace(/_/g, ' ')}</Badge>;
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Team Attendance Report</CardTitle>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filters */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <Label className="text-xs">From</Label>
            <Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">To</Label>
            <Input type="date" value={toDate} onChange={e => setToDate(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Employee</Label>
            <Select value={selectedUser} onValueChange={setSelectedUser}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Members</SelectItem>
                {teamMembers.map(u => <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Status</Label>
            <Select value={selectedStatus} onValueChange={setSelectedStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="present">Present</SelectItem>
                <SelectItem value="absent">Absent</SelectItem>
                <SelectItem value="leave">Leave</SelectItem>
                <SelectItem value="regularized">Regularized</SelectItem>
                <SelectItem value="late">Late</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-2">
          <Button onClick={generateReport} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Search className="h-4 w-4 mr-1" />}
            {loading ? 'Generating...' : 'Generate Report'}
          </Button>
          {reportData.length > 0 && (
            <>
              <Button variant="outline" onClick={downloadExcel}>
                <FileSpreadsheet className="h-4 w-4 mr-1" />Excel
              </Button>
              <Button variant="outline" onClick={downloadPDF}>
                <FileText className="h-4 w-4 mr-1" />PDF
              </Button>
            </>
          )}
        </div>

        {/* Summary */}
        {reportData.length > 0 && (
          <div className="grid grid-cols-4 gap-2 text-center">
            <div className="bg-muted rounded-lg p-2">
              <div className="text-lg font-bold">{summary.total}</div>
              <div className="text-[11px] text-muted-foreground">Records</div>
            </div>
            <div className="bg-[hsl(150,35%,93%)] rounded-lg p-2">
              <div className="text-lg font-bold text-[hsl(150,45%,30%)]">{summary.present}</div>
              <div className="text-[11px] text-[hsl(150,35%,40%)]">Present</div>
            </div>
            <div className="bg-[hsl(0,40%,94%)] rounded-lg p-2">
              <div className="text-lg font-bold text-[hsl(0,45%,35%)]">{summary.absent}</div>
              <div className="text-[11px] text-[hsl(0,35%,45%)]">Absent</div>
            </div>
            <div className="bg-[hsl(210,40%,93%)] rounded-lg p-2">
              <div className="text-lg font-bold text-[hsl(210,45%,35%)]">{summary.leave}</div>
              <div className="text-[11px] text-[hsl(210,35%,45%)]">Leave</div>
            </div>
          </div>
        )}

        {/* Data Table */}
        {reportData.length > 0 && (
          <div className="overflow-auto max-h-[400px]">
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
                    <TableCell className="font-medium text-sm">{r.full_name}</TableCell>
                    <TableCell className="text-sm">{format(new Date(r.date), 'MMM dd, yyyy')}</TableCell>
                    <TableCell>{statusBadge(r.status)}</TableCell>
                    <TableCell className="text-sm">{r.check_in_time ? format(new Date(r.check_in_time), 'HH:mm') : '--'}</TableCell>
                    <TableCell className="text-sm">{r.check_out_time ? format(new Date(r.check_out_time), 'HH:mm') : '--'}</TableCell>
                    <TableCell className="text-sm">{r.total_hours?.toFixed(2) || '--'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
