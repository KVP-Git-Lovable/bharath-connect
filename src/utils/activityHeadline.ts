/**
 * How an activity is named on screen.
 *
 * The rule already existed, written out twice — once on the activity card and
 * once on the timeline. It lives here so a third caller cannot drift from the
 * other two, which matters most for "Previous activity considered": a name
 * that does not match the card it points at is worse than no name.
 */
export interface HeadlineFields {
  activity_type?: string | null | undefined;
  activity_name?: string | null | undefined;
  lead_company?: string | null | undefined;
  lead_name?: string | null | undefined;
  site_name?: string | null | undefined;
  project_name?: string | null | undefined;
}

export function activityHeadline(a: HeadlineFields): string {
  const label = a.activity_type || a.activity_name || "Activity";
  const context = a.lead_company || a.lead_name || a.site_name || a.project_name || "";
  return context ? `${label} - ${context}` : label;
}
