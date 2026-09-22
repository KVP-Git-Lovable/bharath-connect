import { createFileRoute } from "@tanstack/react-router";
import Leads from "@/pages/Leads";

export const Route = createFileRoute("/_app/leads/")({
  component: Leads,
});
