import { Smartphone, Moon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatHHMM } from "@/utils/duration";

/** Totals for the selected user over the selected range. */
export interface AppUsageSummary {
  foregroundSeconds: number;
  backgroundSeconds: number;
  inferredSeconds: number;
  sessionCount: number;
  deviceCount: number;
  daysWithData: number;
}

interface Props {
  /** null when the range has no recorded usage at all. */
  summary: AppUsageSummary | null;
  /** The summary could not be loaded (RPC missing, offline, not permitted). */
  error?: boolean;
}

/**
 * The two Day Tracking usage cards.
 *
 * These render ALWAYS, including as 00:00 before a device has ever reported.
 * Hiding them when there is no data reads as "this feature does not exist"
 * rather than "nothing has been recorded yet", which is the more useful thing
 * to know. The distinction between a measured zero and an absence is kept in
 * the sub-label instead of in whether the card appears.
 *
 * Extracted from GPSTracking.tsx so this behaviour can be tested without
 * standing up the whole page (maps, supabase, attendance gating).
 */
export function AppUsageCards({ summary, error = false }: Props) {
  const foreground = summary?.foregroundSeconds ?? 0;
  const background = summary?.backgroundSeconds ?? 0;

  const note = error
    ? "usage data unavailable"
    : !summary
      ? "no usage recorded yet"
      : `${summary.sessionCount} session${summary.sessionCount === 1 ? "" : "s"}`;

  return (
    <div className="grid grid-cols-2 gap-2">
      <Card className="shadow-card">
        <CardContent className="p-3 text-center">
          <Smartphone className="h-4 w-4 mx-auto mb-1 text-primary" />
          <p className="text-xs text-muted-foreground">Total foreground time</p>
          <p className="text-sm font-semibold">{formatHHMM(foreground)}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">{note}</p>
        </CardContent>
      </Card>
      <Card className="shadow-card">
        <CardContent className="p-3 text-center">
          <Moon className="h-4 w-4 mx-auto mb-1 text-primary" />
          <p className="text-xs text-muted-foreground">Total background time</p>
          <p className="text-sm font-semibold">{formatHHMM(background)}</p>
          {summary && summary.inferredSeconds > 0 && (
            <p className="text-[10px] text-muted-foreground mt-0.5">
              incl. {formatHHMM(summary.inferredSeconds)} reconciled after a kill
            </p>
          )}
          {summary && summary.deviceCount > 1 && (
            <p className="text-[10px] text-amber-600 mt-0.5">
              across {summary.deviceCount} devices
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
