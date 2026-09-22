import { createFileRoute } from "@tanstack/react-router";
import OpportunityStagesMaster from "@/pages/master/OpportunityStagesMaster";

export const Route = createFileRoute("/_app/master-data/opportunity-stages")({
  component: OpportunityStagesMaster,
});
