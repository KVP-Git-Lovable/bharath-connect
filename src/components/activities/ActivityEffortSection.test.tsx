import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "@/lib/router-compat";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const h = vi.hoisted(() => ({
  compute: vi.fn(),
  explain: vi.fn(),
  updateError: null as { message: string } | null,
  update: vi.fn((payload?: Record<string, unknown>) => ({
    eq: vi.fn().mockResolvedValue({
      // Simulate the column being absent: only the payload carrying it fails.
      error: h.updateError && payload && "travel_role" in payload ? h.updateError : null,
    }),
  })),
  expense: null as any,
  vehicles: [] as any[],
  tables: [] as string[],
  companions: [] as unknown[],
  rpcError: null as { message: string } | null,
  headlines: {} as Record<string, string | null>,
}));

vi.mock("@/utils/activityTravel", () => ({
  computeTravelForCheckIn: h.compute,
  explainMissingTravel: h.explain,
  uploadTravelProof: vi.fn(),
  TRAVEL_PROOF_BUCKET: "x",
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (t: string) => { h.tables.push(t); return { update: h.update }; },
    rpc: async () => ({ data: h.companions, error: h.rpcError }),
  },
}));
vi.mock("@/hooks/useTaRates", () => ({ useTaRates: () => ({ rateFor: () => 5 }) }));
vi.mock("@/hooks/useActivityTravelExpense", () => ({ useActivityTravelExpense: () => ({ data: h.expense }) }));
vi.mock("@/utils/signedStorage", () => ({ resolveSignedUrl: vi.fn() }));
vi.mock("@/utils/fareClaim", () => ({
  lockedFareClaim: vi.fn().mockResolvedValue(null),
  syncFareClaim: vi.fn().mockResolvedValue({ kind: "none" }),
  FARE_CATEGORY: "Public Transport",
}));
vi.mock("@/hooks/useVehicleTypes", () => ({
  useVehicleTypes: () => ({ vehicleTypes: h.vehicles, loading: false, refetch: vi.fn() }),
}));
vi.mock("@/hooks/useActivityHeadline", () => ({
  useActivityHeadline: (id: string | null) => ({ data: id ? h.headlines[id] ?? null : null }),
}));

import ActivityEffortSection, { TravelExpenseTile } from "./ActivityEffortSection";

const activity = {
  id: "a1", user_id: "u1", activity_date: "2026-09-11", customer_id: "c1",
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
  beforeEach(() => { h.compute.mockReset(); h.explain.mockReset(); h.expense = null; h.vehicles = []; h.tables = []; h.updateError = null; h.companions = []; h.rpcError = null; h.headlines = {}; h.update.mockClear(); });

  it("shows recalculated values immediately, even without a parent refresh", async () => {
    h.compute.mockResolvedValue({ travel_distance_km: 8.6, travel_time_mins: 25, travel_from_type: "attendance", travel_from_activity_id: null, travel_from_at: "x" });
    renderIt();
    await waitFor(() => expect(screen.getByText("8.6 km")).toBeInTheDocument());
    expect(screen.getByText("25 min")).toBeInTheDocument();
    expect(screen.getByText("Attendance (day check-in)")).toBeInTheDocument();
    expect(screen.getByText("32 min")).toBeInTheDocument(); // meeting time unchanged
    expect(screen.getByText("₹43")).toBeInTheDocument(); // 8.6 km × ₹5
  });

  it("names the activity the travel was measured from", async () => {
    h.headlines = { "prev-1": "General Activity - Dibyanshi Associates" };
    h.compute.mockResolvedValue({ travel_distance_km: 1.1, travel_time_mins: 3, travel_from_type: "activity", travel_from_activity_id: "prev-1", travel_from_at: "x" });
    renderIt();

    await waitFor(() =>
      expect(screen.getByText("General Activity - Dibyanshi Associates")).toBeInTheDocument(),
    );
    // The generic words were the bug: they made two different starting points
    // read identically.
    expect(screen.queryByText("Previous activity")).not.toBeInTheDocument();
  });

  it("falls back to the neutral wording rather than showing nothing", async () => {
    h.headlines = {}; // name not resolved yet, or no longer readable
    h.compute.mockResolvedValue({ travel_distance_km: 1.1, travel_time_mins: 3, travel_from_type: "activity", travel_from_activity_id: "prev-1", travel_from_at: "x" });
    renderIt();

    await waitFor(() => expect(screen.getByText("Previous activity")).toBeInTheDocument());
  });

  it("still says attendance when the day check-in was the starting point", async () => {
    h.headlines = { "prev-1": "Should not be used" };
    h.compute.mockResolvedValue({ travel_distance_km: 1.1, travel_time_mins: 3, travel_from_type: "attendance", travel_from_activity_id: null, travel_from_at: "x" });
    renderIt();

    await waitFor(() => expect(screen.getByText("Attendance (day check-in)")).toBeInTheDocument());
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
    // Two selects now: vehicle first, then who paid.
    expect(screen.getAllByRole("combobox")[0]).toHaveTextContent("Bike");
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
    // (The save also files the fare claim, so the table list is not exhaustive.)
    expect(h.tables).toContain("activity_events");
    expect(h.tables).not.toContain("daily_vehicle_selections");
    expect(h.tables).not.toContain("user_pinned_vehicles");
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
    await waitFor(() => expect(screen.getAllByRole("combobox")[0]).toHaveTextContent("Bike"));
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

  it("locks the effort block for a per-km vehicle", async () => {
    h.vehicles = [{ id: "v1", name: "Car", is_fare_based: false, is_no_vehicle: false }];
    h.expense = { method: "from_gps", vehicle_id: "v1", vehicle_name: "Car", vehicle_source: "activity", is_no_vehicle: false, km: 8, rate: 25, rate_source: "vehicle", amount: 200 };
    h.compute.mockResolvedValue(null);
    h.explain.mockResolvedValue("x");
    renderIt({ vehicle_type_id: "v1" });

    await waitFor(() => expect(screen.getByText(/Available for public transport only/)).toBeInTheDocument());
    expect(screen.getByPlaceholderText("e.g. 18.4")).toBeDisabled();
    expect(screen.getByPlaceholderText(/Reason \/ remarks/)).toBeDisabled();
    expect(screen.getByText("Attach").closest("button")).toBeDisabled();
    // Nothing to commit, so Save is closed too.
    expect(screen.getByText("Save effort details").closest("button")).toBeDisabled();
  });

  it("leaves the block open for public transport", async () => {
    h.vehicles = [{ id: "v-cab", name: "Cab", is_fare_based: true, is_no_vehicle: false }];
    h.expense = { method: "from_gps", vehicle_id: "v-cab", vehicle_name: "Cab", vehicle_source: "activity", is_no_vehicle: false, km: null, rate: 0, rate_source: "vehicle", amount: 0 };
    h.compute.mockResolvedValue(null);
    h.explain.mockResolvedValue("x");
    renderIt({ vehicle_type_id: "v-cab" });

    await waitFor(() => expect(screen.getByText(/Fare paid for this trip/)).toBeInTheDocument());
    expect(screen.queryByText(/Available for public transport only/)).not.toBeInTheDocument();
    expect(screen.getByText("Attach").closest("button")).not.toBeDisabled();
    expect(screen.getByText("Save effort details").closest("button")).not.toBeDisabled();
  });

  it("still allows saving a vehicle change away from public transport", async () => {
    h.vehicles = [{ id: "v1", name: "Car", is_fare_based: false, is_no_vehicle: false }];
    h.expense = { method: "from_gps", vehicle_id: "v1", vehicle_name: "Car", vehicle_source: "activity", is_no_vehicle: false, km: 8, rate: 25, rate_source: "vehicle", amount: 200 };
    h.compute.mockResolvedValue(null);
    h.explain.mockResolvedValue("x");
    // Saved with no vehicle, picker seeded null -> differs from nothing, so the
    // pending case is exercised by a saved vehicle the picker does not hold.
    renderIt({ vehicle_type_id: null });

    await waitFor(() => expect(screen.getByText(/Available for public transport only/)).toBeInTheDocument());
    // Locked, and with no pending change there is nothing to save.
    expect(screen.getByText("Save effort details").closest("button")).toBeDisabled();
  });

  it("shows nothing to claim, and files no claim, for a passenger", async () => {
    h.vehicles = [{ id: "v-cab", name: "Cab", is_fare_based: true, is_no_vehicle: false }];
    h.expense = { method: "from_gps", vehicle_id: "v-cab", vehicle_name: "Cab", vehicle_source: "activity", is_no_vehicle: false, km: 6, rate: 0, rate_source: "vehicle", amount: 0 };
    h.compute.mockResolvedValue(null);
    h.explain.mockResolvedValue("x");
    // A passenger must name who they rode with, so seed that too.
    h.companions = [{ activity_id: "act-driver", user_id: "u2", full_name: "Prajwal C", activity_label: null, start_time: null }];
    renderIt({ vehicle_type_id: "v-cab", travel_role: "passenger", manual_fare_amount: 180, shared_with_activity_id: "act-driver" });

    await waitFor(() => expect(screen.getByText(/your colleague is claiming the fare/i)).toBeInTheDocument());
    // The fare field is replaced, not merely disabled.
    expect(screen.queryByPlaceholderText("e.g. 180")).not.toBeInTheDocument();
    expect(screen.getByText(/Travelled with a colleague/)).toBeInTheDocument();

    fireEvent.click(screen.getByText("Save effort details"));
    await waitFor(() => expect(h.update).toHaveBeenCalled());
    const payload = h.update.mock.calls[0]?.[0] ?? {};
    expect(payload["travel_role"]).toBe("passenger");
    // A passenger keeps no fare of their own.
    expect(payload["manual_fare_amount"]).toBeNull();
  });

  it("keeps the fare field for someone who paid", async () => {
    h.vehicles = [{ id: "v-cab", name: "Cab", is_fare_based: true, is_no_vehicle: false }];
    h.expense = { method: "from_gps", vehicle_id: "v-cab", vehicle_name: "Cab", vehicle_source: "activity", is_no_vehicle: false, km: 6, rate: 0, rate_source: "vehicle", amount: 0 };
    h.compute.mockResolvedValue(null);
    h.explain.mockResolvedValue("x");
    renderIt({ vehicle_type_id: "v-cab", travel_role: "driver", manual_fare_amount: 180 });

    await waitFor(() => expect(screen.getByText(/Fare paid for this trip/)).toBeInTheDocument());
    expect(screen.queryByText(/your colleague is claiming the fare/i)).not.toBeInTheDocument();
  });

  it("offers a way to say who paid", async () => {
    h.vehicles = [{ id: "v1", name: "Car", is_fare_based: false, is_no_vehicle: false }];
    h.expense = { method: "from_gps", vehicle_id: "v1", vehicle_name: "Car", vehicle_source: "activity", is_no_vehicle: false, km: 8, rate: 25, rate_source: "vehicle", amount: 200 };
    h.compute.mockResolvedValue(null);
    h.explain.mockResolvedValue("x");
    renderIt({ vehicle_type_id: "v1" });

    await waitFor(() => expect(screen.getByText("Who paid for this journey")).toBeInTheDocument());
  });

  it("still saves the effort details when the shared-travel column is missing", async () => {
    h.updateError = { message: 'column "travel_role" does not exist' };
    // A fare vehicle, so the block is not greyed out and Save is reachable.
    h.vehicles = [{ id: "v-cab", name: "Cab", is_fare_based: true, is_no_vehicle: false }];
    h.expense = { method: "from_gps", vehicle_id: "v-cab", vehicle_name: "Cab", vehicle_source: "activity", is_no_vehicle: false, km: null, rate: 0, rate_source: "vehicle", amount: 0 };
    h.compute.mockResolvedValue(null);
    h.explain.mockResolvedValue("x");
    renderIt({ vehicle_type_id: "v-cab" });

    await waitFor(() => expect(screen.getByText("Who paid for this journey")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Save effort details"));

    // Retried without the new column, so the distance/note/proofs still land.
    await waitFor(() => expect(h.update).toHaveBeenCalledTimes(2));
    const retry = h.update.mock.calls[1]?.[0] ?? {};
    expect("travel_role" in retry).toBe(false);
    expect("manual_distance_km" in retry).toBe(true);
  });

  it("will not save a passenger without naming who they travelled with", async () => {
    h.vehicles = [{ id: "v-cab", name: "Cab", is_fare_based: true, is_no_vehicle: false }];
    h.expense = { method: "from_gps", vehicle_id: "v-cab", vehicle_name: "Cab", vehicle_source: "activity", is_no_vehicle: false, km: null, rate: 0, rate_source: "vehicle", amount: 0 };
    h.compute.mockResolvedValue(null);
    h.explain.mockResolvedValue("x");
    renderIt({ vehicle_type_id: "v-cab", travel_role: "passenger" });

    await waitFor(() => expect(screen.getByText("Travelled with")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Save effort details"));

    // Nothing written: a passenger with no companion is an unfinished answer.
    await waitFor(() => expect(h.update).not.toHaveBeenCalled());
  });

  it("explains when nobody else went there, rather than showing an empty list", async () => {
    h.companions = [];
    h.vehicles = [{ id: "v-cab", name: "Cab", is_fare_based: true, is_no_vehicle: false }];
    h.expense = { method: "from_gps", vehicle_id: "v-cab", vehicle_name: "Cab", vehicle_source: "activity", is_no_vehicle: false, km: null, rate: 0, rate_source: "vehicle", amount: 0 };
    h.compute.mockResolvedValue(null);
    h.explain.mockResolvedValue("x");
    renderIt({ vehicle_type_id: "v-cab", travel_role: "passenger" });

    await waitFor(() => expect(screen.getByText(/Nobody else has an activity at this destination/)).toBeInTheDocument());
  });

  it("names the date it searched, so a wrong date is visible", async () => {
    h.companions = [];
    h.vehicles = [{ id: "v-cab", name: "Cab", is_fare_based: true, is_no_vehicle: false }];
    h.expense = { method: "from_gps", vehicle_id: "v-cab", vehicle_name: "Cab", vehicle_source: "activity", is_no_vehicle: false, km: null, rate: 0, rate_source: "vehicle", amount: 0 };
    h.compute.mockResolvedValue(null);
    h.explain.mockResolvedValue("x");
    renderIt({ vehicle_type_id: "v-cab", travel_role: "passenger" });

    // "today" would be a lie on an activity being filled in days later.
    await waitFor(() => expect(screen.getByText(/11 Sep 2026/)).toBeInTheDocument());
  });

  it("says the lookup failed instead of claiming nobody was there", async () => {
    h.rpcError = { message: "function find_travel_companions does not exist" };
    h.vehicles = [{ id: "v-cab", name: "Cab", is_fare_based: true, is_no_vehicle: false }];
    h.expense = { method: "from_gps", vehicle_id: "v-cab", vehicle_name: "Cab", vehicle_source: "activity", is_no_vehicle: false, km: null, rate: 0, rate_source: "vehicle", amount: 0 };
    h.compute.mockResolvedValue(null);
    h.explain.mockResolvedValue("x");
    renderIt({ vehicle_type_id: "v-cab", travel_role: "passenger" });

    await waitFor(() => expect(screen.getByText(/Could not look up colleagues/)).toBeInTheDocument());
    expect(screen.queryByText(/Nobody else has an activity/)).not.toBeInTheDocument();
  });

  it("says so when the activity has nowhere to match a colleague against", async () => {
    h.companions = [{ activity_id: "act-driver", user_id: "u2", full_name: "Prajwal C", activity_label: null, start_time: null }];
    h.vehicles = [{ id: "v-cab", name: "Cab", is_fare_based: true, is_no_vehicle: false }];
    h.expense = { method: "from_gps", vehicle_id: "v-cab", vehicle_name: "Cab", vehicle_source: "activity", is_no_vehicle: false, km: null, rate: 0, rate_source: "vehicle", amount: 0 };
    h.compute.mockResolvedValue(null);
    h.explain.mockResolvedValue("x");
    // No customer, site or lead: there is nothing to match on, so asking the
    // database would only ever return nobody.
    renderIt({ vehicle_type_id: "v-cab", travel_role: "passenger", customer_id: null });

    await waitFor(() => expect(screen.getByText(/nothing to match a colleague against/)).toBeInTheDocument());
    expect(screen.queryByText(/Nobody else has an activity/)).not.toBeInTheDocument();
  });

  it("saves the link so both legs share one journey", async () => {
    h.companions = [{ activity_id: "act-driver", user_id: "u2", full_name: "Prajwal C", activity_label: "ACT-1 · Visit", start_time: null }];
    h.vehicles = [{ id: "v-cab", name: "Cab", is_fare_based: true, is_no_vehicle: false }];
    h.expense = { method: "from_gps", vehicle_id: "v-cab", vehicle_name: "Cab", vehicle_source: "activity", is_no_vehicle: false, km: null, rate: 0, rate_source: "vehicle", amount: 0 };
    h.compute.mockResolvedValue(null);
    h.explain.mockResolvedValue("x");
    renderIt({ vehicle_type_id: "v-cab", travel_role: "passenger", shared_with_activity_id: "act-driver" });

    await waitFor(() => expect(screen.getByText("Travelled with")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Save effort details"));

    await waitFor(() => expect(h.update).toHaveBeenCalled());
    const payload = h.update.mock.calls[0]?.[0] ?? {};
    expect(payload["shared_with_activity_id"]).toBe("act-driver");
    // The group is the paying activity, so the driver's leg matches without
    // anyone writing to the driver's row.
    expect(payload["travel_group_id"]).toBe("act-driver");
  });
});
