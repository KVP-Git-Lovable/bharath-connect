import { describe, expect, it } from "vitest";
import { activityHeadline } from "./activityHeadline";

describe("activityHeadline", () => {
  it("names the activity and where it went", () => {
    expect(activityHeadline({ activity_type: "General Activity", lead_company: "Dibyanshi Associates" }))
      .toBe("General Activity - Dibyanshi Associates");
  });

  it("falls back through the destinations in the order the card uses", () => {
    expect(activityHeadline({ activity_type: "Visit", lead_name: "Ravi" })).toBe("Visit - Ravi");
    expect(activityHeadline({ activity_type: "Visit", site_name: "Plant A" })).toBe("Visit - Plant A");
    expect(activityHeadline({ activity_type: "Visit", project_name: "Metro" })).toBe("Visit - Metro");
    // A company outranks the person, as on the card.
    expect(activityHeadline({ activity_type: "Visit", lead_company: "Acme", lead_name: "Ravi" }))
      .toBe("Visit - Acme");
  });

  it("uses the activity name when there is no type", () => {
    expect(activityHeadline({ activity_name: "Follow up: Activity" })).toBe("Follow up: Activity");
  });

  it("never renders a dangling separator", () => {
    expect(activityHeadline({ activity_type: "General Activity" })).toBe("General Activity");
    expect(activityHeadline({})).toBe("Activity");
  });

  it("does not distinguish two activities by name — that is the caller's job", () => {
    // Both legs of the 18 Sep pair produce the same string, which is why the
    // UI has to carry the record id alongside it.
    const a = { activity_type: "General Activity", lead_company: "INDO PROFILES" };
    const b = { activity_type: "General Activity", lead_company: "INDO PROFILES" };
    expect(activityHeadline(a)).toBe(activityHeadline(b));
  });
});
