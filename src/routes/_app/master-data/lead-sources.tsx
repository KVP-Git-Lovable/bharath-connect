import { createFileRoute } from "@tanstack/react-router";
import LeadSourcesMaster from "@/pages/master/LeadSourcesMaster";

export const Route = createFileRoute("/_app/master-data/lead-sources")({
  component: LeadSourcesMaster,
});
