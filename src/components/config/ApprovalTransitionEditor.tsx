import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { ApprovalTransition, DEFAULT_TRANSITION } from "@/hooks/useAppConfiguration";

interface RoleRow { id: string; name: string; }

function useRolesList() {
  return useQuery({
    queryKey: ["config-roles-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("roles").select("id, name").order("name");
      if (error) throw error;
      return (data ?? []) as RoleRow[];
    },
    staleTime: 10 * 60 * 1000,
  });
}

function RolePicker({
  label, selected, roles, onChange,
}: { label: string; selected: string[]; roles: RoleRow[]; onChange: (v: string[]) => void }) {
  const toggle = (name: string) => {
    if (selected.includes(name)) onChange(selected.filter((r) => r !== name));
    else onChange([...selected, name]);
  };
  return (
    <div className="space-y-2">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="flex flex-wrap gap-2">
        {roles.length === 0 && <span className="text-xs text-muted-foreground">No roles found</span>}
        {roles.map((r) => {
          const active = selected.includes(r.name);
          return (
            <button type="button" key={r.id} onClick={() => toggle(r.name)} className="focus:outline-none">
              <Badge variant={active ? "default" : "outline"} className="cursor-pointer">
                {active && <Checkbox checked className="mr-1 h-3 w-3 pointer-events-none" />}
                {r.name}
              </Badge>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function ApprovalTransitionEditor({
  title, value, onChange,
}: { title: string; value?: ApprovalTransition; onChange: (v: ApprovalTransition) => void }) {
  const { data: roles = [] } = useRolesList();
  const t = value ?? DEFAULT_TRANSITION;
  const update = (patch: Partial<ApprovalTransition>) => onChange({ ...t, ...patch });

  return (
    <div className="rounded-lg border border-border/60 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">{title}</p>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{t.enabled ? "Enabled" : "Disabled"}</span>
          <Switch checked={t.enabled} onCheckedChange={(v) => update({ enabled: v })} />
        </div>
      </div>

      {t.enabled && (
        <div className="space-y-4">
          <RolePicker label="Approvers (roles)" selected={t.approverRoles} roles={roles}
            onChange={(v) => update({ approverRoles: v })} />

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Approval rule</Label>
            <RadioGroup value={t.rule} onValueChange={(v) => update({ rule: v as "any" | "all" })} className="flex gap-6">
              <div className="flex items-center gap-2">
                <RadioGroupItem value="any" id={`${title}-any`} />
                <Label htmlFor={`${title}-any`} className="text-sm font-normal">Any one can approve</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="all" id={`${title}-all`} />
                <Label htmlFor={`${title}-all`} className="text-sm font-normal">All must approve</Label>
              </div>
            </RadioGroup>
          </div>

          <RolePicker label="Notify others (roles)" selected={t.notifyRoles} roles={roles}
            onChange={(v) => update({ notifyRoles: v })} />

          {t.approverRoles.length === 0 && (
            <p className="text-xs text-destructive">Select at least one approver role.</p>
          )}
        </div>
      )}
    </div>
  );
}
