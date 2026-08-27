import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NumberInput } from "@/components/ui/number-input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Opportunity, useCreateOpportunity, useUpdateOpportunity,
  useOppTypes, useOppStages, useUserLookup, useCustomers,
} from "@/hooks/useCustomers";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useCurrencies, usePaymentTerms } from "@/hooks/useOpportunityMasters";
import { useLeadSources } from "@/hooks/useLeadsEvents";
import { supabase } from "@/integrations/supabase/client";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{title}</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{children}</div>
    </div>
  );
}

export function OpportunityForm({
  open, onOpenChange, opportunity, lockCustomerId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  opportunity?: Opportunity;
  lockCustomerId?: string;
}) {
  const create = useCreateOpportunity();
  const update = useUpdateOpportunity();
  const { data: types = [] } = useOppTypes();
  const { data: stages = [] } = useOppStages();
  const { data: users = [] } = useUserLookup();
  const { data: customers = [] } = useCustomers();
  const { data: currencies = [] } = useCurrencies();
  const { data: paymentTerms = [] } = usePaymentTerms();
  const { data: sources = [] } = useLeadSources();
  const { userId } = useCurrentUser();
  const isEdit = !!opportunity;

  const [form, setForm] = useState({
    name: "", type: "", stage: "", probability: 0, close_date: "", amount: 0, owner_id: "",
    customer_id: "", currency: "INR", payment_terms: "", opportunity_source_id: "",
    requirements_highlights: "",
  });
  const [aiLoading, setAiLoading] = useState(false);

  useEffect(() => {
    if (opportunity) {
      const o = opportunity as any;
      setForm({
        name: opportunity.name,
        type: opportunity.type ?? "",
        stage: opportunity.stage ?? "",
        probability: opportunity.probability,
        close_date: opportunity.close_date ?? "",
        amount: Number(opportunity.amount),
        owner_id: opportunity.owner_id ?? "",
        customer_id: opportunity.customer_id ?? lockCustomerId ?? "",
        currency: o.currency ?? "INR",
        payment_terms: o.payment_terms ?? "",
        opportunity_source_id: o.opportunity_source_id ?? "",
        requirements_highlights: o.requirements_highlights ?? "",
      });
    } else {
      setForm({
        name: "", type: types[0]?.name ?? "", stage: stages[0]?.name ?? "",
        probability: 20, close_date: "", amount: 0, owner_id: "",
        customer_id: lockCustomerId ?? "", currency: "INR", payment_terms: "",
        opportunity_source_id: "", requirements_highlights: "",
      });
    }
  }, [opportunity, open, types, stages, lockCustomerId]);

  const canSubmit = form.name.trim() && (form.customer_id || lockCustomerId);

  const submit = async () => {
    if (!canSubmit) return;
    const payload: any = {
      name: form.name.trim(),
      type: form.type || null,
      stage: form.stage || null,
      probability: Number(form.probability) || 0,
      close_date: form.close_date || null,
      amount: Number(form.amount) || 0,
      customer_id: lockCustomerId ?? form.customer_id ?? null,
      currency: form.currency || "INR",
      payment_terms: form.payment_terms || null,
      opportunity_source_id: form.opportunity_source_id || null,
      requirements_highlights: form.requirements_highlights || null,
    };
    if (opportunity) {
      payload.owner_id = form.owner_id || null;
      await update.mutateAsync({ id: opportunity.id, ...payload });
    } else {
      payload.owner_id = userId ?? null;
      await create.mutateAsync(payload);
    }
    onOpenChange(false);
  };

  const elaborate = async () => {
    setAiLoading(true);
    try {
      const customerName = (lockCustomerId || form.customer_id)
        ? customers.find((c) => c.id === (lockCustomerId ?? form.customer_id))?.name
        : null;
      const { data, error } = await supabase.functions.invoke("elaborate-opportunity-requirements", {
        body: {
          name: form.name,
          type: form.type,
          customer: customerName,
          amount: form.amount,
          currency: form.currency,
          draft: form.requirements_highlights,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const details = (data as any)?.details ?? "";
      if (details) setForm((f) => ({ ...f, requirements_highlights: details }));
    } catch (e: any) {
      toast.error(e?.message || "AI generation failed");
    } finally {
      setAiLoading(false);
    }
  };

  const lockedCustomer = lockCustomerId ? customers.find((c) => c.id === lockCustomerId) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{opportunity ? "Edit Opportunity" : "New Opportunity"}</DialogTitle></DialogHeader>

        <div className="space-y-6">
          <Section title="Basic Info">
            <div className="md:col-span-2">
              <Label>Opportunity Name *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="md:col-span-2">
              <Label>Customer / Account *</Label>
              {lockCustomerId ? (
                <Input value={lockedCustomer?.name ?? "—"} disabled />
              ) : (
                <Select value={form.customer_id} onValueChange={(v) => setForm({ ...form, customer_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
                  <SelectContent>
                    {customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div>
              <Label>Type</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{types.map((t) => <SelectItem key={t.id} value={t.name}>{t.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Stage</Label>
              <Select value={form.stage} onValueChange={(v) => setForm({ ...form, stage: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{stages.map((s) => <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </Section>

          <Section title="Deal Details">
            <div>
              <Label>Currency</Label>
              <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {currencies.map((c) => (
                    <SelectItem key={c.id} value={c.code}>
                      {c.symbol} {c.code} — {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Amount</Label>
              <NumberInput min={0} value={form.amount} onValueChange={(v) => setForm({ ...form, amount: v })} />
            </div>
            <div>
              <Label>Probability (%)</Label>
              <NumberInput min={0} max={100} value={form.probability} onValueChange={(v) => setForm({ ...form, probability: v })} />
            </div>
            <div>
              <Label>Close Date</Label>
              <Input type="date" value={form.close_date} onChange={(e) => setForm({ ...form, close_date: e.target.value })} />
            </div>
            <div>
              <Label>Payment Terms</Label>
              <Select value={form.payment_terms || "none"} onValueChange={(v) => setForm({ ...form, payment_terms: v === "none" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="Select terms" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {paymentTerms.map((p) => <SelectItem key={p.id} value={p.name}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Opportunity Source</Label>
              <Select value={form.opportunity_source_id || "none"} onValueChange={(v) => setForm({ ...form, opportunity_source_id: v === "none" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="Select source" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {sources.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </Section>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Requirements</h3>
              <Button type="button" size="sm" variant="outline" onClick={elaborate} disabled={aiLoading}>
                {aiLoading ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 mr-1" />}
                AI Elaborate
              </Button>
            </div>
            <Textarea
              rows={5}
              placeholder="Brief requirements notes… click AI Elaborate to expand."
              value={form.requirements_highlights}
              onChange={(e) => setForm({ ...form, requirements_highlights: e.target.value })}
            />
          </div>

          {isEdit && (
            <Section title="Ownership">
              <div className="md:col-span-2">
                <Label>Owner</Label>
                <Select value={form.owner_id || "none"} onValueChange={(v) => setForm({ ...form, owner_id: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="Select owner" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Unassigned</SelectItem>
                    {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.full_name || u.username || u.email}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </Section>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!canSubmit}>{opportunity ? "Save" : "Create"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
