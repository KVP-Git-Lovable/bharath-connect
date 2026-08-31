import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subWeeks, subMonths, subDays,
} from "date-fns";
import { Plus, Camera, Download, Loader2, Pencil, Trash2, Eye, CheckCircle2, XCircle, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import CameraCapture from "@/components/CameraCapture";
import TeamExpenseSummary from "@/components/expenses/TeamExpenseSummary";
import ExpenseDateRangeFilter, { type ExpenseDatePreset } from "@/components/expenses/ExpenseDateRangeFilter";
import Pager from "@/components/expenses/Pager";
import ExpenseSummaryCards from "@/components/expenses/ExpenseSummaryCards";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useDaApplicable } from "@/hooks/useDaApplicable";
import { useExpenseSummaryRange, type DailyBreakdownRow } from "@/hooks/useMonthlyExpenseSummary";

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const PAGE_SIZE = 10;

function resolveRange(preset: ExpenseDatePreset, customStart: string, customEnd: string): { start: Date; end: Date } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  switch (preset) {
    case "today":
      return { start: today, end: today };
    case "yesterday": {
      const y = subDays(today, 1);
      return { start: y, end: y };
    }
    case "this_week":
      return { start: startOfWeek(today, { weekStartsOn: 1 }), end: endOfWeek(today, { weekStartsOn: 1 }) };
    case "last_week": {
      const lw = subWeeks(today, 1);
      return { start: startOfWeek(lw, { weekStartsOn: 1 }), end: endOfWeek(lw, { weekStartsOn: 1 }) };
    }
    case "last_month": {
      const lm = subMonths(today, 1);
      return { start: startOfMonth(lm), end: endOfMonth(lm) };
    }
    case "custom":
      if (customStart && customEnd) return { start: new Date(customStart), end: new Date(customEnd) };
      return { start: startOfMonth(today), end: endOfMonth(today) };
    case "this_month":
    default:
      return { start: startOfMonth(today), end: endOfMonth(today) };
  }
}

function TATable({ days, totalTa, totalKm }: { days: DailyBreakdownRow[]; totalTa: number; totalKm: number }) {
  const active = useMemo(() => days.filter((d) => d.km > 0 || d.ta > 0), [days]);
  const [page, setPage] = useState(0);
  useEffect(() => setPage(0), [active.length]);
  const pageCount = Math.max(1, Math.ceil(active.length / PAGE_SIZE));
  const pageRows = active.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  if (!active.length) return <p className="text-xs text-muted-foreground text-center py-6">No TA records in this period.</p>;
  return (
    <div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-xs">Date</TableHead>
            <TableHead className="text-right text-xs">KM</TableHead>
            <TableHead className="text-right text-xs">TA Amt</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pageRows.map((d) => (
            <TableRow key={d.date}>
              <TableCell className="text-xs">{format(new Date(d.date), "dd MMM yyyy")}</TableCell>
              <TableCell className="text-right text-xs">{d.km.toFixed(1)}</TableCell>
              <TableCell className="text-right text-xs font-medium">{inr(d.ta)}</TableCell>
            </TableRow>
          ))}
          <TableRow className="border-t-2 bg-muted/30">
            <TableCell className="font-bold text-xs">Total ({active.length} days)</TableCell>
            <TableCell className="text-right font-bold text-xs">{totalKm.toFixed(1)}</TableCell>
            <TableCell className="text-right font-bold text-xs">{inr(totalTa)}</TableCell>
          </TableRow>
        </TableBody>
      </Table>
      <Pager page={page} pageCount={pageCount} onPageChange={setPage} />
    </div>
  );
}

function DATable({ days, totalDa }: { days: DailyBreakdownRow[]; totalDa: number }) {
  const active = useMemo(() => days.filter((d) => d.present > 0 || d.da > 0), [days]);
  const [page, setPage] = useState(0);
  useEffect(() => setPage(0), [active.length]);
  const pageCount = Math.max(1, Math.ceil(active.length / PAGE_SIZE));
  const pageRows = active.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  if (!active.length) return <p className="text-xs text-muted-foreground text-center py-6">No DA records in this period.</p>;
  return (
    <div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-xs">Date</TableHead>
            <TableHead className="text-right text-xs">Present</TableHead>
            <TableHead className="text-right text-xs">DA Amt</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pageRows.map((d) => (
            <TableRow key={d.date}>
              <TableCell className="text-xs">{format(new Date(d.date), "dd MMM yyyy")}</TableCell>
              <TableCell className="text-right text-xs">{d.present === 1 ? "Full" : d.present === 0.5 ? "Half" : "—"}</TableCell>
              <TableCell className="text-right text-xs font-medium">{inr(d.da)}</TableCell>
            </TableRow>
          ))}
          <TableRow className="border-t-2 bg-muted/30">
            <TableCell className="font-bold text-xs">Total ({active.length} days)</TableCell>
            <TableCell></TableCell>
            <TableCell className="text-right font-bold text-xs">{inr(totalDa)}</TableCell>
          </TableRow>
        </TableBody>
      </Table>
      <Pager page={page} pageCount={pageCount} onPageChange={setPage} />
    </div>
  );
}

interface Expense {
  id: string;
  category: string;
  custom_category: string | null;
  amount: number;
  description: string | null;
  expense_date: string;
  status: string;
  bill_url: string | null;
  rejection_reason: string | null;
}
interface Category { id: string; name: string; auto_approval_limit: number | null; }

export default function Expenses() {
  const { userId } = useCurrentUser();
  const [preset, setPreset] = useState<ExpenseDatePreset>("this_month");
  const [customStart, setCustomStart] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [customEnd, setCustomEnd] = useState(format(new Date(), "yyyy-MM-dd"));
  const { start, end } = useMemo(() => resolveRange(preset, customStart, customEnd), [preset, customStart, customEnd]);
  const startStr = format(start, "yyyy-MM-dd");
  const endStr = format(end, "yyyy-MM-dd");
  const rangeLabel = preset === "today" ? "Today" : preset === "yesterday" ? "Yesterday" : `${format(start, "dd MMM yyyy")} - ${format(end, "dd MMM yyyy")}`;

  const { data: summary, isLoading: summaryLoading, refetch: refetchSummary } = useExpenseSummaryRange(userId, start, end);
  const { daApplicable } = useDaApplicable();
  const [policy, setPolicy] = useState<{ ta_type: "from_gps" | "fixed"; ta_per_km_rate: number; fixed_ta_amount: number; fixed_da_amount: number; da_calculation_basis: "per_day" | "per_half_day" } | null>(null);

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [addlPage, setAddlPage] = useState(0);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasTeam, setHasTeam] = useState(false);

  const additionalApproved = useMemo(() => expenses.filter((e) => e.status === "approved").reduce((s, e) => s + Number(e.amount), 0), [expenses]);
  const additionalPending = useMemo(() => expenses.filter((e) => e.status === "submitted" || e.status === "pending").reduce((s, e) => s + Number(e.amount), 0), [expenses]);
  const totalExpenses = (summary?.ta || 0) + (daApplicable ? (summary?.da || 0) : 0) + additionalApproved;

  // Add/Edit dialog
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [formDate, setFormDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [formCategory, setFormCategory] = useState("");
  const [formAmount, setFormAmount] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formFile, setFormFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showCamera, setShowCamera] = useState(false);

  const [detailsTab, setDetailsTab] = useState<"ta" | "da" | "additional">("ta");

  const [rejectionView, setRejectionView] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    (async () => {
      const [{ data: role }, hier] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle(),
        supabase.rpc("get_user_hierarchy", { _manager_id: userId }),
      ]);
      setHasTeam(!!role || (Array.isArray(hier.data) && hier.data.length > 0));
    })();
    supabase.from("expense_categories").select("id, name, auto_approval_limit").eq("is_active", true).order("name")
      .then(({ data }) => setCategories((data || []) as Category[]));
    supabase.from("expense_master_config").select("ta_type, ta_per_km_rate, fixed_ta_amount, fixed_da_amount, da_calculation_basis")
      .order("updated_at", { ascending: false }).limit(1).maybeSingle()
      .then(({ data }) => data && setPolicy(data as any));
  }, [userId]);

  useEffect(() => { if (userId) fetchExpenses(); }, [userId, startStr, endStr]);
  useEffect(() => setAddlPage(0), [startStr, endStr]);

  const fetchExpenses = async () => {
    if (!userId) return;
    setLoading(true);
    const { data } = await supabase.from("additional_expenses").select("*")
      .eq("user_id", userId)
      .gte("expense_date", startStr)
      .lte("expense_date", endStr)
      .order("expense_date", { ascending: false });
    setExpenses((data || []) as Expense[]);
    setLoading(false);
  };

  const resetForm = () => {
    setEditing(null);
    setFormDate(format(new Date(), "yyyy-MM-dd"));
    setFormCategory(""); setFormAmount(""); setFormDescription(""); setFormFile(null);
  };

  const openAdd = () => { resetForm(); setAddOpen(true); };
  const openEdit = (e: Expense) => {
    setEditing(e); setFormDate(e.expense_date); setFormCategory(e.category);
    setFormAmount(String(e.amount)); setFormDescription(e.description || ""); setFormFile(null);
    setAddOpen(true);
  };

  const submit = async () => {
    if (!userId || !formCategory || !formAmount) { toast.error("Fill required fields"); return; }
    setSubmitting(true);
    let billUrl = editing?.bill_url || null;
    if (formFile) {
      const path = `${userId}/${Date.now()}_${formFile.name}`;
      const { error } = await supabase.storage.from("expense-bills").upload(path, formFile);
      if (error) { toast.error("Upload failed"); setSubmitting(false); return; }
      billUrl = path;
    }
    const cat = categories.find((c) => c.name === formCategory);
    const amount = parseFloat(formAmount);
    const autoApprove = !!(cat?.auto_approval_limit && amount < cat.auto_approval_limit);
    const payload = {
      category: formCategory, category_id: cat?.id || null, amount,
      description: formDescription || null, expense_date: formDate,
      bill_url: billUrl, status: autoApprove ? "approved" : "submitted",
      month_key: formDate.substring(0, 7),
    };
    const { error } = editing
      ? await supabase.from("additional_expenses").update(payload).eq("id", editing.id)
      : await supabase.from("additional_expenses").insert({ ...payload, user_id: userId });
    if (error) { toast.error("Failed to save"); setSubmitting(false); return; }
    toast.success(autoApprove ? "Expense auto-approved" : editing ? "Expense updated" : "Expense submitted");
    setAddOpen(false); resetForm(); fetchExpenses(); refetchSummary();
    setSubmitting(false);
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this expense?")) return;
    const { error } = await supabase.from("additional_expenses").delete().eq("id", id);
    if (error) { toast.error("Failed"); return; }
    toast.success("Deleted"); fetchExpenses(); refetchSummary();
  };

  const downloadXLS = async () => {
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();

    const taRows = (summary?.daily || []).filter((d) => d.km > 0 || d.ta > 0);
    const taSheet = XLSX.utils.json_to_sheet([
      ...taRows.map((d) => ({ Date: format(new Date(d.date), "dd-MMM-yyyy"), "KM": d.km, "TA Amount (₹)": d.ta })),
      { Date: "TOTAL", "KM": summary?.total_km || 0, "TA Amount (₹)": summary?.ta || 0 },
    ]);
    XLSX.utils.book_append_sheet(wb, taSheet, "TA");

    if (daApplicable) {
      const daRows = (summary?.daily || []).filter((d) => d.present > 0 || d.da > 0);
      const daSheet = XLSX.utils.json_to_sheet([
        ...daRows.map((d) => ({ Date: format(new Date(d.date), "dd-MMM-yyyy"), Present: d.present === 1 ? "Full" : d.present === 0.5 ? "Half" : "-", "DA Amount (₹)": d.da })),
        { Date: "TOTAL", Present: "", "DA Amount (₹)": summary?.da || 0 },
      ]);
      XLSX.utils.book_append_sheet(wb, daSheet, "DA");
    }

    const addlSheet = XLSX.utils.json_to_sheet([
      ...expenses.map((e) => ({
        Date: format(new Date(e.expense_date), "dd-MMM-yyyy"),
        Category: e.category === "Other" ? e.custom_category : e.category,
        "Amount (₹)": e.amount,
        Status: e.status,
      })),
      { Date: "TOTAL", Category: "", "Amount (₹)": expenses.reduce((s, e) => s + Number(e.amount), 0), Status: "" },
    ]);
    XLSX.utils.book_append_sheet(wb, addlSheet, "Additional Expenses");

    XLSX.writeFile(wb, `Expenses_${startStr}_to_${endStr}.xlsx`);
    toast.success("Expense report downloaded");
  };

  const statusBadge = (s: string) => {
    if (s === "approved") return <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"><CheckCircle2 className="h-3 w-3 mr-1" />Approved</Badge>;
    if (s === "rejected") return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Rejected</Badge>;
    if (s === "draft") return <Badge variant="secondary">Draft</Badge>;
    return <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400"><Clock className="h-3 w-3 mr-1" />Submitted</Badge>;
  };

  const myContent = (
    <div className="space-y-4">
      <ExpenseDateRangeFilter
        preset={preset}
        onPresetChange={setPreset}
        customStart={customStart}
        customEnd={customEnd}
        onCustomStartChange={setCustomStart}
        onCustomEndChange={setCustomEnd}
        rangeLabel={rangeLabel}
      />

      <ExpenseSummaryCards
        ta={summary?.ta || 0}
        da={summary?.da || 0}
        additional={additionalApproved + additionalPending}
        total={totalExpenses}
        presentDays={summary?.present_days || 0}
        totalKm={summary?.total_km || 0}
        loading={summaryLoading}
        taType={policy?.ta_type}
        taPerKmRate={Number(policy?.ta_per_km_rate || 0)}
        fixedTaAmount={Number(policy?.fixed_ta_amount || 0)}
        daBasis={policy?.da_calculation_basis}
        daAmount={Number(policy?.fixed_da_amount || 0)}
        daApplicable={daApplicable}
      />

      {policy && (
        <Card className="shadow-card border-l-4 border-l-blue-500">
          <CardContent className="p-3 text-xs text-muted-foreground space-y-1">
            <p><span className="font-semibold text-foreground">TA policy:</span>{" "}
              {policy.ta_type === "from_gps"
                ? <>From GPS tracking · <span className="font-medium text-foreground">₹{Number(policy.ta_per_km_rate || 0)}/km</span> × total km driven in this period ({(summary?.total_km || 0).toFixed(1)} km = ₹{Math.round(summary?.ta || 0).toLocaleString("en-IN")})</>
                : <>Fixed · <span className="font-medium text-foreground">₹{Number(policy.fixed_ta_amount || 0)}/day</span> per present day</>}
            </p>
            {daApplicable && (
              <p><span className="font-semibold text-foreground">DA policy:</span>{" "}
                <span className="font-medium text-foreground">₹{Number(policy.fixed_da_amount || 0)}</span>{" "}
                {policy.da_calculation_basis === "per_half_day" ? "per half-day (half-day = 0.5)" : "per present day"}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <Card className="shadow-card">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-base">Expense Details</CardTitle>
            <div className="flex items-center gap-1.5">
              <Button variant="outline" size="sm" className="h-8 px-2 text-xs" onClick={downloadXLS}>
                <Download className="h-3.5 w-3.5 sm:mr-1" /><span className="hidden sm:inline">XLS</span>
              </Button>
              <Button size="sm" className="h-8 px-2 text-xs" onClick={openAdd}>
                <Plus className="h-3.5 w-3.5 sm:mr-1" /><span className="hidden sm:inline">Add </span>Expense
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{rangeLabel}</p>
        </CardHeader>
        <CardContent>
          <Tabs value={!daApplicable && detailsTab === "da" ? "ta" : detailsTab} onValueChange={(v) => setDetailsTab(v as typeof detailsTab)}>
            <TabsList className={daApplicable ? "grid w-full grid-cols-3" : "grid w-full grid-cols-2"}>
              <TabsTrigger value="ta" className="text-xs">TA</TabsTrigger>
              {daApplicable && <TabsTrigger value="da" className="text-xs">DA</TabsTrigger>}
              <TabsTrigger value="additional" className="text-xs">Additional Expenses</TabsTrigger>
            </TabsList>

            {summaryLoading ? (
              <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : (
              <>
                <TabsContent value="ta" className="mt-3">
                  {summary && <TATable days={summary.daily} totalTa={summary.ta} totalKm={summary.total_km} />}
                </TabsContent>

                {daApplicable && (
                  <TabsContent value="da" className="mt-3">
                    {summary && <DATable days={summary.daily} totalDa={summary.da} />}
                  </TabsContent>
                )}

                <TabsContent value="additional" className="mt-3">
                  {loading ? (
                    <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                  ) : expenses.length === 0 ? (
                    <p className="text-xs text-center text-muted-foreground py-6">No additional expenses in this period.</p>
                  ) : (
                    <div className="space-y-2">
                      {expenses.slice(addlPage * PAGE_SIZE, addlPage * PAGE_SIZE + PAGE_SIZE).map((e) => (
                        <div key={e.id} className="border rounded-lg p-3">
                          <div className="flex items-start justify-between">
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">{e.category === "Other" ? e.custom_category : e.category}</p>
                              <p className="text-[11px] text-muted-foreground">{format(new Date(e.expense_date), "dd MMM yyyy")}</p>
                              {e.description && <p className="text-xs text-muted-foreground mt-1">{e.description}</p>}
                            </div>
                            <div className="flex flex-col items-end gap-1">
                              <span className="font-bold">₹{Number(e.amount).toFixed(0)}</span>
                              {statusBadge(e.status)}
                            </div>
                          </div>
                          <div className="flex gap-2 mt-2 flex-wrap">
                            {(e.status === "draft" || e.status === "rejected" || e.status === "submitted" || e.status === "pending") && (
                              <Button variant="outline" size="sm" onClick={() => openEdit(e)}><Pencil className="h-3 w-3 mr-1" />Edit</Button>
                            )}
                            {(e.status === "draft" || e.status === "submitted" || e.status === "pending") && (
                              <Button variant="outline" size="sm" className="text-destructive" onClick={() => remove(e.id)}><Trash2 className="h-3 w-3 mr-1" />Delete</Button>
                            )}
                            {e.status === "rejected" && e.rejection_reason && (
                              <Button variant="ghost" size="sm" onClick={() => setRejectionView(e.rejection_reason)}><Eye className="h-3 w-3 mr-1" />Reason</Button>
                            )}
                            {e.bill_url && (
                              <Button variant="ghost" size="sm" onClick={() => window.open(e.bill_url!, "_blank")}><Eye className="h-3 w-3 mr-1" />Receipt</Button>
                            )}
                          </div>
                        </div>
                      ))}
                      <Pager
                        page={addlPage}
                        pageCount={Math.max(1, Math.ceil(expenses.length / PAGE_SIZE))}
                        onPageChange={setAddlPage}
                      />
                    </div>
                  )}
                </TabsContent>
              </>
            )}
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );

  return (
    <motion.div className="p-4 space-y-4" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
      <h1 className="text-xl font-bold">Expenses</h1>

      {hasTeam ? (
        <Tabs defaultValue="my" className="w-full">
          <TabsList className="w-full">
            <TabsTrigger value="my" className="flex-1">My Expenses</TabsTrigger>
            <TabsTrigger value="team" className="flex-1">Team Summary</TabsTrigger>
          </TabsList>
          <TabsContent value="my">{myContent}</TabsContent>
          <TabsContent value="team"><TeamExpenseSummary /></TabsContent>
        </Tabs>
      ) : myContent}

      {/* Add/Edit Dialog */}
      <Dialog open={addOpen} onOpenChange={(o) => { if (!o) { setAddOpen(false); resetForm(); } }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Edit Expense" : "Add Expense"}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1"><Label>Date</Label><Input type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} /></div>
            <div className="space-y-1"><Label>Category</Label>
              <Select value={formCategory} onValueChange={setFormCategory}>
                <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>{categories.map((c) => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label>Amount (₹)</Label>
              <Input type="number" min="0" step="0.01" value={formAmount} onChange={(e) => setFormAmount(e.target.value)} /></div>
            <div className="space-y-1"><Label>Description</Label>
              <Textarea rows={2} value={formDescription} onChange={(e) => setFormDescription(e.target.value)} /></div>
            <div className="space-y-1"><Label>Receipt</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="file"
                  accept="image/*,.pdf"
                  onChange={(e) => setFormFile(e.target.files?.[0] || null)}
                  className="flex-1 h-10 file:mr-3 file:h-full file:border-0 file:border-r file:border-input file:bg-muted file:px-3 file:text-sm file:font-medium file:text-foreground hover:file:bg-muted/80 cursor-pointer py-0"
                />
                <Button type="button" variant="outline" size="icon" className="h-10 w-10 shrink-0" onClick={() => setShowCamera(true)}><Camera className="h-4 w-4" /></Button>
              </div>
              {formFile && <p className="text-[11px] text-muted-foreground">Selected: {formFile.name}</p>}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAddOpen(false); resetForm(); }}>Cancel</Button>
            <Button onClick={submit} disabled={submitting || !formCategory || !formAmount}>
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editing ? "Update" : "Submit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rejection Reason */}
      <Dialog open={!!rejectionView} onOpenChange={() => setRejectionView(null)}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader><DialogTitle className="text-destructive">Rejection Reason</DialogTitle></DialogHeader>
          <p className="text-sm">{rejectionView}</p>
        </DialogContent>
      </Dialog>

      <CameraCapture
        open={showCamera}
        onClose={() => setShowCamera(false)}
        onCapture={(blob) => setFormFile(new File([blob], `receipt_${Date.now()}.jpg`, { type: "image/jpeg" }))}
        title="Capture Receipt"
      />
    </motion.div>
  );
}
