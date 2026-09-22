import { createFileRoute } from "@tanstack/react-router";
import OpportunityScoringMaster from "@/pages/master/OpportunityScoringMaster";

export const Route = createFileRoute("/_app/master-data/opportunity-scoring")({
  component: OpportunityScoringMaster,
});
