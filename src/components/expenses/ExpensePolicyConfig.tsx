import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Save, Loader2, Car, Utensils, Receipt, Tags, GitBranch, Scale, Plus, Trash2, Pencil, ChevronDown, ChevronUp, Navigation, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import OverrideTable, { type OverrideEntry } from "./OverrideTable";
import ExpenseGroupsInline, { type ExpenseGroup } from "./ExpenseGroupsInline";
import TaRateHistory from "./TaRateHistory";


interface ExpenseConfig {
  id: string;
  ta_type: "fixed" | "from_gps";
  fixed_ta_amount: number;
  ta_per_km_rate: number;
  fixed_da_amount: number;
  da_calculation_basis: "per_day" | "per_half_day";
  da_applicable: boolean;
}
interface PolicyRow {
  id: string;
  max_additional_expense_per_day: number;
  max_additional_expense_per_month: number;
  require_bill_above_amount: number;
}
interface Category { id: string; name: string; receipt_required_above: number | null; auto_approval_limit: number | null; is_active: boolean; }
interface Workflow { id: string; name: string; approval_type: string; steps: number; is_default: boolean; is_active: boolean; }
interface Rule { id: string; rule_name: string; condition_type: string; min_amount: number | null; max_amount: number | null; workflow_id: string; priority: number; is_active: boolean; }

export default function ExpensePolicyConfig() {
  const [config, setConfig] = useState<ExpenseConfig | null>(null);
  const [policy, setPolicy] = useState<PolicyRow | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const [taDist, setTaDist] = useState<"same_for_all" | "custom">("same_for_all");
  const [daDist, setDaDist] = useState<"same_for_all" | "custom">("same_for_all");
  const [taOverrides, setTaOverrides] = useState<OverrideEntry[]>([]);
  const [daOverrides, setDaOverrides] = useState<OverrideEntry[]>([]);
  const [groups, setGroups] = useState<ExpenseGroup[]>([]);

  // Category dialog
  const [catDlgOpen, setCatDlgOpen] = useState(false);
  const [editingCat, setEditingCat] = useState<Category | null>(null);
  const [catForm, setCatForm] = useState({ name: "", receipt_required_above: "", auto_approval_limit: "" });

  // Workflow dialog
  const [wfDlgOpen, setWfDlgOpen] = useState(false);
  const [editingWf, setEditingWf] = useState<Workflow | null>(null);
  const [wfForm, setWfForm] = useState({ name: "", approval_type: "sequential", steps: 1, is_default: false });
  const [expandedWf, setExpandedWf] = useState<string | null>(null);

  // Rule form
  const [showRuleForm, setShowRuleForm] = useState(false);
  const [ruleForm, setRuleForm] = useState({ rule_name: "", condition_type: "amount_range", min_amount: "", max_amount: "", workflow_id: "", priority: "100" });

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [cfg, pol, cats, wfs, rls, ovr, grp, mem] = await Promise.all([
      supabase.from("expense_master_config" as any).select("*").order("updated_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("expense_policy").select("*").limit(1).maybeSingle(),
      supabase.from("expense_categories").select("*").order("name"),
      supabase.from("expense_approval_workflows").select("*").order("name"),
      supabase.from("expense_approval_rules").select("*").order("priority"),
      supabase.from("expense_overrides" as any).select("*"),
      supabase.from("expense_groups" as any).select("*").order("name"),
      supabase.from("expense_group_members" as any).select("group_id"),
    ]);

    // config
    let cfgRow: any = cfg.data;
    if (!cfgRow) {
      const { data: created } = await supabase.from("expense_master_config" as any).insert({
        ta_type: "from_gps", fixed_ta_amount: 0, fixed_da_amount: 0, ta_per_km_rate: 0, da_calculation_basis: "per_day",
      } as any).select().single();
      cfgRow = created;
    }
    if (cfgRow) setConfig({
      id: cfgRow.id, ta_type: cfgRow.ta_type || "from_gps",
      fixed_ta_amount: Number(cfgRow.fixed_ta_amount || 0),
      ta_per_km_rate: Number(cfgRow.ta_per_km_rate || 0),
      fixed_da_amount: Number(cfgRow.fixed_da_amount || 0),
      da_calculation_basis: cfgRow.da_calculation_basis || "per_day",
      da_applicable: cfgRow.da_applicable !== false,
    });

    // policy
    let polRow: any = pol.data;
    if (!polRow) {
      const { data: created } = await supabase.from("expense_policy").insert({} as any).select().single();
      polRow = created;
    }
    if (polRow) setPolicy({
      id: polRow.id,
      max_additional_expense_per_day: Number(polRow.max_additional_expense_per_day || 0),
      max_additional_expense_per_month: Number(polRow.max_additional_expense_per_month || 0),
      require_bill_above_amount: Number(polRow.require_bill_above_amount ?? 500),
    });

    setCategories((cats.data || []) as Category[]);
    setWorkflows((wfs.data || []) as Workflow[]);
    setRules((rls.data || []) as Rule[]);

    // Overrides — attach names
    const overrideRows = (ovr.data || []) as any[];
    if (overrideRows.length) {
      const ids = Array.from(new Set(overrideRows.map((r) => r.ref_id)));
      const { data: users } = await supabase.from("users").select("id, full_name").in("id", ids);
      const nameMap = new Map((users || []).map((u: any) => [u.id, u.full_name || "Unnamed"]));
      const entries: OverrideEntry[] = overrideRows.map((r) => ({
        id: r.id, ref_id: r.ref_id, type: r.ref_type, amount: Number(r.amount || 0),
        name: nameMap.get(r.ref_id) || "Unknown",
      }));
      setTaOverrides(entries.filter((e) => (overrideRows.find((r) => r.id === e.id)!.field) === "ta"));
      setDaOverrides(entries.filter((e) => (overrideRows.find((r) => r.id === e.id)!.field) === "da"));
      setTaDist(entries.some((e) => (overrideRows.find((r) => r.id === e.id)!.field) === "ta") ? "custom" : "same_for_all");
      setDaDist(entries.some((e) => (overrideRows.find((r) => r.id === e.id)!.field) === "da") ? "custom" : "same_for_all");
    } else {
      setTaOverrides([]); setDaOverrides([]);
    }

    // groups + member counts
    const memberCounts = new Map<string, number>();
    ((mem.data || []) as any[]).forEach((r) => memberCounts.set(r.group_id, (memberCounts.get(r.group_id) || 0) + 1));
    setGroups(((grp.data || []) as any[]).map((g) => ({
      id: g.id, name: g.name, description: g.description, ta_type: g.ta_type,
      fixed_ta_amount: Number(g.fixed_ta_amount || 0), ta_per_km_rate: Number(g.ta_per_km_rate || 0),
      da_amount: Number(g.da_amount || 0), member_count: memberCounts.get(g.id) || 0,
    })));

    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const saveConfigAndPolicy = async () => {
    if (!config || !policy) return;
    setSaving(true);
    const [cfgRes, polRes] = await Promise.all([
      supabase.from("expense_master_config" as any).update({
        ta_type: config.ta_type,
        fixed_ta_amount: config.fixed_ta_amount,
        ta_per_km_rate: config.ta_per_km_rate,
        fixed_da_amount: config.fixed_da_amount,
        da_calculation_basis: config.da_calculation_basis,
        da_applicable: config.da_applicable,
      }).eq("id", config.id),
      supabase.from("expense_policy").update({
        max_additional_expense_per_day: policy.max_additional_expense_per_day,
        max_additional_expense_per_month: policy.max_additional_expense_per_month,
        require_bill_above_amount: policy.require_bill_above_amount,
      } as any).eq("id", policy.id),
    ]);
    setSaving(false);
    if (cfgRes.error || polRes.error) toast.error("Failed to save"); else toast.success("Saved");
  };

  // Overrides handlers
  const addOverride = async (field: "ta" | "da", type: "user" | "team", refId: string, name: string) => {
    const amt = field === "ta"
      ? (config?.ta_type === "from_gps" ? config?.ta_per_km_rate || 0 : config?.fixed_ta_amount || 0)
      : (config?.fixed_da_amount || 0);
    const { data, error } = await supabase.from("expense_overrides" as any)
      .insert({ field, ref_type: type, ref_id: refId, amount: amt })
      .select().single();
    if (error) { toast.error("Failed to add"); return; }
    const entry: OverrideEntry = { id: (data as any).id, ref_id: refId, type, amount: amt, name };
    if (field === "ta") setTaOverrides((p) => [...p, entry]);
    else setDaOverrides((p) => [...p, entry]);
  };
  const updateOverride = async (field: "ta" | "da", id: string, amount: number) => {
    await supabase.from("expense_overrides" as any).update({ amount }).eq("id", id);
    const setter = field === "ta" ? setTaOverrides : setDaOverrides;
    setter((p) => p.map((o) => (o.id === id ? { ...o, amount } : o)));
  };
  const deleteOverride = async (field: "ta" | "da", entry: OverrideEntry) => {
    await supabase.from("expense_overrides" as any).delete().eq("id", entry.id);
    const setter = field === "ta" ? setTaOverrides : setDaOverrides;
    setter((p) => p.filter((o) => o.id !== entry.id));
  };

  // Category CRUD
  const openAddCat = () => { setEditingCat(null); setCatForm({ name: "", receipt_required_above: "", auto_approval_limit: "" }); setCatDlgOpen(true); };
  const openEditCat = (c: Category) => { setEditingCat(c); setCatForm({ name: c.name, receipt_required_above: c.receipt_required_above?.toString() || "", auto_approval_limit: c.auto_approval_limit?.toString() || "" }); setCatDlgOpen(true); };
  const saveCat = async () => {
    if (!catForm.name.trim()) return;
    const payload = {
      name: catForm.name.trim(),
      receipt_required_above: catForm.receipt_required_above ? Number(catForm.receipt_required_above) : null,
      auto_approval_limit: catForm.auto_approval_limit ? Number(catForm.auto_approval_limit) : null,
    };
    const { error } = editingCat
      ? await supabase.from("expense_categories").update(payload).eq("id", editingCat.id)
      : await supabase.from("expense_categories").insert(payload as any);
    if (error) { toast.error("Failed"); return; }
    toast.success(editingCat ? "Category updated" : "Category added");
    setCatDlgOpen(false); fetchAll();
  };
  const toggleCat = async (id: string, active: boolean) => {
    await supabase.from("expense_categories").update({ is_active: active }).eq("id", id);
    setCategories((p) => p.map((c) => (c.id === id ? { ...c, is_active: active } : c)));
  };
  const deleteCat = async (id: string) => {
    const { error } = await supabase.from("expense_categories").delete().eq("id", id);
    if (error) { toast.error("Cannot delete"); return; }
    setCategories((p) => p.filter((c) => c.id !== id));
  };

  // Workflow CRUD
  const openAddWf = () => { setEditingWf(null); setWfForm({ name: "", approval_type: "sequential", steps: 1, is_default: false }); setWfDlgOpen(true); };
  const openEditWf = (w: Workflow) => { setEditingWf(w); setWfForm({ name: w.name, approval_type: w.approval_type, steps: w.steps, is_default: w.is_default }); setWfDlgOpen(true); };
  const saveWf = async () => {
    if (!wfForm.name.trim()) return;
    const { error } = editingWf
      ? await supabase.from("expense_approval_workflows").update(wfForm).eq("id", editingWf.id)
      : await supabase.from("expense_approval_workflows").insert(wfForm as any);
    if (error) { toast.error("Failed"); return; }
    toast.success(editingWf ? "Workflow updated" : "Workflow added");
    setWfDlgOpen(false); fetchAll();
  };
  const deleteWf = async (id: string) => {
    const { error } = await supabase.from("expense_approval_workflows").delete().eq("id", id);
    if (error) { toast.error("Cannot delete"); return; }
    fetchAll();
  };

  // Rule CRUD
  const addRule = async () => {
    if (!ruleForm.rule_name.trim() || !ruleForm.workflow_id) { toast.error("Fill required fields"); return; }
    const { error } = await supabase.from("expense_approval_rules").insert({
      rule_name: ruleForm.rule_name,
      condition_type: ruleForm.condition_type,
      min_amount: ruleForm.min_amount ? Number(ruleForm.min_amount) : null,
      max_amount: ruleForm.max_amount ? Number(ruleForm.max_amount) : null,
      workflow_id: ruleForm.workflow_id,
      priority: Number(ruleForm.priority) || 100,
    } as any);
    if (error) { toast.error("Failed"); return; }
    setShowRuleForm(false);
    setRuleForm({ rule_name: "", condition_type: "amount_range", min_amount: "", max_amount: "", workflow_id: "", priority: "100" });
    fetchAll();
  };
  const deleteRule = async (id: string) => {
    await supabase.from("expense_approval_rules").delete().eq("id", id);
    setRules((p) => p.filter((r) => r.id !== id));
  };

  if (loading || !config || !policy) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-4">
      {/* TA Policy */}
      <Card className="shadow-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><Car className="h-4 w-4 text-blue-500" />Travel Allowance (TA) Policy</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">TA Calculation Method</Label>
            <Select value={config.ta_type} onValueChange={(v: any) => setConfig({ ...config, ta_type: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="from_gps">From GPS Tracking</SelectItem>
                <SelectItem value="fixed">Fixed Amount</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-md border bg-muted/30 p-3 space-y-2">
            {config.ta_type === "from_gps" ? (
              <>
                <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                  <Navigation className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>TA is auto-calculated from GPS kilometers traveled per day: <strong className="text-foreground">TA = Total KM × Per KM Rate</strong>.</span>
                </p>
                <div className="space-y-1">
                  <Label className="text-xs">Per KM Rate (₹) *</Label>
                  <Input type="number" min="0" step="0.5" value={config.ta_per_km_rate}
                    onChange={(e) => setConfig({ ...config, ta_per_km_rate: Number(e.target.value) })} className="max-w-[200px]" />
                  <p className="text-[11px] text-muted-foreground">Example: If rate is ₹8/km and user travels 45 km, TA = ₹360</p>
                </div>
                <TaRateHistory onCurrentRateChange={(r) => setConfig((c) => (c ? { ...c, ta_per_km_rate: r } : c))} />

              </>
            ) : (
              <div className="space-y-1">
                <Label className="text-xs">Fixed TA Amount (₹ per day)</Label>
                <Input type="number" min="0" value={config.fixed_ta_amount}
                  onChange={(e) => setConfig({ ...config, fixed_ta_amount: Number(e.target.value) })} className="max-w-[200px]" />
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Distribution</Label>
            <RadioGroup value={taDist} onValueChange={(v: any) => setTaDist(v)} className="flex gap-4">
              <div className="flex items-center gap-2"><RadioGroupItem value="same_for_all" id="ta-same" /><Label htmlFor="ta-same" className="text-xs">Same for all</Label></div>
              <div className="flex items-center gap-2"><RadioGroupItem value="custom" id="ta-custom" /><Label htmlFor="ta-custom" className="text-xs">Custom per user/team</Label></div>
            </RadioGroup>
          </div>

          {taDist === "custom" && (
            <>
              <OverrideTable field="ta" overrides={taOverrides}
                defaultAmount={config.ta_type === "from_gps" ? config.ta_per_km_rate : config.fixed_ta_amount}
                unitLabel={config.ta_type === "from_gps" ? "/km" : ""}
                onAdd={(t, id, name) => addOverride("ta", t, id, name)}
                onUpdateAmount={(id, amt) => updateOverride("ta", id, amt)}
                onDelete={(e) => deleteOverride("ta", e)} />
              <ExpenseGroupsInline field="ta" groups={groups} reload={fetchAll} />
            </>
          )}
        </CardContent>
      </Card>

      {/* DA Policy */}
      <Card className="shadow-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><Utensils className="h-4 w-4 text-emerald-500" />Daily Allowance (DA) Policy</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <Label className="text-xs font-medium">DA applicable</Label>
              <p className="text-[11px] text-muted-foreground">
                If turned off, Daily Allowance is hidden everywhere in the Expenses module.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{config.da_applicable ? "Yes" : "No"}</span>
              <Switch checked={config.da_applicable}
                onCheckedChange={(v) => setConfig({ ...config, da_applicable: v })} />
            </div>
          </div>

          {config.da_applicable && (<>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1"><Label className="text-xs">DA Amount (₹)</Label>
              <Input type="number" min="0" value={config.fixed_da_amount}
                onChange={(e) => setConfig({ ...config, fixed_da_amount: Number(e.target.value) })} /></div>
            <div className="space-y-1"><Label className="text-xs">Calculation Basis</Label>
              <Select value={config.da_calculation_basis} onValueChange={(v: any) => setConfig({ ...config, da_calculation_basis: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="per_day">Per Day</SelectItem>
                  <SelectItem value="per_half_day">Per Half Day (half-day = 0.5 × DA)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>


          <div className="space-y-1.5">
            <Label className="text-xs">Distribution</Label>
            <RadioGroup value={daDist} onValueChange={(v: any) => setDaDist(v)} className="flex gap-4">
              <div className="flex items-center gap-2"><RadioGroupItem value="same_for_all" id="da-same" /><Label htmlFor="da-same" className="text-xs">Same for all</Label></div>
              <div className="flex items-center gap-2"><RadioGroupItem value="custom" id="da-custom" /><Label htmlFor="da-custom" className="text-xs">Custom per user/team</Label></div>
            </RadioGroup>
          </div>

          {daDist === "custom" && (
            <>
              <OverrideTable field="da" overrides={daOverrides} defaultAmount={config.fixed_da_amount}
                onAdd={(t, id, name) => addOverride("da", t, id, name)}
                onUpdateAmount={(id, amt) => updateOverride("da", id, amt)}
                onDelete={(e) => deleteOverride("da", e)} />
              <ExpenseGroupsInline field="da" groups={groups} reload={fetchAll} />
            </>
          )}
          </>)}

        </CardContent>
      </Card>

      {/* Additional Expenses Policy */}
      <Card className="shadow-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><Receipt className="h-4 w-4 text-fuchsia-500" />Additional Expenses Policy</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1">
              <Label className="text-xs">Max per Day (₹)</Label>
              <Input type="number" min="0" value={policy.max_additional_expense_per_day}
                onChange={(e) => setPolicy({ ...policy, max_additional_expense_per_day: Number(e.target.value) })} />
              <p className="text-[11px] text-muted-foreground">0 = no limit</p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Max per Month (₹)</Label>
              <Input type="number" min="0" value={policy.max_additional_expense_per_month}
                onChange={(e) => setPolicy({ ...policy, max_additional_expense_per_month: Number(e.target.value) })} />
              <p className="text-[11px] text-muted-foreground">0 = no limit</p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Bill Required Above (₹)</Label>
              <Input type="number" min="0" value={policy.require_bill_above_amount}
                onChange={(e) => setPolicy({ ...policy, require_bill_above_amount: Number(e.target.value) })} />
              <p className="text-[11px] text-muted-foreground">Mandatory bill above this amount</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={saveConfigAndPolicy} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          Save Policies
        </Button>
      </div>

      {/* Categories */}
      <Card className="shadow-card">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base flex items-center gap-2"><Tags className="h-4 w-4 text-orange-500" />Expense Categories</CardTitle>
          <Button size="sm" onClick={openAddCat}><Plus className="h-4 w-4 mr-1" />Add</Button>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Name</TableHead><TableHead>Receipt above</TableHead><TableHead>Auto-approve up to</TableHead><TableHead>Active</TableHead><TableHead></TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {categories.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell>{c.receipt_required_above != null ? `₹${c.receipt_required_above}` : "—"}</TableCell>
                  <TableCell>{c.auto_approval_limit ? `₹${c.auto_approval_limit}` : "—"}</TableCell>
                  <TableCell><Switch checked={c.is_active} onCheckedChange={(v) => toggleCat(c.id, v)} /></TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openEditCat(c)}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="sm" className="text-destructive" onClick={() => deleteCat(c.id)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {!categories.length && <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground">No categories.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Approval Workflows */}
      <Card className="shadow-card">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base flex items-center gap-2"><GitBranch className="h-4 w-4 text-violet-500" />Approval Workflows</CardTitle>
          <Button size="sm" onClick={openAddWf}><Plus className="h-4 w-4 mr-1" />Add</Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {workflows.map((wf) => (
            <Collapsible key={wf.id} open={expandedWf === wf.id} onOpenChange={() => setExpandedWf(expandedWf === wf.id ? null : wf.id)}>
              <CollapsibleTrigger className="w-full">
                <div className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="font-medium">{wf.name}</span>
                    <Badge variant="secondary" className="text-xs">{wf.approval_type === "sequential" ? "Sequential" : "Parallel"}</Badge>
                    {wf.is_default && <Badge className="bg-primary text-primary-foreground text-xs">Default</Badge>}
                    <Badge variant="outline" className="text-xs">{wf.steps} steps</Badge>
                  </div>
                  {expandedWf === wf.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="p-3 border border-t-0 rounded-b-lg bg-muted/20 flex gap-2 justify-end">
                  <Button variant="outline" size="sm" onClick={() => openEditWf(wf)}><Pencil className="h-3 w-3 mr-1" />Edit</Button>
                  <Button variant="outline" size="sm" className="text-destructive" onClick={() => deleteWf(wf.id)}><Trash2 className="h-3 w-3 mr-1" />Delete</Button>
                </div>
              </CollapsibleContent>
            </Collapsible>
          ))}
          {!workflows.length && <p className="text-center text-muted-foreground py-6 text-sm">No workflows configured.</p>}
        </CardContent>
      </Card>

      {/* Approval Rules */}
      <Card className="shadow-card">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base flex items-center gap-2"><Scale className="h-4 w-4 text-teal-500" />Approval Rules</CardTitle>
          <Button size="sm" onClick={() => setShowRuleForm(true)}><Plus className="h-4 w-4 mr-1" />Add Rule</Button>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground flex items-start gap-1.5"><Info className="h-3.5 w-3.5 mt-0.5" />Rules are checked in priority order (lowest first). First match wins.</p>

          {showRuleForm && (
            <div className="border rounded-lg p-3 space-y-3 bg-muted/20">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1"><Label className="text-xs">Rule Name</Label>
                  <Input value={ruleForm.rule_name} onChange={(e) => setRuleForm({ ...ruleForm, rule_name: e.target.value })} /></div>
                <div className="space-y-1"><Label className="text-xs">Workflow</Label>
                  <Select value={ruleForm.workflow_id} onValueChange={(v) => setRuleForm({ ...ruleForm, workflow_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Select workflow" /></SelectTrigger>
                    <SelectContent>{workflows.map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1"><Label className="text-xs">Min Amount (₹)</Label>
                  <Input type="number" value={ruleForm.min_amount} onChange={(e) => setRuleForm({ ...ruleForm, min_amount: e.target.value })} /></div>
                <div className="space-y-1"><Label className="text-xs">Max Amount (₹)</Label>
                  <Input type="number" value={ruleForm.max_amount} onChange={(e) => setRuleForm({ ...ruleForm, max_amount: e.target.value })} /></div>
                <div className="space-y-1"><Label className="text-xs">Priority</Label>
                  <Input type="number" value={ruleForm.priority} onChange={(e) => setRuleForm({ ...ruleForm, priority: e.target.value })} /></div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setShowRuleForm(false)}>Cancel</Button>
                <Button size="sm" onClick={addRule}>Add Rule</Button>
              </div>
            </div>
          )}

          {rules.length === 0 ? (
            <p className="text-center text-muted-foreground py-4 text-sm">No approval rules yet.</p>
          ) : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Priority</TableHead><TableHead>Rule</TableHead><TableHead>Range</TableHead><TableHead>Workflow</TableHead><TableHead></TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {rules.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{r.priority}</TableCell>
                    <TableCell className="font-medium">{r.rule_name}</TableCell>
                    <TableCell className="text-xs">
                      {r.min_amount != null ? `₹${r.min_amount}` : "0"} – {r.max_amount != null ? `₹${r.max_amount}` : "∞"}
                    </TableCell>
                    <TableCell className="text-xs">{workflows.find((w) => w.id === r.workflow_id)?.name || "—"}</TableCell>
                    <TableCell><Button variant="ghost" size="sm" className="text-destructive" onClick={() => deleteRule(r.id)}><Trash2 className="h-4 w-4" /></Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Category dialog */}
      <Dialog open={catDlgOpen} onOpenChange={setCatDlgOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader><DialogTitle>{editingCat ? "Edit" : "Add"} Category</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><Label className="text-xs">Name</Label>
              <Input value={catForm.name} onChange={(e) => setCatForm({ ...catForm, name: e.target.value })} /></div>
            <div className="space-y-1"><Label className="text-xs">Receipt required above (₹)</Label>
              <Input type="number" value={catForm.receipt_required_above} onChange={(e) => setCatForm({ ...catForm, receipt_required_above: e.target.value })} /></div>
            <div className="space-y-1"><Label className="text-xs">Auto-approval limit (₹)</Label>
              <Input type="number" value={catForm.auto_approval_limit} onChange={(e) => setCatForm({ ...catForm, auto_approval_limit: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCatDlgOpen(false)}>Cancel</Button>
            <Button onClick={saveCat}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Workflow dialog */}
      <Dialog open={wfDlgOpen} onOpenChange={setWfDlgOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader><DialogTitle>{editingWf ? "Edit" : "Add"} Workflow</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><Label className="text-xs">Name</Label>
              <Input value={wfForm.name} onChange={(e) => setWfForm({ ...wfForm, name: e.target.value })} /></div>
            <div className="space-y-1"><Label className="text-xs">Type</Label>
              <Select value={wfForm.approval_type} onValueChange={(v) => setWfForm({ ...wfForm, approval_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sequential">Sequential</SelectItem>
                  <SelectItem value="parallel">Parallel</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label className="text-xs">Steps</Label>
              <Input type="number" min="1" value={wfForm.steps} onChange={(e) => setWfForm({ ...wfForm, steps: Number(e.target.value) })} /></div>
            <div className="flex items-center gap-2">
              <Switch checked={wfForm.is_default} onCheckedChange={(v) => setWfForm({ ...wfForm, is_default: v })} />
              <Label className="text-xs">Default workflow</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWfDlgOpen(false)}>Cancel</Button>
            <Button onClick={saveWf}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
