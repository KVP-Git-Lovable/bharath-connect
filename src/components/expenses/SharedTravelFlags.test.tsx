import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SharedTravelFlags from "./SharedTravelFlags";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));

const pair = {
  activity_date: "2026-09-08",
  destination: "Acme Industries",
  a_activity_id: "act-a",
  a_user_id: "u-a",
  a_name: "Ravi Kumar",
  a_amount: 215,
  b_activity_id: "act-b",
  b_user_id: "u-b",
  b_name: "Priya Nair",
  b_amount: 215,
};

function renderFlags() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={client}>
      <SharedTravelFlags yearMonth="2026-09" />
    </QueryClientProvider>,
  );
  // An empty DOM means nothing until the query has actually settled -- while
  // it is still loading the component renders nothing either way.
  const settled = () =>
    waitFor(() =>
      expect(client.getQueryState(["undeclared-shared-travel", "2026-09"])?.status).toBe("success"),
    );
  return { ...view, settled };
}

describe("SharedTravelFlags", () => {
  beforeEach(() => rpc.mockReset());

  it("names both people and what each is being paid", async () => {
    rpc.mockResolvedValue({ data: [pair], error: null });
    renderFlags();

    expect(await screen.findByText("Ravi Kumar")).toBeInTheDocument();
    expect(screen.getByText("Priya Nair")).toBeInTheDocument();
    expect(screen.getByText(/Acme Industries/)).toBeInTheDocument();
    // The total is the number that matters: this is what gets paid twice.
    expect(screen.getByText("₹430 in total")).toBeInTheDocument();
  });

  it("says nothing when no journey looks duplicated", async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    const { container, settled } = renderFlags();
    await settled();
    expect(container).toBeEmptyDOMElement();
  });

  it("stays quiet rather than breaking the page before the migration runs", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'function find_undeclared_shared_travel does not exist' } });
    const { container, settled } = renderFlags();
    await settled();
    expect(container).toBeEmptyDOMElement();
  });

  it("asks for the month being reviewed", async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    renderFlags();
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith("find_undeclared_shared_travel", { _year_month: "2026-09" }),
    );
  });
});
