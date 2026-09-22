import { createFileRoute } from "@tanstack/react-router";
import SiteMasterPage from "@/pages/SiteMaster";

export const Route = createFileRoute("/_app/sites")({
  component: SiteMasterPage,
});
