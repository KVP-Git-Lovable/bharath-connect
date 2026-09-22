import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/analytics")({
  beforeLoad: () => {
    throw redirect({ to: "/reports", replace: true });
  },
});
