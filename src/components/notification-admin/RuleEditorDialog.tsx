import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Eye, Loader2, Smartphone, Users, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  CONTEXT_RECEIVERS,
  RECEIVER_TYPES,
  SAMPLE_VALUES,
  receiverOptions,
  SUGGESTED_TEXT,
  TOKEN_LABELS,
  fillSample,
  previewRecipients,
  useNotificationEventTypes,
  usePeopleOptions,
  useSaveNotificationRule,
  type NotificationRule,
} from "@/hooks/useNotificationRules";

type FormState = {
  name: string;
  source_table: string;
  event_code: string;
  receiver_type: string;
  receiver_role: string;
  receiver_user_id: string;
  include_secondary_manager: boolean;
  notification_channel: "in_app" | "in_app_push";
  title_template: string;
  message_template: string;
  is_active: boolean;
};

const EMPTY: FormState = {
  name: "",
  source_table: "",
  event_code: "",
  receiver_type: "manager",
  receiver_role: "",
  receiver_user_id: "",
  include_secondary_manager: false,
  notification_channel: "in_app_push",
  title_template: "",
  message_template: "",
  is_active: true,
};

function fromRule(rule: NotificationRule): FormState {
  return {
    name: rule.name,
    source_table: rule.source_table,
    event_code: rule.event_code,
    receiver_type: rule.receiver_type,
    receiver_role: rule.receiver_role ?? "",
    receiver_user_id: rule.receiver_user_id ?? "",
    include_secondary_manager: rule.include_secondary_manager,
    notification_channel: rule.notification_channel === "in_app" ? "in_app" : "in_app_push",
    title_template: rule.title_template,
    message_template: rule.message_template,
    is_active: rule.is_active,
  };
}

export default function RuleEditorDialog({
  open,
  onOpenChange,
  rule,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rule: NotificationRule | null;
}) {
  const { data: eventTypes = [] } = useNotificationEventTypes();
  const { data: people } = usePeopleOptions();
  const save = useSaveNotificationRule();

  const [form, setForm] = useState<FormState>(EMPTY);
  const [sampleActor, setSampleActor] = useState<string>("");
  const [recipients, setRecipients] = useState<{ id: string; name: string }[] | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const messageRef = useRef<HTMLTextAreaElement>(null);
  // Last caret position per field. null = the user never placed a caret there,
  // so a tapped detail is appended at the end (mobile browsers report stale
  // selection values once the field loses focus).
  const caret = useRef<{ title: number | null; message: number | null }>({ title: null, message: null });

  useEffect(() => {
    if (!open) return;
    setForm(rule ? fromRule(rule) : EMPTY);
    setRecipients(null);
    setSampleActor("");
    caret.current = { title: null, message: null };
  }, [open, rule]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (key !== "title_template" && key !== "message_template" && key !== "name" && key !== "is_active") {
      setRecipients(null);
    }
  };

  const modules = useMemo(() => {
    const seen = new Map<string, string>();
    eventTypes.forEach((e) => {
      if (!seen.has(e.source_table)) seen.set(e.source_table, e.module_label);
    });
    return Array.from(seen, ([value, label]) => ({ value, label }));
  }, [eventTypes]);

  const events = eventTypes.filter((e) => e.source_table === form.source_table);
  const selectedEvent = eventTypes.find(
    (e) => e.source_table === form.source_table && e.event_code === form.event_code
  );
  const tokens = selectedEvent?.tokens?.length ? selectedEvent.tokens : ["user_name", "date", "time"];
  const receivers = receiverOptions(form.source_table, selectedEvent?.extra_receivers);

  const rememberCaret = (field: "title" | "message", el: HTMLInputElement | HTMLTextAreaElement) => {
    caret.current[field] = el.selectionStart ?? el.value.length;
  };

  const insertToken = (field: "title" | "message", token: string) => {
    const key = field === "title" ? "title_template" : "message_template";
    const el = field === "title" ? titleRef.current : messageRef.current;
    const current = form[key];
    const pos = Math.min(caret.current[field] ?? current.length, current.length);
    const before = current.slice(0, pos);
    const after = current.slice(pos);
    // Keep details readable: separate from neighbouring words with a space.
    const lead = before && !/\s$/.test(before) ? " " : "";
    const trail = after && !/^[\s.,:;!?)]/.test(after) ? " " : "";
    const text = `${lead}{${token}}${trail}`;
    const next = before + text + after;
    const nextPos = before.length + text.length;
    caret.current[field] = nextPos;
    setForm((f) => ({ ...f, [key]: next }));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(nextPos, nextPos);
    });
  };

  const TokenChips = ({ field }: { field: "title" | "message" }) => (
    <div className="flex flex-wrap items-center gap-1.5 pt-1">
      <span className="text-[11px] text-muted-foreground mr-0.5">Insert:</span>
      {tokens.map((t) => (
        <button
          key={t}
          type="button"
          // Keep focus (and the caret) in the field on desktop.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => insertToken(field, t)}
          className="rounded-full border bg-background px-2.5 py-0.5 text-xs hover:bg-primary/10 hover:border-primary/40 transition-colors"
        >
          {TOKEN_LABELS[t] ?? t}
        </button>
      ))}
    </div>
  );

  const suggestion = SUGGESTED_TEXT[`${form.source_table}:${form.event_code}`];
  const applySuggestion = () => {
    if (!suggestion) return;
    setForm((f) => ({ ...f, title_template: suggestion.title, message_template: suggestion.message }));
    caret.current = { title: null, message: null };
  };

  const onEventChange = (code: string) => {
    const ev = eventTypes.find((e) => e.source_table === form.source_table && e.event_code === code);
    const sug = SUGGESTED_TEXT[`${form.source_table}:${code}`];
    const allowed = receiverOptions(form.source_table, ev?.extra_receivers).map((r) => r.value);
    setForm((f) => {
      const receiver = allowed.includes(f.receiver_type)
        ? f.receiver_type
        : allowed.find((r) => CONTEXT_RECEIVERS.includes(r)) ?? "admin";
      const receiverName = RECEIVER_TYPES.find((r) => r.value === receiver)?.label ?? "";
      return {
        ...f,
        event_code: code,
        receiver_type: receiver,
        name: f.name || (ev ? `${ev.label} → ${receiverName}` : ""),
        title_template: f.title_template || sug?.title || (ev ? `${ev.label}: {user_name}` : ""),
        message_template: f.message_template || sug?.message || "",
      };
    });
    setRecipients(null);
  };

  const runPreview = async () => {
    setPreviewing(true);
    try {
      const rows = await previewRecipients({
        receiver_type: form.receiver_type,
        receiver_role: form.receiver_role || null,
        receiver_user_id: form.receiver_user_id || null,
        sample_actor: sampleActor || null,
        include_secondary: form.include_secondary_manager,
      });
      setRecipients(rows.map((r) => ({ id: r.id, name: r.name })));
    } catch (e) {
      toast.error("Could not preview recipients", { description: (e as Error).message });
    } finally {
      setPreviewing(false);
    }
  };

  const validation = (() => {
    if (!form.name.trim()) return "Give the rule a name";
    if (!form.source_table || !form.event_code) return "Choose a module and event";
    if (!receivers.some((r) => r.value === form.receiver_type)) return "Choose who to notify for this event";
    if (form.receiver_type === "role" && !form.receiver_role) return "Choose a security profile";
    if (form.receiver_type === "specific_user" && !form.receiver_user_id) return "Choose a person";
    if (!form.title_template.trim()) return "Add a title";
    return null;
  })();

  const onSave = async () => {
    if (validation) {
      toast.error(validation);
      return;
    }
    try {
      await save.mutateAsync({
        id: rule?.id!,
        values: {
          name: form.name.trim(),
          source_table: form.source_table,
          event_code: form.event_code,
          receiver_type: form.receiver_type,
          receiver_role: form.receiver_type === "role" ? form.receiver_role : null,
          receiver_user_id: form.receiver_type === "specific_user" ? form.receiver_user_id : null,
          include_secondary_manager:
            form.receiver_type === "manager" || form.receiver_type === "hierarchy"
              ? form.include_secondary_manager
              : false,
          notification_channel: form.notification_channel,
          title_template: form.title_template.trim(),
          message_template: form.message_template.trim(),
          is_active: form.is_active,
        },
      });
      toast.success(rule ? "Rule updated" : "Rule created");
      onOpenChange(false);
    } catch (e) {
      toast.error("Could not save rule", { description: (e as Error).message });
    }
  };

  const needsActorPreview = ["employee", "manager", "hierarchy"].includes(form.receiver_type);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{rule ? "Edit notification rule" : "New notification rule"}</DialogTitle>
          <DialogDescription>When the event happens, the chosen people are notified automatically.</DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="rule-name">Rule name</Label>
            <Input
              id="rule-name"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="e.g. Expense submitted → manager"
            />
          </div>

          {/* When */}
          <section className="space-y-3">
            <h4 className="text-sm font-semibold">When</h4>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Module</Label>
                <Select
                  value={form.source_table}
                  onValueChange={(v) => {
                    setForm((f) => ({ ...f, source_table: v, event_code: "" }));
                    setRecipients(null);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose module" />
                  </SelectTrigger>
                  <SelectContent>
                    {modules.map((m) => (
                      <SelectItem key={m.value} value={m.value}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Event</Label>
                <Select value={form.event_code} onValueChange={onEventChange} disabled={!form.source_table}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose event" />
                  </SelectTrigger>
                  <SelectContent>
                    {events.map((e) => (
                      <SelectItem key={e.event_code} value={e.event_code}>
                        {e.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {selectedEvent?.description && (
              <p className="text-xs text-muted-foreground">{selectedEvent.description}</p>
            )}
            {selectedEvent?.app_already_notifies && (
              <Alert className="border-amber-300 bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                <AlertTriangle className="h-4 w-4 !text-amber-600" />
                <AlertDescription className="text-xs">
                  The app already sends its own notification for this event. If this rule targets the same people,
                  they will receive two notifications.
                </AlertDescription>
              </Alert>
            )}
          </section>

          {/* Who */}
          <section className="space-y-3">
            <h4 className="text-sm font-semibold">Send to</h4>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Recipients</Label>
                <Select value={form.receiver_type} onValueChange={(v) => set("receiver_type", v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {receivers.map((r) => (
                      <SelectItem key={r.value} value={r.value}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {RECEIVER_TYPES.find((r) => r.value === form.receiver_type)?.hint}
                </p>
              </div>

              {form.receiver_type === "role" && (
                <div className="space-y-1.5">
                  <Label>Security profile</Label>
                  <Select value={form.receiver_role} onValueChange={(v) => set("receiver_role", v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose profile" />
                    </SelectTrigger>
                    <SelectContent>
                      {(people?.profiles || []).map((p) => (
                        <SelectItem key={p} value={p}>
                          {p}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {form.receiver_type === "specific_user" && (
                <div className="space-y-1.5">
                  <Label>Person</Label>
                  <Select value={form.receiver_user_id} onValueChange={(v) => set("receiver_user_id", v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose person" />
                    </SelectTrigger>
                    <SelectContent>
                      {(people?.users || []).map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {(form.receiver_type === "manager" || form.receiver_type === "hierarchy") && (
                <div className="flex items-center justify-between rounded-lg border px-3 py-2 sm:mt-6">
                  <Label htmlFor="secondary" className="text-sm font-normal">
                    Also notify secondary manager
                  </Label>
                  <Switch
                    id="secondary"
                    checked={form.include_secondary_manager}
                    onCheckedChange={(v) => set("include_secondary_manager", v)}
                  />
                </div>
              )}
            </div>

            {CONTEXT_RECEIVERS.includes(form.receiver_type) ? (
              <p className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
                Recipients depend on each record: everyone on its{" "}
                {form.receiver_type === "project_members" ? "project" : "site"} at the time of the event.
              </p>
            ) : (
            <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
              <div className="flex flex-wrap items-end gap-2">
                {needsActorPreview && (
                  <div className="space-y-1 flex-1 min-w-[180px]">
                    <Label className="text-xs">Preview for employee</Label>
                    <Select value={sampleActor} onValueChange={(v) => { setSampleActor(v); setRecipients(null); }}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Me (current user)" />
                      </SelectTrigger>
                      <SelectContent>
                        {(people?.users || []).map((u) => (
                          <SelectItem key={u.id} value={u.id}>
                            {u.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <Button type="button" variant="outline" size="sm" onClick={runPreview} disabled={previewing}>
                  {previewing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />}
                  <span className="ml-1.5">Preview recipients</span>
                </Button>
              </div>
              {recipients && (
                recipients.length === 0 ? (
                  <p className="text-xs text-amber-700">No active users match — nobody would be notified.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {recipients.map((r) => (
                      <Badge key={r.id} variant="secondary" className="font-normal">
                        {r.name}
                      </Badge>
                    ))}
                  </div>
                )
              )}
            </div>
            )}
          </section>

          {/* What */}
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-sm font-semibold">Message</h4>
              {suggestion && (
                <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={applySuggestion}>
                  <Wand2 className="h-3.5 w-3.5 mr-1" /> Use suggested text
                </Button>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rule-title">Title</Label>
              <Input
                id="rule-title"
                ref={titleRef}
                value={form.title_template}
                onSelect={(e) => rememberCaret("title", e.currentTarget)}
                onChange={(e) => {
                  set("title_template", e.target.value);
                  rememberCaret("title", e.currentTarget);
                }}
                placeholder="e.g. Leave applied: {user_name}"
              />
              <TokenChips field="title" />
              {form.title_template.length > 90 && (
                <p className="text-xs text-amber-700">Long titles get cut off on phones — keep it short and put details in the message.</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rule-message">Message</Label>
              <Textarea
                id="rule-message"
                ref={messageRef}
                rows={3}
                value={form.message_template}
                onSelect={(e) => rememberCaret("message", e.currentTarget)}
                onChange={(e) => {
                  set("message_template", e.target.value);
                  rememberCaret("message", e.currentTarget);
                }}
                placeholder="e.g. {user_name} applied for {leave_type} from {from_date} to {to_date}."
              />
              <TokenChips field="message" />
            </div>
            <div className="rounded-lg border p-3 bg-background">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1.5">
                <Eye className="h-3.5 w-3.5" /> Preview with sample data
              </div>
              <p className="text-sm font-semibold">{fillSample(form.title_template || "Title", SAMPLE_VALUES)}</p>
              <p className="text-sm text-muted-foreground whitespace-pre-line">
                {fillSample(form.message_template || "Message", SAMPLE_VALUES)}
              </p>
            </div>
          </section>

          {/* How */}
          <section className="grid gap-3 sm:grid-cols-2">
            <div className="flex items-center justify-between rounded-lg border px-3 py-2.5">
              <div className="flex items-center gap-2">
                <Smartphone className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm">Phone push</p>
                  <p className="text-xs text-muted-foreground">Always shown in the bell</p>
                </div>
              </div>
              <Switch
                checked={form.notification_channel === "in_app_push"}
                onCheckedChange={(v) => set("notification_channel", v ? "in_app_push" : "in_app")}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border px-3 py-2.5">
              <div>
                <p className="text-sm">Active</p>
                <p className="text-xs text-muted-foreground">Rule runs when switched on</p>
              </div>
              <Switch checked={form.is_active} onCheckedChange={(v) => set("is_active", v)} />
            </div>
          </section>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onSave} disabled={save.isPending}>
            {save.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            {rule ? "Save changes" : "Create rule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
