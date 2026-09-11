import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const h = vi.hoisted(() => {
  const state = { statuses: [] as string[] };
  const chain = (table: string) => {
    const q: Record<string, unknown> = {};
    const self = new Proxy(q, {
      get(_t, prop) {
        if (prop === "then") {
          if (table === "notification_rules")
            return (res: (v: unknown) => void) => res({ data: [{ id: "r1", name: "Expense submitted → manager", notification_channel: "in_app_push" }], error: null });
          if (table === "notification_event_types") return (res: (v: unknown) => void) => res({ count: 15, error: null });
          return undefined;
        }
        if (prop === "maybeSingle")
          return async () => ({ data: { id: "n1", title: "[Test] Expense submitted", delivery_status: state.statuses.shift() ?? "delivered" }, error: null });
        return () => self;
      },
    });
    return self;
  };
  return { state, chain };
});

vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (t: string) => h.chain(t) } }));
vi.mock("@/hooks/useNotificationRules", () => ({
  previewRecipients: vi.fn().mockResolvedValue([{ id: "a", name: "Admin", email: "a@x" }]),
  sendTestNotification: vi.fn().mockResolvedValue({ notification_id: "n1", push: true }),
}));

import SystemCheckDialog from "./SystemCheckDialog";

const statusOf = (key: string) => screen.getByTestId(`check-${key}`).getAttribute("data-status");

describe("SystemCheckDialog", () => {
  beforeEach(() => { h.state.statuses = []; });

  it("reports every step green when the push goes out", async () => {
    h.state.statuses = ["delivered", "pushed"];
    render(<SystemCheckDialog open onOpenChange={() => {}} />);
    fireEvent.click(screen.getByText("Run check"));
    await waitFor(() => expect(statusOf("push")).toBe("ok"), { timeout: 6000 });
    expect(["engine", "recipients", "send", "bell"].map(statusOf)).toEqual(["ok", "ok", "ok", "ok"]);
    expect(screen.getByText(/Sent to your phone/)).toBeInTheDocument();
  }, 10000);

  it("explains a missing phone registration", async () => {
    h.state.statuses = ["no_device"];
    render(<SystemCheckDialog open onOpenChange={() => {}} />);
    fireEvent.click(screen.getByText("Run check"));
    await waitFor(() => expect(statusOf("push")).toBe("warn"));
    expect(screen.getByText(/No phone is registered/)).toBeInTheDocument();
  });
});
