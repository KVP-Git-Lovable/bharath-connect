import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/admin/sites")({
  beforeLoad: () => {
    throw redirect({ to: "/sites", replace: true });
  },
});
