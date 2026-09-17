import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Upload, AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import {
  parseQuotationWorkbook, buildImportPlan, resolveUser, resolveStatus,
  type ImportPlan,
} from "@/lib/leadQuotationImport";

type Stage = "idle" | "parsing" | "preview" | "importing" | "done";

export default function ImportQuotationsDialog({ open, onOpenChange, onImported }: {
  open: boolean; onOpenChange: (v: boolean) => void; onImported: () => void;
}) {
  const { userId } = useCurrentUser();
  const [stage, setStage] = useState<Stage>("idle");
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [users, setUsers] = useState<{ id: string; full_name: string }[]>([]);
  const [statuses, setStatuses] = useState<{ id: string; name: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ leadsCreated: number; quotationsAdded: number } | null>(null);

  const reset = () => { setStage("idle"); setPlan(null); setError(null); setResult(null); };

  const handleFile = async (file: File) => {
    setStage("parsing");
    setError(null);
    try {
      const [rows, leadsRes, usersRes, statusesRes] = await Promise.all([
        parseQuotationWorkbook(file),
        supabase.from("leads").select("id, company, name"),
        supabase.from("users").select("id, full_name"),
        supabase.from("master_lead_statuses" as any).select("id, name"),
      ]);
      if (!rows.length) throw new Error("No data rows found in this file.");
      const u = (usersRes.data || []) as any[];
      const s = (statusesRes.data || []) as any[];
      setUsers(u);
      setStatuses(s);
      setPlan(buildImportPlan(rows, (leadsRes.data || []) as any, u, s));
      setStage("preview");
    } catch (e: any) {
      setError(e?.message || "Could not read this file");
      setStage("idle");
    }
  };

  const runImport = async () => {
    if (!plan) return;
    setStage("importing");
    let leadsCreated = 0;
    let quotationsAdded = 0;
    try {
      for (const group of plan.groups) {
        let leadId = group.existingLeadId;
        if (!leadId) {
          const lastRow = group.rows[group.rows.length - 1];
          const followedByUser = resolveUser(users, lastRow.followed_by_raw);
          const status = resolveStatus(statuses, lastRow.status_raw);
          const { data: newLead, error: leadErr } = await supabase
            .from("leads")
            .insert({
              name: group.companyDisplay,
              company: group.companyDisplay,
              contact_role: "unknown",
              lead_status_id: status?.id ?? null,
              owner_id: followedByUser?.id ?? null,
              created_by: userId ?? null,
            } as any)
            .select("id")
            .single();
          if (leadErr || !newLead) throw new Error(leadErr?.message || "Could not create a lead for " + group.companyDisplay);
          leadId = (newLead as any).id;
          leadsCreated++;
        }

        const quotationRows = group.rows.map((row) => {
          const followedByUser = resolveUser(users, row.followed_by_raw);
          const status = resolveStatus(statuses, row.status_raw);
          return {
            lead_id: leadId,
            enquiry_number: row.enquiry_number,
            enquiry_received_date: row.enquiry_received_date,
            quotation_number: row.quotation_number,
            quotation_date: row.quotation_date,
            value_without_gst: row.value_without_gst,
            followed_by_user_id: followedByUser?.id ?? null,
            followed_by_name: row.followed_by_raw,
            status_id: status?.id ?? null,
            status_name: row.status_raw,
            po_date: row.po_date,
            po_number: row.po_number,
            po_amount: row.po_amount,
            remarks: row.remarks,
            created_by: userId ?? null,
          };
        });
        const { error: qErr } = await supabase.from("lead_quotations" as any).insert(quotationRows as any);
        if (qErr) throw new Error(qErr.message);
        quotationsAdded += quotationRows.length;
      }
      setResult({ leadsCreated, quotationsAdded });
      setStage("done");
      onImported();
    } catch (e: any) {
      toast.error(e?.message || "Import failed partway through — some rows may already be saved");
      setStage("preview");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Import Quotations</DialogTitle></DialogHeader>

        {stage === "idle" && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Upload the Enquiry Followup Register (.xlsx). Each row becomes a quotation; rows for the
              same customer are grouped under one Lead — a new Lead is created if none matches by company name.
            </p>
            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border border-dashed p-8 text-center hover:bg-muted/40">
              <Upload className="h-6 w-6 text-muted-foreground" />
              <span className="text-sm">Click to choose a .xlsx file</span>
              <input type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
            </label>
            {error && <p className="flex items-center gap-1.5 text-sm text-destructive"><AlertTriangle className="h-4 w-4" />{error}</p>}
          </div>
        )}

        {stage === "parsing" && (
          <div className="flex flex-col items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />Reading file…
          </div>
        )}

        {stage === "preview" && plan && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2 text-center text-sm">
              <div className="rounded-md border p-3"><div className="text-lg font-bold">{plan.newLeadCount}</div><div className="text-xs text-muted-foreground">New Leads</div></div>
              <div className="rounded-md border p-3"><div className="text-lg font-bold">{plan.existingLeadCount}</div><div className="text-xs text-muted-foreground">Existing Leads Matched</div></div>
              <div className="rounded-md border p-3"><div className="text-lg font-bold">{plan.totalQuotations}</div><div className="text-xs text-muted-foreground">Quotations</div></div>
            </div>
            {(plan.unmatchedFollowedBy.length > 0 || plan.unmatchedStatus.length > 0) && (
              <div className="rounded-md border border-warning/40 bg-warning/5 p-3 text-xs space-y-1">
                <p className="flex items-center gap-1.5 font-medium text-warning"><AlertTriangle className="h-3.5 w-3.5" />Some values didn't match your system and will be kept as plain text:</p>
                {plan.unmatchedFollowedBy.length > 0 && <p>Followed By: {plan.unmatchedFollowedBy.join(", ")}</p>}
                {plan.unmatchedStatus.length > 0 && <p>Status: {plan.unmatchedStatus.join(", ")}</p>}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={reset}>Choose Different File</Button>
              <Button onClick={runImport}>Import {plan.totalQuotations} Quotations</Button>
            </div>
          </div>
        )}

        {stage === "importing" && (
          <div className="flex flex-col items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />Importing…
          </div>
        )}

        {stage === "done" && result && (
          <div className="space-y-4 py-4 text-center">
            <CheckCircle2 className="h-8 w-8 mx-auto text-success" />
            <p className="text-sm">Created <strong>{result.leadsCreated}</strong> new leads and added <strong>{result.quotationsAdded}</strong> quotations.</p>
            <Button onClick={() => onOpenChange(false)}>Done</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
