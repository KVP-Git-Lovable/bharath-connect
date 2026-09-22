import { useState } from "react";
import { CheckCircle2, CircleDashed, Loader2, XCircle, AlertTriangle, Stethoscope } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { previewRecipients, sendTestNotification } from "@/hooks/useNotificationRules";

type Status = "pending" | "running" | "ok" | "warn" | "fail";
type Step = { key: string; label: string; status: Status; detail?: string };

const STEPS: Step[] = [
  { key: "engine", label: "Rules engine installed", status: "pending" },
  { key: "recipients", label: "Recipient lookup works", status: "pending" },
  { key: "send", label: "Test notification created", status: "pending" },
  { key: "bell", label: "Delivered to your bell", status: "pending" },
  { key: "push", label: "Phone push", status: "pending" },
];

const PUSH_RESULT: Record<string, { status: Status; detail: string }> = {
  pushed: { status: "ok", detail: "Sent to your phone. Check it now." },
  no_device: {
    status: "warn",
    detail: "No phone is registered for your account. Open the Android app (or allow notifications in the browser app) once, then run the check again.",
  },
  push_failed: {
    status: "fail",
    detail: "The push service rejected it. Open the notification-push function logs in Lovable Cloud for the exact reason.",
  },
  push_skipped: { status: "warn", detail: "Push is switched off for the rule used, or you opted out of this type." },
};

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function SystemCheckDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [steps, setSteps] = useState<Step[]>(STEPS);
  const [running, setRunning] = useState(false);

  const update = (key: string, patch: Partial<Step>) =>
    setSteps((s) => s.map((st) => (st.key === key ? { ...st, ...patch } : st)));

  const fail = (key: string, detail: string) => {
    update(key, { status: "fail", detail });
    return false;
  };

  const run = async () => {
    setRunning(true);
    setSteps(STEPS);
    try {
      // 1. Engine tables reachable
      update("engine", { status: "running" });
      const [{ data: rules, error: rErr }, { count: evCount, error: eErr }] = await Promise.all([
        supabase.from("notification_rules").select("id, name, notification_channel").order("created_at").limit(50),
        supabase.from("notification_event_types").select("id", { count: "exact", head: true }),
      ]);
      if (rErr || eErr) { fail("engine", (rErr || eErr)!.message); return; }
      const rule = (rules || []).find((r) => r.notification_channel === "in_app_push") || (rules || [])[0];
      if (!rule) { fail("engine", "No rules found. Create a rule first, then run the check."); return; }
      update("engine", { status: "ok", detail: `${rules!.length} rules, ${evCount ?? 0} events available` });

      // 2. Recipient resolution
      update("recipients", { status: "running" });
      try {
        const admins = await previewRecipients({ receiver_type: "admin" });
        update("recipients", {
          status: admins.length ? "ok" : "warn",
          detail: admins.length ? `${admins.length} active admin(s) found` : "No active admins found",
        });
      } catch (e) {
        { fail("recipients", (e as Error).message); return; }
      }

      // 3. Create a test notification (sent to you only)
      update("send", { status: "running" });
      let notificationId: string | undefined;
      let pushExpected = false;
      try {
        const res = await sendTestNotification(rule.id);
        notificationId = res?.notification_id;
        pushExpected = !!res?.push;
        if (!notificationId) { fail("send", "The database did not return a notification id"); return; }
        update("send", { status: "ok", detail: `Using rule "${rule.name}"` });
      } catch (e) {
        { fail("send", (e as Error).message); return; }
      }

      // 4. Visible in the bell
      update("bell", { status: "running" });
      const { data: row, error: nErr } = await supabase
        .from("notifications")
        .select("id, title, delivery_status")
        .eq("id", notificationId)
        .maybeSingle();
      if (nErr || !row) { fail("bell", nErr?.message || "Notification not found"); return; }
      update("bell", { status: "ok", detail: row.title });

      // 5. Push: wait for notification-push to record the outcome
      if (!pushExpected) {
        update("push", { status: "warn", detail: "The rule used has phone push switched off." });
        return;
      }
      update("push", { status: "running", detail: "Waiting for the push service…" });
      let status = row.delivery_status;
      for (let i = 0; i < 12 && status === "delivered"; i++) {
        await wait(2000);
        const { data } = await supabase.from("notifications").select("delivery_status").eq("id", notificationId).maybeSingle();
        status = data?.delivery_status ?? status;
      }
      const result = PUSH_RESULT[status];
      if (result) update("push", result);
      else
        update("push", {
          status: "fail",
          detail:
            "No response from the push function after 24 seconds. Check that notification-push is deployed and look at its logs.",
        });
    } finally {
      setRunning(false);
    }
  };

  const icon = (s: Status) =>
    s === "ok" ? <CheckCircle2 className="h-5 w-5 text-emerald-600" />
    : s === "warn" ? <AlertTriangle className="h-5 w-5 text-amber-500" />
    : s === "fail" ? <XCircle className="h-5 w-5 text-destructive" />
    : s === "running" ? <Loader2 className="h-5 w-5 animate-spin text-primary" />
    : <CircleDashed className="h-5 w-5 text-muted-foreground" />;

  return (
    <Dialog open={open} onOpenChange={(o) => !running && onOpenChange(o)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Stethoscope className="h-5 w-5" /> System check
          </DialogTitle>
          <DialogDescription>
            Runs the notification pipeline end to end. One test notification is sent to you only.
          </DialogDescription>
        </DialogHeader>

        <ol className="space-y-3">
          {steps.map((s) => (
            <li key={s.key} className="flex gap-3" data-testid={`check-${s.key}`} data-status={s.status}>
              <span className="mt-0.5 shrink-0">{icon(s.status)}</span>
              <div className="min-w-0">
                <p className="text-sm font-medium">{s.label}</p>
                {s.detail && <p className="text-xs text-muted-foreground break-words">{s.detail}</p>}
              </div>
            </li>
          ))}
        </ol>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={running}>
            Close
          </Button>
          <Button onClick={run} disabled={running}>
            {running && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            {steps.some((s) => s.status !== "pending") ? "Run again" : "Run check"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
