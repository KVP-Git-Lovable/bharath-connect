import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Plus, Trash2, Save, Pencil, X } from "lucide-react";
import {
  useLeadScoringRules,
  DEFAULT_SCORING_RULES,
  ScoringRules,
  CONTACT_ROLE_LABELS,
  ContactRole,
} from "@/hooks/useLeadScoring";
import { useLeadStatuses } from "@/hooks/useLeadsEvents";
import { useUserProfile } from "@/hooks/useUserProfile";
import { useAdminAccess } from "@/hooks/useAdminAccess";

export default function LeadScoringMaster() {
  const nav = useNavigate();
  const { rules, save, saving } = useLeadScoringRules();
  const { isAdmin } = useUserProfile();
  const { hasAdminAccess } = useAdminAccess();
  const canEdit = isAdmin || hasAdminAccess;
  const [editing, setEditing] = useState(false);
  const ro = !editing;
  const { data: statuses = [] } = useLeadStatuses(false);
  const [draft, setDraft] = useState<ScoringRules>(rules);

  useEffect(() => { if (!editing) setDraft(rules); }, [rules, editing]);

  const updateStatus = (name: string, v: string) =>
    setDraft((d) => ({ ...d, statusScores: { ...d.statusScores, [name.toLowerCase()]: Number(v) || 0 } }));

  const updateRole = (r: ContactRole, v: string) =>
    setDraft((d) => ({ ...d, contactRoleScores: { ...d.contactRoleScores, [r]: Number(v) || 0 } }));

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-3xl mx-auto">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => nav("/master-data")} className="-ml-2">
          <ArrowLeft className="h-4 w-4 mr-1" />Back
        </Button>
        {canEdit && (
          editing ? (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => { setDraft(rules); setEditing(false); }}>
                <X className="h-4 w-4 mr-1" />Cancel
              </Button>
              <Button size="sm" onClick={() => { save(draft); setEditing(false); }} disabled={saving}>
                <Save className="h-4 w-4 mr-1" />Save
              </Button>
            </div>
          ) : (
            <Button size="sm" onClick={() => setEditing(true)}>
              <Pencil className="h-4 w-4 mr-1" />Edit
            </Button>
          )
        )}
      </div>

      <div>
        <h1 className="text-2xl font-bold">Lead Scoring Rules</h1>
        <p className="text-sm text-muted-foreground">
          {!canEdit
            ? "View-only — BANT scoring rules are managed by an administrator in Admin Controls."
            : editing
              ? "Configure BANT scoring for leads"
              : "Tap Edit to change the BANT scoring rules"}
        </p>
      </div>


      <Card>
        <CardHeader><CardTitle className="text-base">Lead Status Scores</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {statuses.map((s) => (
            <div key={s.id} className="flex items-center gap-2">
              <Label className="flex-1">{s.name}</Label>
              <Input disabled={ro} type="number"
                className="w-24"
                value={draft.statusScores[s.name.toLowerCase()] ?? 0}
                onChange={(e) => updateStatus(s.name, e.target.value)}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Budget Scores</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="flex items-center gap-2">
            <Label className="flex-1">Budget shared</Label>
            <Input disabled={ro} type="number" className="w-24" value={draft.budget?.shared ?? 0}
              onChange={(e) => setDraft({ ...draft, budget: { ...draft.budget, shared: Number(e.target.value) || 0 } })} />
          </div>
          <div className="flex items-center gap-2">
            <Label className="flex-1">Budget aligned to opportunity value</Label>
            <Input disabled={ro} type="number" className="w-24" value={draft.budget?.aligned ?? 0}
              onChange={(e) => setDraft({ ...draft, budget: { ...draft.budget, aligned: Number(e.target.value) || 0 } })} />
          </div>
          <div className="flex items-center gap-2">
            <Label className="flex-1">No budget shared</Label>
            <Input disabled={ro} type="number" className="w-24" value={draft.budget?.none ?? 0}
              onChange={(e) => setDraft({ ...draft, budget: { ...draft.budget, none: Number(e.target.value) || 0 } })} />
          </div>
          <div className="flex items-center gap-2">
            <Label className="flex-1">Alignment tolerance (%)</Label>
            <Input disabled={ro} type="number" className="w-24" value={draft.budget?.tolerancePct ?? 10}
              onChange={(e) => setDraft({ ...draft, budget: { ...draft.budget, tolerancePct: Number(e.target.value) || 0 } })} />
          </div>
          <p className="md:col-span-2 text-xs text-muted-foreground">
            Indicative budget within the tolerance % of the opportunity value scores the "aligned" points; any other budget entered scores "shared".
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Timeline — Close Date Scores</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {([["thisMonth", "Closing this month"], ["nextMonth", "Closing next month"], ["later", "Closing later"], ["none", "No close date"]] as const).map(([k, label]) => (
            <div key={k} className="flex items-center gap-2">
              <Label className="flex-1">{label}</Label>
              <Input disabled={ro} type="number" className="w-24" value={draft.closeDate?.[k] ?? 0}
                onChange={(e) => setDraft({ ...draft, closeDate: { ...draft.closeDate, [k]: Number(e.target.value) || 0 } })} />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Need — Requirement Overview Scores</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="flex items-center gap-2">
            <Label className="flex-1">Requirement clear</Label>
            <Input disabled={ro} type="number" className="w-24" value={draft.need?.clear ?? 0}
              onChange={(e) => setDraft({ ...draft, need: { ...draft.need, clear: Number(e.target.value) || 0 } })} />
          </div>
          <div className="flex items-center gap-2">
            <Label className="flex-1">Requirement not clear (brief)</Label>
            <Input disabled={ro} type="number" className="w-24" value={draft.need?.vague ?? 0}
              onChange={(e) => setDraft({ ...draft, need: { ...draft.need, vague: Number(e.target.value) || 0 } })} />
          </div>
          <div className="flex items-center gap-2">
            <Label className="flex-1">Not entered</Label>
            <Input disabled={ro} type="number" className="w-24" value={draft.need?.none ?? 0}
              onChange={(e) => setDraft({ ...draft, need: { ...draft.need, none: Number(e.target.value) || 0 } })} />
          </div>
          <div className="flex items-center gap-2">
            <Label className="flex-1">Min characters to count as clear</Label>
            <Input disabled={ro} type="number" className="w-24" value={draft.need?.clearMinChars ?? 80}
              onChange={(e) => setDraft({ ...draft, need: { ...draft.need, clearMinChars: Number(e.target.value) || 0 } })} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Authority — Contact Role Scores</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {(Object.keys(CONTACT_ROLE_LABELS) as ContactRole[]).map((r) => (
            <div key={r} className="flex items-center gap-2">
              <Label className="flex-1">{CONTACT_ROLE_LABELS[r]}</Label>
              <Input disabled={ro} type="number"
                className="w-24"
                value={draft.contactRoleScores[r] ?? 0}
                onChange={(e) => updateRole(r, e.target.value)}
              />
            </div>
          ))}
        </CardContent>
      </Card>


      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Activity Count Thresholds</CardTitle>
          {!ro && (
            <Button size="sm" variant="outline" onClick={() =>
              setDraft((d) => ({ ...d, activityThresholds: [...d.activityThresholds, { min: 0, score: 0 }] }))
            }><Plus className="h-4 w-4" /></Button>
          )}
        </CardHeader>
        <CardContent className="space-y-2">
          {draft.activityThresholds.map((t, i) => (
            <div key={i} className="flex items-center gap-2">
              <Label className="text-xs">Min activities</Label>
              <Input disabled={ro} type="number" className="w-20" value={t.min} onChange={(e) => {
                const arr = [...draft.activityThresholds]; arr[i] = { ...arr[i], min: Number(e.target.value) || 0 };
                setDraft({ ...draft, activityThresholds: arr });
              }} />
              <Label className="text-xs">Score</Label>
              <Input disabled={ro} type="number" className="w-20" value={t.score} onChange={(e) => {
                const arr = [...draft.activityThresholds]; arr[i] = { ...arr[i], score: Number(e.target.value) || 0 };
                setDraft({ ...draft, activityThresholds: arr });
              }} />
              {!ro && (
                <Button size="icon" variant="ghost" onClick={() => {
                  setDraft({ ...draft, activityThresholds: draft.activityThresholds.filter((_, j) => j !== i) });
                }}><Trash2 className="h-4 w-4" /></Button>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Lead Age Buckets (days)</CardTitle>
          {!ro && (
            <Button size="sm" variant="outline" onClick={() =>
              setDraft((d) => ({ ...d, ageBuckets: [...d.ageBuckets, { maxDays: 30, score: 0 }] }))
            }><Plus className="h-4 w-4" /></Button>
          )}
        </CardHeader>
        <CardContent className="space-y-2">
          {draft.ageBuckets.map((b, i) => (
            <div key={i} className="flex items-center gap-2">
              <Label className="text-xs">Up to (days)</Label>
              <Input disabled={ro} type="number" className="w-24" value={b.maxDays} onChange={(e) => {
                const arr = [...draft.ageBuckets]; arr[i] = { ...arr[i], maxDays: Number(e.target.value) || 0 };
                setDraft({ ...draft, ageBuckets: arr });
              }} />
              <Label className="text-xs">Score</Label>
              <Input disabled={ro} type="number" className="w-20" value={b.score} onChange={(e) => {
                const arr = [...draft.ageBuckets]; arr[i] = { ...arr[i], score: Number(e.target.value) || 0 };
                setDraft({ ...draft, ageBuckets: arr });
              }} />
              {!ro && (
                <Button size="icon" variant="ghost" onClick={() => {
                  setDraft({ ...draft, ageBuckets: draft.ageBuckets.filter((_, j) => j !== i) });
                }}><Trash2 className="h-4 w-4" /></Button>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Qualification Thresholds</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">High (≥)</Label>
            <Input disabled={ro} type="number" value={draft.qualification.high} onChange={(e) =>
              setDraft({ ...draft, qualification: { ...draft.qualification, high: Number(e.target.value) || 0 } })
            } />
          </div>
          <div>
            <Label className="text-xs">Medium (≥)</Label>
            <Input disabled={ro} type="number" value={draft.qualification.medium} onChange={(e) =>
              setDraft({ ...draft, qualification: { ...draft.qualification, medium: Number(e.target.value) || 0 } })
            } />
          </div>
          <p className="col-span-2 text-xs text-muted-foreground">
            Defaults: {DEFAULT_SCORING_RULES.qualification.high} / {DEFAULT_SCORING_RULES.qualification.medium}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
