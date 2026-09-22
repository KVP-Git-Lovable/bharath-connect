import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/leads-events/leads/$id")({
  beforeLoad: () => {
    throw redirect({ to: "/leads", replace: true });
  },
});
