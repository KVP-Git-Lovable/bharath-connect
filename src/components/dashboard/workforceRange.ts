import {
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  subWeeks,
  addWeeks,
  addDays,
  subDays,
  startOfDay,
  endOfDay,
} from "date-fns";

export type DatePreset =
  | "today"
  | "yesterday"
  | "tomorrow"
  | "this_week"
  | "last_week"
  | "next_week"
  | "this_month"
  | "custom";

export const presetLabels: Record<DatePreset, string> = {
  today: "Today",
  yesterday: "Yesterday",
  tomorrow: "Tomorrow",
  this_week: "This Week",
  last_week: "Last Week",
  next_week: "Next Week",
  this_month: "This Month",
  custom: "Custom Date Range",
};

export function resolveRange(
  preset: DatePreset,
  customStart: string,
  customEnd: string
): { start: Date; end: Date } {
  const now = new Date();
  switch (preset) {
    case "today":
      return { start: startOfDay(now), end: endOfDay(now) };
    case "yesterday": {
      const d = subDays(now, 1);
      return { start: startOfDay(d), end: endOfDay(d) };
    }
    case "tomorrow": {
      const d = addDays(now, 1);
      return { start: startOfDay(d), end: endOfDay(d) };
    }
    case "this_week":
      return { start: startOfWeek(now), end: endOfWeek(now) };
    case "last_week": {
      const lw = subWeeks(now, 1);
      return { start: startOfWeek(lw), end: endOfWeek(lw) };
    }
    case "next_week": {
      const nw = addWeeks(now, 1);
      return { start: startOfWeek(nw), end: endOfWeek(nw) };
    }
    case "this_month":
      return { start: startOfMonth(now), end: endOfMonth(now) };
    default: {
      const start = customStart ? new Date(customStart) : startOfMonth(now);
      const end = customEnd ? new Date(customEnd) : endOfMonth(now);
      return { start, end };
    }
  }
}
