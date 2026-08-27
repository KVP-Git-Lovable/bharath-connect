import { Battery, BatteryCharging, BatteryLow, Wifi, WifiOff, Signal, SignalHigh, SignalMedium, SignalLow } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  batteryLevel: number | null;
  batteryCharging: boolean | null;
  networkType: string | null;
  statusAt: string | null;
  className?: string;
}

function batteryColor(level: number): string {
  if (level >= 50) return "text-emerald-600";
  if (level >= 30) return "text-amber-600";
  return "text-red-600";
}

function NetworkIcon({ type, className }: { type: string | null; className?: string }) {
  switch (type) {
    case "wifi":
      return <Wifi className={className} />;
    case "offline":
      return <WifiOff className={className} />;
    case "4g":
      return <SignalHigh className={className} />;
    case "3g":
      return <SignalMedium className={className} />;
    case "2g":
    case "slow-2g":
      return <SignalLow className={className} />;
    default:
      return <Signal className={cn(className, "opacity-40")} />;
  }
}

function networkLabel(type: string | null): string {
  if (!type || type === "unknown") return "—";
  if (type === "offline") return "Offline";
  if (type === "wifi") return "Wi-Fi";
  return type.toUpperCase();
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diffMs / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function DeviceStatusBadges({ batteryLevel, batteryCharging, networkType, statusAt, className }: Props) {
  const stale = !statusAt || (Date.now() - new Date(statusAt).getTime()) > 3 * 60 * 1000;
  const staleClass = stale ? "opacity-50" : "";

  const BatteryIcon = batteryLevel == null
    ? Battery
    : batteryCharging
      ? BatteryCharging
      : batteryLevel < 30
        ? BatteryLow
        : Battery;

  return (
    <div className={cn("flex flex-col items-end gap-0.5 text-[11px]", staleClass, className)}>
      <span
        className="inline-flex items-center gap-1"
        title={batteryLevel == null ? "Battery not reported (e.g. iOS Safari)" : `Battery ${batteryLevel}%${batteryCharging ? " (charging)" : ""}`}
      >
        <BatteryIcon className={cn("h-3.5 w-3.5", batteryLevel != null ? batteryColor(batteryLevel) : "text-muted-foreground")} />
        <span className="text-muted-foreground">
          {batteryLevel == null ? "—" : `${batteryLevel}%`}
        </span>
      </span>
      <span
        className="inline-flex items-center gap-1"
        title={`Network: ${networkLabel(networkType)}`}
      >
        <NetworkIcon type={networkType} className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-muted-foreground">{networkLabel(networkType)}</span>
      </span>
      {statusAt && (
        <span className="text-muted-foreground/70">{timeAgo(statusAt)}</span>
      )}
    </div>
  );
}
