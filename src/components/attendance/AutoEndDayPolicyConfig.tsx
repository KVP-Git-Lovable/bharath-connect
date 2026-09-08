import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { toast } from 'sonner';
import { Save, Clock, Bell, MapPin, Loader2, Power, AlertCircle, Info } from 'lucide-react';
import { useAutoEndDayPolicy, useUpdateAutoEndDayPolicy } from '@/hooks/useAutoEndDayPolicy';

const TIMEZONES = [
  { value: 'Asia/Kolkata', label: 'IST (India Standard Time)' },
  { value: 'Asia/Dubai', label: 'GST (Gulf Standard Time)' },
  { value: 'Asia/Singapore', label: 'SGT (Singapore Time)' },
  { value: 'Asia/Tokyo', label: 'JST (Japan Standard Time)' },
  { value: 'America/New_York', label: 'EST (Eastern US)' },
  { value: 'Europe/London', label: 'GMT (London)' },
];

const ACTIVITY_SOURCES = [
  { value: 'all_activity', label: 'All Activity', description: 'Visits, orders, page views & sessions' },
  { value: 'last_order_only', label: 'Last Order Only', description: 'Only consider order timestamps' },
  { value: 'last_click', label: 'Last App Interaction', description: 'Only page views & session activity' },
];

const AutoEndDayPolicyConfig = () => {
  const { data: policyResult, isLoading } = useAutoEndDayPolicy();
  const policy = policyResult?.data ?? null;
  const policyError = policyResult?.error ?? null;
  const isFallback = policyResult?.isFallback ?? false;
  const updatePolicy = useUpdateAutoEndDayPolicy();
  const errorToastShown = useRef(false);

  useEffect(() => {
    if (policyError && !policy && !errorToastShown.current) {
      toast.error('Failed to load Auto End Day policy');
      errorToastShown.current = true;
    }
    if (isFallback && policy && !errorToastShown.current) {
      toast.warning('Default config loaded. Check permissions if saving fails.');
      errorToastShown.current = true;
    }
  }, [policyError, policy, isFallback]);

  const [form, setForm] = useState<{
    is_enabled: boolean;
    auto_close_time: string;
    timezone: string;
    last_activity_source: 'all_activity' | 'last_order_only' | 'last_click';
    pre_warning_enabled: boolean;
    pre_warning_time: string;
    close_in_progress_visits: boolean;
    cancel_planned_visits: boolean;
    mark_unproductive: boolean;
  }>({
    is_enabled: true,
    auto_close_time: '22:00',
    timezone: 'Asia/Kolkata',
    last_activity_source: 'all_activity',
    pre_warning_enabled: true,
    pre_warning_time: '22:00',
    close_in_progress_visits: true,
    cancel_planned_visits: true,
    mark_unproductive: true,
  });

  useEffect(() => {
    if (policy) {
      setForm({
        is_enabled: policy.is_enabled,
        auto_close_time: policy.auto_close_time?.substring(0, 5) || '22:00',
        timezone: policy.timezone,
        last_activity_source: policy.last_activity_source,
        pre_warning_enabled: policy.pre_warning_enabled,
        pre_warning_time: policy.pre_warning_time?.substring(0, 5) || '22:00',
        close_in_progress_visits: policy.close_in_progress_visits,
        cancel_planned_visits: policy.cancel_planned_visits,
        mark_unproductive: policy.mark_unproductive,
      });
    }
  }, [policy]);

  const handleSave = () => {
    if (!policy?.id) return;
    updatePolicy.mutate({
      id: policy.id,
      ...form,
      auto_close_time: form.auto_close_time + ':00',
    });
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!policy && policyError) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Unable to load policy</AlertTitle>
        <AlertDescription>Please try again or contact your administrator.</AlertDescription>
      </Alert>
    );
  }

  if (!policy && !policyError) {
    return (
      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>No policy configured yet</AlertTitle>
        <AlertDescription>Click Save to create the default Auto End Day policy.</AlertDescription>
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
          <div className="flex items-center gap-2">
            <Power className="h-5 w-5 text-primary" />
            <div>
              <CardTitle className="text-lg">Auto End Day Policy</CardTitle>
              <CardDescription>
                Configure automatic attendance checkout for users who forget to end their day
              </CardDescription>
            </div>
          </div>
          <Switch
            checked={form.is_enabled}
            onCheckedChange={(checked) => setForm(prev => ({ ...prev, is_enabled: checked }))}
          />
        </div>
      </CardHeader>

      {form.is_enabled && (
        <CardContent className="space-y-6">
          {/* Timing Section */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Clock className="h-4 w-4 text-primary" />
              Timing Configuration
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="auto_close_time">Auto-Close Time</Label>
                <Input
                  id="auto_close_time"
                  type="time"
                  value={form.auto_close_time}
                  onChange={(e) => setForm(prev => ({ ...prev, auto_close_time: e.target.value }))}
                />
                <p className="text-xs text-muted-foreground">
                  Attendance will be auto-closed at this time daily
                </p>
              </div>

              <div className="space-y-2">
                <Label>Timezone</Label>
                <Select
                  value={form.timezone}
                  onValueChange={(value) => setForm(prev => ({ ...prev, timezone: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIMEZONES.map(tz => (
                      <SelectItem key={tz.value} value={tz.value}>{tz.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <Separator />

          {/* Activity Source */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <MapPin className="h-4 w-4 text-primary" />
              Last Activity Detection
            </div>
            <p className="text-xs text-muted-foreground">
              Determines how the system calculates the user's checkout time
            </p>

            <Select
              value={form.last_activity_source}
              onValueChange={(value: 'all_activity' | 'last_order_only' | 'last_click') => setForm(prev => ({ ...prev, last_activity_source: value }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ACTIVITY_SOURCES.map(src => (
                  <SelectItem key={src.value} value={src.value}>
                    <div>
                      <span className="font-medium">{src.label}</span>
                      <span className="text-muted-foreground ml-2 text-xs">— {src.description}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Separator />

          {/* Pre-Warning Notification */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Bell className="h-4 w-4 text-primary" />
                Pre-Warning Notification
              </div>
              <Switch
                checked={form.pre_warning_enabled}
                onCheckedChange={(checked) => setForm(prev => ({ ...prev, pre_warning_enabled: checked }))}
              />
            </div>

            {form.pre_warning_enabled && (
              <div className="space-y-2">
                <Label htmlFor="pre_warning_time">Warning Notification Time</Label>
                <Input
                  id="pre_warning_time"
                  type="time"
                  value={form.pre_warning_time}
                  onChange={(e) => setForm(prev => ({ ...prev, pre_warning_time: e.target.value }))}
                />
                <p className="text-xs text-muted-foreground">
                  Users will receive a warning notification at this exact time.
                  Configure the message content in Notification Rules → AUTO_DAY_WARNING.
                </p>
              </div>
            )}
          </div>

          <Separator />

          {/* Visit Handling */}
          <div className="space-y-4">
            <div className="text-sm font-medium text-foreground">
              Visit Handling on Auto-Close
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Close In-Progress Visits</Label>
                  <p className="text-xs text-muted-foreground">Auto-close visits that are still in progress</p>
                </div>
                <Switch
                  checked={form.close_in_progress_visits}
                  onCheckedChange={(checked) => setForm(prev => ({ ...prev, close_in_progress_visits: checked }))}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label>Cancel Planned Visits</Label>
                  <p className="text-xs text-muted-foreground">Cancel remaining planned visits for the day</p>
                </div>
                <Switch
                  checked={form.cancel_planned_visits}
                  onCheckedChange={(checked) => setForm(prev => ({ ...prev, cancel_planned_visits: checked }))}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label>Mark as Unproductive</Label>
                  <p className="text-xs text-muted-foreground">Mark auto-closed visits as unproductive</p>
                </div>
                <Switch
                  checked={form.mark_unproductive}
                  onCheckedChange={(checked) => setForm(prev => ({ ...prev, mark_unproductive: checked }))}
                />
              </div>
            </div>
          </div>

          <Separator />

          <Button onClick={handleSave} disabled={updatePolicy.isPending} className="w-full">
            {updatePolicy.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Save Auto End Day Policy
          </Button>
        </CardContent>
      )}
    </Card>
  );
};

export default AutoEndDayPolicyConfig;
