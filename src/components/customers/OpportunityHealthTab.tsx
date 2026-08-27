import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { CheckCircle2, AlertTriangle, XCircle, Settings2 } from "lucide-react";
import { differenceInCalendarDays } from "date-fns";
import { useOpportunityScoringRules } from "@/hooks/useOpportunityScoring";
import { useCustomerActivities, useMilestones, useQuotes } from "@/hooks/useCustomers";

type Health = "green" | "amber" | "red";

function healthIcon(h: Health) {
  if (h === "green") return <CheckCircle2 className="h-5 w-5 text-emerald-600" />;
  if (h === "amber") return <AlertTriangle className="h-5 w-5 text-amber-600" />;
  return <XCircle className="h-5 w-5 text-rose-600" />;
}

function healthClass(h: Health) {
  return h === "green" ? "bg-emerald-100 text-emerald-700"
    : h === "amber" ? "bg-amber-100 text-amber-700"
    : "bg-rose-100 text-rose-700";
}

export function OpportunityHealthTab({ opp }: { opp: any }) {
  const { rules } = useOpportunityScoringRules();
  const { data: activities = [] } = useCustomerActivities(opp.id);
  const { data: milestones = [] } = useMilestones(opp.id);
  const { data: quotes = [] } = useQuotes(opp.id);

  const now = new Date();
  const daysInStage = differenceInCalendarDays(now, new Date(opp.stage_changed_at || opp.updated_at || opp.created_at));
  const lastActivity = activities[0]?.activity_date ? new Date(activities[0].activity_date) : null;
  const daysSinceActivity = lastActivity ? differenceInCalendarDays(now, lastActivity) : Number.POSITIVE_INFINITY;
  const daysToClose = opp.close_date ? differenceInCalendarDays(new Date(opp.close_date), now) : null;

  const stageHealth: Health =
    daysInStage >= rules.health.daysInStageBad ? "red"
    : daysInStage >= rules.health.daysInStageWarn ? "amber"
    : "green";

  const activityHealth: Health = !lastActivity
    ? "red"
    : daysSinceActivity >= rules.health.daysSinceActivityBad ? "red"
    : daysSinceActivity >= rules.health.daysSinceActivityWarn ? "amber"
    : "green";

  const earlyStages = ["Discovery", "Prospecting", "Qualification", "Proposal", "New"];
  const closeHealth: Health =
    daysToClose === null ? "amber"
    : daysToClose < 0 ? "red"
    : (daysToClose <= rules.health.closeSoonDays && earlyStages.includes(opp.stage ?? "")) ? "red"
    : daysToClose <= rules.health.closeSoonDays ? "amber"
    : "green";

  const syncedQuote = quotes.find((q: any) => q.is_synced);
  const quoteHealth: Health = syncedQuote ? "green" : quotes.length > 0 ? "amber" : "red";

  const today = new Date().toISOString().slice(0, 10);
  const overdueMs = milestones.filter((m: any) => m.status !== "Paid" && m.invoice_date && m.invoice_date < today);
  const milestoneHealth: Health = milestones.length === 0 ? "amber"
    : overdueMs.length > 0 ? "red"
    : "green";

  const factors = [
    { label: "Days in Current Stage", value: `${daysInStage} days`, health: stageHealth,
      hint: `Warn ≥ ${rules.health.daysInStageWarn}d, Bad ≥ ${rules.health.daysInStageBad}d` },
    { label: "Days Since Last Activity", value: lastActivity ? `${daysSinceActivity} days` : "No activities",
      health: activityHealth, hint: `Warn ≥ ${rules.health.daysSinceActivityWarn}d, Bad ≥ ${rules.health.daysSinceActivityBad}d` },
    { label: "Close Date Proximity", value: daysToClose === null ? "No close date" : daysToClose < 0 ? `${Math.abs(daysToClose)} days overdue` : `${daysToClose} days remaining`,
      health: closeHealth, hint: `Soon threshold: ${rules.health.closeSoonDays}d` },
    { label: "Quote Status", value: syncedQuote ? "Synced quote present" : quotes.length ? `${quotes.length} quote(s), none synced` : "No quotes",
      health: quoteHealth },
    { label: "Payment Milestone Status", value: milestones.length === 0 ? "No milestones" : overdueMs.length ? `${overdueMs.length} overdue` : `${milestones.length} on track`,
      health: milestoneHealth },
  ];

  const reds = factors.filter((f) => f.health === "red").length;
  const ambers = factors.filter((f) => f.health === "amber").length;
  const overall: { label: string; cls: string } =
    reds >= 2 ? { label: "Stalled", cls: healthClass("red") }
    : reds >= 1 || ambers >= 2 ? { label: "At Risk", cls: healthClass("amber") }
    : { label: "Healthy", cls: healthClass("green") };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs text-muted-foreground">Overall Health</div>
            <Badge className={`${overall.cls} text-base px-4 py-1.5 mt-1`}>{overall.label}</Badge>
          </div>
          <div className="text-sm text-muted-foreground">
            {reds} red · {ambers} amber · {factors.length - reds - ambers} green
          </div>
          <Button size="sm" variant="ghost" asChild>
            <Link to="/master-data/opportunity-scoring"><Settings2 className="h-4 w-4 mr-1" />Configure thresholds</Link>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Health Factors</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {factors.map((f) => (
            <div key={f.label} className="flex items-start justify-between gap-3 py-2 border-b last:border-0">
              <div className="flex items-start gap-3 min-w-0">
                {healthIcon(f.health)}
                <div className="min-w-0">
                  <div className="text-sm font-medium">{f.label}</div>
                  <div className="text-xs text-muted-foreground">{f.value}</div>
                  {f.hint && <div className="text-[11px] text-muted-foreground/70 mt-0.5">{f.hint}</div>}
                </div>
              </div>
              <Badge className={`${healthClass(f.health)} shrink-0`}>{f.health.toUpperCase()}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
