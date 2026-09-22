import { createFileRoute } from "@tanstack/react-router";
import Events from "@/pages/Events";

export const Route = createFileRoute("/_app/events/")({
  component: Events,
});
