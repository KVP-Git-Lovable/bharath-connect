import { describe, expect, it } from "vitest";
import { toTravelRow, type TravelSource } from "./TravelExpenseReport";

const base: TravelSource = {
  id: "a1",
  user_id: "u1",
  lead_id: null,
  activity_date: "2026-09-23",
  activity_type: "Visit",
  outcome: null,
  status: "completed",
  travel_distance_km: 8,
  manual_distance_km: null,
  travel_time_mins: 20,
  start_time: null,
  end_time: null,
  total_hours: 1,
};

const ctx = { name: "Shravan", customer: "-", rate: 25 };

describe("toTravelRow", () => {
  it("prices a normal leg at km x rate", () => {
    const row = toTravelRow(base, ctx);
    expect(row.km).toBe(8);
    expect(row.amount).toBe(200);
    expect(row.fare).toBeNull();
    expect(row.proofs).toEqual([]);
  });

  it("uses the fare paid, not km x rate, for public transport", () => {
    const row = toTravelRow({ ...base, manual_fare_amount: 45 }, ctx);
    // 8 km x Rs 25 would be Rs 200 — the fare must win.
    expect(row.amount).toBe(45);
    expect(row.fare).toBe(45);
  });

  it("carries the receipt through so an admin can open it", () => {
    const row = toTravelRow(
      {
        ...base,
        manual_fare_amount: 180,
        manual_distance_attachments: [{ url: "u1/travel-proof/x.jpg", name: "cab.jpg" }],
      },
      ctx,
    );
    expect(row.proofs).toHaveLength(1);
    expect(row.proofs[0]!.name).toBe("cab.jpg");
    expect(row.proofs[0]!.url).toBe("u1/travel-proof/x.jpg");
  });

  it("treats a zero fare as a real claim, not a missing one", () => {
    const row = toTravelRow({ ...base, manual_fare_amount: 0 }, ctx);
    expect(row.fare).toBe(0);
    expect(row.amount).toBe(0);
  });

  it("prefers the rep's meter reading over the GPS distance", () => {
    const row = toTravelRow({ ...base, manual_distance_km: 12 }, ctx);
    expect(row.km).toBe(12);
    expect(row.is_manual).toBe(true);
    expect(row.amount).toBe(300);
  });

  it("survives an activity with no attachments column yet", () => {
    const row = toTravelRow({ ...base, manual_distance_attachments: null }, ctx);
    expect(row.proofs).toEqual([]);
  });
});
