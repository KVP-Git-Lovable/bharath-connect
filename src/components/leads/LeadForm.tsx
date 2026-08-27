import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sparkles, Loader2, MapPin, Target } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { BusinessCardScanner } from "./BusinessCardScanner";
import { getCurrentPosition } from "@/utils/nativePermissions";
import {
  LeadRow, useSaveLead, useLeadStatuses, useLeadSources, useEvents, useIndustries,
} from "@/hooks/useLeadsEvents";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { CONTACT_ROLE_LABELS, ContactRole } from "@/hooks/useLeadScoring";

export function LeadForm({
  open, onOpenChange, lead, defaultEventId,
}: { open: boolean; onOpenChange: (v: boolean) => void; lead?: LeadRow; defaultEventId?: string }) {
  const save = useSaveLead();
  const { data: statuses = [] } = useLeadStatuses();
  const { data: sources = [] } = useLeadSources();
  const { data: industries = [] } = useIndustries();
  const { data: events = [] } = useEvents();
  const { userId } = useCurrentUser();

  const emptyForm = {
    name: "", title: "", contact_role: "unknown", company: "", email: "", phone: "", website: "", address: "", industry: "",
    lead_status_id: "", lead_source_id: "", related_event_id: defaultEventId ?? "",
    business_card_url: "", researched_information: "", indicative_budget: "",
    opportunity_value: "", opportunity_close_date: "", opportunity_probability: "",
  };
  const [f, setF] = useState(emptyForm);
  const [isElaborating, setIsElaborating] = useState(false);
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    if (lead) {
      const l = lead as any;
      setF({
        name: lead.name, title: lead.title ?? "", contact_role: l.contact_role ?? "unknown", company: lead.company ?? "",
        email: lead.email ?? "", phone: lead.phone ?? "", website: lead.website ?? "",
        address: lead.address ?? "", industry: lead.industry ?? "",
        lead_status_id: lead.lead_status_id ?? "",
        lead_source_id: lead.lead_source_id ?? "",
        related_event_id: lead.related_event_id ?? "",
        business_card_url: lead.business_card_url ?? "",
        researched_information: lead.researched_information ?? "",
        indicative_budget: l.indicative_budget != null ? String(l.indicative_budget) : "",
        opportunity_value: l.opportunity_value != null ? String(l.opportunity_value) : "",
        opportunity_close_date: l.opportunity_close_date ?? "",
        opportunity_probability: l.opportunity_probability != null ? String(l.opportunity_probability) : "",
      });
    } else {
      setF({ ...emptyForm, related_event_id: defaultEventId ?? "" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead, open, defaultEventId]);


  useEffect(() => {
    if (!lead && !f.lead_status_id && statuses.length) {
      setF((prev) => ({ ...prev, lead_status_id: statuses[0].id }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statuses, lead]);

  const applyScanned = (d: any, path: string) => {
    setF((p) => ({
      ...p,
      name: d.name || p.name,
      title: d.title || p.title,
      company: d.company || p.company,
      email: d.email || p.email,
      phone: d.phone || p.phone,
      website: d.website || p.website,
      address: d.address || p.address,
      business_card_url: path,
    }));
  };

  const handleElaborate = async () => {
    if (!f.company.trim() && !f.name.trim() && !f.researched_information.trim()) {
      toast.error("Add a name, company, or some notes first");
      return;
    }
    setIsElaborating(true);
    try {
      const { data, error } = await supabase.functions.invoke("elaborate-lead-research", {
        body: {
          name: f.name, designation: f.title, company: f.company,
          industry: f.industry, website: f.website, draft: f.researched_information,
        },
      });
      if (error) throw error;
      if (data?.error) { toast.error(data.error); return; }
      if (data?.details) {
        setF((prev) => ({ ...prev, researched_information: data.details }));
        toast.success("Research generated");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to generate research");
    } finally {
      setIsElaborating(false);
    }
  };

  const captureLocation = async () => {
    setLocating(true);
    try {
      const pos = await getCurrentPosition();
      let address = `${pos.latitude.toFixed(6)}, ${pos.longitude.toFixed(6)}`;
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${pos.latitude}&lon=${pos.longitude}&format=json`
        );
        const geo = await res.json();
        if (geo?.display_name) address = geo.display_name;
      } catch { /* keep coordinates */ }
      setF((p) => ({ ...p, address }));
      toast.success("Address captured from your location");
    } catch (err: any) {
      toast.error(err?.message || "Could not get your location");
    } finally {
      setLocating(false);
    }
  };

  const submit = async () => {
    if (!f.name.trim()) return;
    await save.mutateAsync({
      id: lead?.id,
      name: f.name.trim(),
      title: f.title || null,
      contact_role: f.contact_role || "unknown",
      company: f.company || null,
      email: f.email || null,
      phone: f.phone || null,
      website: f.website || null,
      address: f.address || null,
      industry: f.industry || null,
      lead_status_id: f.lead_status_id || null,
      lead_source_id: f.lead_source_id || null,
      related_event_id: f.related_event_id || null,
      business_card_url: f.business_card_url || null,
      researched_information: f.researched_information.trim() || null,
      indicative_budget: f.indicative_budget === "" ? null : Number(f.indicative_budget),
      opportunity_value: f.opportunity_value === "" ? null : Number(f.opportunity_value),
      opportunity_close_date: f.opportunity_close_date || null,
      opportunity_probability: f.opportunity_probability === "" ? null : Number(f.opportunity_probability),
      owner_id: lead?.owner_id ?? userId ?? null,
      ...(lead?.id ? {} : { created_by: userId ?? null }),
    } as any);

    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="pr-8">
          <DialogTitle className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <span>{lead ? "Edit Lead" : "New Lead"}</span>
            {!lead && <BusinessCardScanner onScanned={applyScanned} />}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div><Label>Name *</Label><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
            <div><Label>Designation</Label><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
            <div>
              <Label>Contact Role</Label>
              <Select value={f.contact_role || "unknown"} onValueChange={(v) => setF({ ...f, contact_role: v })}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(CONTACT_ROLE_LABELS) as ContactRole[]).map((r) => (
                    <SelectItem key={r} value={r}>{CONTACT_ROLE_LABELS[r]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Company</Label><Input value={f.company} onChange={(e) => setF({ ...f, company: e.target.value })} /></div>
            <div>
              <Label>Industry</Label>
              <Select value={f.industry} onValueChange={(v) => setF({ ...f, industry: v })}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>{industries.map((i) => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Email</Label><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
            <div><Label>Phone</Label><Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></div>
            <div><Label>Website</Label><Input value={f.website} onChange={(e) => setF({ ...f, website: e.target.value })} /></div>
            <div>
              <Label>Status</Label>
              <Select value={f.lead_status_id} onValueChange={(v) => setF({ ...f, lead_status_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>{statuses.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Source</Label>
              <Select value={f.lead_source_id} onValueChange={(v) => setF({ ...f, lead_source_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>{sources.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>


          <div>
            <div className="flex items-center justify-between mb-1">
              <Label>Address</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={captureLocation}
                disabled={locating}
                aria-label="Use my current location"
              >
                {locating ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <MapPin className="h-4 w-4 mr-1" />}
                Use location
              </Button>
            </div>
            <Textarea rows={2} value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} />
          </div>

          <div className="rounded-lg border p-3 space-y-3">

            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" />
              <Label className="text-sm font-semibold">Opportunity Highlight</Label>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Indicative Budget (₹)</Label>
                <Input
                  inputMode="decimal"
                  placeholder="Budget shared by the customer"
                  value={f.indicative_budget}
                  onChange={(e) => setF({ ...f, indicative_budget: e.target.value.replace(/[^0-9.]/g, "") })}
                />
              </div>
              <div>
                <Label className="text-xs">Opportunity Value (₹)</Label>
                <Input
                  inputMode="decimal"
                  placeholder="0"
                  value={f.opportunity_value}
                  onChange={(e) => setF({ ...f, opportunity_value: e.target.value.replace(/[^0-9.]/g, "") })}
                />
              </div>
              <div>
                <Label className="text-xs">Close Date</Label>
                <Input
                  type="date"
                  value={f.opportunity_close_date}
                  onChange={(e) => setF({ ...f, opportunity_close_date: e.target.value })}
                />
              </div>
              <div>
                <Label className="text-xs">Probability of Win (%)</Label>
                <Input
                  inputMode="numeric"
                  placeholder="0"
                  value={f.opportunity_probability}
                  onChange={(e) => {
                    const v = e.target.value.replace(/[^0-9]/g, "");
                    if (v === "" || Number(v) <= 100) setF({ ...f, opportunity_probability: v });
                  }}
                />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <Label className="text-xs">Requirement Overview</Label>
                <Button type="button" variant="outline" size="sm" onClick={handleElaborate} disabled={isElaborating}>
                  {isElaborating ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}
                  AI Elaborate
                </Button>
              </div>
              <Textarea
                rows={5}
                placeholder="What the customer needs — scope, products/services, quantities, timelines and budget. You can also add background research: company size, recent news, pain points and competition… or leave blank and click AI Elaborate."
                value={f.researched_information}
                onChange={(e) => setF({ ...f, researched_information: e.target.value })}
              />
            </div>
          </div>
        </div>
        <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!f.name.trim() || save.isPending}>{lead ? "Save" : "Create"}</Button>
        </DialogFooter>
      </DialogContent>

    </Dialog>
  );
}
