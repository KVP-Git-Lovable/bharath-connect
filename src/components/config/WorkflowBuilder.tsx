import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowUp, ArrowDown, Plus, Trash2 } from "lucide-react";
import { useConfigFieldsWorkflow } from "@/hooks/useConfigFieldsWorkflow";
import { ApprovalRule, ApprovalStep } from "@/lib/configSchemas";
import { RuleBuilder } from "./RuleBuilder";
import { WorkflowPreview } from "./WorkflowPreview";

function useRoles() {
  return useQuery({
    queryKey: ["config-roles-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("roles").select("id, name").order("name");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string }[];
    },
    staleTime: 10 * 60 * 1000,
  });
}

export function WorkflowBuilder({ module }: { module: string }) {
  const { fields, workflow, setWorkflow } = useConfigFieldsWorkflow(module);
  const { data: roles = [] } = useRoles();

  const patchStep = (id: string, p: Partial<ApprovalStep>) =>
    setWorkflow({ ...workflow, steps: workflow.steps.map((s) => (s.id === id ? { ...s, ...p } : s)) });

  const addStep = () => setWorkflow({
    ...workflow,
    steps: [...workflow.steps, {
      id: `step-${Date.now()}`, name: `Step ${workflow.steps.length + 1}`,
      approverType: "reporting_manager", mode: "sequential",
    }],
  });

  const removeStep = (id: string) =>
    setWorkflow({ ...workflow, steps: workflow.steps.filter((s) => s.id !== id) });

  const moveStep = (id: string, dir: -1 | 1) => {
    const list = [...workflow.steps];
    const i = list.findIndex((s) => s.id === id); const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    setWorkflow({ ...workflow, steps: list });
  };

  const patchRule = (id: string, r: ApprovalRule) =>
    setWorkflow({ ...workflow, rules: workflow.rules.map((x) => (x.id === id ? r : x)) });

  const addRule = () => setWorkflow({
    ...workflow,
    rules: [...workflow.rules, {
      id: `rule-${Date.now()}`, name: "", conditions: [], logic: "AND", action: "add_step",
    }],
  });

  const removeRule = (id: string) =>
    setWorkflow({ ...workflow, rules: workflow.rules.filter((r) => r.id !== id) });

  const toggleRole = (step: ApprovalStep, role: string) => {
    const cur = step.approverRoles ?? [];
    const next = cur.includes(role) ? cur.filter((r) => r !== role) : [...cur, role];
    patchStep(step.id, { approverRoles: next });
  };

  return (
    <div className="space-y-5">
      <div className="rounded-lg border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">Approval steps</p>
          <Button size="sm" variant="outline" onClick={addStep}>
            <Plus className="h-4 w-4 mr-1" /> Add step
          </Button>
        </div>
        {workflow.steps.length === 0 && (
          <p className="text-xs text-muted-foreground">No approval steps yet. Add one to require approvals.</p>
        )}
        <div className="space-y-3">
          {workflow.steps.map((s, i) => (
            <div key={s.id} className="rounded-md border p-3 space-y-3 bg-background">
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="shrink-0">Step {i + 1}</Badge>
                <Input value={s.name} onChange={(e) => patchStep(s.id, { name: e.target.value })}
                  className="h-8" placeholder="Step name" />
                <Button size="icon" variant="ghost" className="h-8 w-8" disabled={i === 0} onClick={() => moveStep(s.id, -1)}>
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" className="h-8 w-8" disabled={i === workflow.steps.length - 1} onClick={() => moveStep(s.id, 1)}>
                  <ArrowDown className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => removeStep(s.id)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Approver type</Label>
                  <Select value={s.approverType} onValueChange={(v) => patchStep(s.id, { approverType: v as ApprovalStep["approverType"] })}>
                    <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="reporting_manager">Reporting Manager of submitter</SelectItem>
                      <SelectItem value="role">Role(s)</SelectItem>
                      <SelectItem value="user">Specific user(s)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Execution mode</Label>
                  <Select value={s.mode} onValueChange={(v) => patchStep(s.id, { mode: v as "sequential" | "parallel" })}>
                    <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sequential">Sequential</SelectItem>
                      <SelectItem value="parallel">Parallel</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {s.approverType === "role" && (
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Approver roles</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {roles.map((r) => {
                      const active = (s.approverRoles ?? []).includes(r.name);
                      return (
                        <button key={r.id} type="button" onClick={() => toggleRole(s, r.name)}>
                          <Badge variant={active ? "default" : "outline"} className="cursor-pointer">{r.name}</Badge>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {s.mode === "parallel" && (
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Parallel rule</Label>
                  <Select value={s.parallelRule ?? "any"} onValueChange={(v) => patchStep(s.id, { parallelRule: v as "all" | "any" })}>
                    <SelectTrigger className="h-8 w-[220px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Any one can approve</SelectItem>
                      <SelectItem value="all">All must approve</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-lg border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold">Conditional rules</p>
            <p className="text-xs text-muted-foreground">Override the default path based on field values</p>
          </div>
          <Button size="sm" variant="outline" onClick={addRule}>
            <Plus className="h-4 w-4 mr-1" /> Add rule
          </Button>
        </div>
        <div className="space-y-3">
          {workflow.rules.map((r) => (
            <RuleBuilder key={r.id} rule={r} fields={fields} steps={workflow.steps} roles={roles}
              onChange={(v) => patchRule(r.id, v)} onDelete={() => removeRule(r.id)} />
          ))}
          {workflow.rules.length === 0 && (
            <p className="text-xs text-muted-foreground">No conditional rules — the step list above is used as the default path.</p>
          )}
        </div>
      </div>

      <div className="rounded-lg border p-4 space-y-2">
        <p className="text-sm font-semibold">Workflow preview</p>
        <WorkflowPreview workflow={workflow} />
      </div>
    </div>
  );
}
