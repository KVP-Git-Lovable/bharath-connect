import { useState, useCallback, useEffect } from "react";

export interface NavGroup {
  id: string;
  name: string;
  items: string[]; // nav item labels
}

export interface NavPreferences {
  groups: NavGroup[];
  itemOrder: string[]; // ordered labels for ungrouped items
}

const STORAGE_KEY = "nav_preferences";

export function useNavigationPreferences(allItemLabels: string[]) {
  const [preferences, setPreferences] = useState<NavPreferences | null>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) return JSON.parse(stored);
    } catch {}
    return null;
  });

  const save = useCallback((prefs: NavPreferences) => {
    setPreferences(prefs);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  }, []);

  const reset = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setPreferences(null);
  }, []);

  // Get ordered items, filling in any new items not yet in preferences
  const getOrderedItems = useCallback((): string[] => {
    if (!preferences) return allItemLabels;

    const groupedLabels = new Set(preferences.groups.flatMap((g) => g.items));
    const orderedUngrouped = preferences.itemOrder.filter(
      (label) => allItemLabels.includes(label) && !groupedLabels.has(label)
    );
    // Add any new items not in saved order
    const known = new Set([...preferences.itemOrder, ...groupedLabels]);
    const newItems = allItemLabels.filter((l) => !known.has(l));
    return [...orderedUngrouped, ...newItems];
  }, [preferences, allItemLabels]);

  return { preferences, save, reset, getOrderedItems };
}
