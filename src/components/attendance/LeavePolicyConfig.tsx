import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Save, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useGlobalLeavePolicy, GlobalLeavePolicy } from '@/hooks/useGlobalLeavePolicy';

const resetCycleOptions = [
  { value: 'calendar_year', label: 'Calendar Year (Jan–Dec)' },
  { value: 'financial_year', label: 'Financial Year (Apr–Mar)' },
  { value: 'joining_date', label: 'From Date of Joining' },
];

const LeavePolicyConfig = () => {
  const { policy, overrides, loading, savePolicy, saveOverride, deleteOverride } = useGlobalLeavePolicy();
  const [leaveTypes, setLeaveTypes] = useState<{ id: string; name: string }[]>([]);
  const [form, setForm] = useState<Partial<GlobalLeavePolicy>>({});
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    supabase.from('leave_types').select('id, name').eq('is_active', true).order('name')
      .then(({ data }) => setLeaveTypes(data || []));
  }, []);

  useEffect(() => {
    if (policy) setForm(policy);
  }, [policy]);

  const handleSave = async () => {
    setIsSaving(true);
    await savePolicy(form);
    setIsSaving(false);
  };

  if (loading) return <div className="flex items-center justify-center py-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Global Leave Policy</CardTitle>
          <CardDescription>Configure organization-wide leave rules</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Reset Cycle */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>Leave Reset Cycle</Label>
              <Select value={form.reset_cycle || 'calendar_year'} onValueChange={v => setForm({ ...form, reset_cycle: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {resetCycleOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Max Continuous Leave Days</Label>
              <Input type="number" value={form.max_continuous_days ?? 30} onChange={e => setForm({ ...form, max_continuous_days: parseInt(e.target.value) || 0 })} />
            </div>
          </div>

          {/* Toggle Settings */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div>
                <Label>Allow Negative Balance</Label>
                <p className="text-xs text-muted-foreground">Let employees take leave beyond quota</p>
              </div>
              <Switch checked={form.allow_negative_balance ?? false} onCheckedChange={v => setForm({ ...form, allow_negative_balance: v })} />
            </div>
            {form.allow_negative_balance && (
              <div>
                <Label>Max Negative Days</Label>
                <Input type="number" value={form.max_negative_days ?? 0} onChange={e => setForm({ ...form, max_negative_days: parseInt(e.target.value) || 0 })} />
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div>
                <Label>Carry Forward</Label>
                <p className="text-xs text-muted-foreground">Allow unused leaves to carry over</p>
              </div>
              <Switch checked={form.carry_forward_enabled ?? false} onCheckedChange={v => setForm({ ...form, carry_forward_enabled: v })} />
            </div>
            {form.carry_forward_enabled && (
              <div>
                <Label>Max Carry Forward Days</Label>
                <Input type="number" value={form.max_carry_forward_days ?? 0} onChange={e => setForm({ ...form, max_carry_forward_days: parseInt(e.target.value) || 0 })} />
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div>
                <Label>Sandwich Rule</Label>
                <p className="text-xs text-muted-foreground">Count weekends between leave days as leave</p>
              </div>
              <Switch checked={form.sandwich_rule_enabled ?? false} onCheckedChange={v => setForm({ ...form, sandwich_rule_enabled: v })} />
            </div>
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div>
                <Label>Half Day Leave</Label>
                <p className="text-xs text-muted-foreground">Allow half-day leave applications</p>
              </div>
              <Switch checked={form.half_day_enabled ?? true} onCheckedChange={v => setForm({ ...form, half_day_enabled: v })} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div>
                <Label>Allow Backdated Leave</Label>
                <p className="text-xs text-muted-foreground">Allow applying for past-date leaves</p>
              </div>
              <Switch checked={form.allow_backdated_leave ?? true} onCheckedChange={v => setForm({ ...form, allow_backdated_leave: v })} />
            </div>
            {form.allow_backdated_leave && (
              <div>
                <Label>Max Backdate Days</Label>
                <Input type="number" value={form.max_backdate_days ?? 30} onChange={e => setForm({ ...form, max_backdate_days: parseInt(e.target.value) || 0 })} />
              </div>
            )}
          </div>

          <div>
            <Label>Notice Period (days before leave start)</Label>
            <Input type="number" value={form.notice_period_days ?? 0} onChange={e => setForm({ ...form, notice_period_days: parseInt(e.target.value) || 0 })} className="max-w-xs" />
          </div>

          <Button onClick={handleSave} disabled={isSaving}>
            <Save className="h-4 w-4 mr-2" />{isSaving ? 'Saving...' : 'Save Policy'}
          </Button>
        </CardContent>
      </Card>

      {/* Per-Type Overrides */}
      <Card>
        <CardHeader>
          <CardTitle>Per Leave-Type Overrides</CardTitle>
          <CardDescription>Override global policy for specific leave types</CardDescription>
        </CardHeader>
        <CardContent>
          <Accordion type="multiple" className="w-full">
            {leaveTypes.map(lt => {
              const ov = overrides.find(o => o.leave_type_id === lt.id);
              return (
                <AccordionItem key={lt.id} value={lt.id}>
                  <AccordionTrigger className="text-sm">
                    <div className="flex items-center gap-2">
                      {lt.name}
                      {ov && <Badge variant="secondary" className="text-xs">Has Override</Badge>}
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <OverrideForm leaveTypeId={lt.id} override={ov || null} onSave={saveOverride} onDelete={deleteOverride} />
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        </CardContent>
      </Card>
    </div>
  );
};

function OverrideForm({ leaveTypeId, override, onSave, onDelete }: {
  leaveTypeId: string;
  override: any;
  onSave: (id: string, data: any) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [form, setForm] = useState({
    override_negative_balance: override?.override_negative_balance ?? null,
    max_negative_days: override?.max_negative_days ?? null,
    override_carry_forward: override?.override_carry_forward ?? null,
    max_carry_forward_days: override?.max_carry_forward_days ?? null,
    custom_reset_cycle: override?.custom_reset_cycle ?? null,
    min_notice_days: override?.min_notice_days ?? null,
    max_continuous_days: override?.max_continuous_days ?? null,
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await onSave(leaveTypeId, form);
    setSaving(false);
  };

  return (
    <div className="space-y-4 pt-2">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="flex items-center gap-2">
          <Switch checked={form.override_negative_balance ?? false} onCheckedChange={v => setForm({ ...form, override_negative_balance: v })} />
          <Label className="text-xs">Override Negative Balance</Label>
        </div>
        {form.override_negative_balance && (
          <div>
            <Label className="text-xs">Max Negative Days</Label>
            <Input type="number" value={form.max_negative_days ?? ''} onChange={e => setForm({ ...form, max_negative_days: parseInt(e.target.value) || 0 })} className="h-8" />
          </div>
        )}
        <div className="flex items-center gap-2">
          <Switch checked={form.override_carry_forward ?? false} onCheckedChange={v => setForm({ ...form, override_carry_forward: v })} />
          <Label className="text-xs">Override Carry Forward</Label>
        </div>
        {form.override_carry_forward && (
          <div>
            <Label className="text-xs">Max CF Days</Label>
            <Input type="number" value={form.max_carry_forward_days ?? ''} onChange={e => setForm({ ...form, max_carry_forward_days: parseInt(e.target.value) || 0 })} className="h-8" />
          </div>
        )}
        <div>
          <Label className="text-xs">Custom Reset Cycle</Label>
          <Select value={form.custom_reset_cycle || 'none'} onValueChange={v => setForm({ ...form, custom_reset_cycle: v === 'none' ? null : v })}>
            <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Use Global</SelectItem>
              {resetCycleOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Min Notice Days</Label>
          <Input type="number" value={form.min_notice_days ?? ''} onChange={e => setForm({ ...form, min_notice_days: e.target.value ? parseInt(e.target.value) : null })} className="h-8" placeholder="Use global" />
        </div>
        <div>
          <Label className="text-xs">Max Continuous Days</Label>
          <Input type="number" value={form.max_continuous_days ?? ''} onChange={e => setForm({ ...form, max_continuous_days: e.target.value ? parseInt(e.target.value) : null })} className="h-8" placeholder="Use global" />
        </div>
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={handleSave} disabled={saving}>
          <Save className="h-3 w-3 mr-1" />{saving ? 'Saving...' : 'Save Override'}
        </Button>
        {override && (
          <Button size="sm" variant="destructive" onClick={() => onDelete(leaveTypeId)}>
            <Trash2 className="h-3 w-3 mr-1" />Remove
          </Button>
        )}
      </div>
    </div>
  );
}

export default LeavePolicyConfig;
