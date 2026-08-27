import { WorkflowDef } from "@/lib/configSchemas";
import { ArrowRight } from "lucide-react";

export function WorkflowPreview({ workflow }: { workflow: WorkflowDef }) {
  const { steps, rules } = workflow;
  if (steps.length === 0) return <p className="text-xs text-muted-foreground">No steps configured yet.</p>;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {steps.map((s, i) => (
          <div key={s.id} className="flex items-center gap-2">
            <div className="rounded-md border bg-background px-3 py-2 min-w-[140px]">
              <div className="text-[10px] uppercase text-muted-foreground">Step {i + 1}</div>
              <div className="text-sm font-medium">{s.name || "(unnamed)"}</div>
              <div className="text-[11px] text-muted-foreground">
                {s.approverType === "reporting_manager" && "Reporting Manager"}
                {s.approverType === "role" && (s.approverRoles?.join(", ") || "Any role")}
                {s.approverType === "user" && `${s.approverIds?.length ?? 0} user(s)`}
                {s.mode === "parallel" && ` · ${s.parallelRule === "all" ? "All must approve" : "Any one"}`}
              </div>
            </div>
            {i < steps.length - 1 && <ArrowRight className="h-4 w-4 text-muted-foreground" />}
          </div>
        ))}
      </div>

      {rules.length > 0 && (
        <div className="space-y-1 pt-2 border-t">
          <div className="text-[10px] uppercase text-muted-foreground">Conditional rules</div>
          {rules.map((r) => (
            <div key={r.id} className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{r.name || "Rule"}:</span>{" "}
              IF {r.conditions.map((c) => `${c.field} ${c.op} ${c.value}`).join(` ${r.logic} `)}{" "}
              → {r.action === "add_step" ? `add ${r.extraApproverRoles?.[0] ?? "approver"}` :
                r.action === "skip_to" ? `skip to step` :
                `replace approvers`}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
