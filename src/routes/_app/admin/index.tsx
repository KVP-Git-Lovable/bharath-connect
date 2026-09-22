import { createFileRoute } from "@tanstack/react-router";
import AdminControls from "@/pages/AdminControls";

export const Route = createFileRoute("/_app/admin/")({
  component: AdminControls,
});
