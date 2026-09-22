import { createFileRoute } from "@tanstack/react-router";
import LeadDetail from "@/pages/LeadDetail";

export const Route = createFileRoute("/_app/leads/$id")({
  component: LeadDetail,
});
