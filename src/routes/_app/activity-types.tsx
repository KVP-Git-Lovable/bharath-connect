import { createFileRoute } from "@tanstack/react-router";
import ActivityTypeMasterPage from "@/pages/ActivityTypeMaster";

export const Route = createFileRoute("/_app/activity-types")({
  component: ActivityTypeMasterPage,
});
