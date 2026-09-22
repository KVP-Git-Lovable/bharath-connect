import { createFileRoute } from "@tanstack/react-router";
import AdminUserManagement from "@/pages/AdminUserManagement";

export const Route = createFileRoute("/_app/admin/users")({
  component: AdminUserManagement,
});
