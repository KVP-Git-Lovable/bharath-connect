import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { Settings2 } from "lucide-react";
import { differenceInCalendarDays } from "date-fns";
import {
  useOpportunityScoringRules, qualificationLevel,
  BUDGET_LABELS, AUTHORITY_LABELS, NEED_LABELS, TIMELINE_LABELS,
  BudgetStatus, AuthorityRole, NeedLevel, TimelineTier,
} from "@/hooks/useOpportunityScoring";
import { useUpdateOpportunity } from "@/hooks/useCustomers";

function autoTimeline(closeDate: string | null | undefined): TimelineTier {
  if (!closeDate) return "unclear";
  const d = differenceInCalendarDays(new Date(closeDate), new Date());
  if (d <= 30) return "immediate";
  if (d <= 90) return "this_quarter";
  if (d <= 180) return "next_quarter";
  return "unclear";
}

export function OpportunityBantTab({ opp }: { opp: any }) {
  const { rules } = useOpportunityScoringRules();
  const update = useUpdateOpportunity();

  const budget = (opp.budget_status || "unknown") as BudgetStatus;
  const authority = (opp.authority_role || "unknown") as AuthorityRole;
  const need = (opp.need_level || "unclear") as NeedLevel;
  const timeline = (opp.timeline || autoTimeline(opp.close_date)) as TimelineTier;

  const sB = rules.budget[budget] ?? 0;
  const sA = rules.authority[authority] ?? 0;
  const sN = rules.need[need] ?? 0;
  const sT = rules.timeline[timeline] ?? 0;
  const total = sB + sA + sN + sT;
  const level = qualificationLevel(total, rules);
  const levelCls = level === "High" ? "bg-emerald-100 text-emerald-700"
    : level === "Medium" ? "bg-amber-100 text-amber-700"
    : "bg-rose-100 text-rose-700";

  const setField = (field: string, value: string) =>
    update.mutate({ id: opp.id, [field]: value } as any);

  const RowSelect = ({ label, field, value, options, score }:
    { label: string; field: string; value: string; options: Record<string, string>; score: number }) => (
    <div className="flex items-center justify-between py-2 border-b last:border-0 gap-3">
      <div className="text-sm flex-1 min-w-0">
        <div className="text-muted-foreground text-xs mb-1">{label}</div>
        <Select value={value} onValueChange={(v) => setField(field, v)}>
          <SelectTrigger className="w-full max-w-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {Object.entries(options).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
          </SelectContent>
        </Select>
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
          <Badge className={`${levelCls} text-base px-4 py-1.5`}>{level} Qualification</Badge>
          <Button size="sm" variant="ghost" asChild>
            <Link to="/master-data/opportunity-scoring"><Settings2 className="h-4 w-4 mr-1" />Configure rules</Link>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">BANT Breakdown</CardTitle></CardHeader>
        <CardContent className="space-y-1">
          <RowSelect label="Budget" field="budget_status" value={budget} options={BUDGET_LABELS} score={sB} />
          <RowSelect label="Authority (Contact Role)" field="authority_role" value={authority} options={AUTHORITY_LABELS} score={sA} />
          <RowSelect label="Need" field="need_level" value={need} options={NEED_LABELS} score={sN} />
          <RowSelect label="Timeline" field="timeline" value={timeline} options={TIMELINE_LABELS} score={sT} />
          {!opp.timeline && opp.close_date && (
            <p className="text-[11px] text-muted-foreground pt-2">
              Timeline auto-derived from close date. Select a value above to override.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
