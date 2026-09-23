import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  claim: null as { id: string; status: string; amount: number } | null,
  category: null as { id: string; auto_approval_limit: number | null } | null,
  inserted: [] as Record<string, unknown>[],
  updated: [] as Record<string, unknown>[],
  deleted: [] as string[],
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => ({
      select: () => ({
        eq: function eq() {
          return {
            eq: () => ({ maybeSingle: async () => ({ data: h.category }) }),
            maybeSingle: async () => ({
              data: table === "additional_expenses" ? h.claim : h.category,
            }),
          };
        },
      }),
      insert: async (row: Record<string, unknown>) => { h.inserted.push(row); return { error: null }; },
      update: (row: Record<string, unknown>) => ({
        eq: async (_c: string, id: string) => { h.updated.push({ ...row, __id: id }); return { error: null }; },
      }),
      delete: () => ({
        eq: async (_c: string, id: string) => { h.deleted.push(id); return { error: null }; },
      }),
    }),
  },
}));

const { syncFareClaim, approvedFareClaim, FARE_CATEGORY } = await import("./fareClaim");

const input = {
  activityId: "act-1",
  userId: "u-1",
  activityDate: "2026-09-23",
  fare: 180,
  billPath: "u-1/travel-proof/cab.jpg",
  description: "ACT-0049 · Site visit",
};

describe("syncFareClaim", () => {
  beforeEach(() => {
    h.claim = null;
    h.category = { id: "cat-1", auto_approval_limit: null };
    h.inserted = []; h.updated = []; h.deleted = [];
  });

  it("files a new fare as a submitted claim against the activity", async () => {
    const out = await syncFareClaim(input);
    expect(out).toEqual({ kind: "saved", autoApproved: false });

    const row = h.inserted[0]!;
    expect(row["activity_id"]).toBe("act-1");
    expect(row["user_id"]).toBe("u-1");
    expect(row["amount"]).toBe(180);
    expect(row["status"]).toBe("submitted");
    expect(row["category"]).toBe(FARE_CATEGORY);
    expect(row["bill_url"]).toBe("u-1/travel-proof/cab.jpg");
    expect(row["month_key"]).toBe("2026-09");
  });

  it("auto-approves a fare under the category limit", async () => {
    h.category = { id: "cat-1", auto_approval_limit: 200 };
    const out = await syncFareClaim(input);
    expect(out).toEqual({ kind: "saved", autoApproved: true });
    expect(h.inserted[0]!["status"]).toBe("approved");
  });

  it("does not auto-approve a fare on the limit", async () => {
    h.category = { id: "cat-1", auto_approval_limit: 180 };
    const out = await syncFareClaim({ ...input, fare: 180 });
    expect(out).toEqual({ kind: "saved", autoApproved: false });
  });

  it("updates the existing claim instead of filing a second one", async () => {
    h.claim = { id: "exp-1", status: "submitted", amount: 180 };
    await syncFareClaim({ ...input, fare: 220 });

    expect(h.inserted).toHaveLength(0);
    expect(h.updated).toHaveLength(1);
    expect(h.updated[0]!["amount"]).toBe(220);
  });

  it("refuses to rewrite a claim an approver already signed off", async () => {
    h.claim = { id: "exp-1", status: "approved", amount: 180 };
    const out = await syncFareClaim({ ...input, fare: 900 });

    expect(out).toEqual({ kind: "locked", amount: 180 });
    expect(h.inserted).toHaveLength(0);
    expect(h.updated).toHaveLength(0);
    expect(h.deleted).toHaveLength(0);
  });

  it("removes the claim when the fare is cleared", async () => {
    h.claim = { id: "exp-1", status: "submitted", amount: 180 };
    const out = await syncFareClaim({ ...input, fare: null });

    expect(out).toEqual({ kind: "removed" });
    expect(h.deleted).toEqual(["exp-1"]);
  });

  it("will not delete an approved claim when the fare is cleared", async () => {
    h.claim = { id: "exp-1", status: "approved", amount: 180 };
    const out = await syncFareClaim({ ...input, fare: null });

    expect(out).toEqual({ kind: "locked", amount: 180 });
    expect(h.deleted).toHaveLength(0);
  });

  it("does nothing when there is no fare and no claim", async () => {
    const out = await syncFareClaim({ ...input, fare: null });
    expect(out).toEqual({ kind: "none" });
    expect(h.inserted).toHaveLength(0);
    expect(h.deleted).toHaveLength(0);
  });

  it("still files the claim when the category is missing", async () => {
    h.category = null;
    const out = await syncFareClaim(input);
    expect(out).toEqual({ kind: "saved", autoApproved: false });
    expect(h.inserted[0]!["category_id"]).toBeNull();
  });
});

describe("approvedFareClaim", () => {
  beforeEach(() => { h.claim = null; });

  it("reports an approved claim so the caller can block the edit", async () => {
    h.claim = { id: "exp-1", status: "approved", amount: 180 };
    expect(await approvedFareClaim("act-1")).toEqual({ amount: 180 });
  });

  it("is null for a claim still awaiting approval", async () => {
    h.claim = { id: "exp-1", status: "submitted", amount: 180 };
    expect(await approvedFareClaim("act-1")).toBeNull();
  });

  it("is null when there is no claim", async () => {
    expect(await approvedFareClaim("act-1")).toBeNull();
  });
});
