import { describe, it, expect, vi } from "vitest";

const h = vi.hoisted(() => ({ row: null as unknown }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: h.row, error: null }) }) }) }) }),
  },
}));
import { explainMissingTravel, pickPreviousCheckout, checkOutAt } from "./activityTravel";

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

describe("travel checkpoints", () => {
  const out = (id: string, at: string, endTime = at) => ({ id, end_time: endTime, status_history: [{ status: "in_progress", at: "x" }, { status: "completed", at }] });
  const session = "2026-09-11T03:00:00Z"; // attendance check-in

  it("first activity of the session starts from attendance (no earlier check-out)", () => {
    expect(pickPreviousCheckout([], "2026-09-11T03:20:00Z", session)).toBeNull();
  });

  it("each activity starts from the previous activity's check-out, not from attendance", () => {
    const a1 = out("a1", "2026-09-11T04:05:00Z");
    const a2 = out("a2", "2026-09-11T05:30:00Z");
    // Activity 2 check-in: previous checkpoint is Activity 1 check-out
    expect(pickPreviousCheckout([a1], "2026-09-11T04:30:00Z", session)?.row.id).toBe("a1");
    // Activity 3 check-in: previous checkpoint is Activity 2 check-out (latest one)
    const p3 = pickPreviousCheckout([a1, a2], "2026-09-11T05:45:00Z", session);
    expect(p3?.row.id).toBe("a2");
    expect(p3?.at).toBe("2026-09-11T05:30:00Z");
  });

  it("tells apart two activities that carry the same name", () => {
    // The 18 Sep case: two "General Activity - INDO PROFILES" records. The
    // checkpoint is chosen by check-out time and reported by id, so a name
    // collision cannot send the third activity back to the first.
    const named = (id: string, at: string) => ({ ...out(id, at), activity_name: "General Activity" });
    const first = named("indo-1", "2026-09-11T04:05:00Z");
    const second = named("indo-2", "2026-09-11T05:30:00Z");
    expect(pickPreviousCheckout([first, second], "2026-09-11T05:45:00Z", session)?.row.id).toBe("indo-2");
  });

  it("orders by check-out time, not by the order rows came back in", () => {
    const a1 = out("a1", "2026-09-11T04:05:00Z");
    const a2 = out("a2", "2026-09-11T05:30:00Z");
    const forwards = pickPreviousCheckout([a1, a2], "2026-09-11T05:45:00Z", session)?.row.id;
    const backwards = pickPreviousCheckout([a2, a1], "2026-09-11T05:45:00Z", session)?.row.id;
    expect(forwards).toBe("a2");
    expect(backwards).toBe("a2");
  });

  it("ignores check-outs from before this attendance session or after this check-in", () => {
    const before = out("old", "2026-09-11T02:00:00Z");
    const later = out("later", "2026-09-11T06:00:00Z");
    expect(pickPreviousCheckout([before, later], "2026-09-11T04:00:00Z", session)).toBeNull();
  });

  it("uses the real check-out moment even if the end time was edited", () => {
    const edited = out("a1", "2026-09-11T04:05:00Z", "2026-09-11T09:00:00Z");
    expect(checkOutAt(edited)).toBe("2026-09-11T04:05:00Z");
    expect(pickPreviousCheckout([edited], "2026-09-11T04:30:00Z", session)?.row.id).toBe("a1");
  });
});
