import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({ update: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({}) })) }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: {
              is_read: false,
              metadata: {
                module: "travel-expense",
                period_from: "2026-09-07",
                period_to: "2026-09-13",
                report_config: { filters: { employee: "u1" }, visibleColumns: ["full_name"] },
              },
            },
          }),
        }),
      }),
      update: h.update,
    }),
  },
}));

import { applyReportLink } from "./reportLink";
import { takeReportPrefill } from "./reportPrefill";

describe("applyReportLink", () => {
  beforeEach(() => sessionStorage.clear());
  it("opens the right tab with the delivered period and saved layout", async () => {
    await applyReportLink("n1");
    expect(sessionStorage.getItem("analytics-tab")).toBe("travel");
    expect(takeReportPrefill("travel-expense")).toEqual({
      employee: "u1",
      preset: "custom",
      customFrom: "2026-09-07",
      customTo: "2026-09-13",
      __visibleColumns: ["full_name"],
    });
    expect(h.update).toHaveBeenCalledWith({ is_read: true });
  });
});
