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
import { downloadCSV } from '@/utils/fileDownloader';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import { downloadXLSX as downloadXLSXNative, downloadPDF as downloadPDFNative } from '@/utils/nativeDownload';
import { ExpandableText } from '@/components/ui/expandable-text';

interface ReportExpense {
  id: string;
  user_name: string;
  expense_date: string;
  category: string;
  custom_category: string | null;
  description: string | null;
  amount: number;
  status: string;
  rejection_reason: string | null;
}

interface TeamMember {
  id: string;
  full_name: string;
}

interface Props {
  isAdmin: boolean;
}

export default function ExpenseReportGenerator({ isAdmin }: Props) {
  const [showFilters, setShowFilters] = useState(false);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [reportData, setReportData] = useState<ReportExpense[] | null>(null);

  // Filters
  const [filterUser, setFilterUser] = useState('all');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');

  useEffect(() => {
    loadFilterOptions();
  }, []);

  const loadFilterOptions = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Load team members
    let members: TeamMember[] = [];
    if (isAdmin) {
      const { data } = await supabase.from('users').select('id, full_name').order('full_name');
      members = (data || []).filter(u => u.id !== user.id).map(u => ({ id: u.id, full_name: u.full_name || 'Unknown' }));
    } else {
      const { data } = await supabase.from('users').select('id, full_name').eq('reporting_manager_id', user.id).order('full_name');
      members = (data || []).map(u => ({ id: u.id, full_name: u.full_name || 'Unknown' }));
    }
    setTeamMembers(members);

    // Load categories
    const { data: cats } = await supabase.from('expense_categories').select('id, name').eq('is_active', true).order('name');
    setCategories(cats || []);
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

      // Get target user IDs
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
        .from('additional_expenses')
        .select('*')
        .in('user_id', targetIds)
        .gte('expense_date', filterDateFrom)
        .lte('expense_date', filterDateTo)
        .order('expense_date', { ascending: false });

      if (filterStatus !== 'all') {
        query = query.eq('status', filterStatus);
      }
      if (filterCategory !== 'all') {
        query = query.eq('category', filterCategory);
      }

      const { data, error } = await query;
      if (error) throw error;

      const nameMap = new Map(teamMembers.map(m => [m.id, m.full_name]));

      const mapped: ReportExpense[] = (data || []).map(e => ({
        id: e.id,
        user_name: nameMap.get(e.user_id) || 'Unknown',
        expense_date: e.expense_date,
        category: e.category === 'Other' ? (e.custom_category || 'Other') : e.category,
        custom_category: e.custom_category,
        description: e.description,
        amount: Number(e.amount),
        status: e.status,
        rejection_reason: e.rejection_reason,
      }));

      setReportData(mapped);
      toast.success(`Report generated: ${mapped.length} records`);
    } catch (error) {
      console.error('Report generation error:', error);
      toast.error('Failed to generate report');
    } finally {
      setLoading(false);
    }
  };

  const getReportRows = () => {
    if (!reportData) return [];
    return reportData.map(r => ({
      'User Name': r.user_name,
      'Expense Date': format(new Date(r.expense_date), 'dd MMM yyyy'),
      'Category': r.category,
      'Description': r.description || '-',
      'Amount (₹)': r.amount.toFixed(2),
      'Status': r.status.charAt(0).toUpperCase() + r.status.slice(1),
    }));
  };

  const downloadExcel = async () => {
    if (!reportData || reportData.length === 0) return;
    try {
      const rows = getReportRows();
      const totalAmount = reportData.reduce((s, r) => s + r.amount, 0);
      rows.push({
        'User Name': '',
        'Expense Date': '',
        'Category': '',
        'Description': 'TOTAL',
        'Amount (₹)': totalAmount.toFixed(2),
        'Status': '',
      });

      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Expense Report');

      const colWidths = Object.keys(rows[0]).map(k => ({
        wch: Math.max(k.length, ...rows.map(r => String((r as any)[k]).length)) + 2
      }));
      ws['!cols'] = colWidths;

      await downloadXLSXNative(wb, `Expense_Report_${filterDateFrom}_to_${filterDateTo}.xlsx`);
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
      const totalAmount = reportData.reduce((s, r) => s + r.amount, 0);

      doc.setFontSize(16);
      doc.text('Expense Report', 14, 15);
      doc.setFontSize(10);
      doc.text(`Period: ${format(new Date(filterDateFrom), 'dd MMM yyyy')} – ${format(new Date(filterDateTo), 'dd MMM yyyy')}`, 14, 22);
      doc.text(`Generated: ${format(new Date(), 'dd MMM yyyy HH:mm')}`, 14, 28);

      const headers = ['User Name', 'Date', 'Category', 'Description', 'Amount (₹)', 'Status'];
      const colX = [14, 60, 100, 140, 210, 245];
      let y = 38;

      doc.setFontSize(9);
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
        doc.text(r.user_name.substring(0, 25), colX[0], y);
        doc.text(format(new Date(r.expense_date), 'dd MMM yyyy'), colX[1], y);
        doc.text(r.category.substring(0, 20), colX[2], y);
        doc.text((r.description || '-').substring(0, 35), colX[3], y);
        doc.text(`₹${r.amount.toFixed(2)}`, colX[4], y);
        doc.text(r.status.charAt(0).toUpperCase() + r.status.slice(1), colX[5], y);
        y += 6;
      });

      y += 3;
      doc.line(14, y, 283, y);
      y += 6;
      doc.setFont('helvetica', 'bold');
      doc.text('TOTAL', colX[3], y);
      doc.text(`₹${totalAmount.toFixed(2)}`, colX[4], y);

      await downloadPDFNative(doc, `Expense_Report_${filterDateFrom}_to_${filterDateTo}.pdf`);
      toast.success('PDF report downloaded');
    } catch (err) {
      console.error('PDF download error:', err);
      toast.error('Failed to download PDF report');
    }
  };

  const totalAmount = reportData?.reduce((s, r) => s + r.amount, 0) || 0;

  const statusBadge = (status: string) => {
    switch (status) {
      case 'approved': return <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">Approved</Badge>;
      case 'rejected': return <Badge variant="destructive">Rejected</Badge>;
      default: return <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">Pending</Badge>;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-1">
          <Download className="h-4 w-4" /> Generate Report
        </h3>
        <Button
          variant={showFilters ? 'secondary' : 'outline'}
          size="sm"
          onClick={() => setShowFilters(!showFilters)}
        >
          {showFilters ? <X className="h-4 w-4 mr-1" /> : <Filter className="h-4 w-4 mr-1" />}
          {showFilters ? 'Close' : 'Filters'}
        </Button>
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
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="submitted">Submitted</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
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
                <Label className="text-xs">Category</Label>
                <Select value={filterCategory} onValueChange={setFilterCategory}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {categories.map(c => (
                      <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
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
          {/* Download buttons */}
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
                No expenses found for the selected filters.
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
                          <p className="text-xs text-muted-foreground">
                            {r.category} • {format(new Date(r.expense_date), 'dd MMM yyyy')}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-sm">₹{r.amount.toFixed(0)}</p>
                          {statusBadge(r.status)}
                        </div>
                      </div>
                      {r.description && <p className="text-xs text-muted-foreground">{r.description}</p>}
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
                          <TableHead>Date</TableHead>
                          <TableHead>Category</TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {reportData.map(r => (
                          <TableRow key={r.id}>
                            <TableCell className="font-medium">{r.user_name}</TableCell>
                            <TableCell>{format(new Date(r.expense_date), 'dd MMM yyyy')}</TableCell>
                            <TableCell>{r.category}</TableCell>
                            <TableCell><ExpandableText text={r.description} title="Expense Description" className="max-w-[200px]" /></TableCell>
                            <TableCell className="text-right">₹{r.amount.toFixed(2)}</TableCell>
                            <TableCell>{statusBadge(r.status)}</TableCell>
                          </TableRow>
                        ))}
                        <TableRow className="font-bold bg-muted/50">
                          <TableCell colSpan={4} className="text-right">Total</TableCell>
                          <TableCell className="text-right">₹{totalAmount.toFixed(2)}</TableCell>
                          <TableCell />
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
                    <span className="text-sm font-semibold">Total</span>
                    <span className="font-bold">₹{totalAmount.toFixed(2)}</span>
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
