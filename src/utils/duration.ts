/**
 * Duration formatting for display.
 *
 * Deliberately separate from the two ad-hoc formatters already in the tree
 * (TodayGPSRoute takes minutes, useAudioRecorder wants M:SS). Adopting this one
 * there is a follow-up with its own visual-regression risk, not a freebie.
 */

/**
 * Render a duration in seconds as zero-padded HH:MM.
 *
 * Absence and zero are different claims about someone's workday, so no data
 * renders as an em dash rather than 00:00. Minutes are floored, never rounded:
 * the displayed total must never exceed the recorded total. Hours are not
 * capped at two digits -- a month range legitimately exceeds 100 hours, and
 * "142:30" is honest where "5d 22h" would fight the rest of the page.
 */
export function formatHHMM(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || Number.isNaN(seconds)) return "—";
  const safe = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}
