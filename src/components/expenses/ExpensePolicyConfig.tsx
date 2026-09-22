import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { SegmentedControl, type SegmentedOption } from "@/components/ui/segmented-control";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Save, Loader2, Car, Utensils, Receipt, Tags, GitBranch, Scale, Plus, Trash2, Pencil, ChevronDown, ChevronUp, Navigation, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import OverrideTable, { type OverrideEntry } from "./OverrideTable";
import ExpenseGroupsInline, { type ExpenseGroup } from "./ExpenseGroupsInline";
import TaPolicyCard from "./TaPolicyCard";
import VehicleTaCard from "./VehicleTaCard";
import PettyCashSection from "./PettyCashSection";


interface ExpenseConfig {
  id: string;
  ta_type: "fixed" | "from_gps";
  fixed_ta_amount: number;
  ta_per_km_rate: number;
  fixed_da_amount: number;
  da_calculation_basis: "per_day" | "per_half_day";
  da_applicable: boolean;
  ta_default_enabled: boolean;
}
interface PolicyRow {
  id: string;
  max_additional_expense_per_day: number;
  max_additional_expense_per_month: number;
  require_bill_above_amount: number;
}
type Dist = "same_for_all" | "custom";
const DA_DISTRIBUTIONS: readonly SegmentedOption<Dist>[] = [
  { value: "same_for_all", label: "Same for all" },
  { value: "custom", label: "Custom per user/team" },
];

interface Category { id: string; name: string; receipt_required_above: number | null; auto_approval_limit: number | null; is_active: boolean; }
interface Workflow { id: string; name: string; approval_type: string; steps: number; is_default: boolean; is_active: boolean; }
interface Rule { id: string; rule_name: string; condition_type: string; min_amount: number | null; max_amount: number | null; workflow_id: string; priority: number; is_active: boolean; }

export default function ExpensePolicyConfig() {
  const queryClient = useQueryClient();
  const [config, setConfig] = useState<ExpenseConfig | null>(null);
  const [policy, setPolicy] = useState<PolicyRow | null>(null);
  // Last saved values, so unsaved edits can be counted and discarded.
  const [savedConfig, setSavedConfig] = useState<ExpenseConfig | null>(null);
  const [savedPolicy, setSavedPolicy] = useState<PolicyRow | null>(null);
  const taMethodSync = useRef<(() => Promise<void>) | null>(null);
  const registerTaMethodSync = useCallback((sync: () => Promise<void>) => { taMethodSync.current = sync; }, []);
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
    if (cfgRow) {
      const loadedConfig: ExpenseConfig = {
        id: cfgRow.id, ta_type: cfgRow.ta_type || "from_gps",
        fixed_ta_amount: Number(cfgRow.fixed_ta_amount || 0),
        ta_per_km_rate: Number(cfgRow.ta_per_km_rate || 0),
        fixed_da_amount: Number(cfgRow.fixed_da_amount || 0),
        da_calculation_basis: cfgRow.da_calculation_basis || "per_day",
        da_applicable: cfgRow.da_applicable !== false,
        ta_default_enabled: cfgRow.ta_default_enabled !== false,
      };
      setConfig(loadedConfig);
      setSavedConfig(loadedConfig);
    }

    // policy
    let polRow: any = pol.data;
    if (!polRow) {
      const { data: created } = await supabase.from("expense_policy").insert({} as any).select().single();
      polRow = created;
    }
    if (polRow) {
      const loadedPolicy: PolicyRow = {
        id: polRow.id,
        max_additional_expense_per_day: Number(polRow.max_additional_expense_per_day || 0),
        max_additional_expense_per_month: Number(polRow.max_additional_expense_per_month || 0),
        require_bill_above_amount: Number(polRow.require_bill_above_amount ?? 500),
      };
      setPolicy(loadedPolicy);
      setSavedPolicy(loadedPolicy);
    }

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

  // Keeps the top-level "Per KM Rate" field as the single control for the
  // org-wide rate, while still recording every change in ta_rate_history —
  // so editing it here can never silently bypass the rate-history log.
  const syncTaRateHistory = async (newRate: number) => {
    const today = format(new Date(), "yyyy-MM-dd");
    const { data: rows, error: fetchErr } = await supabase
      .from("ta_rate_history" as any)
      .select("id, per_km_rate, effective_from, effective_to")
      .order("effective_from", { ascending: false });
    if (fetchErr) { toast.error("Could not check rate history"); return; }

    const history = (rows || []) as any[];
    const active = history.find((r) => r.effective_from <= today && (!r.effective_to || r.effective_to >= today));

    if (active && Number(active.per_km_rate) === newRate) return; // unchanged

    if (active && active.effective_from === today) {
      // Already a row for today (e.g. added via "Add Rate" earlier today) — update it in place.
      const { error } = await supabase.from("ta_rate_history" as any).update({ per_km_rate: newRate }).eq("id", active.id);
      if (error) { toast.error("Could not update today's rate"); return; }
    } else {
      if (active) {
        const end = new Date(`${today}T00:00:00`);
        end.setDate(end.getDate() - 1);
        const { error } = await supabase
          .from("ta_rate_history" as any)
          .update({ effective_to: format(end, "yyyy-MM-dd") })
          .eq("id", active.id);
        if (error) { toast.error("Could not close previous rate"); return; }
      }
      const { error } = await supabase
        .from("ta_rate_history" as any)
        .insert({ per_km_rate: newRate, effective_from: today, note: "Updated from Policy Configuration" } as any);
      if (error) { toast.error("Could not record rate history"); return; }
    }
    queryClient.invalidateQueries({ queryKey: ["ta-rate-history"] });
  };

  // Everything else on this page saves on the spot; only config + policy are
  // held back until Save, so those are the only fields that can be "unsaved".
  const dirtyCount = useMemo(() => {
    if (!config || !policy || !savedConfig || !savedPolicy) return 0;
    const changed = <T extends object>(a: T, b: T) =>
      (Object.keys(a) as (keyof T)[]).filter((k) => String(k) !== "id" && a[k] !== b[k]).length;
    return changed(config, savedConfig) + changed(policy, savedPolicy);
  }, [config, policy, savedConfig, savedPolicy]);

  const discardChanges = () => {
    setConfig(savedConfig);
    setPolicy(savedPolicy);
  };

  const saveConfigAndPolicy = async () => {
    if (!config || !policy) return;
    setSaving(true);
    if (config.ta_type === "from_gps") {
      await syncTaRateHistory(config.ta_per_km_rate);
    }
    const [cfgRes, polRes] = await Promise.all([
      supabase.from("expense_master_config" as any).update({
        ta_type: config.ta_type,
        fixed_ta_amount: config.fixed_ta_amount,
        ta_per_km_rate: config.ta_per_km_rate,
        fixed_da_amount: config.fixed_da_amount,
        da_calculation_basis: config.da_calculation_basis,
        da_applicable: config.da_applicable,
        ta_default_enabled: config.ta_default_enabled,
      }).eq("id", config.id),
      supabase.from("expense_policy").update({
        max_additional_expense_per_day: policy.max_additional_expense_per_day,
        max_additional_expense_per_month: policy.max_additional_expense_per_month,
        require_bill_above_amount: policy.require_bill_above_amount,
      } as any).eq("id", policy.id),
    ]);
    if (!cfgRes.error && !polRes.error) {
      // Custom TA rows store their own ta_type — keep them in step with the config.
      await taMethodSync.current?.();
    }
    setSaving(false);
    if (cfgRes.error || polRes.error) {
      toast.error("Failed to save");
      return;
    }
    setSavedConfig(config);
    setSavedPolicy(policy);
    toast.success("Saved");
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
    <div className="space-y-8 pb-4">
      <div className="space-y-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Allowance policies</h2>
      {/* Travel Allowance */}
      <TaPolicyCard
        method={config.ta_type}
        onMethodChange={(m) => setConfig({ ...config, ta_type: m })}
        defaultRate={config.ta_per_km_rate}
        defaultFixed={config.fixed_ta_amount}
        onDefaultRateChange={(n) => setConfig((c) => (c ? { ...c, ta_per_km_rate: n } : c))}
        onDefaultFixedChange={(n) => setConfig((c) => (c ? { ...c, fixed_ta_amount: n } : c))}
        defaultEnabled={config.ta_default_enabled}
        onDefaultEnabledChange={(v) => setConfig((c) => (c ? { ...c, ta_default_enabled: v } : c))}
        dist={taDist}
        onDistChange={setTaDist}
        overrides={taOverrides}
        onAddOverride={(t, id, name) => addOverride("ta", t, id, name)}
        onUpdateOverride={(id, amt) => updateOverride("ta", id, amt)}
        onDeleteOverride={(e) => deleteOverride("ta", e)}
        onRegisterMethodSync={registerTaMethodSync}
      />
      <VehicleTaCard method={config.ta_type} />

      {/* DA Policy */}
      <Card className="overflow-hidden border-border/70 shadow-card">
        <CardHeader className="flex flex-row items-center gap-3 space-y-0 border-b border-border/60 bg-muted/30 px-5 py-4 sm:px-7">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary"><Utensils className="h-5 w-5" /></span>
          <div className="min-w-0">
            <CardTitle className="text-lg">Daily Allowance (DA) Policy</CardTitle>
            <CardDescription className="mt-0.5">Control daily allowance availability, value, and calculation basis.</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-5 p-5 sm:p-7">
          <div className="flex flex-col gap-3 rounded-md border border-border/70 bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">DA applicable</p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                If turned off, Daily Allowance is hidden everywhere in the Expenses module.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{config.da_applicable ? "Yes" : "No"}</span>
              <Switch checked={config.da_applicable}
                onCheckedChange={(v) => setConfig({ ...config, da_applicable: v })} />
            </div>
          </div>

          {config.da_applicable && (<>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2"><Label className="block text-sm font-medium text-foreground">DA Amount (₹)</Label>
              <Input type="number" min="0" value={config.fixed_da_amount}
                onChange={(e) => setConfig({ ...config, fixed_da_amount: Number(e.target.value) })} /></div>
            <div className="space-y-2"><Label className="block text-sm font-medium text-foreground">Calculation Basis</Label>
              <Select value={config.da_calculation_basis} onValueChange={(v: any) => setConfig({ ...config, da_calculation_basis: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="per_day">Per Day</SelectItem>
                  <SelectItem value="per_half_day">Per Half Day (half-day = 0.5 × DA)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>


          <div className="grid gap-3 lg:grid-cols-[minmax(260px,0.8fr)_minmax(360px,1.2fr)] lg:items-center">
            <div><p className="text-sm font-medium text-foreground">Distribution</p><p className="mt-0.5 text-sm text-muted-foreground">Apply one policy to everyone or define exceptions.</p></div>
            <SegmentedControl
              idPrefix="da-dist"
              label="DA distribution"
              value={daDist}
              onValueChange={(v) => setDaDist(v)}
              options={DA_DISTRIBUTIONS}
              className="justify-self-start"
            />
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

      <PettyCashSection />
      </div>

      <div className="space-y-4 pt-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Claims and approvals</h2>

      {/* Receipt rule (kept from the old Additional Expenses Policy) */}
      <Card className="overflow-hidden border-border/70 shadow-card">
        <CardHeader className="flex flex-row items-center gap-3 space-y-0 border-b border-border/60 bg-muted/30 px-5 py-4 sm:px-7">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary"><Receipt className="h-5 w-5" /></span>
          <div className="min-w-0">
            <CardTitle className="text-lg">Receipts</CardTitle>
            <CardDescription className="mt-0.5">Claims above this amount must have a bill attached. Saved with “Save Policies”.</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="p-5 sm:p-7">
          <div className="space-y-2 sm:max-w-[220px]">
            <Label htmlFor="require-bill-above" className="block text-sm font-medium text-foreground">Bill required above (₹)</Label>
            <Input id="require-bill-above" type="number" min="0" value={policy.require_bill_above_amount}
              onChange={(e) => setPolicy({ ...policy, require_bill_above_amount: Number(e.target.value) })} className="h-10" />
          </div>
        </CardContent>
      </Card>

      {/* Categories */}
      <Card className="overflow-hidden border-border/70 shadow-card">
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0 border-b border-border/60 bg-muted/30 px-5 py-4 sm:px-7">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary"><Tags className="h-5 w-5" /></span>
            <div className="min-w-0">
              <CardTitle className="text-lg">Expense Categories</CardTitle>
              <CardDescription className="mt-0.5">Control receipt and automatic approval rules by category.</CardDescription>
            </div>
          </div>
          <Button size="sm" className="shrink-0" onClick={openAddCat}><Plus className="h-4 w-4 mr-1" />Add</Button>
        </CardHeader>
        <CardContent className="overflow-x-auto p-4 sm:p-6">
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
      <Card className="overflow-hidden border-border/70 shadow-card">
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0 border-b border-border/60 bg-muted/30 px-5 py-4 sm:px-7">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary"><GitBranch className="h-5 w-5" /></span>
            <div className="min-w-0">
              <CardTitle className="text-lg">Approval Workflows</CardTitle>
              <CardDescription className="mt-0.5">Define the sequence used to review submitted claims.</CardDescription>
            </div>
          </div>
          <Button size="sm" className="shrink-0" onClick={openAddWf}><Plus className="h-4 w-4 mr-1" />Add</Button>
        </CardHeader>
        <CardContent className="space-y-2 p-4 sm:p-6">
          {workflows.map((wf) => (
            <Collapsible key={wf.id} open={expandedWf === wf.id} onOpenChange={() => setExpandedWf(expandedWf === wf.id ? null : wf.id)}>
              <CollapsibleTrigger className="w-full">
                <div className="flex items-center justify-between rounded-md border p-3 transition-colors hover:bg-muted/50">
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
      <Card className="overflow-hidden border-border/70 shadow-card">
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0 border-b border-border/60 bg-muted/30 px-5 py-4 sm:px-7">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary"><Scale className="h-5 w-5" /></span>
            <div className="min-w-0">
              <CardTitle className="text-lg">Approval Rules</CardTitle>
              <CardDescription className="mt-0.5">Match expense amounts to the appropriate workflow.</CardDescription>
            </div>
          </div>
          <Button size="sm" className="shrink-0" onClick={() => setShowRuleForm(true)}><Plus className="h-4 w-4 mr-1" />Add Rule</Button>
        </CardHeader>
        <CardContent className="space-y-3 overflow-x-auto p-4 sm:p-6">
          <p className="text-sm text-muted-foreground flex items-start gap-1.5"><Info className="h-3.5 w-3.5 mt-0.5" />Rules are checked in priority order (lowest first). First match wins.</p>

          {showRuleForm && (
            <div className="space-y-4 rounded-md border border-border/70 bg-muted/20 p-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-2"><Label className="block text-sm font-medium text-foreground">Rule Name</Label>
                  <Input value={ruleForm.rule_name} onChange={(e) => setRuleForm({ ...ruleForm, rule_name: e.target.value })} /></div>
                <div className="space-y-2"><Label className="block text-sm font-medium text-foreground">Workflow</Label>
                  <Select value={ruleForm.workflow_id} onValueChange={(v) => setRuleForm({ ...ruleForm, workflow_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Select workflow" /></SelectTrigger>
                    <SelectContent>{workflows.map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2"><Label className="block text-sm font-medium text-foreground">Min Amount (₹)</Label>
                  <Input type="number" value={ruleForm.min_amount} onChange={(e) => setRuleForm({ ...ruleForm, min_amount: e.target.value })} /></div>
                <div className="space-y-2"><Label className="block text-sm font-medium text-foreground">Max Amount (₹)</Label>
                  <Input type="number" value={ruleForm.max_amount} onChange={(e) => setRuleForm({ ...ruleForm, max_amount: e.target.value })} /></div>
                <div className="space-y-2"><Label className="block text-sm font-medium text-foreground">Priority</Label>
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
      </div>

      {/* Unsaved-changes bar — only config and policy edits are deferred to Save. */}
      {dirtyCount > 0 && (
        <div className="sticky bottom-0 z-20 -mx-4 border-t bg-background/95 px-4 py-3 shadow-card backdrop-blur-sm sm:mx-0 sm:rounded-lg sm:border sm:px-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-medium" role="status">
              {dirtyCount} unsaved change{dirtyCount === 1 ? "" : "s"}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={discardChanges} disabled={saving} className="flex-1 sm:flex-none">
                Discard
              </Button>
              <Button onClick={saveConfigAndPolicy} disabled={saving} className="flex-1 sm:flex-none">
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Save Policies
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Category dialog */}
      <Dialog open={catDlgOpen} onOpenChange={setCatDlgOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader><DialogTitle>{editingCat ? "Edit" : "Add"} Category</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2"><Label className="block text-sm font-medium text-foreground">Name</Label>
              <Input value={catForm.name} onChange={(e) => setCatForm({ ...catForm, name: e.target.value })} /></div>
            <div className="space-y-2"><Label className="block text-sm font-medium text-foreground">Receipt required above (₹)</Label>
              <Input type="number" value={catForm.receipt_required_above} onChange={(e) => setCatForm({ ...catForm, receipt_required_above: e.target.value })} /></div>
            <div className="space-y-2"><Label className="block text-sm font-medium text-foreground">Auto-approval limit (₹)</Label>
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
            <div className="space-y-2"><Label className="block text-sm font-medium text-foreground">Name</Label>
              <Input value={wfForm.name} onChange={(e) => setWfForm({ ...wfForm, name: e.target.value })} /></div>
            <div className="space-y-2"><Label className="block text-sm font-medium text-foreground">Type</Label>
              <Select value={wfForm.approval_type} onValueChange={(v) => setWfForm({ ...wfForm, approval_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sequential">Sequential</SelectItem>
                  <SelectItem value="parallel">Parallel</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label className="block text-sm font-medium text-foreground">Steps</Label>
              <Input type="number" min="1" value={wfForm.steps} onChange={(e) => setWfForm({ ...wfForm, steps: Number(e.target.value) })} /></div>
            <div className="flex items-center gap-2">
              <Switch checked={wfForm.is_default} onCheckedChange={(v) => setWfForm({ ...wfForm, is_default: v })} />
              <Label className="block text-sm font-medium text-foreground">Default workflow</Label>
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
