import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/admin/activity-types")({
  beforeLoad: () => {
    throw redirect({ to: "/activity-types", replace: true });
  },
});
