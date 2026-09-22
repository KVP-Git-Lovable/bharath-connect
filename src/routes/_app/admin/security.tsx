import { createFileRoute } from "@tanstack/react-router";
import SecurityManagement from "@/pages/SecurityManagement";

export const Route = createFileRoute("/_app/admin/security")({
  component: SecurityManagement,
});
