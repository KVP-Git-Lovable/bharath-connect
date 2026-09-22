import { createFileRoute } from "@tanstack/react-router";
import AdminExpenseManagement from "@/pages/AdminExpenseManagement";

export const Route = createFileRoute("/_app/admin/expenses")({
  component: AdminExpenseManagement,
});
