import { supabase } from "@/integrations/supabase/client";
import { setReportPrefill } from "./reportPrefill";

/** Subscription module → Analytics tab key. */
export const MODULE_TAB: Record<string, string> = {
  attendance: "attendance",
  activities: "activities",
  leave: "leave",
  expenses: "expenses",
  "travel-expense": "travel",
  leads: "leads",
  opportunities: "opportunities",
  procurement: "procurement",
};

/** Modules whose report screen auto-generates from a prefill. */
const PREFILL_MODULES = new Set(["attendance", "activities", "leave", "travel-expense", "leads", "opportunities"]);

type LinkMeta = {
  module?: string;
  period_from?: string;
  period_to?: string;
  report_config?: { filters?: Record<string, unknown>; visibleColumns?: string[]; charts?: unknown[] };
};

/**
 * Reads a delivered report notification (the recipient's own row) and hands
 * the Analytics page the tab, period and saved layout to open with.
 */
export async function applyReportLink(notificationId: string) {
  try {
    const { data } = await supabase
      .from("notifications")
      .select("metadata, is_read")
      .eq("id", notificationId)
      .maybeSingle();
    const meta = (data?.metadata || {}) as LinkMeta;
    if (!meta.module) return;

    const tab = MODULE_TAB[meta.module];
    if (tab) sessionStorage.setItem("analytics-tab", tab);

    if (PREFILL_MODULES.has(meta.module) && meta.period_from && meta.period_to) {
      const cfg = meta.report_config || {};
      setReportPrefill(meta.module, {
        ...(cfg.filters || {}),
        preset: "custom",
        customFrom: meta.period_from,
        customTo: meta.period_to,
        __visibleColumns: cfg.visibleColumns,
        __charts: cfg.charts,
      });
    }
    if (data && !data.is_read) {
      await supabase.from("notifications").update({ is_read: true }).eq("id", notificationId);
    }
  } catch {
    /* fall back to the plain Reports page */
  }
}
