import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { CheckCircle2, AlertTriangle, Clock, HelpCircle, Hourglass } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { format, addDays, differenceInCalendarDays, parseISO } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { LeadRow, useLeadAuditLog } from "@/hooks/useLeadsEvents";

type LeadSlaFields = {
  actual_first_contact_date?: string | null;
  created_by?: string | null;
};

const STAGES = [
  { key: "contacted", match: "contacted", label: "Contacted", offset: 0 },
  { key: "interest", match: "shown interest", label: "Shows Interest", offset: 5 },
  { key: "quote", match: "quote submitted", label: "Quote Submitted", offset: 10 },
  { key: "won", match: "close won", label: "Close Won", offset: 25 },
] as const;

type FlagKind = "met" | "breached" | "pending" | "overdue" | "na";

const FLAG_META: Record<FlagKind, { label: string; cls: string }> = {
  met: { label: "Met", cls: "bg-emerald-100 text-emerald-700" },
  breached: { label: "Breached", cls: "bg-rose-100 text-rose-700" },
  pending: { label: "Pending", cls: "bg-blue-100 text-blue-700" },
  overdue: { label: "Overdue", cls: "bg-amber-100 text-amber-800" },
  na: { label: "Not started", cls: "bg-muted text-muted-foreground" },
};

function Help({ text }: { text: string }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" className="text-muted-foreground hover:text-foreground">
            <HelpCircle className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-[240px] text-xs">{text}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function LeadSlaTab({ lead }: { lead: LeadRow & LeadSlaFields }) {
  const { data: audit = [] } = useLeadAuditLog(lead.id);
  const [creatorName, setCreatorName] = useState<string>("");

  useEffect(() => {
    (async () => {
      if (!lead.created_by) return;
      const { data } = await supabase.from("users").select("full_name, username, email").eq("id", lead.created_by).maybeSingle();
      if (data) setCreatorName((data as any).full_name || (data as any).username || (data as any).email || "");
    })();
  }, [lead.created_by]);

  // Any status that means the lead has moved beyond enquiry into a productive stage
  const PRODUCTIVE = [
    "contacted",
    "shown interest",
    "shows interest",
    "quote submitted",
    "negotiation",
    "close won",
    "closed won",
  ];

  // Actual stage dates derived from the lead audit log (first time the stage was reached)
  const actuals = useMemo(() => {
    const map: Record<string, string | null> = {};
    const rows = [...(audit as any[])].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );
    for (const s of STAGES) {
      const hit = rows.find(
        (r) => String(r.to_value || "").trim().toLowerCase() === s.match,
      );
      map[s.key] = hit ? String(hit.created_at).slice(0, 10) : null;
    }
    // Contact date = first move into ANY productive stage (handles skipped "Contacted")
    const firstProductive = rows.find((r) =>
      PRODUCTIVE.includes(String(r.to_value || "").trim().toLowerCase()),
    );
    if (firstProductive) {
      map.contacted = String(firstProductive.created_at).slice(0, 10);
    }
    if (!map.contacted && lead.actual_first_contact_date) {
      map.contacted = String(lead.actual_first_contact_date).slice(0, 10);
    }
    return map;
  }, [audit, lead.actual_first_contact_date]);

  const contactDate = actuals.contacted;

  const rows = STAGES.filter((s) => s.key !== "contacted").map((s) => {
    const target = contactDate
      ? format(addDays(parseISO(contactDate), s.offset), "yyyy-MM-dd")
      : null;
    const actual = actuals[s.key];
    let flag: FlagKind = "na";
    let variance: number | null = null;
    if (target && actual) {
      variance = differenceInCalendarDays(parseISO(actual), parseISO(target));
      flag = variance <= 0 ? "met" : "breached";
    } else if (target) {
      variance = differenceInCalendarDays(new Date(), parseISO(target));
      flag = variance > 0 ? "overdue" : "pending";
    }
    return { ...s, target, actual, flag, variance };
  });

  const overall: { label: string; cls: string; icon: any } = (() => {
    if (!contactDate) return { label: "Not Started", cls: "bg-muted text-muted-foreground", icon: Hourglass };
    if (rows.some((r) => r.flag === "breached" || r.flag === "overdue"))
      return { label: "SLA Breached", cls: "bg-rose-100 text-rose-700", icon: AlertTriangle };
    if (rows.every((r) => r.flag === "met"))
      return { label: "SLA Met", cls: "bg-emerald-100 text-emerald-700", icon: CheckCircle2 };
    return { label: "On Track", cls: "bg-blue-100 text-blue-700", icon: Clock };
  })();

  const OverallIcon = overall.icon;
  const fmt = (d?: string | null) => (d ? format(parseISO(d), "dd MMM yyyy") : "—");

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs text-muted-foreground">Overall SLA Status</div>
            <Badge className={`${overall.cls} text-base px-4 py-1.5 mt-1`}>
              <OverallIcon className="h-4 w-4 mr-1" />{overall.label}
            </Badge>
          </div>
          <div className="text-right">
            <div className="text-xs text-muted-foreground flex items-center justify-end gap-1">
              Actual Contact Date
              <Help text="Auto-captured on the date the lead first moved into any productive stage — Contacted, Shown Interest, Quote Submitted, Negotiation or Close Won — even if Contacted was skipped." />
            </div>
            <div className="text-lg font-semibold">{fmt(contactDate)}</div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">SLA Tracking</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="hidden md:grid grid-cols-[1.2fr_1fr_1fr_0.8fr] gap-3 text-xs font-medium text-muted-foreground px-1">
            <div>Milestone</div><div>Target SLA</div><div>Actual SLA</div><div>SLA Flag</div>
          </div>

          {rows.map((r) => (
            <div
              key={r.key}
              className="grid grid-cols-2 md:grid-cols-[1.2fr_1fr_1fr_0.8fr] gap-2 md:gap-3 items-center border rounded-lg p-3"
            >
              <div className="col-span-2 md:col-span-1 text-sm font-medium">{r.label}</div>

              <div>
                <div className="md:hidden text-[11px] text-muted-foreground flex items-center gap-1">
                  Target SLA
                  <Help text={`Actual Contact Date + ${r.offset} days`} />
                </div>
                <div className="text-sm flex items-center gap-1">
                  {fmt(r.target)}
                  <span className="hidden md:inline"><Help text={`Target ${r.label} Date = Actual Contact Date + ${r.offset} days`} /></span>
                </div>
              </div>

              <div>
                <div className="md:hidden text-[11px] text-muted-foreground flex items-center gap-1">
                  Actual SLA
                  <Help text={`Date on which the lead stage moved to “${r.label}”`} />
                </div>
                <div className="text-sm flex items-center gap-1">
                  {fmt(r.actual)}
                  <span className="hidden md:inline"><Help text={`Auto-captured date on which the lead stage first moved to “${r.label}”`} /></span>
                </div>
              </div>

              <div className="flex flex-col items-start gap-1">
                <Badge className={FLAG_META[r.flag].cls}>{FLAG_META[r.flag].label}</Badge>
                {r.variance !== null && r.flag !== "na" && (
                  <span className="text-[11px] text-muted-foreground">
                    {r.variance === 0
                      ? "On target date"
                      : r.variance > 0
                      ? `${r.variance} day${r.variance === 1 ? "" : "s"} late`
                      : `${Math.abs(r.variance)} day${Math.abs(r.variance) === 1 ? "" : "s"} early`}
                  </span>
                )}
              </div>
            </div>
          ))}

          {!contactDate && (
            <p className="text-xs text-muted-foreground">
              Target SLA dates appear once the lead status moves to “Contacted”.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Lead Origin</CardTitle></CardHeader>
        <CardContent>
          <Label className="text-xs text-muted-foreground">Created By</Label>
          <div className="text-sm mt-1">
            {creatorName || (lead.created_by ? "—" : "System")} · {format(new Date(lead.created_at), "dd MMM yyyy, HH:mm")}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
