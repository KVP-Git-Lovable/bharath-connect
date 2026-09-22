import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { CalendarClock, Loader2, Search, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { usePeopleOptions } from "@/hooks/useNotificationRules";
import {
  CADENCES,
  PERIODS,
  RECIPIENT_MODES,
  REPORT_MODULES,
  WEEKDAYS,
  previewSubscription,
  useSavedReports,
  useSaveSubscription,
  type ReportSubscription,
  type SubscriptionPreview,
} from "@/hooks/useReportSubscriptions";

type Form = {
  name: string;
  module: string;
  savedReportId: string;
  period: string;
  cadence: string;
  fire_time: string;
  fire_weekday: number;
  fire_monthday: number;
  recipient_mode: string;
  recipient_role: string;
  recipient_user_ids: string[];
  push_to_phone: boolean;
  active: boolean;
};

const EMPTY: Form = {
  name: "",
  module: "attendance",
  savedReportId: "none",
  period: "yesterday",
  cadence: "mon_sat",
  fire_time: "09:00",
  fire_weekday: 1,
  fire_monthday: 1,
  recipient_mode: "managers",
  recipient_role: "",
  recipient_user_ids: [],
  push_to_phone: true,
  active: true,
};

function fromSub(s: ReportSubscription): Form {
  return {
    name: s.name,
    module: s.module,
    savedReportId: "keep",
    period: s.period,
    cadence: s.cadence,
    fire_time: s.fire_time.slice(0, 5),
    fire_weekday: s.fire_weekday ?? 1,
    fire_monthday: s.fire_monthday ?? 1,
    recipient_mode: s.recipient_mode,
    recipient_role: s.recipient_role ?? "",
    recipient_user_ids: s.recipient_user_ids ?? [],
    push_to_phone: s.push_to_phone,
    active: s.status === "active",
  };
}

export default function SubscriptionEditorDialog({
  open,
  onOpenChange,
  subscription,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  subscription: ReportSubscription | null;
}) {
  const [form, setForm] = useState<Form>(EMPTY);
  const [peopleSearch, setPeopleSearch] = useState("");
  const [preview, setPreview] = useState<SubscriptionPreview | null>(null);
  const { data: people } = usePeopleOptions();
  const save = useSaveSubscription();
  const moduleDef = REPORT_MODULES.find((m) => m.value === form.module);
  const { data: savedReports = [] } = useSavedReports(moduleDef?.savedModule ?? null);

  useEffect(() => {
    if (!open) return;
    setForm(subscription ? fromSub(subscription) : EMPTY);
    setPeopleSearch("");
  }, [open, subscription]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  // Live preview of next run, period and recipients (debounced).
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      previewSubscription({
        cadence: form.cadence,
        fire_time: form.fire_time,
        fire_weekday: form.cadence === "weekly" ? form.fire_weekday : null,
        fire_monthday: form.cadence === "monthly" ? form.fire_monthday : null,
        period: form.period,
        recipient_mode: form.recipient_mode,
        recipient_role: form.recipient_role || null,
        recipient_user_ids: form.recipient_user_ids,
      })
        .then(setPreview)
        .catch(() => setPreview(null));
    }, 300);
    return () => clearTimeout(t);
  }, [open, form.cadence, form.fire_time, form.fire_weekday, form.fire_monthday, form.period, form.recipient_mode, form.recipient_role, form.recipient_user_ids]);

  const filteredPeople = useMemo(
    () => (people?.users || []).filter((u) => u.name.toLowerCase().includes(peopleSearch.toLowerCase())),
    [people, peopleSearch]
  );

  const togglePerson = (id: string) =>
    set(
      "recipient_user_ids",
      form.recipient_user_ids.includes(id)
        ? form.recipient_user_ids.filter((x) => x !== id)
        : [...form.recipient_user_ids, id]
    );

  const validation = (() => {
    if (!form.name.trim()) return "Give the subscription a name";
    if (form.recipient_mode === "users" && form.recipient_user_ids.length === 0) return "Choose at least one person";
    if (form.recipient_mode === "role" && !form.recipient_role) return "Choose a security profile";
    return null;
  })();

  const onSave = async () => {
    if (validation) { toast.error(validation); return; }
    const saved = savedReports.find((r) => r.id === form.savedReportId);
    const values: Record<string, unknown> = {
      name: form.name.trim(),
      module: form.module,
      period: form.period,
      cadence: form.cadence,
      fire_time: form.fire_time,
      fire_weekday: form.cadence === "weekly" ? form.fire_weekday : null,
      fire_monthday: form.cadence === "monthly" ? form.fire_monthday : null,
      recipient_mode: form.recipient_mode,
      recipient_role: form.recipient_mode === "role" ? form.recipient_role : null,
      recipient_user_ids: form.recipient_mode === "users" ? form.recipient_user_ids : [],
      push_to_phone: form.push_to_phone,
      status: form.active ? "active" : "paused",
    };
    // Snapshot the chosen saved report's filters/columns/charts for recipients.
    if (form.savedReportId === "none" || (subscription && subscription.module !== form.module && form.savedReportId === "keep")) {
      values['report_config'] = {};
      values['saved_report_name'] = null;
    } else if (saved) {
      values['report_config'] = saved.config ?? {};
      values['saved_report_name'] = saved.name;
    }
    try {
      await save.mutateAsync({ id: subscription?.id!, values: values as never });
      toast.success(subscription ? "Subscription updated" : "Subscription created");
      onOpenChange(false);
    } catch (e) {
      toast.error("Could not save", { description: (e as Error).message });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{subscription ? "Edit subscription" : "New report subscription"}</DialogTitle>
          <DialogDescription>
            On schedule, each recipient gets a notification with the headline numbers for their team and a link to
            the full report for that period.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="sub-name">Name</Label>
            <Input id="sub-name" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Daily attendance" />
          </div>

          <section className="space-y-3">
            <h4 className="text-sm font-semibold">Report</h4>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Report</Label>
                <Select value={form.module} onValueChange={(v) => setForm((f) => ({ ...f, module: v, savedReportId: "none" }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {REPORT_MODULES.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Covers</Label>
                <Select value={form.period} onValueChange={(v) => set("period", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PERIODS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {moduleDef?.savedModule && (
              <div className="space-y-1.5">
                <Label>Layout</Label>
                <Select value={form.savedReportId} onValueChange={(v) => set("savedReportId", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {subscription?.saved_report_name && subscription.module === form.module && (
                      <SelectItem value="keep">Keep “{subscription.saved_report_name}”</SelectItem>
                    )}
                    <SelectItem value="none">Standard report</SelectItem>
                    {savedReports.map((r) => <SelectItem key={r.id} value={r.id}>Saved: {r.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Pick one of your saved reports to send its filters, columns and charts. Save one first from the report screen.
                </p>
              </div>
            )}
          </section>

          <section className="space-y-3">
            <h4 className="text-sm font-semibold">Schedule</h4>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5 sm:col-span-1">
                <Label>Repeat</Label>
                <Select value={form.cadence} onValueChange={(v) => set("cadence", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CADENCES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {form.cadence === "weekly" && (
                <div className="space-y-1.5">
                  <Label>Day</Label>
                  <Select value={String(form.fire_weekday)} onValueChange={(v) => set("fire_weekday", Number(v))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {WEEKDAYS.map((d, i) => <SelectItem key={d} value={String(i + 1)}>{d}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {form.cadence === "monthly" && (
                <div className="space-y-1.5">
                  <Label>Day of month</Label>
                  <Select value={String(form.fire_monthday)} onValueChange={(v) => set("fire_monthday", Number(v))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                        <SelectItem key={d} value={String(d)}>{d === 31 ? "Last day" : d}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="sub-time">Time (IST)</Label>
                <Input id="sub-time" type="time" step={900} value={form.fire_time} onChange={(e) => set("fire_time", e.target.value || "09:00")} />
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <h4 className="text-sm font-semibold">Send to</h4>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Recipients</Label>
                <Select value={form.recipient_mode} onValueChange={(v) => set("recipient_mode", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {RECIPIENT_MODES.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">{RECIPIENT_MODES.find((m) => m.value === form.recipient_mode)?.hint}</p>
              </div>
              {form.recipient_mode === "role" && (
                <div className="space-y-1.5">
                  <Label>Security profile</Label>
                  <Select value={form.recipient_role} onValueChange={(v) => set("recipient_role", v)}>
                    <SelectTrigger><SelectValue placeholder="Choose profile" /></SelectTrigger>
                    <SelectContent>
                      {(people?.profiles || []).map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            {form.recipient_mode === "users" && (
              <div className="rounded-lg border">
                <div className="relative border-b">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={peopleSearch}
                    onChange={(e) => setPeopleSearch(e.target.value)}
                    placeholder="Search people…"
                    className="pl-8 border-0 shadow-none focus-visible:ring-0"
                  />
                </div>
                <div className="max-h-44 overflow-y-auto p-1">
                  {filteredPeople.map((u) => (
                    <label key={u.id} className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-muted/50 cursor-pointer">
                      <Checkbox checked={form.recipient_user_ids.includes(u.id)} onCheckedChange={() => togglePerson(u.id)} />
                      {u.name}
                    </label>
                  ))}
                  {filteredPeople.length === 0 && <p className="px-2 py-3 text-xs text-muted-foreground">No matches</p>}
                </div>
                <p className="border-t px-3 py-1.5 text-xs text-muted-foreground">{form.recipient_user_ids.length} selected</p>
              </div>
            )}
          </section>

          <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <CalendarClock className="h-3.5 w-3.5" /> What happens next
            </div>
            {preview?.next_run_at ? (
              <p className="text-sm">
                Next: <strong>{format(new Date(preview.next_run_at), "EEE d MMM, h:mm a")}</strong>, covering{" "}
                <strong>{preview.period_label}</strong>, to {preview.recipients.length}{" "}
                {preview.recipients.length === 1 ? "person" : "people"}.
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">Calculating…</p>
            )}
            {preview && preview.recipients.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {preview.recipients.slice(0, 12).map((n, i) => (
                  <Badge key={`${n}-${i}`} variant="secondary" className="font-normal">{n}</Badge>
                ))}
                {preview.recipients.length > 12 && (
                  <Badge variant="outline" className="font-normal">+{preview.recipients.length - 12} more</Badge>
                )}
              </div>
            )}
            {preview && preview.recipients.length === 0 && (
              <p className="text-xs text-amber-700">Nobody matches these recipients yet.</p>
            )}
          </div>

          <section className="grid gap-3 sm:grid-cols-2">
            <div className="flex items-center justify-between rounded-lg border px-3 py-2.5">
              <div className="flex items-center gap-2">
                <Smartphone className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm">Phone push</p>
                  <p className="text-xs text-muted-foreground">Always shown in the bell</p>
                </div>
              </div>
              <Switch checked={form.push_to_phone} onCheckedChange={(v) => set("push_to_phone", v)} />
            </div>
            <div className="flex items-center justify-between rounded-lg border px-3 py-2.5">
              <div>
                <p className="text-sm">Active</p>
                <p className="text-xs text-muted-foreground">Paused subscriptions don't send</p>
              </div>
              <Switch checked={form.active} onCheckedChange={(v) => set("active", v)} />
            </div>
          </section>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={onSave} disabled={save.isPending}>
            {save.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            {subscription ? "Save changes" : "Create subscription"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
