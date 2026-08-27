import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  format,
  isSameMonth,
  isToday,
} from "date-fns";
import { CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";
import type { WorkforceActivityRow } from "@/hooks/useWorkforceOverview";

interface Props {
  activities: WorkforceActivityRow[];
  anchorDate: Date;
}

const statusStyles: Record<string, string> = {
  planned: "bg-info/10 text-info border border-info/20",
  in_progress: "bg-warning/10 text-warning border border-warning/20",
  completed: "bg-success/10 text-success border border-success/20",
};

const statusLabels: Record<string, string> = {
  planned: "Planned",
  in_progress: "In Progress",
  completed: "Completed",
};

const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function WorkforceActivityCalendar({ activities, anchorDate }: Props) {
  const navigate = useNavigate();

  const days = useMemo(() => {
    const monthStart = startOfMonth(anchorDate);
    const monthEnd = endOfMonth(anchorDate);
    return eachDayOfInterval({
      start: startOfWeek(monthStart),
      end: endOfWeek(monthEnd),
    });
  }, [anchorDate]);

  const byDate = useMemo(() => {
    const map = new Map<string, WorkforceActivityRow[]>();
    activities.forEach((a) => {
      const key = a.activity_date;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(a);
    });
    return map;
  }, [activities]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-primary" />
          <p className="text-sm font-semibold">
            Activity Calendar — {format(anchorDate, "MMMM yyyy")}
          </p>
        </div>
        <div className="flex flex-wrap gap-3 text-[10px] sm:text-xs">
          {Object.entries(statusLabels).map(([k, label]) => (
            <span key={k} className="inline-flex items-center gap-1 text-muted-foreground">
              <span
                className={cn(
                  "h-2.5 w-2.5 rounded-full",
                  k === "planned" && "bg-info",
                  k === "in_progress" && "bg-warning",
                  k === "completed" && "bg-success"
                )}
              />
              {label}
            </span>
          ))}
        </div>
      </div>
      <div className="overflow-hidden rounded-xl border">
        <div className="grid grid-cols-7 border-b bg-muted/40">
          {weekdays.map((d) => (
            <div
              key={d}
              className="py-1.5 text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground sm:text-xs"
            >
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((day, idx) => {
            const key = format(day, "yyyy-MM-dd");
            const entries = byDate.get(key) || [];
            const inMonth = isSameMonth(day, anchorDate);
            return (
              <div
                key={key}
                className={cn(
                  "flex min-h-[88px] flex-col gap-1 border-b border-r p-1 transition-colors",
                  idx % 7 === 6 && "border-r-0",
                  !inMonth && "bg-muted/20 opacity-50",
                  isToday(day) && "bg-primary/5"
                )}
              >
                <span
                  className={cn(
                    "inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold sm:text-xs",
                    isToday(day)
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground"
                  )}
                >
                  {format(day, "d")}
                </span>
                <div className="flex max-h-[120px] flex-col gap-0.5 overflow-y-auto">
                  {entries.map((e) => (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => navigate(`/activities?id=${e.id}`)}
                      className={cn(
                        "text-left rounded-md px-1 py-0.5 text-[9px] leading-tight sm:text-[10px] cursor-pointer transition-opacity hover:opacity-80 active:opacity-60",
                        statusStyles[e.status] || "bg-muted text-muted-foreground"
                      )}
                      title={`${e.full_name} · ${e.site_name || "No site"} · ${
                        statusLabels[e.status] || e.status
                      }`}
                    >
                      <p className="truncate font-semibold">{e.full_name}</p>
                      <p className="truncate opacity-80">{e.site_name || "No site"}</p>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
