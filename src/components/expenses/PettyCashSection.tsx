import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Loader2, Plus, Search, Wallet, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

type Mode = "cash" | "upi" | "bank";
interface Advance {
  id: string; user_id: string; amount: number; issued_on: string; payment_mode: Mode;
  purpose: string | null; reference_no: string | null; status: "open" | "settled";
  settled_on: string | null; settlement_note: string | null;
}
interface Txn { id: string; advance_id: string; kind: "issue" | "topup"; amount: number; txn_date: string; payment_mode: Mode; reference_no: string | null; note: string | null }
interface Emp { id: string; name: string; role: string }

const inr = (n: number) => `${n < 0 ? "−" : ""}₹${Math.abs(n).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const fmt = (d: string) => format(new Date(`${d}T00:00:00`), "dd MMM yyyy");
const today = () => format(new Date(), "yyyy-MM-dd");
const MODES: { v: Mode; l: string }[] = [{ v: "cash", l: "Cash" }, { v: "upi", l: "UPI" }, { v: "bank", l: "Bank" }];

type Panel =
  | { kind: "issue" }
  | { kind: "edit"; adv: Advance }
  | { kind: "topup"; adv: Advance }
  | { kind: "settle"; adv: Advance }
  | { kind: "view"; adv: Advance }
  | null;

export default function PettyCashSection() {
  const [advances, setAdvances] = useState<Advance[]>([]);
  const [txns, setTxns] = useState<Txn[]>([]);
  const [emps, setEmps] = useState<Emp[]>([]);
  const [spentByAdvance, setSpentByAdvance] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "open" | "settled">("all");
  const [search, setSearch] = useState("");
  const [panel, setPanel] = useState<Panel>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [advRes, txnRes, userRes, roleRes] = await Promise.all([
      supabase.from("petty_cash_advances" as any).select("*").order("issued_on", { ascending: false }),
      supabase.from("petty_cash_transactions" as any).select("*").order("txn_date", { ascending: true }),
      supabase.from("users").select("id, full_name, role_id, is_active").order("full_name"),
      supabase.from("security_profiles" as any).select("id, name"),
    ]);
    if (advRes.error) {
      toast.error("Petty Cash tables are not set up yet — apply the latest migration");
      setLoading(false);
      return;
    }
    const roleName = new Map(((roleRes.data || []) as any[]).map((r) => [r.id, r.name]));
    setEmps(((userRes.data || []) as any[])
      .filter((u) => u.is_active !== false)
      .map((u) => ({ id: u.id, name: u.full_name || "Unnamed", role: roleName.get(u.role_id) || "" })));
    const advs = ((advRes.data || []) as any[]).map((a) => ({ ...a, amount: Number(a.amount || 0) })) as Advance[];
    setAdvances(advs);
    setTxns(((txnRes.data || []) as any[]).map((t) => ({ ...t, amount: Number(t.amount || 0) })));

    // Spent = approved additional expenses of that employee between issue and settlement (or today).
    const spent = new Map<string, number>();
    if (advs.length) {
      const userIds = Array.from(new Set(advs.map((a) => a.user_id)));
      const minDate = advs.reduce((m, a) => (a.issued_on < m ? a.issued_on : m), advs[0].issued_on);
      const { data: exp } = await supabase.from("additional_expenses")
        .select("user_id, amount, expense_date, status")
        .in("user_id", userIds).eq("status", "approved").gte("expense_date", minDate);
      advs.forEach((a) => {
        const end = a.settled_on || today();
        const total = ((exp || []) as any[])
          .filter((e) => e.user_id === a.user_id && e.expense_date >= a.issued_on && e.expense_date <= end)
          .reduce((s, e) => s + Number(e.amount || 0), 0);
        spent.set(a.id, total);
      });
    }
    setSpentByAdvance(spent);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const empMap = useMemo(() => new Map(emps.map((e) => [e.id, e])), [emps]);

  const monthStart = format(new Date(), "yyyy-MM-01");
  const issuedThisMonth = txns.filter((t) => t.txn_date >= monthStart).reduce((s, t) => s + t.amount, 0);
  const openAdvs = advances.filter((a) => a.status === "open");
  const spentOpen = openAdvs.reduce((s, a) => s + (spentByAdvance.get(a.id) || 0), 0);
  const withEmployees = openAdvs.reduce((s, a) => s + Math.max(0, a.amount - (spentByAdvance.get(a.id) || 0)), 0);

  const rows = advances.filter((a) => {
    if (filter !== "all" && a.status !== filter) return false;
    const e = empMap.get(a.user_id);
    return !search || (e?.name || "").toLowerCase().includes(search.toLowerCase());
  });

  return (
    <Card id="petty-cash" className="scroll-mt-28 overflow-hidden border-border/70 shadow-card">
      <CardHeader className="flex flex-col gap-3 border-b border-border/60 bg-warning/5 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-7">
        <CardTitle className="flex items-center gap-3 text-lg">
          <span className="flex h-10 w-10 items-center justify-center rounded-md bg-warning/10 text-warning"><Wallet className="h-5 w-5" /></span>
          <span>Petty Cash
            <span className="mt-0.5 block text-sm font-normal text-muted-foreground">Cash given to employees in advance, and how much of it has been used.</span>
          </span>
        </CardTitle>
        <Button onClick={() => setPanel({ kind: "issue" })}><Plus className="mr-1 h-4 w-4" />Issue petty cash</Button>
      </CardHeader>
      <CardContent className="space-y-5 p-5 sm:p-7">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { l: "Issued this month", v: issuedThisMonth },
            { l: "Spent against open advances", v: spentOpen },
            { l: "Still with employees", v: withEmployees },
            { l: "Unsettled advances", v: openAdvs.length, count: true },
          ].map((s) => (
            <div key={s.l} className="rounded-lg border bg-background px-4 py-3">
              <p className="text-xs text-muted-foreground">{s.l}</p>
              <p className="text-2xl font-bold">{s.count ? s.v : inr(s.v)}</p>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-2">
            {(["all", "open", "settled"] as const).map((f) => (
              <button key={f} type="button" onClick={() => setFilter(f)}
                className={cn("rounded-full border px-4 py-1.5 text-sm font-medium capitalize",
                  filter === f ? "border-primary bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted/50")}>
                {f}
              </button>
            ))}
          </div>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search employee" className="pl-9" />
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border">
          <div className="hidden grid-cols-[1.8fr_1.1fr_1fr_1fr_1fr_0.9fr_1.6fr] gap-3 bg-muted/40 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground lg:grid">
            <span>Employee</span><span>Issued on</span><span>Amount</span><span>Spent</span><span>Balance</span><span>Status</span><span className="text-right">Actions</span>
          </div>
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : rows.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">
              {advances.length ? "No advances match this filter." : "No petty cash issued yet. Use “Issue petty cash” to add the first one."}
            </p>
          ) : rows.map((a) => {
            const e = empMap.get(a.user_id);
            const spent = spentByAdvance.get(a.id) || 0;
            const bal = a.amount - spent;
            const status = a.status === "settled"
              ? { l: "Settled", c: "bg-muted text-muted-foreground" }
              : bal < 0 ? { l: "Overspent", c: "bg-warning/10 text-warning" }
              : { l: "Open", c: "bg-success/10 text-success" };
            return (
              <div key={a.id} className="grid grid-cols-2 items-center gap-3 border-t px-4 py-3 text-sm first:border-t-0 lg:grid-cols-[1.8fr_1.1fr_1fr_1fr_1fr_0.9fr_1.6fr]">
                <div className="col-span-2 lg:col-span-1">
                  <p className="font-semibold">{e?.name || "Unknown"}</p>
                  <p className="text-xs text-muted-foreground">{[e?.role, a.purpose].filter(Boolean).join(" · ")}</p>
                </div>
                <div><span className="text-xs text-muted-foreground lg:hidden">Issued </span>{fmt(a.issued_on)}</div>
                <div className="font-semibold"><span className="text-xs font-normal text-muted-foreground lg:hidden">Amount </span>{inr(a.amount)}</div>
                <div><span className="text-xs text-muted-foreground lg:hidden">Spent </span>{inr(spent)}</div>
                <div className={cn("font-bold", bal < 0 && "text-warning")}><span className="text-xs font-normal text-muted-foreground lg:hidden">Balance </span>{inr(bal)}</div>
                <div><span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", status.c)}>{status.l}</span></div>
                <div className="col-span-2 flex flex-wrap justify-end gap-1.5 lg:col-span-1">
                  {a.status === "open" ? (
                    <>
                      <Button size="sm" variant="outline" onClick={() => setPanel({ kind: "topup", adv: a })}>Top up</Button>
                      <Button size="sm" variant="outline" onClick={() => setPanel({ kind: "settle", adv: a })}>Settle</Button>
                      <Button size="icon" variant="ghost" className="h-9 w-9" aria-label="Edit" onClick={() => setPanel({ kind: "edit", adv: a })}><Pencil className="h-4 w-4" /></Button>
                    </>
                  ) : (
                    <Button size="sm" variant="ghost" onClick={() => setPanel({ kind: "view", adv: a })}>View</Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">Spent = the employee’s approved additional expenses from the issue date until the advance is settled.</p>
      </CardContent>

      <PettyCashPanel panel={panel} onClose={() => setPanel(null)} emps={emps} empMap={empMap}
        txns={txns} spentByAdvance={spentByAdvance} onSaved={() => { setPanel(null); load(); }} />
    </Card>
  );
}

function ModePicker({ value, onChange }: { value: Mode; onChange: (m: Mode) => void }) {
  return (
    <div className="grid grid-cols-3 overflow-hidden rounded-md border">
      {MODES.map((m) => (
        <button key={m.v} type="button" onClick={() => onChange(m.v)}
          className={cn("px-3 py-2 text-sm font-medium", value === m.v ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground")}>
          {m.l}
        </button>
      ))}
    </div>
  );
}

function PettyCashPanel({ panel, onClose, emps, empMap, txns, spentByAdvance, onSaved }: {
  panel: Panel; onClose: () => void; emps: Emp[]; empMap: Map<string, Emp>;
  txns: Txn[]; spentByAdvance: Map<string, number>; onSaved: () => void;
}) {
  const [f, setF] = useState({ user_id: "", amount: "", date: today(), mode: "cash" as Mode, purpose: "", ref: "", note: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!panel) return;
    if (panel.kind === "edit") {
      const a = panel.adv;
      setF({ user_id: a.user_id, amount: String(a.amount), date: a.issued_on, mode: a.payment_mode, purpose: a.purpose || "", ref: a.reference_no || "", note: "" });
    } else {
      setF({ user_id: "", amount: "", date: today(), mode: "cash", purpose: "", ref: "", note: "" });
    }
  }, [panel]);

  if (!panel) return null;
  const adv = "adv" in panel ? panel.adv : null;
  const emp = adv ? empMap.get(adv.user_id) : null;
  const history = adv ? txns.filter((t) => t.advance_id === adv.id) : [];

  const run = async (fn: () => Promise<void>) => {
    setSaving(true);
    try { await fn(); onSaved(); } catch (e: any) { toast.error(e?.message || "Could not save"); } finally { setSaving(false); }
  };
  const uid = async () => (await supabase.auth.getUser()).data.user?.id ?? null;
  const amountNum = Number(f.amount);
  const validAmount = Number.isFinite(amountNum) && amountNum > 0;

  const issue = () => run(async () => {
    if (!f.user_id) throw new Error("Select an employee");
    if (!validAmount) throw new Error("Enter a valid amount");
    const me = await uid();
    const { data, error } = await supabase.from("petty_cash_advances" as any).insert({
      user_id: f.user_id, amount: amountNum, issued_on: f.date, payment_mode: f.mode,
      purpose: f.purpose.trim() || null, reference_no: f.ref.trim() || null, created_by: me,
    } as any).select("id").single();
    if (error) throw error;
    const { error: tErr } = await supabase.from("petty_cash_transactions" as any).insert({
      advance_id: (data as any).id, kind: "issue", amount: amountNum, txn_date: f.date, payment_mode: f.mode,
      reference_no: f.ref.trim() || null, note: f.purpose.trim() || null, created_by: me,
    } as any);
    if (tErr) throw tErr;
    toast.success("Petty cash issued");
  });

  const saveEdit = () => run(async () => {
    if (!adv) return;
    if (!validAmount) throw new Error("Enter a valid amount");
    const topups = history.filter((t) => t.kind === "topup").reduce((s, t) => s + t.amount, 0);
    if (amountNum < topups) throw new Error(`Amount can't be less than the top-ups already given (${inr(topups)})`);
    const { error } = await supabase.from("petty_cash_advances" as any).update({
      amount: amountNum, issued_on: f.date, payment_mode: f.mode,
      purpose: f.purpose.trim() || null, reference_no: f.ref.trim() || null,
    }).eq("id", adv.id);
    if (error) throw error;
    const issueTxn = history.find((t) => t.kind === "issue");
    if (issueTxn) {
      await supabase.from("petty_cash_transactions" as any).update({
        amount: amountNum - topups, txn_date: f.date, payment_mode: f.mode, reference_no: f.ref.trim() || null,
      }).eq("id", issueTxn.id);
    }
    toast.success("Advance updated");
  });

  const removeAdvance = () => run(async () => {
    if (!adv) return;
    const { error } = await supabase.from("petty_cash_advances" as any).delete().eq("id", adv.id);
    if (error) throw error;
    toast.success("Advance deleted");
  });

  const topup = () => run(async () => {
    if (!adv) return;
    if (!validAmount) throw new Error("Enter a valid amount");
    const { error } = await supabase.from("petty_cash_transactions" as any).insert({
      advance_id: adv.id, kind: "topup", amount: amountNum, txn_date: f.date, payment_mode: f.mode,
      reference_no: f.ref.trim() || null, note: f.note.trim() || null, created_by: await uid(),
    } as any);
    if (error) throw error;
    const { error: aErr } = await supabase.from("petty_cash_advances" as any)
      .update({ amount: adv.amount + amountNum }).eq("id", adv.id);
    if (aErr) throw aErr;
    toast.success(`Topped up ${inr(amountNum)}`);
  });

  const settle = () => run(async () => {
    if (!adv) return;
    const { error } = await supabase.from("petty_cash_advances" as any).update({
      status: "settled", settled_on: f.date, settlement_note: f.note.trim() || null,
    }).eq("id", adv.id);
    if (error) throw error;
    toast.success("Advance settled");
  });

  const reopen = () => run(async () => {
    if (!adv) return;
    const { error } = await supabase.from("petty_cash_advances" as any)
      .update({ status: "open", settled_on: null, settlement_note: null }).eq("id", adv.id);
    if (error) throw error;
    toast.success("Advance reopened");
  });

  const spent = adv ? spentByAdvance.get(adv.id) || 0 : 0;
  const title = { issue: "Issue petty cash", edit: "Edit advance", topup: "Top up", settle: "Settle advance", view: "Advance details" }[panel.kind];

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-md">
        <SheetHeader className="pb-4"><SheetTitle>{title}</SheetTitle></SheetHeader>

        {adv && (
          <div className="mb-4 rounded-lg border bg-muted/30 p-3 text-sm">
            <p className="font-semibold">{emp?.name || "Unknown"}</p>
            <p className="text-xs text-muted-foreground">Issued {fmt(adv.issued_on)}{adv.purpose ? ` · ${adv.purpose}` : ""}</p>
            <div className="mt-2 grid grid-cols-3 gap-2">
              <div><p className="text-xs text-muted-foreground">Amount</p><p className="font-semibold">{inr(adv.amount)}</p></div>
              <div><p className="text-xs text-muted-foreground">Spent</p><p className="font-semibold">{inr(spent)}</p></div>
              <div><p className="text-xs text-muted-foreground">Balance</p><p className="font-bold">{inr(adv.amount - spent)}</p></div>
            </div>
          </div>
        )}

        <div className="flex-1 space-y-4">
          {(panel.kind === "issue" || panel.kind === "edit") && (
            <>
              <div className="space-y-1.5">
                <Label>Employee</Label>
                <Select value={f.user_id} onValueChange={(v) => setF({ ...f, user_id: v })} disabled={panel.kind === "edit"}>
                  <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                  <SelectContent>
                    {emps.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}{e.role ? ` — ${e.role}` : ""}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Amount (₹)</Label>
                <Input type="number" min="0" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} placeholder="e.g. 5000" /></div>
              <div className="space-y-1.5"><Label>Issued on</Label>
                <Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Given by</Label><ModePicker value={f.mode} onChange={(m) => setF({ ...f, mode: m })} /></div>
              <div className="space-y-1.5"><Label>Purpose</Label>
                <Input value={f.purpose} onChange={(e) => setF({ ...f, purpose: e.target.value })} placeholder="e.g. Hosur beat, week 38" /></div>
              <div className="space-y-1.5"><Label>Reference no. (optional)</Label>
                <Input value={f.ref} onChange={(e) => setF({ ...f, ref: e.target.value })} placeholder="UPI / voucher no." /></div>
            </>
          )}

          {panel.kind === "topup" && (
            <>
              <div className="space-y-1.5"><Label>Top-up amount (₹)</Label>
                <Input type="number" min="0" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} placeholder="e.g. 2000" autoFocus /></div>
              <div className="space-y-1.5"><Label>Date</Label>
                <Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Given by</Label><ModePicker value={f.mode} onChange={(m) => setF({ ...f, mode: m })} /></div>
              <div className="space-y-1.5"><Label>Reference no. (optional)</Label>
                <Input value={f.ref} onChange={(e) => setF({ ...f, ref: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Note (optional)</Label>
                <Input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></div>
            </>
          )}

          {panel.kind === "settle" && adv && (
            <>
              <p className="text-sm text-muted-foreground">
                {adv.amount - spent > 0
                  ? `Employee should return ${inr(adv.amount - spent)}.`
                  : adv.amount - spent < 0
                    ? `Employee spent ${inr(spent - adv.amount)} more than issued — reimburse through their claim.`
                    : "Fully used — nothing to return."}
              </p>
              <div className="space-y-1.5"><Label>Settled on</Label>
                <Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Note (optional)</Label>
                <Textarea value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="e.g. ₹450 returned in cash" /></div>
            </>
          )}

          {panel.kind === "view" && adv?.settled_on && (
            <p className="text-sm">Settled on <b>{fmt(adv.settled_on)}</b>{adv.settlement_note ? ` — ${adv.settlement_note}` : ""}</p>
          )}

          {adv && history.length > 0 && (
            <div className="space-y-2 pt-2">
              <p className="text-sm font-semibold">Money given</p>
              {history.map((t) => (
                <div key={t.id} className="flex justify-between rounded-md border px-3 py-2 text-sm">
                  <span>{t.kind === "issue" ? "Issued" : "Top-up"} · {fmt(t.txn_date)} · {MODES.find((m) => m.v === t.payment_mode)?.l}</span>
                  <b>{inr(t.amount)}</b>
                </div>
              ))}
            </div>
          )}
        </div>

        <SheetFooter className="mt-6 flex-row gap-2 border-t pt-4 sm:justify-between">
          {panel.kind === "edit" ? (
            <Button variant="ghost" className="text-destructive" onClick={removeAdvance} disabled={saving}><Trash2 className="mr-1 h-4 w-4" />Delete</Button>
          ) : panel.kind === "view" ? (
            <Button variant="outline" onClick={reopen} disabled={saving}>Reopen</Button>
          ) : <span />}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>{panel.kind === "view" ? "Close" : "Cancel"}</Button>
            {panel.kind !== "view" && (
              <Button disabled={saving} onClick={{ issue, edit: saveEdit, topup, settle }[panel.kind]}>
                {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                {{ issue: "Save", edit: "Save changes", topup: "Add top-up", settle: "Mark settled" }[panel.kind]}
              </Button>
            )}
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
