import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { format } from "date-fns";
import { resolveRange, type DatePreset } from "./workforceRange";
import {
  useWorkforceOverview,
  useWorkforceUsers,
  type WorkforceUser,
} from "@/hooks/useWorkforceOverview";

interface WorkforceFilterValue {
  preset: DatePreset;
  setPreset: (p: DatePreset) => void;
  customStart: string;
  setCustomStart: (v: string) => void;
  customEnd: string;
  setCustomEnd: (v: string) => void;
  selectedUsers: string[];
  setSelectedUsers: (ids: string[]) => void;
  users: WorkforceUser[];
  start: Date;
  end: Date;
  startStr: string;
  endStr: string;
  rangeLabel: string;
  data: ReturnType<typeof useWorkforceOverview>["data"];
  isLoading: boolean;
  /** Persist the current filter so it is restored on reload. */
  saveFilters: () => void;
  /** Reset to defaults and drop any saved filter. */
  clearFilters: () => void;
  hasSavedFilters: boolean;
}

const Ctx = createContext<WorkforceFilterValue | null>(null);

const STORAGE_KEY = "dashboard-workforce-filters";

interface SavedFilters {
  preset: DatePreset;
  customStart: string;
  customEnd: string;
  selectedUsers: string[];
}

function readSaved(): SavedFilters | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SavedFilters) : null;
  } catch {
    return null;
  }
}

export function WorkforceFilterProvider({ children }: { children: ReactNode }) {
  const saved = readSaved();
  const [preset, setPreset] = useState<DatePreset>(saved?.preset || "this_week");
  const [customStart, setCustomStart] = useState(saved?.customStart || "");
  const [customEnd, setCustomEnd] = useState(saved?.customEnd || "");
  const [selectedUsers, setSelectedUsers] = useState<string[]>(saved?.selectedUsers || []);
  const [hasSavedFilters, setHasSavedFilters] = useState(!!saved);

  const saveFilters = () => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ preset, customStart, customEnd, selectedUsers })
      );
      setHasSavedFilters(true);
    } catch {
      /* storage unavailable */
    }
  };

  const clearFilters = () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* storage unavailable */
    }
    setHasSavedFilters(false);
    setPreset("this_week");
    setCustomStart("");
    setCustomEnd("");
    setSelectedUsers([]);
  };

  const { data: users = [] } = useWorkforceUsers();


  const range = useMemo(
    () => resolveRange(preset, customStart, customEnd),
    [preset, customStart, customEnd]
  );
  const startStr = format(range.start, "yyyy-MM-dd");
  const endStr = format(range.end, "yyyy-MM-dd");

  const { data, isLoading } = useWorkforceOverview({
    userIds: selectedUsers,
    start: startStr,
    end: endStr,
  });

  const rangeLabel = `${format(range.start, "MMM d")} – ${format(range.end, "MMM d, yyyy")}`;

  return (
    <Ctx.Provider
      value={{
        preset,
        setPreset,
        customStart,
        setCustomStart,
        customEnd,
        setCustomEnd,
        selectedUsers,
        setSelectedUsers,
        users,
        start: range.start,
        end: range.end,
        startStr,
        endStr,
        rangeLabel,
        data,
        isLoading,
        saveFilters,
        clearFilters,
        hasSavedFilters,

      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useWorkforceFilterContext() {
  const ctx = useContext(Ctx);
  if (!ctx)
    throw new Error("useWorkforceFilterContext must be used within WorkforceFilterProvider");
  return ctx;
}
