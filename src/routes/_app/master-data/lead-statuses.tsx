import { createFileRoute } from "@tanstack/react-router";
import LeadStatusesMaster from "@/pages/master/LeadStatusesMaster";

export const Route = createFileRoute("/_app/master-data/lead-statuses")({
  component: LeadStatusesMaster,
});
