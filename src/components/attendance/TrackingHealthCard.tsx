import { useEffect, useState, useSyncExternalStore } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Navigation, AlertTriangle } from "lucide-react";
import {
  getTrackerStatus,
  subscribeTrackerStatus,
  type TrackerStatus,
} from "@/services/trackerStatus";
import {
  isNative,
  getNativeLocationPowerStatus,
  prepareNativeLocationSettings,
  openAutoStartSettings,
  openLocationSettings,
  openAppSettings,
  type NativeLocationPowerStatus,
} from "@/utils/nativePermissions";

function ago(ts: number | null): string {
  if (!ts) return "none yet";
  const mins = Math.floor((Date.now() - ts) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m ago`;
}

/**
 * Compact tracking-health strip shown while the attendance day is open.
 * Answers on-device what previously needed database forensics: is capture
 * running, when did the last fix land, and are the OS/OEM prerequisites in
 * place for background tracking to survive the phone being pocketed.
 */
export default function TrackingHealthCard() {
  const status: TrackerStatus = useSyncExternalStore(subscribeTrackerStatus, getTrackerStatus, getTrackerStatus);
  const [power, setPower] = useState<NativeLocationPowerStatus | null>(null);
  const [, setTick] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!isNative()) return;
    let cancelled = false;
    const load = async () => {
      const s = await getNativeLocationPowerStatus();
      if (!cancelled) setPower(s);
    };
    void load();
    const id = window.setInterval(load, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  if (!status.active) return null;

  const stale = status.lastFixAt != null && Date.now() - status.lastFixAt > 15 * 60_000;
  const needsBackground = isNative() && power?.backgroundLocation === 'denied';
  const needsBattery = isNative() && power?.ignoringBatteryOptimizations === false;
  // Approximate-only location produces coarse fused fixes and 0 km days —
  // never treated as equivalent to Precise.
  const needsPrecise = isNative() && power?.preciseLocation === false;
  const locationOff = isNative() && power?.locationServicesEnabled === false;

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Navigation className={`h-4 w-4 shrink-0 ${stale ? "text-orange-500" : "text-green-600"}`} />
            <div className="min-w-0">
              <div className="text-sm font-medium truncate">
                {stale ? "Tracking may be paused" : "Tracking active"}
              </div>
              <div className="text-xs text-muted-foreground truncate">
                Last location {ago(status.lastFixAt)}
              </div>
            </div>
          </div>
        </div>

        {locationOff && (
          <div className="rounded-md border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/40 p-3 space-y-2">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
              <p className="text-xs text-red-800 dark:text-red-200">
                Device Location is turned OFF — tracking cannot record your
                route until it is switched on.
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={() => void openLocationSettings()}>
              Turn on Location
            </Button>
          </div>
        )}

        {needsPrecise && !locationOff && (
          <div className="rounded-md border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/40 p-3 space-y-2">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
              <p className="text-xs text-red-800 dark:text-red-200">
                Only “Approximate” location is allowed for this app. Route
                tracking needs “Precise” — enable it in Location permission.
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={() => void openAppSettings()}>
              Enable Precise location
            </Button>
          </div>
        )}

        {(needsBackground || needsBattery) && (
          <div className="rounded-md border border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-950/40 p-3 space-y-2">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-orange-600 mt-0.5 shrink-0" />
              <p className="text-xs text-orange-800 dark:text-orange-200">
                Background tracking can be stopped by the phone. Allow location
                “All the time” and turn off battery restrictions for this app.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => void prepareNativeLocationSettings()}>
                Fix settings
              </Button>
              <Button size="sm" variant="ghost" onClick={() => void openAutoStartSettings()}>
                Autostart
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
