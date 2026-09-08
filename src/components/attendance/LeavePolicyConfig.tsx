import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { toast } from 'sonner';
import { Save, Settings, Shield, Clock, CheckSquare, Loader2, CalendarDays, AlertCircle, Info } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useGlobalLeavePolicy, useLeaveTypeOverrides, type GlobalLeavePolicy, type LeaveTypeOverride } from '@/hooks/useGlobalLeavePolicy';

interface LeaveType {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
}

interface OverrideForm {
  override_enabled: boolean;
  allow_negative_balance: boolean | null;
  max_negative_limit: number | null;
  enable_carry_forward: boolean | null;
  max_carry_forward_limit: number | null;
  carry_forward_expiry_months: number | null;
  custom_reset_cycle: string | null;
}

interface AccrualForm {
  accrual_type: string;
  yearly_entitlement: number;
}

interface AccrualConfigForm {
  frequency: string;
  divisor: number;
  round_mode: string;
  prorate_joining: boolean;
  credit_day: number;
}

const LeavePolicyConfig = () => {
  const { data: globalPolicyResult, isLoading: loadingGlobal } = useGlobalLeavePolicy();
  const globalPolicy = globalPolicyResult?.data ?? null;
  const globalPolicyError = globalPolicyResult?.error ?? null;
  const isGlobalFallback = globalPolicyResult?.isFallback ?? false;
  const { data: overrides, isLoading: loadingOverrides } = useLeaveTypeOverrides();
  const queryClient = useQueryClient();
  const [isSaving, setIsSaving] = useState(false);
  const errorToastShown = useRef(false);

  useEffect(() => {
    if (globalPolicyError && !globalPolicy && !errorToastShown.current) {
      toast.error('Failed to load leave policy');
      errorToastShown.current = true;
    }
    if (isGlobalFallback && globalPolicy && !errorToastShown.current) {
      toast.warning('Default config loaded. Check permissions if saving fails.');
      errorToastShown.current = true;
    }
  }, [globalPolicyError, globalPolicy, isGlobalFallback]);
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [loadingTypes, setLoadingTypes] = useState(true);

  const [globalForm, setGlobalForm] = useState({
    is_enabled: true,
    reset_cycle: 'calendar_year',
    custom_reset_date: null as string | null,
    allow_negative_balance: false,
    max_negative_limit: 0,
    enable_carry_forward: false,
    max_carry_forward_limit: 0,
    carry_forward_expiry_months: null as number | null,
    min_notice_period_days: 0,
    max_continuous_leave_days: null as number | null,
    allow_backdated_leave: false,
    max_backdate_days: 0,
    enable_half_day: true,
    enable_sandwich_rule: false,
  });

  const [overrideForms, setOverrideForms] = useState<Record<string, OverrideForm>>({});
  const [accrualForms, setAccrualForms] = useState<Record<string, AccrualForm>>({});
  const [originalAccrualForms, setOriginalAccrualForms] = useState<Record<string, AccrualForm>>({});
  const [accrualConfigForms, setAccrualConfigForms] = useState<Record<string, AccrualConfigForm>>({});
  const [showUpdateModeModal, setShowUpdateModeModal] = useState(false);
  const [updateMode, setUpdateMode] = useState<'retroactive' | 'current_month' | 'next_month'>('next_month');
  const [changedLeaveTypeIds, setChangedLeaveTypeIds] = useState<string[]>([]);

  useEffect(() => {
    supabase.from('leave_types').select('*').eq('is_active', true).order('name')
      .then(({ data }) => {
        setLeaveTypes(data || []);
        setLoadingTypes(false);
      });
  }, []);

  // Load existing leave_policy (accrual) data
  useEffect(() => {
    if (leaveTypes.length > 0) {
      supabase.from('leave_policy').select('*').then(({ data }) => {
        const forms: Record<string, AccrualForm> = {};
        leaveTypes.forEach(lt => {
          const existing = (data || []).find((p: any) => p.leave_type_id === lt.id);
          forms[lt.id] = existing ? {
            accrual_type: existing.accrual_type || 'yearly',
            yearly_entitlement: existing.yearly_entitlement ?? 0,
          } : {
            accrual_type: 'yearly',
            yearly_entitlement: 0,
          };
        });
        setAccrualForms(forms);
        setOriginalAccrualForms(JSON.parse(JSON.stringify(forms)));
      });

      // Load accrual_config
      supabase.from('accrual_config').select('*').then(({ data }) => {
        const configs: Record<string, AccrualConfigForm> = {};
        leaveTypes.forEach(lt => {
          const existing = (data || []).find((c: any) => c.leave_type_id === lt.id);
          configs[lt.id] = existing ? {
            frequency: existing.frequency || 'monthly',
            divisor: existing.divisor ?? 12,
            round_mode: existing.round_mode || 'round',
            prorate_joining: existing.prorate_joining ?? false,
            credit_day: existing.credit_day ?? 1,
          } : {
            frequency: 'monthly',
            divisor: 12,
            round_mode: 'round',
            prorate_joining: false,
            credit_day: 1,
          };
        });
        setAccrualConfigForms(configs);
      });
    }
  }, [leaveTypes]);

  useEffect(() => {
    if (globalPolicy) {
      setGlobalForm({
        is_enabled: globalPolicy.is_enabled,
        reset_cycle: globalPolicy.reset_cycle,
        custom_reset_date: globalPolicy.custom_reset_date,
        allow_negative_balance: globalPolicy.allow_negative_balance,
        max_negative_limit: globalPolicy.max_negative_limit,
        enable_carry_forward: globalPolicy.enable_carry_forward,
        max_carry_forward_limit: globalPolicy.max_carry_forward_limit,
        carry_forward_expiry_months: globalPolicy.carry_forward_expiry_months,
        min_notice_period_days: globalPolicy.min_notice_period_days,
        max_continuous_leave_days: globalPolicy.max_continuous_leave_days,
        allow_backdated_leave: globalPolicy.allow_backdated_leave,
        max_backdate_days: globalPolicy.max_backdate_days,
        enable_half_day: globalPolicy.enable_half_day,
        enable_sandwich_rule: globalPolicy.enable_sandwich_rule,
      });
    }
  }, [globalPolicy]);

  useEffect(() => {
    if (overrides && leaveTypes.length > 0) {
      const forms: Record<string, OverrideForm> = {};
      leaveTypes.forEach(lt => {
        const existing = overrides.find(o => o.leave_type_id === lt.id);
        forms[lt.id] = existing ? {
          override_enabled: existing.override_enabled,
          allow_negative_balance: existing.allow_negative_balance,
          max_negative_limit: existing.max_negative_limit,
          enable_carry_forward: existing.enable_carry_forward,
          max_carry_forward_limit: existing.max_carry_forward_limit,
          carry_forward_expiry_months: existing.carry_forward_expiry_months,
          custom_reset_cycle: existing.custom_reset_cycle,
        } : {
          override_enabled: false,
          allow_negative_balance: null,
          max_negative_limit: null,
          enable_carry_forward: null,
          max_carry_forward_limit: null,
          carry_forward_expiry_months: null,
          custom_reset_cycle: null,
        };
      });
      setOverrideForms(forms);
    }
  }, [overrides, leaveTypes]);

  const updateOverride = (leaveTypeId: string, field: keyof OverrideForm, value: any) => {
    setOverrideForms(prev => ({
      ...prev,
      [leaveTypeId]: { ...prev[leaveTypeId], [field]: value },
    }));
  };

  const updateAccrual = (leaveTypeId: string, field: keyof AccrualForm, value: any) => {
    setAccrualForms(prev => ({
      ...prev,
      [leaveTypeId]: { ...prev[leaveTypeId], [field]: value },
    }));
  };

  const updateAccrualConfig = (leaveTypeId: string, field: keyof AccrualConfigForm, value: any) => {
    setAccrualConfigForms(prev => ({
      ...prev,
      [leaveTypeId]: { ...prev[leaveTypeId], [field]: value },
    }));
  };

  const detectAccrualChanges = (): string[] => {
    const changed: string[] = [];
    for (const lt of leaveTypes) {
      const current = accrualForms[lt.id];
      const original = originalAccrualForms[lt.id];
      if (!current || !original) continue;
      // Only flag if this is an existing policy (original had values > 0 or was monthly)
      if (original.yearly_entitlement > 0 && (
        current.yearly_entitlement !== original.yearly_entitlement ||
        current.accrual_type !== original.accrual_type
      )) {
        changed.push(lt.id);
      }
    }
    return changed;
  };

  const handleSave = async () => {
    // Check if any existing monthly accrual policies changed
    const changed = detectAccrualChanges();
    const hasMonthlyChanges = changed.some(id => 
      accrualForms[id]?.accrual_type === 'monthly' || originalAccrualForms[id]?.accrual_type === 'monthly'
    );

    if (hasMonthlyChanges && !showUpdateModeModal) {
      setChangedLeaveTypeIds(changed);
      setShowUpdateModeModal(true);
      return;
    }

    setIsSaving(true);
    try {
      // Save global policy
      if (globalPolicy?.id) {
        const { error } = await supabase
          .from('global_leave_policy')
          .update({ ...globalForm, updated_at: new Date().toISOString() })
          .eq('id', globalPolicy.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('global_leave_policy')
          .insert(globalForm);
        if (error) throw error;
      }

      // Save overrides
      for (const lt of leaveTypes) {
        const form = overrideForms[lt.id];
        if (!form) continue;
        const existingOverride = overrides?.find(o => o.leave_type_id === lt.id);

        if (existingOverride) {
          const { error } = await supabase
            .from('leave_type_policy_override')
            .update({ ...form, updated_at: new Date().toISOString() })
            .eq('id', existingOverride.id);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from('leave_type_policy_override')
            .insert({ leave_type_id: lt.id, ...form });
          if (error) throw error;
        }
      }

      // Save accrual settings to leave_policy
      for (const lt of leaveTypes) {
        const accrual = accrualForms[lt.id];
        if (!accrual) continue;

        // Include last_update_mode for changed monthly policies
        const isChanged = changedLeaveTypeIds.includes(lt.id);
        const payload: any = {
          leave_type_id: lt.id,
          accrual_type: accrual.accrual_type,
          yearly_entitlement: accrual.yearly_entitlement,
          is_active: true,
        };
        if (isChanged) {
          payload.last_update_mode = updateMode;
        }

        const { error } = await supabase
          .from('leave_policy')
          .upsert(payload, { onConflict: 'leave_type_id' });
        if (error) throw error;
      }

      // Save accrual_config settings
      for (const lt of leaveTypes) {
        const config = accrualConfigForms[lt.id];
        if (!config) continue;

        const { error } = await supabase
          .from('accrual_config')
          .upsert({
            leave_type_id: lt.id,
            frequency: config.frequency,
            divisor: config.divisor,
            round_mode: config.round_mode,
            prorate_joining: config.prorate_joining,
            credit_day: config.credit_day,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'leave_type_id' });
        if (error) throw error;
      }

      // Update originals to reflect saved state
      setOriginalAccrualForms(JSON.parse(JSON.stringify(accrualForms)));
      setChangedLeaveTypeIds([]);
      setShowUpdateModeModal(false);
      setUpdateMode('next_month');

      queryClient.invalidateQueries({ queryKey: ['global-leave-policy'] });
      queryClient.invalidateQueries({ queryKey: ['leave-type-overrides'] });
      queryClient.invalidateQueries({ queryKey: ['leave-policies'] });
      queryClient.invalidateQueries({ queryKey: ['leave-balances'] });
      toast.success('Leave policy saved successfully');
    } catch (error) {
      console.error('Error saving leave policy:', error);
      toast.error('Failed to save leave policy');
    } finally {
      setIsSaving(false);
    }
  };

  const isLoading = loadingGlobal || loadingOverrides || loadingTypes;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!globalPolicy && globalPolicyError) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Unable to load policy</AlertTitle>
        <AlertDescription>Please try again or contact your administrator.</AlertDescription>
      </Alert>
    );
  }

  if (!globalPolicy && !globalPolicyError) {
    return (
      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>No policy configured yet</AlertTitle>
        <AlertDescription>Click Save to create the default leave policy.</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      {isGlobalFallback && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Default config loaded</AlertTitle>
          <AlertDescription>Check permissions if saving fails.</AlertDescription>
        </Alert>
      )}
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Leave Policy
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Configure global leave rules and per-type overrides
          </p>
        </div>
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          {isSaving ? 'Saving...' : 'Save Policy'}
        </Button>
      </div>

      {/* Global Leave Rules Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Global Leave Rules
          </CardTitle>
          <CardDescription>
            Default rules applied to all leave types unless overridden
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* General Settings */}
          <div>
            <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
              <CheckSquare className="h-4 w-4" />
              General Settings
            </h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/30">
                <div>
                  <Label className="text-base font-semibold">Enable Leave Management</Label>
                  <p className="text-sm text-muted-foreground mt-1">Master toggle for the entire leave system</p>
                </div>
                <Switch
                  checked={globalForm.is_enabled}
                  onCheckedChange={(checked) => setGlobalForm({ ...globalForm, is_enabled: checked })}
                />
              </div>

              <div className="space-y-2">
                <Label>Reset Cycle</Label>
                <Select
                  value={globalForm.reset_cycle}
                  onValueChange={(value) => setGlobalForm({ ...globalForm, reset_cycle: value })}
                >
                  <SelectTrigger className="max-w-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="calendar_year">Calendar Year (Jan – Dec)</SelectItem>
                    <SelectItem value="financial_year">Financial Year (Apr – Mar)</SelectItem>
                    <SelectItem value="custom">Custom Date</SelectItem>
                  </SelectContent>
                </Select>
                {globalForm.reset_cycle === 'custom' && (
                  <Input
                    type="date"
                    value={globalForm.custom_reset_date || ''}
                    onChange={(e) => setGlobalForm({ ...globalForm, custom_reset_date: e.target.value || null })}
                    className="max-w-sm mt-2"
                  />
                )}
              </div>
            </div>
          </div>

          {globalForm.is_enabled && (
            <>
              <Separator />

              {/* Balance Behaviour */}
              <div>
                <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
                  <CalendarDays className="h-4 w-4" />
                  Balance Behaviour
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Left Column */}
                  <div className="space-y-4">
                    <div className="p-4 rounded-lg border space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <Label>Allow Negative Balance</Label>
                          <p className="text-xs text-muted-foreground">Allow leave even when balance is zero</p>
                        </div>
                        <Switch
                          checked={globalForm.allow_negative_balance}
                          onCheckedChange={(checked) => setGlobalForm({ ...globalForm, allow_negative_balance: checked })}
                        />
                      </div>
                      {globalForm.allow_negative_balance && (
                        <div className="space-y-1">
                          <Label className="text-xs">Max Negative Limit (days)</Label>
                          <Input
                            type="number"
                            value={globalForm.max_negative_limit}
                            onChange={(e) => setGlobalForm({ ...globalForm, max_negative_limit: parseInt(e.target.value) || 0 })}
                            min={0}
                            max={30}
                          />
                        </div>
                      )}
                    </div>

                    <div className="p-4 rounded-lg border space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <Label>Enable Carry Forward</Label>
                          <p className="text-xs text-muted-foreground">Carry unused leaves to next cycle</p>
                        </div>
                        <Switch
                          checked={globalForm.enable_carry_forward}
                          onCheckedChange={(checked) => setGlobalForm({ ...globalForm, enable_carry_forward: checked })}
                        />
                      </div>
                      {globalForm.enable_carry_forward && (
                        <>
                          <div className="space-y-1">
                            <Label className="text-xs">Max Carry Forward (days)</Label>
                            <Input
                              type="number"
                              value={globalForm.max_carry_forward_limit}
                              onChange={(e) => setGlobalForm({ ...globalForm, max_carry_forward_limit: parseInt(e.target.value) || 0 })}
                              min={0}
                              max={365}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Expiry (months, blank = no expiry)</Label>
                            <Input
                              type="number"
                              value={globalForm.carry_forward_expiry_months ?? ''}
                              onChange={(e) => setGlobalForm({ ...globalForm, carry_forward_expiry_months: e.target.value ? parseInt(e.target.value) : null })}
                              min={1}
                              max={24}
                              placeholder="No expiry"
                            />
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Right Column */}
                  <div className="space-y-4">
                    <div className="p-4 rounded-lg border space-y-3">
                      <div className="space-y-1">
                        <Label>Min Notice Period (days)</Label>
                        <Input
                          type="number"
                          value={globalForm.min_notice_period_days}
                          onChange={(e) => setGlobalForm({ ...globalForm, min_notice_period_days: parseInt(e.target.value) || 0 })}
                          min={0}
                          max={90}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label>Max Continuous Leave (days, blank = unlimited)</Label>
                        <Input
                          type="number"
                          value={globalForm.max_continuous_leave_days ?? ''}
                          onChange={(e) => setGlobalForm({ ...globalForm, max_continuous_leave_days: e.target.value ? parseInt(e.target.value) : null })}
                          min={1}
                          max={365}
                          placeholder="Unlimited"
                        />
                      </div>
                    </div>

                    <div className="p-4 rounded-lg border space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <Label>Allow Backdated Leave</Label>
                          <p className="text-xs text-muted-foreground">Apply leave for past dates</p>
                        </div>
                        <Switch
                          checked={globalForm.allow_backdated_leave}
                          onCheckedChange={(checked) => setGlobalForm({ ...globalForm, allow_backdated_leave: checked })}
                        />
                      </div>
                      {globalForm.allow_backdated_leave && (
                        <div className="space-y-1">
                          <Label className="text-xs">Max Backdate Days</Label>
                          <Input
                            type="number"
                            value={globalForm.max_backdate_days}
                            onChange={(e) => setGlobalForm({ ...globalForm, max_backdate_days: parseInt(e.target.value) || 0 })}
                            min={0}
                            max={90}
                          />
                        </div>
                      )}
                    </div>

                    <div className="p-4 rounded-lg border space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <Label>Enable Half Day</Label>
                          <p className="text-xs text-muted-foreground">Allow half-day leave applications</p>
                        </div>
                        <Switch
                          checked={globalForm.enable_half_day}
                          onCheckedChange={(checked) => setGlobalForm({ ...globalForm, enable_half_day: checked })}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <Label>Enable Sandwich Rule</Label>
                          <p className="text-xs text-muted-foreground">Count weekends/holidays between leaves</p>
                        </div>
                        <Switch
                          checked={globalForm.enable_sandwich_rule}
                          onCheckedChange={(checked) => setGlobalForm({ ...globalForm, enable_sandwich_rule: checked })}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Leave Type Behaviour Card */}
      {globalForm.is_enabled && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5" />
              Leave Type Behaviour
            </CardTitle>
            <CardDescription>
              Optionally override global rules for specific leave types
            </CardDescription>
          </CardHeader>
          <CardContent>
            {leaveTypes.length === 0 ? (
              <p className="text-center py-4 text-muted-foreground">No active leave types found.</p>
            ) : (
              <Accordion type="multiple" className="space-y-2">
                {leaveTypes.map(lt => {
                  const form = overrideForms[lt.id];
                  if (!form) return null;
                  return (
                    <AccordionItem key={lt.id} value={lt.id} className="border rounded-lg px-4">
                      <AccordionTrigger className="hover:no-underline">
                        <div className="flex items-center gap-3">
                          <span className="font-medium">{lt.name}</span>
                          {form.override_enabled && (
                            <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                              Custom Rules
                            </span>
                          )}
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="space-y-4 pt-2">
                          {/* Accrual & Entitlement - always visible */}
                          <div className="p-4 rounded-lg border bg-muted/30 space-y-3">
                            <h4 className="text-sm font-semibold flex items-center gap-2">
                              <Clock className="h-4 w-4" />
                              Accrual & Entitlement
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div className="space-y-1">
                                <Label className="text-xs">Accrual Type</Label>
                                <Select
                                  value={accrualForms[lt.id]?.accrual_type || 'yearly'}
                                  onValueChange={(value) => updateAccrual(lt.id, 'accrual_type', value)}
                                >
                                  <SelectTrigger>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="yearly">Yearly (full entitlement at start)</SelectItem>
                                    <SelectItem value="monthly">Monthly (credited each month)</SelectItem>
                                    <SelectItem value="quarterly">Quarterly</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">Yearly Entitlement (days)</Label>
                                <Input
                                  type="number"
                                  value={accrualForms[lt.id]?.yearly_entitlement ?? 0}
                                  onChange={(e) => updateAccrual(lt.id, 'yearly_entitlement', parseFloat(e.target.value) || 0)}
                                  min={0}
                                  max={365}
                                />
                              </div>
                            </div>
                            {accrualForms[lt.id]?.accrual_type === 'monthly' && accrualForms[lt.id]?.yearly_entitlement > 0 && (
                              <p className="text-xs text-muted-foreground">
                                ℹ Monthly credit: {(accrualForms[lt.id].yearly_entitlement / (accrualConfigForms[lt.id]?.divisor || 12)).toFixed(2)} days/month
                              </p>
                            )}
                            {accrualForms[lt.id]?.accrual_type === 'quarterly' && accrualForms[lt.id]?.yearly_entitlement > 0 && (
                              <p className="text-xs text-muted-foreground">
                                ℹ Quarterly credit: {(accrualForms[lt.id].yearly_entitlement / (accrualConfigForms[lt.id]?.divisor || 4)).toFixed(2)} days/quarter
                              </p>
                            )}

                            {/* Advanced Accrual Configuration */}
                            {accrualForms[lt.id]?.accrual_type !== 'yearly' && (
                              <div className="mt-3 pt-3 border-t space-y-3">
                                <h5 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Advanced Accrual Settings</h5>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                  <div className="space-y-1">
                                    <Label className="text-xs">Frequency</Label>
                                    <Select
                                      value={accrualConfigForms[lt.id]?.frequency || 'monthly'}
                                      onValueChange={(value) => {
                                        updateAccrualConfig(lt.id, 'frequency', value);
                                        // Auto-set divisor
                                        const divisorMap: Record<string, number> = { monthly: 12, quarterly: 4, annual: 1 };
                                        updateAccrualConfig(lt.id, 'divisor', divisorMap[value] || 12);
                                      }}
                                    >
                                      <SelectTrigger>
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="monthly">Monthly</SelectItem>
                                        <SelectItem value="quarterly">Quarterly</SelectItem>
                                        <SelectItem value="annual">Annual</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-xs">Divisor</Label>
                                    <Input
                                      type="number"
                                      value={accrualConfigForms[lt.id]?.divisor ?? 12}
                                      onChange={(e) => updateAccrualConfig(lt.id, 'divisor', parseInt(e.target.value) || 12)}
                                      min={1}
                                      max={365}
                                    />
                                    <p className="text-[10px] text-muted-foreground">Yearly entitlement ÷ this = per-period credit</p>
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-xs">Rounding</Label>
                                    <Select
                                      value={accrualConfigForms[lt.id]?.round_mode || 'round'}
                                      onValueChange={(value) => updateAccrualConfig(lt.id, 'round_mode', value)}
                                    >
                                      <SelectTrigger>
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="round">Round (nearest)</SelectItem>
                                        <SelectItem value="floor">Floor (round down)</SelectItem>
                                        <SelectItem value="ceil">Ceil (round up)</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                  <div className="space-y-1">
                                    <Label className="text-xs">Credit Day of Period</Label>
                                    <Input
                                      type="number"
                                      value={accrualConfigForms[lt.id]?.credit_day ?? 1}
                                      onChange={(e) => updateAccrualConfig(lt.id, 'credit_day', parseInt(e.target.value) || 1)}
                                      min={1}
                                      max={28}
                                    />
                                  </div>
                                  <div className="flex items-center justify-between p-2 rounded border">
                                    <div>
                                      <Label className="text-xs">Prorate for Mid-Period Joiners</Label>
                                      <p className="text-[10px] text-muted-foreground">Reduce first credit based on joining date</p>
                                    </div>
                                    <Switch
                                      checked={accrualConfigForms[lt.id]?.prorate_joining ?? false}
                                      onCheckedChange={(checked) => updateAccrualConfig(lt.id, 'prorate_joining', checked)}
                                    />
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>

                          <Separator />

                          <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
                            <div>
                              <Label className="font-semibold">Override Global Rules</Label>
                              <p className="text-xs text-muted-foreground mt-1">
                                Enable custom settings for this leave type
                              </p>
                            </div>
                            <Switch
                              checked={form.override_enabled}
                              onCheckedChange={(checked) => updateOverride(lt.id, 'override_enabled', checked)}
                            />
                          </div>

                          {!form.override_enabled ? (
                            <p className="text-sm text-muted-foreground italic py-2">
                              This leave type follows global leave policy rules.
                            </p>
                          ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              {/* Override: Negative Balance */}
                              <div className="p-4 rounded-lg border space-y-3">
                                <div className="flex items-center justify-between">
                                  <Label>Allow Negative Balance</Label>
                                  <Switch
                                    checked={form.allow_negative_balance ?? false}
                                    onCheckedChange={(checked) => updateOverride(lt.id, 'allow_negative_balance', checked)}
                                  />
                                </div>
                                {form.allow_negative_balance && (
                                  <div className="space-y-1">
                                    <Label className="text-xs">Max Negative Limit</Label>
                                    <Input
                                      type="number"
                                      value={form.max_negative_limit ?? 0}
                                      onChange={(e) => updateOverride(lt.id, 'max_negative_limit', parseInt(e.target.value) || 0)}
                                      min={0}
                                      max={30}
                                    />
                                  </div>
                                )}
                              </div>

                              {/* Override: Carry Forward */}
                              <div className="p-4 rounded-lg border space-y-3">
                                <div className="flex items-center justify-between">
                                  <Label>Enable Carry Forward</Label>
                                  <Switch
                                    checked={form.enable_carry_forward ?? false}
                                    onCheckedChange={(checked) => updateOverride(lt.id, 'enable_carry_forward', checked)}
                                  />
                                </div>
                                {form.enable_carry_forward && (
                                  <>
                                    <div className="space-y-1">
                                      <Label className="text-xs">Max Carry Forward</Label>
                                      <Input
                                        type="number"
                                        value={form.max_carry_forward_limit ?? 0}
                                        onChange={(e) => updateOverride(lt.id, 'max_carry_forward_limit', parseInt(e.target.value) || 0)}
                                        min={0}
                                        max={365}
                                      />
                                    </div>
                                    <div className="space-y-1">
                                      <Label className="text-xs">Expiry (months)</Label>
                                      <Input
                                        type="number"
                                        value={form.carry_forward_expiry_months ?? ''}
                                        onChange={(e) => updateOverride(lt.id, 'carry_forward_expiry_months', e.target.value ? parseInt(e.target.value) : null)}
                                        min={1}
                                        max={24}
                                        placeholder="No expiry"
                                      />
                                    </div>
                                  </>
                                )}
                              </div>

                              {/* Override: Custom Reset Cycle */}
                              <div className="p-4 rounded-lg border space-y-2 md:col-span-2">
                                <Label>Custom Reset Cycle (leave blank to use global)</Label>
                                <Select
                                  value={form.custom_reset_cycle || 'global'}
                                  onValueChange={(value) => updateOverride(lt.id, 'custom_reset_cycle', value === 'global' ? null : value)}
                                >
                                  <SelectTrigger className="max-w-sm">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="global">Use Global Setting</SelectItem>
                                    <SelectItem value="calendar_year">Calendar Year</SelectItem>
                                    <SelectItem value="financial_year">Financial Year</SelectItem>
                                    <SelectItem value="custom">Custom</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                          )}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
              </Accordion>
            )}
          </CardContent>
        </Card>
      )}

      {/* Update Mode Modal */}
      <Dialog open={showUpdateModeModal} onOpenChange={(open) => {
        if (!open) {
          setShowUpdateModeModal(false);
          setUpdateMode('next_month');
          setChangedLeaveTypeIds([]);
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>How should the entitlement change take effect?</DialogTitle>
            <DialogDescription>
              You've changed the accrual entitlement for{' '}
              {changedLeaveTypeIds.map(id => leaveTypes.find(lt => lt.id === id)?.name).filter(Boolean).join(', ')}.
              Choose how to apply the update to existing balances.
            </DialogDescription>
          </DialogHeader>
          <RadioGroup value={updateMode} onValueChange={(v) => setUpdateMode(v as any)} className="space-y-3 py-4">
            <div className="flex items-start space-x-3 p-3 rounded-lg border hover:bg-muted/50 cursor-pointer">
              <RadioGroupItem value="retroactive" id="retroactive" className="mt-0.5" />
              <Label htmlFor="retroactive" className="cursor-pointer">
                <div className="font-medium">Retroactive</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Recalculate all balances from January to now at the new rate
                </p>
              </Label>
            </div>
            <div className="flex items-start space-x-3 p-3 rounded-lg border hover:bg-muted/50 cursor-pointer">
              <RadioGroupItem value="current_month" id="current_month" className="mt-0.5" />
              <Label htmlFor="current_month" className="cursor-pointer">
                <div className="font-medium">From current month</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Apply new rate starting this month; past months unchanged
                </p>
              </Label>
            </div>
            <div className="flex items-start space-x-3 p-3 rounded-lg border hover:bg-muted/50 cursor-pointer">
              <RadioGroupItem value="next_month" id="next_month" className="mt-0.5" />
              <Label htmlFor="next_month" className="cursor-pointer">
                <div className="font-medium">From next month</div>
                <p className="text-xs text-muted-foreground mt-1">
                  New rate applies from next month onward only
                </p>
              </Label>
            </div>
          </RadioGroup>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowUpdateModeModal(false);
              setUpdateMode('next_month');
              setChangedLeaveTypeIds([]);
            }}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              Confirm & Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default LeavePolicyConfig;
