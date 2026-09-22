import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "@/lib/router-compat";

const h = vi.hoisted(() => {
  const row = (i: number, extra: Record<string, unknown> = {}) => ({
    id: `n${i}`, created_at: "2026-09-11T04:00:00Z", user_id: "u1", recipient_name: "Meena Manager",
    title: `Expense submitted: ₹${i}00`, message: "Shravan kumar submitted a Travel expense", type: "record_created",
    related_table: "additional_expenses", related_id: null, is_read: i % 2 === 0, read_at: null, is_dismissed: false,
    delivery_status: i === 1 ? "no_device" : "pushed", source: "rules_engine", rule_name: "Expense submitted → manager",
    event_code: "RECORD_CREATED", route: "/expenses", is_test: false, total_count: 40, ...extra,
  });
  return {
    calls: [] as unknown[],
    rows: [row(1), row(2)],
  };
});

vi.mock("@/hooks/useNotificationHistory", async (orig) => {
  const actual = await orig<typeof import("@/hooks/useNotificationHistory")>();
  return {
    ...actual,
    useNotificationHistory: (filters: unknown, page: number) => {
      h.calls.push({ filters, page });
      return { data: { rows: h.rows, total: 40 }, isLoading: false, isFetching: false, error: null };
    },
    useNotificationHistoryStats: () => ({
      data: { total: 40, read: 10, pushed: 30, no_device: 3, push_failed: 1, by_source: {}, modules: ["additional_expenses"] },
    }),
  };
});
vi.mock("@/hooks/useNotificationRules", () => ({ usePeopleOptions: () => ({ data: { users: [], profiles: [] } }) }));

import NotificationHistoryTab from "./NotificationHistoryTab";

describe("NotificationHistoryTab", () => {
  it("shows stats, rows, paging and a detail sheet", async () => {
    render(<MemoryRouter><NotificationHistoryTab /></MemoryRouter>);
    expect(screen.getByText("25%")).toBeInTheDocument(); // read rate
    expect(screen.getByText("4")).toBeInTheDocument(); // push problems
    expect(screen.getByText("1–25 of 40")).toBeInTheDocument();
    expect(screen.getAllByText("No device").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByLabelText("Next page"));
    await waitFor(() => expect(h.calls.at(-1)).toMatchObject({ page: 1 }));

    fireEvent.click(screen.getAllByText("Expense submitted: ₹100")[0]!);
    await waitFor(() => expect(screen.getByText(/no phone registered for push/)).toBeInTheDocument());
    expect(screen.getByText("Open Expenses")).toBeInTheDocument();
  });
});
