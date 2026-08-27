import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Plus, Trash2 } from "lucide-react";
import { ApprovalRule, ApprovalStep, FieldDef, OP_LABELS, RuleOp } from "@/lib/configSchemas";

interface Props {
  rule: ApprovalRule;
  fields: FieldDef[];
  steps: ApprovalStep[];
  roles: { id: string; name: string }[];
  onChange: (r: ApprovalRule) => void;
  onDelete: () => void;
}

export function RuleBuilder({ rule, fields, steps, roles, onChange, onDelete }: Props) {
  const patch = (p: Partial<ApprovalRule>) => onChange({ ...rule, ...p });
  const usableFields = fields.filter((f) => !f.deleted);

  return (
    <div className="rounded-lg border p-3 space-y-3 bg-muted/30">
      <div className="flex items-center gap-2">
        <Input value={rule.name} onChange={(e) => patch({ name: e.target.value })} placeholder="Rule name (e.g. High value)" className="h-8" />
        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onDelete}>
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </div>

      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">IF</Label>
        {rule.conditions.map((c, i) => (
          <div key={i} className="flex flex-wrap items-center gap-1.5">
            {i > 0 && (
              <Select value={rule.logic} onValueChange={(v) => patch({ logic: v as "AND" | "OR" })}>
                <SelectTrigger className="h-8 w-[70px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="AND">AND</SelectItem>
                  <SelectItem value="OR">OR</SelectItem>
                </SelectContent>
              </Select>
            )}
            <Select value={c.field} onValueChange={(v) => {
              const next = [...rule.conditions]; next[i] = { ...c, field: v }; patch({ conditions: next });
            }}>
              <SelectTrigger className="h-8 w-[160px]"><SelectValue placeholder="Field" /></SelectTrigger>
              <SelectContent>
                {usableFields.map((f) => <SelectItem key={f.id} value={f.key}>{f.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={c.op} onValueChange={(v) => {
              const next = [...rule.conditions]; next[i] = { ...c, op: v as RuleOp }; patch({ conditions: next });
            }}>
              <SelectTrigger className="h-8 w-[120px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(OP_LABELS) as RuleOp[]).map((o) => <SelectItem key={o} value={o}>{OP_LABELS[o]}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input value={c.value} onChange={(e) => {
              const next = [...rule.conditions]; next[i] = { ...c, value: e.target.value }; patch({ conditions: next });
            }} placeholder="Value" className="h-8 w-[140px]" />
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => {
              patch({ conditions: rule.conditions.filter((_, x) => x !== i) });
            }}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
        <Button size="sm" variant="ghost" onClick={() => patch({
          conditions: [...rule.conditions, { field: usableFields[0]?.key ?? "", op: "eq", value: "" }],
        })}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Add condition
        </Button>
      </div>

      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">THEN</Label>
        <div className="flex flex-wrap items-center gap-1.5">
          <Select value={rule.action} onValueChange={(v) => patch({ action: v as ApprovalRule["action"] })}>
            <SelectTrigger className="h-8 w-[170px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="add_step">Add extra approver</SelectItem>
              <SelectItem value="skip_to">Skip to step</SelectItem>
              <SelectItem value="replace">Replace approvers of step</SelectItem>
            </SelectContent>
          </Select>

          {rule.action === "skip_to" || rule.action === "replace" ? (
            <Select value={rule.targetStepId ?? ""} onValueChange={(v) => patch({ targetStepId: v })}>
              <SelectTrigger className="h-8 w-[180px]"><SelectValue placeholder="Target step" /></SelectTrigger>
              <SelectContent>
                {steps.map((s) => <SelectItem key={s.id} value={s.id}>{s.name || "(unnamed)"}</SelectItem>)}
              </SelectContent>
            </Select>
          ) : (
            <>
              <Input value={rule.extraStepName ?? ""} onChange={(e) => patch({ extraStepName: e.target.value })}
                placeholder="Extra step name (optional)" className="h-8 w-[180px]" />
              <Select value={rule.extraApproverRoles?.[0] ?? ""}
                onValueChange={(v) => patch({ extraApproverRoles: [v] })}>
                <SelectTrigger className="h-8 w-[160px]"><SelectValue placeholder="Approver role" /></SelectTrigger>
                <SelectContent>
                  {roles.map((r) => <SelectItem key={r.id} value={r.name}>{r.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
