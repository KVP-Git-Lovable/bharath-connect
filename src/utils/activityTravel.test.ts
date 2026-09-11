import { describe, it, expect, vi } from "vitest";

const h = vi.hoisted(() => ({ row: null as unknown }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: h.row, error: null }) }) }) }) }),
  },
}));
import { explainMissingTravel } from "./activityTravel";

describe("explainMissingTravel", () => {
  const base = { userId: "u1", activityDate: "2026-09-11", checkInAt: "2026-09-11T04:10:00Z" };
  it("no day check-in", async () => {
    h.row = null;
    expect(await explainMissingTravel(base)).toMatch(/No day check-in was recorded/);
  });
  it("day check-in after the activity check-in", async () => {
    h.row = { check_in_time: "2026-09-11T04:30:00Z" };
    expect(await explainMissingTravel(base)).toMatch(/happened after this activity check-in/);
  });
  it("not checked in yet", async () => {
    expect(await explainMissingTravel({ ...base, checkInAt: null })).toMatch(/when the activity is checked in/);
  });
});
