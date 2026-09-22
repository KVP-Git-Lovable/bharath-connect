import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "@/lib/router-compat";

const h = vi.hoisted(() => ({
  compute: vi.fn(),
  explain: vi.fn(),
  update: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) })),
  expense: null as any,
}));

vi.mock("@/utils/activityTravel", () => ({
  computeTravelForCheckIn: h.compute,
  explainMissingTravel: h.explain,
  uploadTravelProof: vi.fn(),
  TRAVEL_PROOF_BUCKET: "x",
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => ({ update: h.update }) } }));
vi.mock("@/hooks/useTaRates", () => ({ useTaRates: () => ({ rateFor: () => 5 }) }));
vi.mock("@/hooks/useActivityTravelExpense", () => ({ useActivityTravelExpense: () => ({ data: h.expense }) }));
vi.mock("@/utils/signedStorage", () => ({ resolveSignedUrl: vi.fn() }));

import ActivityEffortSection from "./ActivityEffortSection";

const activity = {
  id: "a1", user_id: "u1", activity_date: "2026-09-11",
  start_time: "2026-09-11T04:10:00Z", end_time: "2026-09-11T04:42:00Z",
  status_history: [{ status: "in_progress", at: "2026-09-11T04:10:00Z", lat: 12.88, lng: 74.84 }],
  travel_distance_km: null, travel_time_mins: null, travel_from_type: null, travel_from_activity_id: null,
  manual_distance_km: null, manual_distance_note: null, manual_distance_attachments: [],
} as never;

const renderIt = () => render(<MemoryRouter><ActivityEffortSection activity={activity} /></MemoryRouter>);

describe("ActivityEffortSection travel", () => {
  beforeEach(() => { h.compute.mockReset(); h.explain.mockReset(); h.expense = null; });

  it("shows recalculated values immediately, even without a parent refresh", async () => {
    h.compute.mockResolvedValue({ travel_distance_km: 8.6, travel_time_mins: 25, travel_from_type: "attendance", travel_from_activity_id: null, travel_from_at: "x" });
    renderIt();
    await waitFor(() => expect(screen.getByText("8.6 km")).toBeInTheDocument());
    expect(screen.getByText("25 min")).toBeInTheDocument();
    expect(screen.getByText("Attendance (day check-in)")).toBeInTheDocument();
    expect(screen.getByText("32 min")).toBeInTheDocument(); // meeting time unchanged
    expect(screen.getByText("₹43")).toBeInTheDocument(); // 8.6 km × ₹5
  });

  it("explains why travel is blank and offers Recalculate", async () => {
    h.compute.mockResolvedValue(null);
    h.explain.mockResolvedValue("No day check-in was recorded on this date, so there is no starting point.");
    renderIt();
    await waitFor(() => expect(screen.getByText(/No day check-in was recorded/)).toBeInTheDocument());
    h.compute.mockResolvedValue({ travel_distance_km: null, travel_time_mins: 12, travel_from_type: "attendance", travel_from_activity_id: null, travel_from_at: "x" });
    fireEvent.click(screen.getByText("Recalculate"));
    await waitFor(() => expect(screen.getByText("12 min")).toBeInTheDocument());
    expect(screen.getByText(/Distance needs GPS points/)).toBeInTheDocument();
  });

  it("prices travel with the activity's vehicle and shows the calculation", async () => {
    h.expense = { method: "from_gps", vehicle_id: "v1", vehicle_name: "Car", vehicle_source: "activity", is_no_vehicle: false, km: 8.6, rate: 25, rate_source: "vehicle", amount: 215 };
    h.compute.mockResolvedValue({ travel_distance_km: 8.6, travel_time_mins: 25, travel_from_type: "attendance", travel_from_activity_id: null, travel_from_at: "x" });
    renderIt();
    await waitFor(() => expect(screen.getByText("8.6 km × ₹25/km")).toBeInTheDocument());
    expect(screen.getByText("₹215")).toBeInTheDocument();
    expect(screen.getByText("Car")).toBeInTheDocument();
    expect(screen.getByText("Standard Car rate")).toBeInTheDocument();
  });

  it("shows ₹0 for Outstation", async () => {
    h.expense = { method: "from_gps", vehicle_id: "v9", vehicle_name: "Outstation", vehicle_source: "day", is_no_vehicle: true, km: 3, rate: 0, rate_source: "no_vehicle", amount: 0 };
    h.compute.mockResolvedValue(null);
    h.explain.mockResolvedValue("x");
    renderIt();
    await waitFor(() => expect(screen.getByText("₹0")).toBeInTheDocument());
    expect(screen.getByText("No vehicle used")).toBeInTheDocument();
  });
});
