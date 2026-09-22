import { createFileRoute } from "@tanstack/react-router";
import EventTypesMaster from "@/pages/master/EventTypesMaster";

export const Route = createFileRoute("/_app/master-data/event-types")({
  component: EventTypesMaster,
});
