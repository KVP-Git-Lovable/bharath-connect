import { createFileRoute } from "@tanstack/react-router";
import Activities from "@/pages/Activities";

export const Route = createFileRoute("/_app/activities")({
  component: Activities,
});
