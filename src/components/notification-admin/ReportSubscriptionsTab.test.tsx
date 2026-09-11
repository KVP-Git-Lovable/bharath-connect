import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const h = vi.hoisted(() => {
  const sub = {
    id: "s1", name: "Daily attendance", module: "attendance", saved_report_name: null, report_config: {},
    period: "yesterday", cadence: "mon_sat", fire_time: "09:00:00", fire_weekday: null, fire_monthday: null,
    timezone: "Asia/Kolkata", recipient_mode: "managers", recipient_user_ids: [], recipient_role: null,
    push_to_phone: true, status: "active", next_run_at: "2026-09-12T03:30:00Z", last_run_at: null,
    created_by: null, created_at: "", updated_at: "",
  };
  return { sub, runNow: vi.fn().mockResolvedValue(3) };
});

vi.mock("@/hooks/useReportSubscriptions", async (orig) => {
  const actual = await orig<typeof import("@/hooks/useReportSubscriptions")>();
  const m = { mutateAsync: vi.fn().mockResolvedValue(undefined), isPending: false };
  return {
    ...actual,
    useReportSubscriptions: () => ({ data: [h.sub], isLoading: false }),
    useDeliveryStats: () => ({ data: { delivered7d: 21 } }),
    useDeliveryLog: () => ({ data: [], isLoading: false }),
    useSavedReports: () => ({ data: [] }),
    useSetSubscriptionStatus: () => m,
    useDeleteSubscription: () => m,
    useSaveSubscription: () => m,
    useRunNow: () => ({ mutateAsync: h.runNow }),
    previewSubscription: vi.fn().mockResolvedValue({ next_run_at: "2026-09-12T03:30:00Z", period_label: "11 Sep 2026", recipients: ["Meena Manager"] }),
  };
});
vi.mock("@/hooks/useNotificationRules", () => ({ usePeopleOptions: () => ({ data: { users: [], profiles: [] } }) }));

import ReportSubscriptionsTab from "./ReportSubscriptionsTab";
import { scheduleText } from "@/hooks/useReportSubscriptions";

describe("ReportSubscriptionsTab", () => {
  it("lists subscriptions with a readable schedule", () => {
    render(<ReportSubscriptionsTab />);
    expect(screen.getAllByText("Daily attendance").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Mon–Sat at 9:00 AM").length).toBeGreaterThan(0);
    expect(screen.getByText("21")).toBeInTheDocument();
  });

  it("previews the next run in the editor", async () => {
    render(<ReportSubscriptionsTab />);
    fireEvent.click(screen.getByText("New subscription"));
    await waitFor(() => expect(screen.getByText("11 Sep 2026")).toBeInTheDocument(), { timeout: 3000 });
    expect(screen.getByText("Meena Manager")).toBeInTheDocument();
  });

  it("formats every cadence", () => {
    const base = { fire_time: "18:30:00", fire_weekday: 5, fire_monthday: 31 };
    expect(scheduleText({ ...base, cadence: "daily" })).toBe("Daily at 6:30 PM");
    expect(scheduleText({ ...base, cadence: "weekly" })).toBe("Every Friday at 6:30 PM");
    expect(scheduleText({ ...base, cadence: "monthly" })).toBe("Monthly on day 31 at 6:30 PM");
  });
});
