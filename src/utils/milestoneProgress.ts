import { supabase } from "@/integrations/supabase/client";

/**
 * Derive a milestone status from its progress percentage.
 * Only auto-adjusts between the standard not_started / in_progress / completed
 * states; preserves delayed / on_hold if currently set and progress isn't terminal.
 */
export function statusFromProgress(pct: number, currentStatus?: string | null): string {
  if (pct >= 100) return "completed";
  if (pct <= 0) return currentStatus && currentStatus !== "completed" ? currentStatus : "not_started";
  // in-progress range: keep delayed / on_hold if already set
  if (currentStatus === "delayed" || currentStatus === "on_hold") return currentStatus;
  return "in_progress";
}

/**
 * Single source of truth: update a milestone's progress (and derived status)
 * in the database. Used by both the Site detail screen and the Log Activity form.
 */
export async function updateMilestoneProgress(
  milestoneId: string,
  pct: number,
  currentStatus?: string | null,
): Promise<void> {
  const clamped = Math.min(100, Math.max(0, Math.round(pct)));
  const status = statusFromProgress(clamped, currentStatus);
  const { error } = await supabase
    .from("site_milestones")
    .update({ percent_complete: clamped, status })
    .eq("id", milestoneId);
  if (error) throw error;
}
