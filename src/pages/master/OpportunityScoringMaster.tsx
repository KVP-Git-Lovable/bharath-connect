import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Save } from "lucide-react";
import {
  useOpportunityScoringRules, DEFAULT_OPP_SCORING, OppScoringRules,
  BUDGET_LABELS, AUTHORITY_LABELS, NEED_LABELS, TIMELINE_LABELS,
  BudgetStatus, AuthorityRole, NeedLevel, TimelineTier,
} from "@/hooks/useOpportunityScoring";

export default function OpportunityScoringMaster() {
  const nav = useNavigate();
  const { rules, save, saving } = useOpportunityScoringRules();
  const [draft, setDraft] = useState<OppScoringRules>(rules);
  useEffect(() => setDraft(rules), [rules]);

  const num = (v: string) => Number(v) || 0;

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-3xl mx-auto">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => nav("/master-data")} className="-ml-2">
          <ArrowLeft className="h-4 w-4 mr-1" />Back
        </Button>
        <Button size="sm" onClick={() => save(draft)} disabled={saving}>
          <Save className="h-4 w-4 mr-1" />Save
        </Button>
      </div>
      <div>
        <h1 className="text-2xl font-bold">Opportunity Scoring Rules</h1>
        <p className="text-sm text-muted-foreground">BANT scoring and health thresholds for opportunities</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Budget Scores</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {(Object.keys(BUDGET_LABELS) as BudgetStatus[]).map((k) => (
            <div key={k} className="flex items-center gap-2">
              <Label className="flex-1">{BUDGET_LABELS[k]}</Label>
              <Input type="number" className="w-24" value={draft.budget[k]}
                onChange={(e) => setDraft({ ...draft, budget: { ...draft.budget, [k]: num(e.target.value) } })} />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Authority Scores</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {(Object.keys(AUTHORITY_LABELS) as AuthorityRole[]).map((k) => (
            <div key={k} className="flex items-center gap-2">
              <Label className="flex-1">{AUTHORITY_LABELS[k]}</Label>
              <Input type="number" className="w-24" value={draft.authority[k]}
                onChange={(e) => setDraft({ ...draft, authority: { ...draft.authority, [k]: num(e.target.value) } })} />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Need Scores</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {(Object.keys(NEED_LABELS) as NeedLevel[]).map((k) => (
            <div key={k} className="flex items-center gap-2">
              <Label className="flex-1">{NEED_LABELS[k]}</Label>
              <Input type="number" className="w-24" value={draft.need[k]}
                onChange={(e) => setDraft({ ...draft, need: { ...draft.need, [k]: num(e.target.value) } })} />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Timeline Scores</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {(Object.keys(TIMELINE_LABELS) as TimelineTier[]).map((k) => (
            <div key={k} className="flex items-center gap-2">
              <Label className="flex-1">{TIMELINE_LABELS[k]}</Label>
              <Input type="number" className="w-24" value={draft.timeline[k]}
                onChange={(e) => setDraft({ ...draft, timeline: { ...draft.timeline, [k]: num(e.target.value) } })} />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Qualification Thresholds</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">High (≥)</Label>
            <Input type="number" value={draft.qualification.high} onChange={(e) =>
              setDraft({ ...draft, qualification: { ...draft.qualification, high: num(e.target.value) } })} />
          </div>
          <div>
            <Label className="text-xs">Medium (≥)</Label>
            <Input type="number" value={draft.qualification.medium} onChange={(e) =>
              setDraft({ ...draft, qualification: { ...draft.qualification, medium: num(e.target.value) } })} />
          </div>
          <p className="col-span-2 text-xs text-muted-foreground">
            Defaults: {DEFAULT_OPP_SCORING.qualification.high} / {DEFAULT_OPP_SCORING.qualification.medium}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Health Thresholds</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Days in stage - warn (amber)</Label>
            <Input type="number" value={draft.health.daysInStageWarn} onChange={(e) =>
              setDraft({ ...draft, health: { ...draft.health, daysInStageWarn: num(e.target.value) } })} />
          </div>
          <div>
            <Label className="text-xs">Days in stage - bad (red)</Label>
            <Input type="number" value={draft.health.daysInStageBad} onChange={(e) =>
              setDraft({ ...draft, health: { ...draft.health, daysInStageBad: num(e.target.value) } })} />
          </div>
          <div>
            <Label className="text-xs">Days since activity - warn</Label>
            <Input type="number" value={draft.health.daysSinceActivityWarn} onChange={(e) =>
              setDraft({ ...draft, health: { ...draft.health, daysSinceActivityWarn: num(e.target.value) } })} />
          </div>
          <div>
            <Label className="text-xs">Days since activity - bad</Label>
            <Input type="number" value={draft.health.daysSinceActivityBad} onChange={(e) =>
              setDraft({ ...draft, health: { ...draft.health, daysSinceActivityBad: num(e.target.value) } })} />
          </div>
          <div className="md:col-span-2">
            <Label className="text-xs">Close date "soon" threshold (days)</Label>
            <Input type="number" value={draft.health.closeSoonDays} onChange={(e) =>
              setDraft({ ...draft, health: { ...draft.health, closeSoonDays: num(e.target.value) } })} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
