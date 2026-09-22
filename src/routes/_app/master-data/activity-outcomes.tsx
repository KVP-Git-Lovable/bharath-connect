import { createFileRoute } from "@tanstack/react-router";
import OutcomeMaster from "@/pages/master/OutcomeMaster";

export const Route = createFileRoute("/_app/master-data/activity-outcomes")({
  component: OutcomeMaster,
});
