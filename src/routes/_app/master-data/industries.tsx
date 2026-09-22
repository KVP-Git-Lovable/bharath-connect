import { createFileRoute } from "@tanstack/react-router";
import IndustriesMaster from "@/pages/master/IndustriesMaster";

export const Route = createFileRoute("/_app/master-data/industries")({
  component: IndustriesMaster,
});
