import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/leads-events/events/$id")({
  beforeLoad: () => {
    throw redirect({ to: "/events", replace: true });
  },
});
