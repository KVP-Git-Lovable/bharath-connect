import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "@/lib/router-compat";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const h = vi.hoisted(() => ({
  compute: vi.fn(),
  explain: vi.fn(),
  update: vi.fn((_payload?: Record<string, unknown>) => ({ eq: vi.fn().mockResolvedValue({ error: null }) })),
  expense: null as any,
  vehicles: [] as any[],
  tables: [] as string[],
}));

vi.mock("@/utils/activityTravel", () => ({
  computeTravelForCheckIn: h.compute,
  explainMissingTravel: h.explain,
  uploadTravelProof: vi.fn(),
  TRAVEL_PROOF_BUCKET: "x",
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (t: string) => { h.tables.push(t); return { update: h.update }; } },
}));
vi.mock("@/hooks/useTaRates", () => ({ useTaRates: () => ({ rateFor: () => 5 }) }));
vi.mock("@/hooks/useActivityTravelExpense", () => ({ useActivityTravelExpense: () => ({ data: h.expense }) }));
vi.mock("@/utils/signedStorage", () => ({ resolveSignedUrl: vi.fn() }));
vi.mock("@/hooks/useVehicleTypes", () => ({
  useVehicleTypes: () => ({ vehicleTypes: h.vehicles, loading: false, refetch: vi.fn() }),
}));

import ActivityEffortSection, { TravelExpenseTile } from "./ActivityEffortSection";

const activity = {
  id: "a1", user_id: "u1", activity_date: "2026-09-11",
  start_time: "2026-09-11T04:10:00Z", end_time: "2026-09-11T04:42:00Z",
  status_history: [{ status: "in_progress", at: "2026-09-11T04:10:00Z", lat: 12.88, lng: 74.84 }],
  travel_distance_km: null, travel_time_mins: null, travel_from_type: null, travel_from_activity_id: null,
  manual_distance_km: null, manual_distance_note: null, manual_distance_attachments: [],
} as never;

const renderIt = (extra: Record<string, unknown> = {}) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter><ActivityEffortSection activity={{ ...(activity as object), ...extra } as never} /></MemoryRouter>
    </QueryClientProvider>,
  );
};

describe("ActivityEffortSection travel", () => {
  beforeEach(() => { h.compute.mockReset(); h.explain.mockReset(); h.expense = null; h.vehicles = []; h.tables = []; h.update.mockClear(); });

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

  it("asks for the fare, not the meter reading, when the vehicle is public transport", async () => {
    h.vehicles = [{ id: "v-cab", name: "Cab", is_fare_based: true }];
    h.expense = { method: "from_gps", vehicle_id: "v-cab", vehicle_name: "Cab", vehicle_source: "activity", is_no_vehicle: false, km: 6, rate: 0, rate_source: "vehicle", amount: 0 };
    h.compute.mockResolvedValue(null);
    h.explain.mockResolvedValue("x");
    renderIt({ vehicle_type_id: "v-cab" });

    await waitFor(() => expect(screen.getByText(/Fare paid for this trip/)).toBeInTheDocument());
    expect(screen.queryByText(/enter meter reading distance/)).not.toBeInTheDocument();
    expect(screen.getByText(/Ticket \/ meter \/ invoice/)).toBeInTheDocument();
  });

  it("keeps the meter-reading flow for a normal vehicle", async () => {
    h.vehicles = [{ id: "v1", name: "Car", is_fare_based: false }];
    h.expense = { method: "from_gps", vehicle_id: "v1", vehicle_name: "Car", vehicle_source: "activity", is_no_vehicle: false, km: 8.6, rate: 25, rate_source: "vehicle", amount: 215 };
    h.compute.mockResolvedValue(null);
    h.explain.mockResolvedValue("x");
    renderIt({ vehicle_type_id: "v1" });

    await waitFor(() => expect(screen.getByText(/enter meter reading distance/)).toBeInTheDocument());
    expect(screen.queryByText(/Fare paid for this trip/)).not.toBeInTheDocument();
  });

  it("shows the fare the employee paid instead of km x rate", async () => {
    h.vehicles = [{ id: "v-bus", name: "Bus", is_fare_based: true }];
    h.expense = { method: "from_gps", vehicle_id: "v-bus", vehicle_name: "Bus", vehicle_source: "activity", is_no_vehicle: false, km: 12, rate: 7, rate_source: "vehicle", amount: 84 };
    h.compute.mockResolvedValue(null);
    h.explain.mockResolvedValue("x");
    renderIt({ vehicle_type_id: "v-bus", manual_fare_amount: 45 });

    // 12 km x Rs 7 would be Rs 84; the fare must win.
    // Shown twice: the headline amount and the breakdown row.
    await waitFor(() => expect(screen.getAllByText("₹45").length).toBeGreaterThan(0));
    expect(screen.queryByText("₹84")).not.toBeInTheDocument();
    expect(screen.getByText(/Fare paid · Bus/)).toBeInTheDocument();
  });

  // Radix Select does not open under jsdom's pointer events, so the dropdown
  // interaction is not driven here. What the override needs is covered: the
  // control is present and seeded from the activity, the fare/km switch is
  // asserted per vehicle above, and the saved payload is asserted below.
  it("offers a per-activity vehicle control seeded from the activity", async () => {
    h.vehicles = [
      { id: "v-bike", name: "Bike", is_fare_based: false, is_no_vehicle: false },
      { id: "v-cab", name: "Cab", is_fare_based: true, is_no_vehicle: false },
    ];
    h.expense = { method: "from_gps", vehicle_id: "v-bike", vehicle_name: "Bike", vehicle_source: "activity", is_no_vehicle: false, km: 4, rate: 5, rate_source: "vehicle", amount: 20 };
    h.compute.mockResolvedValue(null);
    h.explain.mockResolvedValue("x");
    renderIt({ vehicle_type_id: "v-bike" });

    await waitFor(() => expect(screen.getByText("Vehicle used for this trip")).toBeInTheDocument());
    expect(screen.getByRole("combobox")).toHaveTextContent("Bike");
    // Stamped vehicle is a Bike, so the km flow is shown.
    expect(screen.getByText(/enter meter reading distance/)).toBeInTheDocument();
  });

  it("writes the vehicle only to this activity, never to the day's selection", async () => {
    h.vehicles = [{ id: "v-bus", name: "Bus", is_fare_based: true, is_no_vehicle: false }];
    h.expense = { method: "from_gps", vehicle_id: "v-bus", vehicle_name: "Bus", vehicle_source: "activity", is_no_vehicle: false, km: null, rate: 0, rate_source: "vehicle", amount: 0 };
    h.compute.mockResolvedValue(null);
    h.explain.mockResolvedValue("x");
    renderIt({ vehicle_type_id: "v-bus" });

    await waitFor(() => expect(screen.getByText(/Fare paid for this trip/)).toBeInTheDocument());
    fireEvent.click(screen.getByText("Save effort details"));

    await waitFor(() => expect(h.update).toHaveBeenCalled());
    const payload = h.update.mock.calls[0]?.[0] ?? {};
    expect(payload["vehicle_type_id"]).toBe("v-bus");
    // The day's vehicle lives in daily_vehicle_selections and must be untouched.
    expect(h.tables).toEqual(["activity_events"]);
  });

  it("does not keep claiming the old amount after the vehicle is changed", async () => {
    // Reproduces the reported screenshot: saved as Bus with a Rs 48 fare, then
    // the vehicle is switched to Bike. The tile must not still assert
    // "Fare paid . Bus  Rs 48" while the picker says Bike.
    h.vehicles = [
      { id: "v-bus", name: "Bus", is_fare_based: true, is_no_vehicle: false },
      { id: "v-bike", name: "Bike", is_fare_based: false, is_no_vehicle: false },
    ];
    h.expense = { method: "from_gps", vehicle_id: "v-bus", vehicle_name: "Bus", vehicle_source: "activity", is_no_vehicle: false, km: null, rate: 0, rate_source: "vehicle", amount: 0 };
    h.compute.mockResolvedValue(null);
    h.explain.mockResolvedValue("x");
    renderIt({ vehicle_type_id: "v-bike", manual_fare_amount: 48 });

    // Saved fare belongs to Bus; the activity now points at Bike.
    await waitFor(() => expect(screen.getByRole("combobox")).toHaveTextContent("Bike"));
    expect(screen.queryByText(/Fare paid · Bus/)).not.toBeInTheDocument();
  });

  // The picker change itself cannot be driven under jsdom, so the pending
  // banner is asserted on the tile directly.
  it("shows a pending banner instead of an amount for an unsaved vehicle", () => {
    const exp = { method: "from_gps", vehicle_id: "v-bus", vehicle_name: "Bus", vehicle_source: "activity", is_no_vehicle: false, km: 4, rate: 7, rate_source: "vehicle", amount: 28 } as never;
    render(<TravelExpenseTile exp={exp} km={4} fare={48} pendingVehicle="Bike" />);

    expect(screen.getByText("Changed to Bike")).toBeInTheDocument();
    expect(screen.getByText(/Save to work out the amount/)).toBeInTheDocument();
    // Neither the old fare nor the old km x rate may be presented as this trip.
    expect(screen.queryByText("₹48")).not.toBeInTheDocument();
    expect(screen.queryByText("₹28")).not.toBeInTheDocument();
    expect(screen.queryByText(/Fare paid/)).not.toBeInTheDocument();
  });
});
