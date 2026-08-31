/**
 * Cross-page report prefill: a dashboard KPI can hand a report module the
 * exact filter state behind its number so the report opens auto-generated
 * with the same rows.
 */
const key = (module: string) => `report-prefill:${module}`;

export function setReportPrefill(module: string, filters: Record<string, unknown>) {
  try {
    sessionStorage.setItem(key(module), JSON.stringify(filters));
  } catch {
    /* storage unavailable */
  }
}

export function takeReportPrefill(module: string): Record<string, unknown> | null {
  try {
    const raw = sessionStorage.getItem(key(module));
    if (!raw) return null;
    sessionStorage.removeItem(key(module));
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}
