import {
  format,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfQuarter,
  endOfQuarter,
  subDays,
  subWeeks,
  subMonths,
  subQuarters,
} from "date-fns";
import { useMemo, useState } from "react";

export type DateFieldKey =
  | "created_at"
  | "updated_at"
  | "opportunity_close_date"
  | "activity_date";

export const DATE_FIELD_OPTIONS: { value: DateFieldKey; label: string }[] = [
  { value: "created_at", label: "Lead Created Date" },
  { value: "updated_at", label: "Last Modified Date" },
  { value: "opportunity_close_date", label: "Opportunity Close Date" },
  { value: "activity_date", label: "Activity Date" },
];

/** A selectable date field for a report module. */
export interface DateFieldOption {
  value: string;
  label: string;
  /** Database column the range is applied to. */
  column?: string;
  /** True when the column is a timestamp (needs time suffixes). */
  timestamp?: boolean;
}

export type PresetKey =
  | "today"
  | "yesterday"
  | "current_week"
  | "last_week"
  | "current_month"
  | "last_month"
  | "current_quarter"
  | "last_quarter"
  | "current_fy"
  | "custom";

export const PRESET_OPTIONS: { value: PresetKey; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "current_week", label: "Current Week" },
  { value: "last_week", label: "Last Week" },
  { value: "current_month", label: "Current Month" },
  { value: "last_month", label: "Last Month" },
  { value: "current_quarter", label: "Current Quarter" },
  { value: "last_quarter", label: "Last Quarter" },
  { value: "current_fy", label: "Current FY" },
  { value: "custom", label: "Custom Date" },
];

const iso = (d: Date) => format(d, "yyyy-MM-dd");

/** Financial year runs Apr 1 - Mar 31 (India). */
function currentFy(now: Date) {
  const y = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return { from: iso(new Date(y, 3, 1)), to: iso(new Date(y + 1, 2, 31)) };
}

export function resolvePreset(
  preset: PresetKey,
  custom: { from: string; to: string },
  now: Date = new Date()
): { from: string; to: string } {
  const wk = { weekStartsOn: 1 as const };
  switch (preset) {
    case "today":
      return { from: iso(now), to: iso(now) };
    case "yesterday": {
      const y = subDays(now, 1);
      return { from: iso(y), to: iso(y) };
    }
    case "current_week":
      return { from: iso(startOfWeek(now, wk)), to: iso(endOfWeek(now, wk)) };
    case "last_week": {
      const d = subWeeks(now, 1);
      return { from: iso(startOfWeek(d, wk)), to: iso(endOfWeek(d, wk)) };
    }
    case "current_month":
      return { from: iso(startOfMonth(now)), to: iso(endOfMonth(now)) };
    case "last_month": {
      const d = subMonths(now, 1);
      return { from: iso(startOfMonth(d)), to: iso(endOfMonth(d)) };
    }
    case "last_quarter": {
      const d = subQuarters(now, 1);
      return { from: iso(startOfQuarter(d)), to: iso(endOfQuarter(d)) };
    }
    case "current_fy":
      return currentFy(now);
    case "custom":
      return custom;
    case "current_quarter":
    default:
      return { from: iso(startOfQuarter(now)), to: iso(endOfQuarter(now)) };
  }
}

export const presetLabel = (p: PresetKey) =>
  PRESET_OPTIONS.find((o) => o.value === p)?.label || p;

export const dateFieldLabel = (f: DateFieldKey) =>
  DATE_FIELD_OPTIONS.find((o) => o.value === f)?.label || f;

const FAV_KEY = "reports.favouriteDatePreset";

export function loadFavouritePreset(module = ""): PresetKey | null {
  try {
    const v = localStorage.getItem(module ? `${FAV_KEY}.${module}` : FAV_KEY);
    return v && PRESET_OPTIONS.some((o) => o.value === v) ? (v as PresetKey) : null;
  } catch {
    return null;
  }
}

export function saveFavouritePreset(p: PresetKey | null, module = "") {
  const key = module ? `${FAV_KEY}.${module}` : FAV_KEY;
  try {
    if (p) localStorage.setItem(key, p);
    else localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export interface DateScopeState {
  field: string;
  preset: PresetKey;
  customFrom: string;
  customTo: string;
}

/** Shared date-field + preset-range state used by every report module. */
export function useDateScope(module: string, defaultField: string) {
  const [state, setState] = useState<DateScopeState>(() => ({
    field: defaultField,
    preset: loadFavouritePreset(module) || "current_quarter",
    customFrom: format(new Date(), "yyyy-MM-01"),
    customTo: format(new Date(), "yyyy-MM-dd"),
  }));

  const { from, to } = useMemo(
    () => resolvePreset(state.preset, { from: state.customFrom, to: state.customTo }),
    [state]
  );

  const patch = (p: Partial<DateScopeState>) => setState((s) => ({ ...s, ...p }));

  return { state, setState, patch, from, to };
}
