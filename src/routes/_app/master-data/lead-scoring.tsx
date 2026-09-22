import { createFileRoute } from "@tanstack/react-router";
import LeadScoringMaster from "@/pages/master/LeadScoringMaster";

export const Route = createFileRoute("/_app/master-data/lead-scoring")({
  component: LeadScoringMaster,
});
