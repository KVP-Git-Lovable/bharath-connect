import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Save } from 'lucide-react';
import { useRegularizationPolicy, RegularizationPolicy } from '@/hooks/useRegularizationPolicy';

const RegularizationPolicyConfig = () => {
  const { policy, loading, savePolicy } = useRegularizationPolicy();
  const [form, setForm] = useState<Partial<RegularizationPolicy>>({});
  const [isSaving, setIsSaving] = useState(false);

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
    <Card>
      <CardHeader>
        <CardTitle>Regularization Policy</CardTitle>
        <CardDescription>Configure limits and rules for attendance regularization requests</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label>Monthly Limit (per employee)</Label>
            <Input type="number" value={form.monthly_limit ?? 3} onChange={e => setForm({ ...form, monthly_limit: parseInt(e.target.value) || 0 })} />
            <p className="text-xs text-muted-foreground mt-1">Max regularization requests per month</p>
          </div>
          <div>
            <Label>Daily Limit</Label>
            <Input type="number" value={form.daily_limit ?? 1} onChange={e => setForm({ ...form, daily_limit: parseInt(e.target.value) || 0 })} />
            <p className="text-xs text-muted-foreground mt-1">Max requests per day</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label>Max Backdate Days</Label>
            <Input type="number" value={form.max_backdate_days ?? 7} onChange={e => setForm({ ...form, max_backdate_days: parseInt(e.target.value) || 0 })} />
            <p className="text-xs text-muted-foreground mt-1">How far back employees can request regularization</p>
          </div>
          <div>
            <Label>Approval Mode</Label>
            <Select value={form.approval_mode || 'manager'} onValueChange={v => setForm({ ...form, approval_mode: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="manager">Manager Approval</SelectItem>
                <SelectItem value="admin">Admin Only</SelectItem>
                <SelectItem value="auto">Auto Approve</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {form.approval_mode === 'auto' && (
          <div>
            <Label>Auto-Approve Within Hours (optional)</Label>
            <Input type="number" step="0.5" value={form.auto_approve_within_hours ?? ''} onChange={e => setForm({ ...form, auto_approve_within_hours: e.target.value ? parseFloat(e.target.value) : null })} className="max-w-xs" placeholder="e.g. 2" />
            <p className="text-xs text-muted-foreground mt-1">Auto-approve if time difference is within this threshold</p>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label>Post-Approval Status</Label>
            <Select value={form.post_approval_status || 'regularized'} onValueChange={v => setForm({ ...form, post_approval_status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="regularized">Regularized</SelectItem>
                <SelectItem value="present">Present</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">Attendance status after approval</p>
          </div>
          <div className="flex items-center justify-between p-3 border rounded-lg">
            <div>
              <Label>Require Reason</Label>
              <p className="text-xs text-muted-foreground">Employee must provide a reason</p>
            </div>
            <Switch checked={form.require_reason ?? true} onCheckedChange={v => setForm({ ...form, require_reason: v })} />
          </div>
        </div>

        <Button onClick={handleSave} disabled={isSaving}>
          <Save className="h-4 w-4 mr-2" />{isSaving ? 'Saving...' : 'Save Policy'}
        </Button>
      </CardContent>
    </Card>
  );
};

export default RegularizationPolicyConfig;
