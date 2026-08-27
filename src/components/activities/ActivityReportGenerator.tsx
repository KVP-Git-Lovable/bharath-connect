import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Loader2, FileSpreadsheet, FileText, Filter, X, Download } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import { downloadXLSX as downloadXLSXNative, downloadPDF as downloadPDFNative } from '@/utils/nativeDownload';

interface ReportActivity {
  id: string;
  user_name: string;
  activity_name: string;
  activity_type: string;
  customer_name: string | null;
  description: string | null;
  activity_date: string;
  start_time: string | null;
  end_time: string | null;
  total_hours: number;
  status: string;
  location_address: string | null;
  location_lat: number | null;
  location_lng: number | null;
}

interface TeamMember {
  id: string;
  full_name: string;
}

interface Props {
  isAdmin: boolean;
  filtersOpen?: boolean;
  onFiltersOpenChange?: (open: boolean) => void;
}

export default function ActivityReportGenerator({ isAdmin, filtersOpen, onFiltersOpenChange }: Props) {
  const [internalShowFilters, setInternalShowFilters] = useState(false);
  const showFilters = filtersOpen ?? internalShowFilters;
  const setShowFilters = onFiltersOpenChange || setInternalShowFilters;
  const isExternallyControlled = onFiltersOpenChange !== undefined;
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [activityTypes, setActivityTypes] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [reportData, setReportData] = useState<ReportActivity[] | null>(null);

  const [filterUser, setFilterUser] = useState('all');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterType, setFilterType] = useState('all');

  useEffect(() => {
    loadFilterOptions();
  }, []);

  const loadFilterOptions = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    let members: TeamMember[] = [];
    if (isAdmin) {
      const { data } = await supabase.from('users').select('id, full_name').order('full_name');
      members = (data || []).filter(u => u.id !== user.id).map(u => ({ id: u.id, full_name: u.full_name || 'Unknown' }));
    } else {
      const { data: subs } = await supabase.rpc('get_user_hierarchy', { _manager_id: user.id });
      if (subs && subs.length > 0) {
        const subIds = subs.map((s: any) => s.user_id);
        const { data: usersData } = await supabase.from('users').select('id, full_name').in('id', subIds).order('full_name');
        members = (usersData || []).map(u => ({ id: u.id, full_name: u.full_name || 'Unknown' }));
      }
    }
    setTeamMembers(members);

    const { data: types } = await supabase.from('activity_types_master').select('name').eq('is_active', true).order('sort_order');
    setActivityTypes((types || []).map((t: any) => t.name));
  };

  const generateReport = async () => {
    if (!filterDateFrom || !filterDateTo) {
      toast.error('Please select a date range');
      return;
    }
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      let targetIds: string[] = [];
      if (filterUser !== 'all') {
        targetIds = [filterUser];
      } else {
        targetIds = teamMembers.map(m => m.id);
      }

      if (targetIds.length === 0) {
        setReportData([]);
        setLoading(false);
        return;
      }

      let query = supabase
        .from('activity_events')
        .select('*')
        .in('user_id', targetIds)
        .gte('activity_date', filterDateFrom)
        .lte('activity_date', filterDateTo)
        .order('activity_date', { ascending: false });

      if (filterStatus !== 'all') query = query.eq('status', filterStatus);
      if (filterType !== 'all') query = query.eq('activity_type', filterType);

      const { data, error } = await query;
      if (error) throw error;

      const nameMap = new Map(teamMembers.map(m => [m.id, m.full_name]));

      // Fetch lead data for all activities with lead_id
      const leadIds = [...new Set((data || []).filter((a: any) => a.lead_id).map((a: any) => a.lead_id))];
      let leadMap: Record<string, string> = {};
      if (leadIds.length > 0) {
        const { data: leadData } = await supabase.from('leads').select('id, company_name').in('id', leadIds);
        (leadData || []).forEach((l: any) => {
          leadMap[l.id] = l.company_name || '';
        });
      }

      const mapped: ReportActivity[] = (data || []).map((a: any) => ({
        id: a.id,
        user_name: nameMap.get(a.user_id) || 'Unknown',
        activity_name: a.activity_name,
        activity_type: a.activity_type,
        customer_name: a.lead_id ? (leadMap[a.lead_id] || null) : null,
        description: a.description,
        activity_date: a.activity_date,
        start_time: a.start_time,
        end_time: a.end_time,
        total_hours: Number(a.total_hours) || 0,
        status: a.status,
        location_address: a.location_address,
        location_lat: a.location_lat,
        location_lng: a.location_lng,
      }));

      setReportData(mapped);
      toast.success(`Report generated: ${mapped.length} records`);
    } catch (err) {
      console.error('Report generation error:', err);
      toast.error('Failed to generate report');
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (t: string | null) => {
    if (!t) return '-';
    try { return format(new Date(t), 'hh:mm a'); } catch { return '-'; }
  };

  const getReportRows = () => {
    if (!reportData) return [];
    return reportData.map(r => ({
      'User Name': r.user_name,
      'Customer': r.customer_name || '-',
      'Activity': r.activity_name,
      'Type': r.activity_type,
      'Description': r.description || '-',
      'Date': format(new Date(r.activity_date), 'dd MMM yyyy'),
      'Start Time': formatTime(r.start_time),
      'End Time': formatTime(r.end_time),
      'Hours': r.total_hours.toFixed(1),
      'Status': r.status.charAt(0).toUpperCase() + r.status.slice(1).replace('_', ' '),
      'Location': r.location_address || (r.location_lat ? `${r.location_lat}, ${r.location_lng}` : '-'),
    }));
  };

  const totalHours = reportData?.reduce((s, r) => s + r.total_hours, 0) || 0;

  const downloadExcel = async () => {
    if (!reportData || reportData.length === 0) return;
    try {
      const rows = getReportRows();
      rows.push({
        'User Name': '', 'Customer': '', 'Activity': '', 'Type': '', 'Description': 'TOTAL',
        'Date': '', 'Start Time': '', 'End Time': '',
        'Hours': totalHours.toFixed(1), 'Status': '', 'Location': '',
      });

      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Activity Report');
      const colWidths = Object.keys(rows[0]).map(k => ({
        wch: Math.max(k.length, ...rows.map(r => String((r as any)[k]).length)) + 2
      }));
      ws['!cols'] = colWidths;
      await downloadXLSXNative(wb, `Activity_Report_${filterDateFrom}_to_${filterDateTo}.xlsx`);
      toast.success('Excel report downloaded');
    } catch (err) {
      console.error('Excel download error:', err);
      toast.error('Failed to download Excel report');
    }
  };

  const downloadPDF = async () => {
    if (!reportData || reportData.length === 0) return;
    try {
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

      doc.setFontSize(16);
      doc.text('Activity Report', 14, 15);
      doc.setFontSize(10);
      doc.text(`Period: ${format(new Date(filterDateFrom), 'dd MMM yyyy')} – ${format(new Date(filterDateTo), 'dd MMM yyyy')}`, 14, 22);
      doc.text(`Generated: ${format(new Date(), 'dd MMM yyyy HH:mm')}`, 14, 28);

      const headers = ['User', 'Customer', 'Activity', 'Date', 'Start', 'End', 'Hours', 'Status', 'Location'];
      const colX = [14, 40, 65, 100, 135, 160, 185, 205, 240];
      let y = 38;

      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      headers.forEach((h, i) => doc.text(h, colX[i], y));
      y += 2;
      doc.line(14, y, 283, y);
      y += 5;

      doc.setFont('helvetica', 'normal');
      reportData.forEach(r => {
        if (y > 190) {
          doc.addPage();
          y = 15;
          doc.setFont('helvetica', 'bold');
          headers.forEach((h, i) => doc.text(h, colX[i], y));
          y += 2;
          doc.line(14, y, 283, y);
          y += 5;
          doc.setFont('helvetica', 'normal');
        }
        doc.text(r.user_name.substring(0, 15), colX[0], y);
        doc.text((r.customer_name || '-').substring(0, 15), colX[1], y);
        doc.text(r.activity_name.substring(0, 25), colX[2], y);
        doc.text(format(new Date(r.activity_date), 'dd MMM yyyy'), colX[3], y);
        doc.text(formatTime(r.start_time), colX[4], y);
        doc.text(formatTime(r.end_time), colX[5], y);
        doc.text(r.total_hours.toFixed(1), colX[6], y);
        doc.text(r.status.replace('_', ' '), colX[7], y);
        doc.text((r.location_address || '-').substring(0, 25), colX[8], y);
        y += 6;
      });

      y += 3;
      doc.line(14, y, 283, y);
      y += 6;
      doc.setFont('helvetica', 'bold');
      doc.text('TOTAL HOURS', colX[5], y);
      doc.text(totalHours.toFixed(1), colX[6], y);

      await downloadPDFNative(doc, `Activity_Report_${filterDateFrom}_to_${filterDateTo}.pdf`);
      toast.success('PDF report downloaded');
    } catch (err) {
      console.error('PDF download error:', err);
      toast.error('Failed to download PDF report');
    }
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case 'completed': return <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">Completed</Badge>;
      case 'in_progress': return <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">In Progress</Badge>;
      default: return <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">Planned</Badge>;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-1">
          <Download className="h-4 w-4" /> Generate Report
        </h3>
        {!isExternallyControlled && (
          <Button
            variant={showFilters ? 'secondary' : 'outline'}
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
          >
            {showFilters ? <X className="h-4 w-4 mr-1" /> : <Filter className="h-4 w-4 mr-1" />}
            {showFilters ? 'Close' : 'Filters'}
          </Button>
        )}
      </div>

      {showFilters && (
        <Card>
          <CardContent className="p-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Team Member</Label>
                <Select value={filterUser} onValueChange={setFilterUser}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Members</SelectItem>
                    {teamMembers.map(m => (
                      <SelectItem key={m.id} value={m.id}>{m.full_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Status</Label>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="planned">Planned</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">From Date</Label>
                <Input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">To Date</Label>
                <Input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Activity Type</Label>
                <Select value={filterType} onValueChange={setFilterType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    {activityTypes.map(t => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button onClick={generateReport} disabled={loading} className="w-full">
              {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Filter className="h-4 w-4 mr-2" />}
              Generate Report
            </Button>
          </CardContent>
        </Card>
      )}

      {reportData !== null && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">{reportData.length} record{reportData.length !== 1 ? 's' : ''} found</p>
            {reportData.length > 0 && (
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={downloadExcel}>
                  <FileSpreadsheet className="h-4 w-4 mr-1" /> Excel
                </Button>
                <Button variant="outline" size="sm" onClick={downloadPDF}>
                  <FileText className="h-4 w-4 mr-1" /> PDF
                </Button>
              </div>
            )}
          </div>

          {reportData.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground text-sm">
                No activities found for the selected filters.
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Mobile cards */}
              <div className="block sm:hidden space-y-2">
                {reportData.map(r => (
                  <Card key={r.id}>
                    <CardContent className="p-3 space-y-1">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-medium text-sm">{r.user_name}</p>
                          {r.customer_name && <p className="text-xs font-medium text-blue-600 dark:text-blue-400">{r.customer_name}</p>}
                          <p className="text-xs text-muted-foreground">
                            {r.activity_name} • {format(new Date(r.activity_date), 'dd MMM yyyy')}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-sm">{r.total_hours.toFixed(1)}h</p>
                          {statusBadge(r.status)}
                        </div>
                      </div>
                      {r.description && <p className="text-xs text-muted-foreground">{r.description}</p>}
                      {r.location_address && <p className="text-xs text-muted-foreground">📍 {r.location_address}</p>}
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Desktop table */}
              <div className="hidden sm:block">
                <Card>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>User</TableHead>
                          <TableHead>Customer</TableHead>
                          <TableHead>Activity</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead>Start</TableHead>
                          <TableHead>End</TableHead>
                          <TableHead className="text-right">Hours</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Location</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {reportData.map(r => (
                          <TableRow key={r.id}>
                            <TableCell className="font-medium">{r.user_name}</TableCell>
                            <TableCell className="font-medium text-blue-600 dark:text-blue-400">{r.customer_name || '-'}</TableCell>
                            <TableCell>{r.activity_name}</TableCell>
                            <TableCell>{format(new Date(r.activity_date), 'dd MMM yyyy')}</TableCell>
                            <TableCell>{formatTime(r.start_time)}</TableCell>
                            <TableCell>{formatTime(r.end_time)}</TableCell>
                            <TableCell className="text-right">{r.total_hours.toFixed(1)}</TableCell>
                            <TableCell>{statusBadge(r.status)}</TableCell>
                            <TableCell className="max-w-[150px] truncate">{r.location_address || '-'}</TableCell>
                          </TableRow>
                        ))}
                        <TableRow className="font-bold bg-muted/50">
                          <TableCell colSpan={6} className="text-right">Total Hours</TableCell>
                          <TableCell className="text-right">{totalHours.toFixed(1)}</TableCell>
                          <TableCell colSpan={2} />
                        </TableRow>
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </div>

              {/* Mobile total */}
              <div className="block sm:hidden">
                <Card className="border-primary/20 bg-primary/5">
                  <CardContent className="p-3 flex justify-between items-center">
                    <span className="text-sm font-semibold">Total Hours</span>
                    <span className="font-bold">{totalHours.toFixed(1)}h</span>
                  </CardContent>
                </Card>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
