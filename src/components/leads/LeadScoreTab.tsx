import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

import { Button } from "@/components/ui/button";
import { differenceInCalendarDays, format } from "date-fns";
import { Link } from "react-router-dom";
import { Settings2, Check, X } from "lucide-react";
import { LeadRow, useLeadStatuses, statusColorClasses } from "@/hooks/useLeadsEvents";
import {
  useLeadScoringRules, useLeadActivityCount, activityScore, ageScore, statusScore,
  qualificationLevel, ContactRole, CONTACT_ROLE_LABELS,
  budgetScore, budgetTier, closeDateScore, closeDateTier, needScore, needTier,
} from "@/hooks/useLeadScoring";

export function LeadScoreTab({ lead }: { lead: LeadRow & { contact_role?: string | null } }) {
  const { rules } = useLeadScoringRules();
  const { data: statuses = [] } = useLeadStatuses(false);
  const { data: activityCount = 0 } = useLeadActivityCount(lead.id);

  const l = lead as any;
  const status = statuses.find((s) => s.id === lead.lead_status_id);
  const ageDays = differenceInCalendarDays(new Date(), new Date(lead.created_at));
  const contactRole = (lead.contact_role || "unknown") as ContactRole;

  const sBudget = budgetScore(l.indicative_budget, l.opportunity_value, rules);
  const bTier = budgetTier(l.indicative_budget, l.opportunity_value, rules);
  const sRole = rules.contactRoleScores[contactRole] ?? 0;
  const sNeed = needScore(lead.researched_information, rules);
  const nTier = needTier(lead.researched_information, rules);
  const sClose = closeDateScore(l.opportunity_close_date, rules);
  const cTier = closeDateTier(l.opportunity_close_date);

  const sStatus = statusScore(status?.name, rules);
  const sAct = activityScore(activityCount, rules);
  const sAge = ageScore(ageDays, rules);

  const total = sBudget + sRole + sNeed + sClose + sStatus + sAct + sAge;
  const level = qualificationLevel(total, rules);
  const levelClass =
    level === "High" ? "bg-emerald-100 text-emerald-700"
    : level === "Medium" ? "bg-amber-100 text-amber-700"
    : "bg-rose-100 text-rose-700";

  const money = (v: any) => (v != null && v !== "" ? `₹${Number(v).toLocaleString("en-IN")}` : null);

  const budgetLabel =
    bTier === "aligned" ? `${money(l.indicative_budget)} · within ${rules.budget.tolerancePct}% of opportunity value`
    : bTier === "shared" ? `${money(l.indicative_budget)} · shared`
    : "Not shared";

  const closeLabel =
    cTier === "none" ? "Not set"
    : `${format(new Date(l.opportunity_close_date), "dd MMM yyyy")} · ${cTier === "thisMonth" ? "This month" : cTier === "nextMonth" ? "Next month" : "Later"}`;

  const needLabel =
    nTier === "clear" ? "Requirement clearly captured"
    : nTier === "vague" ? "Requirement entered but brief"
    : "Requirement not entered";

  const Row = ({ label, value, score, hint }: any) => (
    <div className="flex items-center justify-between gap-3 py-2 border-b last:border-0">
      <div className="text-sm min-w-0">
        <div className="text-muted-foreground text-xs">{label}</div>
        <div className="break-words">{value}</div>
        {hint && <div className="text-[11px] text-muted-foreground mt-0.5">{hint}</div>}
      </div>
      <Badge variant="secondary" className="font-mono shrink-0">{score} pts</Badge>
    </div>
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs text-muted-foreground">Total BANT Score</div>
            <div className="text-4xl font-bold">{total}</div>
          </div>
          <Badge className={`${levelClass} text-base px-4 py-1.5`}>{level} Qualification</Badge>
          <Button size="sm" variant="ghost" asChild>
            <Link to="/master-data/lead-scoring"><Settings2 className="h-4 w-4 mr-1" />View scoring rules</Link>
          </Button>

        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">BANT Breakdown</CardTitle></CardHeader>
        <CardContent className="space-y-1">
          <Row label="Budget (Indicative Budget from Overview)" value={budgetLabel} score={sBudget} />

          <div className="flex items-center justify-between py-2 border-b">
            <div className="text-sm flex-1">
              <div className="text-muted-foreground text-xs mb-1">
                Authority — Contact Role <span className="opacity-70">(from Overview)</span>
              </div>
              <div>{CONTACT_ROLE_LABELS[contactRole] ?? "Unknown"}</div>
            </div>
            <Badge variant="secondary" className="font-mono">{sRole} pts</Badge>
          </div>

          <Row
            label="Need (Requirement Overview)"
            value={
              <span className="inline-flex items-center gap-1.5">
                {nTier === "none"
                  ? <X className="h-4 w-4 text-rose-600" />
                  : <Check className={`h-4 w-4 ${nTier === "clear" ? "text-emerald-600" : "text-amber-600"}`} />}
                {needLabel}
              </span>
            }
            score={sNeed}
          />

          <Row label="Timeline — Close Date (from Overview)" value={closeLabel} score={sClose} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Engagement</CardTitle></CardHeader>
        <CardContent className="space-y-1">
          <Row label="Lead Status" value={status ? <Badge className={statusColorClasses(status.color)}>{status.name}</Badge> : "—"} score={sStatus} />
          <Row label="Total Activities" value={activityCount} score={sAct} />
          <Row label="Lead Age" value={`${ageDays} day${ageDays === 1 ? "" : "s"}`} score={sAge} />
        </CardContent>
      </Card>
    </div>
  );
}
