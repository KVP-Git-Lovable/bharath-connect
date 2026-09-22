import { createFileRoute } from "@tanstack/react-router";
import ActivityTimeline from "@/pages/ActivityTimeline";

export const Route = createFileRoute("/_app/activity-timeline")({
  component: ActivityTimeline,
});
