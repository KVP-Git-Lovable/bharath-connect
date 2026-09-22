import { createFileRoute } from "@tanstack/react-router";
import OpportunityTypesMaster from "@/pages/master/OpportunityTypesMaster";

export const Route = createFileRoute("/_app/master-data/opportunity-types")({
  component: OpportunityTypesMaster,
});
