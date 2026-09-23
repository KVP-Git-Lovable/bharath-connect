import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ calls: [] as { bucket: string; path: string }[] }));

vi.mock("@/utils/signedStorage", () => ({
  resolveSignedUrl: async (bucket: string, path: string) => {
    h.calls.push({ bucket, path });
    return `https://signed.example/${bucket}/${path}`;
  },
}));
vi.mock("@/utils/activityTravel", () => ({ TRAVEL_PROOF_BUCKET: "travel-proofs" }));

const { resolveReceiptUrl, receiptBucket, EXPENSE_BILL_BUCKET } = await import("./receiptUrl");

describe("receipt URLs", () => {
  beforeEach(() => { h.calls = []; });

  it("signs a fare receipt against the travel proof bucket", async () => {
    const url = await resolveReceiptUrl({
      bill_url: "u1/travel-proof/1790158209331-dk0lea.png",
      activity_id: "act-1",
    });

    expect(h.calls[0]!.bucket).toBe("travel-proofs");
    expect(url).toContain("https://signed.example/travel-proofs/");
  });

  it("signs a manually entered claim against the expense bill bucket", async () => {
    await resolveReceiptUrl({ bill_url: "u1/1790000000_bill.jpg", activity_id: null });
    expect(h.calls[0]!.bucket).toBe(EXPENSE_BILL_BUCKET);
  });

  it("treats a claim with no activity_id field as a manual claim", async () => {
    await resolveReceiptUrl({ bill_url: "u1/old-bill.jpg" });
    expect(h.calls[0]!.bucket).toBe(EXPENSE_BILL_BUCKET);
  });

  it("returns nothing, and signs nothing, when there is no receipt", async () => {
    expect(await resolveReceiptUrl({ bill_url: null, activity_id: "act-1" })).toBe("");
    expect(h.calls).toHaveLength(0);
  });

  it("never returns a bare storage path, which is what caused the 404", async () => {
    const path = "10324af2-7f85-411e-beb4-487fd0e4c158/travel-proof/1790158209331-dk0lea.png";
    const url = await resolveReceiptUrl({ bill_url: path, activity_id: "act-1" });
    expect(url).not.toBe(path);
    expect(url.startsWith("https://")).toBe(true);
  });

  it("routes by activity_id", () => {
    expect(receiptBucket({ activity_id: "act-1" })).toBe("travel-proofs");
    expect(receiptBucket({ activity_id: null })).toBe(EXPENSE_BILL_BUCKET);
  });
});
