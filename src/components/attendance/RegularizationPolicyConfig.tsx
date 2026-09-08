import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { toast } from 'sonner';
import { Save, Shield, Clock, CheckCircle, Loader2, AlertCircle, Info } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useRegularizationPolicy } from '@/hooks/useRegularizationPolicy';

const RegularizationPolicyConfig = () => {
  const { data: policyResult, isLoading } = useRegularizationPolicy();
  const policy = policyResult?.data ?? null;
  const policyError = policyResult?.error ?? null;
  const isFallback = policyResult?.isFallback ?? false;
  const queryClient = useQueryClient();
  const [isSaving, setIsSaving] = useState(false);
  const [unlimitedMonthly, setUnlimitedMonthly] = useState(true);
  const errorToastShown = useRef(false);

  useEffect(() => {
    if (policyError && !policy && !errorToastShown.current) {
      toast.error('Failed to load regularization policy');
      errorToastShown.current = true;
    }
    if (isFallback && policy && !errorToastShown.current) {
      toast.warning('Default config loaded. Check permissions if saving fails.');
      errorToastShown.current = true;
    }
  }, [policyError, policy, isFallback]);

  const [form, setForm] = useState({
    is_enabled: true,
    monthly_limit: null as number | null,
    daily_limit: 1,
    max_backdate_days: 7,
    allow_previous_month: false,
    restrict_after_payroll_lock: false,
    approval_mode: 'manager',
    update_attendance_on_approval: true,
    recalculate_hours: true,
    adjust_leave_balance: false,
  });

  useEffect(() => {
    if (policy) {
      setForm({
        is_enabled: policy.is_enabled,
        monthly_limit: policy.monthly_limit,
        daily_limit: policy.daily_limit,
        max_backdate_days: policy.max_backdate_days,
        allow_previous_month: policy.allow_previous_month,
        restrict_after_payroll_lock: policy.restrict_after_payroll_lock,
        approval_mode: policy.approval_mode,
        update_attendance_on_approval: policy.update_attendance_on_approval,
        recalculate_hours: policy.recalculate_hours,
        adjust_leave_balance: policy.adjust_leave_balance,
      });
      setUnlimitedMonthly(policy.monthly_limit === null);
    }
  }, [policy]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const updateData = {
        ...form,
        monthly_limit: unlimitedMonthly ? null : form.monthly_limit,
        updated_at: new Date().toISOString(),
      };

      if (policy?.id) {
        const { error } = await supabase
          .from('regularization_policy')
          .update(updateData)
          .eq('id', policy.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('regularization_policy')
          .insert(updateData);
        if (error) throw error;
      }

      queryClient.invalidateQueries({ queryKey: ['regularization-policy'] });
      toast.success('Regularization policy saved successfully');
    } catch (error) {
      console.error('Error saving policy:', error);
      toast.error('Failed to save regularization policy');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  // Critical error: no data and error present
  if (!policy && policyError) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Unable to load policy</AlertTitle>
        <AlertDescription>Please try again or contact your administrator.</AlertDescription>
      </Alert>
    );
  }

  // Empty state: no data, no error
  if (!policy && !policyError) {
    return (
      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>No policy configured yet</AlertTitle>
        <AlertDescription>Click Save to create the default regularization policy.</AlertDescription>
      </Alert>
    );
  }

  return (
    <Card>
      {isFallback && (
        <div className="px-6 pt-4">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Default config loaded</AlertTitle>
            <AlertDescription>Check permissions if saving fails.</AlertDescription>
          </Alert>
        </div>
      )}
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Attendance Regularization Policy
            </CardTitle>
            <CardDescription>
              Configure how employees can request attendance corrections
            </CardDescription>
          </div>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            {isSaving ? 'Saving...' : 'Save Policy'}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Section 1: Enable/Disable */}
        <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/30">
          <div>
            <Label className="text-base font-semibold">Enable Regularization</Label>
            <p className="text-sm text-muted-foreground mt-1">
              Allow employees to submit attendance correction requests
            </p>
          </div>
          <Switch
            checked={form.is_enabled}
            onCheckedChange={(checked) => setForm({ ...form, is_enabled: checked })}
          />
        </div>

        {form.is_enabled && (
          <>
            {/* Section 2: Usage Limits */}
            <div>
              <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
                <Clock className="h-4 w-4" />
                Usage Limits
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Monthly Limit</Label>
                  <div className="flex items-center gap-3">
                    <Switch
                      checked={unlimitedMonthly}
                      onCheckedChange={(checked) => {
                        setUnlimitedMonthly(checked);
                        if (checked) setForm({ ...form, monthly_limit: null });
                        else setForm({ ...form, monthly_limit: 2 });
                      }}
                    />
                    <span className="text-sm text-muted-foreground">Unlimited</span>
                  </div>
                  {!unlimitedMonthly && (
                    <Input
                      type="number"
                      value={form.monthly_limit ?? 2}
                      onChange={(e) => setForm({ ...form, monthly_limit: parseInt(e.target.value) || 1 })}
                      min={1}
                      max={31}
                      placeholder="Max requests per month"
                    />
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Daily Limit (per date)</Label>
                  <Input
                    type="number"
                    value={form.daily_limit}
                    onChange={(e) => setForm({ ...form, daily_limit: parseInt(e.target.value) || 1 })}
                    min={1}
                    max={5}
                  />
                  <p className="text-xs text-muted-foreground">
                    Max requests allowed for a single attendance date
                  </p>
                </div>
              </div>
            </div>


            {/* Section 4: Time Restrictions */}
            <div>
              <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
                <Clock className="h-4 w-4" />
                Time Restrictions
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Maximum Backdate Days</Label>
                  <Input
                    type="number"
                    value={form.max_backdate_days}
                    onChange={(e) => setForm({ ...form, max_backdate_days: parseInt(e.target.value) || 1 })}
                    min={1}
                    max={90}
                  />
                  <p className="text-xs text-muted-foreground">
                    How many days back an employee can regularize
                  </p>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Allow Previous Month</Label>
                      <p className="text-xs text-muted-foreground">Allow cross-month corrections</p>
                    </div>
                    <Switch
                      checked={form.allow_previous_month}
                      onCheckedChange={(checked) => setForm({ ...form, allow_previous_month: checked })}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Restrict After Payroll Lock</Label>
                      <p className="text-xs text-muted-foreground">Block if payroll is locked</p>
                    </div>
                    <Switch
                      checked={form.restrict_after_payroll_lock}
                      onCheckedChange={(checked) => setForm({ ...form, restrict_after_payroll_lock: checked })}
                    />
                  </div>
                </div>
              </div>
            </div>

            <Separator />

            {/* Section 5: Approval Workflow */}
            <div>
              <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
                <CheckCircle className="h-4 w-4" />
                Approval Workflow
              </h3>
              <div className="space-y-2">
                <Label>Approval Mode</Label>
                <Select
                  value={form.approval_mode}
                  onValueChange={(value) => setForm({ ...form, approval_mode: value })}
                >
                  <SelectTrigger className="max-w-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Auto Approval (No manual review)</SelectItem>
                    <SelectItem value="manager">Manager Approval (Single-level)</SelectItem>
                    <SelectItem value="multi_level">Multi-Level Approval (Hierarchy)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {form.approval_mode === 'auto' && 'Requests will be approved instantly without any manual review.'}
                  {form.approval_mode === 'manager' && 'Reporting manager must approve each request.'}
                  {form.approval_mode === 'multi_level' && 'Request goes through the full management hierarchy.'}
                </p>
              </div>
            </div>

            <Separator />

            {/* Section 6: Post-Approval Impact */}
            <div>
              <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
                <Shield className="h-4 w-4" />
                Post-Approval Impact
              </h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Update Attendance Record</Label>
                    <p className="text-xs text-muted-foreground">Replace original times with approved values</p>
                  </div>
                  <Switch
                    checked={form.update_attendance_on_approval}
                    onCheckedChange={(checked) => setForm({ ...form, update_attendance_on_approval: checked })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Recalculate Working Hours</Label>
                    <p className="text-xs text-muted-foreground">Recalculate total hours after approval</p>
                  </div>
                  <Switch
                    checked={form.recalculate_hours}
                    onCheckedChange={(checked) => setForm({ ...form, recalculate_hours: checked })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Adjust Leave Balance</Label>
                    <p className="text-xs text-muted-foreground">Deduct/restore leave if status changes</p>
                  </div>
                  <Switch
                    checked={form.adjust_leave_balance}
                    onCheckedChange={(checked) => setForm({ ...form, adjust_leave_balance: checked })}
                  />
                </div>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default RegularizationPolicyConfig;
