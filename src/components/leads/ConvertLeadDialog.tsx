import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LeadRow, useConvertLead } from "@/hooks/useLeadsEvents";
import { useCustomers } from "@/hooks/useCustomers";
import { useNavigate } from "react-router-dom";

export function ConvertLeadDialog({
  open, onOpenChange, lead,
}: { open: boolean; onOpenChange: (v: boolean) => void; lead: LeadRow }) {
  const convert = useConvertLead();
  const { data: customers = [] } = useCustomers();
  const nav = useNavigate();

  const [mode, setMode] = useState<"new" | "existing">("new");
  const [existingId, setExistingId] = useState("");
  const [name, setName] = useState("");
  const [oppName, setOppName] = useState("");
  const [amount, setAmount] = useState(0);

  useEffect(() => {
    if (open) {
      setMode("new");
      setName(lead.company || lead.name);
      setOppName(`${lead.company || lead.name} — Opportunity`);
      setAmount(0);
      setExistingId("");
    }
  }, [open, lead]);

  const submit = async () => {
    const payload: Record<string, any> = {
      opportunity_name: oppName || null,
      opportunity_amount: Number(amount) || 0,
    };
    if (mode === "existing") payload.existing_customer_id = existingId;
    else payload.new_customer = { name, email: lead.email, phone: lead.phone, industry: lead.industry, website: lead.website };

    const customerId = await convert.mutateAsync({ leadId: lead.id, payload });
    onOpenChange(false);
    if (customerId) nav(`/customers/${customerId}`);
  };

  const canSubmit = mode === "new" ? name.trim().length > 0 : !!existingId;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Convert Lead to Customer</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <RadioGroup value={mode} onValueChange={(v) => setMode(v as any)} className="space-y-2">
            <div className="flex items-center gap-2"><RadioGroupItem value="new" id="new" /><Label htmlFor="new">Create new customer</Label></div>
            <div className="flex items-center gap-2"><RadioGroupItem value="existing" id="existing" /><Label htmlFor="existing">Link to existing customer</Label></div>
          </RadioGroup>

          {mode === "new" ? (
            <div><Label>Customer Name *</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          ) : (
            <div>
              <Label>Select Customer *</Label>
              <Select value={existingId} onValueChange={setExistingId}>
                <SelectTrigger><SelectValue placeholder="Choose customer" /></SelectTrigger>
                <SelectContent>{customers.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}

          <div className="border-t pt-3 space-y-3">
            <p className="text-xs text-muted-foreground">Optionally create an opportunity for this customer</p>
            <div><Label>Opportunity Name</Label><Input value={oppName} onChange={(e) => setOppName(e.target.value)} /></div>
            <div><Label>Amount</Label><Input type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} /></div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!canSubmit || convert.isPending}>
            {convert.isPending ? "Converting…" : "Convert"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
