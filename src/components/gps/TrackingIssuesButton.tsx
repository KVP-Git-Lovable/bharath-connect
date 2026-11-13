import { useCallback, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { ShieldAlert, WifiOff, PowerOff, AlertTriangle, Clock3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface Props {
  /** Resolved target user (never the dialog's own account unless that's who's selected). */
  userId: string | null;
  userLabel: string;
  from: string;
  to: string;
}

type Severity = "high" | "medium" | "low";

interface IssueBucket {
  key: string;
  icon: LucideIcon;
  title: string;
  detail: string;
  severity: Severity;
  latest: string;
}

interface TrackerEventRow {
  event: string;
  details: any;
  platform: string | null;
  occurred_at: string;
}

// trackerHealth.ts rate-limits these event types per session (MIN_GAP_MS), so
// a duplicate within the gap window never reaches the table. A count built
// from any of these is a floor, not an exact tally — phrased as "at least N"
// below. watcher_silence is NOT rate-limited and can be stated as an exact count.
const RATE_LIMITED_EVENTS = new Set([
  "permission_status",
  "resume_recovery",
  "watcher_error",
  "watcher_register_failed",
  "probe_discarded",
  "probe_failed",
  "native_buffer_drained",
]);

// resume_recovery fires past just 60s of silence (RESUME_SILENCE_MS) —
// that alone is ordinary Android backgrounding, not a kill. Only treat it as
// a likely kill once the silence clears the watchdog's own 5-minute bar
// (WATCHDOG_MS), same threshold watcher_silence itself fires at.
const POSSIBLE_KILL_SILENCE_FLOOR_S = 300;

function countLabel(n: number, event: string): string {
  const times = `${n} time${n === 1 ? "" : "s"}`;
  return RATE_LIMITED_EVENTS.has(event) ? `at least ${times}` : times;
}

function isDegraded(details: any): boolean {
  if (!details) return false;
  // permission_status is logged from two call sites with two different
  // detail shapes (the full native power status object, or a smaller
  // {precise, approximateOnly} one) — check both.
  return (
    details.locationServicesEnabled === false ||
    details.preciseLocation === false ||
    details.precise === false ||
    details.backgroundLocation === "denied" ||
    details.ignoringBatteryOptimizations === false
  );
}

const STAGE_LABEL: Record<string, string> = {
  prepareLocationSettings: "requesting location permission/settings",
  checkPermissions: "checking location permission",
  registerWatcher: "registering the background watcher",
};

function classify(rows: TrackerEventRow[]): IssueBucket[] {
  const buckets: IssueBucket[] = [];

  const degraded = rows.filter((r) => r.event === "permission_status" && isDegraded(r.details));
  if (degraded.length > 0) {
    buckets.push({
      key: "degraded",
      icon: ShieldAlert,
      title: "Location permission or settings degraded",
      detail: `${countLabel(degraded.length, "permission_status")} — device location, precise location, background access, or the battery exemption was off`,
      severity: "high",
      latest: degraded[0]!.occurred_at,
    });
  }

  // The native watcher-start chain (startNativeBackground) failing to
  // settle, or throwing — the direct cause of "tracker_started fires, then
  // nothing": zero fixes, zero distance, despite the day being checked in.
  const startFailures = rows.filter(
    (r) => r.event === "native_start_timeout" || r.event === "native_start_error"
  );
  if (startFailures.length > 0) {
    const latest = startFailures[0]!;
    const stage = STAGE_LABEL[latest.details?.stage as string] ?? latest.details?.stage ?? "an unknown step";
    const kind = latest.event === "native_start_timeout" ? "timed out" : "failed";
    buckets.push({
      key: "native_start_failed",
      icon: PowerOff,
      title: "Native watcher failed to start",
      detail: `${countLabel(startFailures.length, latest.event)} — most recently ${kind} while ${stage}${
        latest.details?.message ? ` ("${String(latest.details.message).slice(0, 80)}")` : ""
      }`,
      severity: "high",
      latest: latest.occurred_at,
    });
  }

  const silence = rows.filter((r) => r.event === "watcher_silence");
  if (silence.length > 0) {
    const totalMin = Math.round(
      silence.reduce((a, r) => a + Number(r.details?.silence_seconds ?? 0), 0) / 60
    );
    buckets.push({
      key: "silence",
      icon: WifiOff,
      title: "Location undetectable while tracking was active",
      detail: `${totalMin} total minute${totalMin === 1 ? "" : "s"} without a fix, across ${countLabel(silence.length, "watcher_silence")}`,
      severity: "high",
      latest: silence[0]!.occurred_at,
    });
  }

  const kills = rows.filter(
    (r) => r.event === "resume_recovery" && Number(r.details?.silence_seconds ?? 0) > POSSIBLE_KILL_SILENCE_FLOOR_S
  );
  if (kills.length > 0) {
    buckets.push({
      key: "kill",
      icon: Clock3,
      title: "App appears to have stopped tracking while backgrounded",
      detail: `${countLabel(kills.length, "resume_recovery")} — Android likely force-stopped or killed the app (Android gives no direct kill signal; this is inferred from a long silence that only cleared on reopen)`,
      severity: "high",
      latest: kills[0]!.occurred_at,
    });
  }

  const errors = rows.filter((r) =>
    ["watcher_error", "watcher_register_failed", "probe_failed"].includes(r.event)
  );
  if (errors.length > 0) {
    const latestMsg = errors[0]!.details?.message ?? errors[0]!.details?.reason;
    buckets.push({
      key: "errors",
      icon: AlertTriangle,
      title: "Location service errors",
      detail: `${countLabel(errors.length, errors[0]!.event)}${latestMsg ? ` — latest: "${String(latestMsg).slice(0, 80)}"` : ""}`,
      severity: "medium",
      latest: errors[0]!.occurred_at,
    });
  }

  return buckets;
}

const SEVERITY_CARD: Record<Severity, string> = {
  high: "border-destructive/40 bg-destructive/5",
  medium: "border-amber-400/50 bg-amber-50 dark:bg-amber-950/20",
  low: "border-border bg-muted/30",
};

const SEVERITY_TEXT: Record<Severity, string> = {
  high: "text-destructive",
  medium: "text-amber-700 dark:text-amber-400",
  low: "text-muted-foreground",
};

/**
 * "Check user tracking issues" — a historical, per-user, per-range view over
 * gps_tracker_events (already written continuously by useGPSTracker.ts /
 * trackerHealth.ts), distinct from the two other GPS Tracking cards:
 *  - the "tracking gap" card only reflects the currently-loaded gpsPoints
 *    for a live view;
 *  - the "sync health" card only reflects the viewing device's own local
 *    queue, not an arbitrary selected team member's.
 * Fetches lazily on open rather than on every tab/user/range change — a
 * diagnostics dialog should not add a background request on every date
 * picker click.
 */
export function TrackingIssuesButton({ userId, userLabel, from, to }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [buckets, setBuckets] = useState<IssueBucket[] | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(false);
    try {
      const { data, error: err } = await supabase
        .from("gps_tracker_events")
        .select("event, details, platform, occurred_at")
        .eq("user_id", userId)
        .gte("occurred_at", `${from}T00:00:00`)
        .lte("occurred_at", `${to}T23:59:59`)
        .order("occurred_at", { ascending: false })
        .limit(1000);
      if (err) throw err;
      setBuckets(classify((data ?? []) as TrackerEventRow[]));
    } catch {
      setError(true);
      setBuckets(null);
    } finally {
      setLoading(false);
    }
  }, [userId, from, to]);

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) void load();
  };

  const rangeLabel =
    from === to
      ? format(new Date(`${from}T00:00:00`), "MMM d, yyyy")
      : `${format(new Date(`${from}T00:00:00`), "MMM d")} – ${format(new Date(`${to}T00:00:00`), "MMM d, yyyy")}`;

  return (
    <>
      <Button variant="outline" className="w-full" onClick={() => onOpenChange(true)}>
        Check user tracking issues
      </Button>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Tracking issues</DialogTitle>
            <p className="text-xs text-muted-foreground">
              {userLabel} · {rangeLabel}
            </p>
          </DialogHeader>

          {loading && <p className="text-sm text-muted-foreground py-4">Loading…</p>}

          {!loading && error && (
            <p className="text-sm text-destructive py-4">Could not load tracking issues. Try again.</p>
          )}

          {!loading && !error && buckets && buckets.length === 0 && (
            <p className="text-sm text-muted-foreground py-4">No tracking issues found for this range.</p>
          )}

          {!loading && !error && buckets && buckets.length > 0 && (
            <div className="space-y-2">
              {buckets.map((b) => {
                const Icon = b.icon;
                return (
                  <div
                    key={b.key}
                    className={cn("rounded-md border p-3 flex gap-2.5", SEVERITY_CARD[b.severity])}
                  >
                    <Icon className={cn("h-4 w-4 flex-shrink-0 mt-0.5", SEVERITY_TEXT[b.severity])} />
                    <div className="space-y-1 min-w-0">
                      <p className={cn("text-xs font-semibold", SEVERITY_TEXT[b.severity])}>{b.title}</p>
                      <p className="text-[11px] text-muted-foreground">{b.detail}</p>
                      <p className="text-[10px] text-muted-foreground">
                        Most recent: {format(new Date(b.latest), "MMM d, h:mm a")}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
