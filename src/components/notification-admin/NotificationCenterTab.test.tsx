import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const h = vi.hoisted(() => {
const rules = [
  { id: "r1", name: "Expense submitted → manager", source_table: "additional_expenses", event_code: "RECORD_CREATED",
    title_template: "Expense submitted: {amount}", message_template: "{user_name} submitted {amount}", receiver_type: "manager",
    receiver_role: null, receiver_user_id: null, include_secondary_manager: true, notification_channel: "in_app_push",
    timezone: "Asia/Kolkata", is_active: true, created_by: null, created_at: "", updated_at: "" },
  { id: "r2", name: "Leave applied → admins", source_table: "leave_applications", event_code: "RECORD_CREATED",
    title_template: "Leave", message_template: "", receiver_type: "role", receiver_role: "Sales Manager", receiver_user_id: null,
    include_secondary_manager: false, notification_channel: "in_app", timezone: "Asia/Kolkata", is_active: false, created_by: null, created_at: "", updated_at: "" },
];
const eventTypes = [
  { id: "e1", source_table: "additional_expenses", event_code: "RECORD_CREATED", module_label: "Expenses", label: "Expense submitted",
    description: "Employee submits an expense", tokens: ["user_name", "amount"], app_already_notifies: false, sort_order: 1, is_active: true },
  { id: "e2", source_table: "leave_applications", event_code: "RECORD_CREATED", module_label: "Leave", label: "Leave applied",
    description: "Employee applies for leave", tokens: ["user_name", "leave_type"], app_already_notifies: true, sort_order: 2, is_active: true },
  { id: "e3", source_table: "site_milestones", event_code: "MILESTONE_AT_RISK", module_label: "Site milestones", label: "Milestone at risk",
    description: "", tokens: ["milestone_name"], app_already_notifies: false, sort_order: 3, is_active: true, extra_receivers: ["site_team"] },
];
const mutate = { mutateAsync: vi.fn().mockResolvedValue(undefined), isPending: false };
const preview = vi.fn().mockResolvedValue([{ id: "u1", name: "Meena Manager", email: "m@x" }]);
return { rules, eventTypes, mutate, preview };
});
const { mutate, preview } = h;

vi.mock("@/hooks/useNotificationRules", async (orig) => {
  const actual = await orig<typeof import("@/hooks/useNotificationRules")>();
  return {
    ...actual,
    useNotificationRules: () => ({ data: h.rules, isLoading: false }),
    useNotificationEventTypes: () => ({ data: h.eventTypes }),
    useNotificationRuleStats: () => ({ data: { eventsToday: 3, sent7d: 12 } }),
    usePeopleOptions: () => ({ data: { users: [{ id: "u1", name: "Meena Manager" }], profiles: ["Sales Manager"] } }),
    useToggleNotificationRule: () => h.mutate,
    useDeleteNotificationRule: () => h.mutate,
    useSaveNotificationRule: () => h.mutate,
    previewRecipients: h.preview,
    sendTestNotification: vi.fn().mockResolvedValue({ push: true }),
  };
});

import NotificationCenterTab from "./NotificationCenterTab";

describe("Notification Center smoke", () => {
  it("renders stats, rules and opens the editor with preview + duplicate warning", async () => {
    render(<NotificationCenterTab />);
    expect(screen.getAllByText("Expense submitted → manager").length).toBeGreaterThan(0);
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getAllByText("Profile: Sales Manager").length).toBeGreaterThan(0);

    fireEvent.click(screen.getAllByText("Leave applied → admins")[0]);
    await waitFor(() => expect(screen.getByText("Edit notification rule")).toBeInTheDocument());
    expect(screen.getByText(/already sends its own notification/)).toBeInTheDocument();

    fireEvent.click(screen.getByText("Preview recipients"));
    await waitFor(() => expect(screen.getByText("Meena Manager")).toBeInTheDocument());
    expect(preview).toHaveBeenCalledWith(expect.objectContaining({ receiver_type: "role", receiver_role: "Sales Manager" }));

    fireEvent.click(screen.getByText("Save changes"));
    await waitFor(() => expect(mutate.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ id: "r2", values: expect.objectContaining({ receiver_role: "Sales Manager", receiver_user_id: null }) })
    ));
  });

  it("fills the sample preview for a new rule", async () => {
    render(<NotificationCenterTab />);
    fireEvent.click(screen.getByText("New rule"));
    await waitFor(() => expect(screen.getByText("New notification rule")).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Hi {user_name}, {amount}" } });
    expect(screen.getByText("Hi Ravi Kumar, ₹1,250.00")).toBeInTheDocument();
  });

  it("inserts details into the field whose chip was tapped, spaced and at the end", async () => {
    render(<NotificationCenterTab />);
    fireEvent.click(screen.getAllByText("Expense submitted → manager")[0]);
    await waitFor(() => expect(screen.getByText("Edit notification rule")).toBeInTheDocument());
    const title = screen.getByLabelText("Title") as HTMLInputElement;
    const message = screen.getByLabelText("Message") as HTMLTextAreaElement;
    fireEvent.focus(title); // title touched last, but the message chip must still target the message

    const amountChips = screen.getAllByText("Amount");
    expect(amountChips).toHaveLength(2); // one row per field
    fireEvent.click(amountChips[1]);
    expect(message.value).toBe("{user_name} submitted {amount} {amount}");
    expect(title.value).toBe("Expense submitted: {amount}");

    fireEvent.click(screen.getAllByText("Employee name")[0]);
    expect(title.value).toBe("Expense submitted: {amount} {user_name}");
  });

  it("replaces broken wording with the suggested text in one tap", async () => {
    render(<NotificationCenterTab />);
    fireEvent.click(screen.getAllByText("Expense submitted → manager")[0]);
    await waitFor(() => expect(screen.getByText("Edit notification rule")).toBeInTheDocument());
    const title = screen.getByLabelText("Title") as HTMLInputElement;
    fireEvent.change(title, { target: { value: "Expense sub{user_name}mitted" } });
    fireEvent.click(screen.getByText("Use suggested text"));
    expect(title.value).toBe("Expense submitted: {amount}");
    expect((screen.getByLabelText("Message") as HTMLTextAreaElement).value).toBe(
      "{user_name} submitted a {category} expense of {amount} for {expense_date}."
    );
  });

  it("offers only record-appropriate recipients for site milestones", async () => {
    const { receiverOptions } = await import("@/hooks/useNotificationRules");
    const values = receiverOptions("site_milestones", ["site_team"]).map((r) => r.value);
    expect(values).toContain("site_team");
    expect(values).not.toContain("employee");
    expect(values).not.toContain("project_members");
    const leave = receiverOptions("leave_applications", []).map((r) => r.value);
    expect(leave).toEqual(["employee", "manager", "hierarchy", "admin", "role", "specific_user"]);
  });
});

