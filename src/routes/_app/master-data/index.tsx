import { createFileRoute } from "@tanstack/react-router";
import MasterData from "@/pages/MasterData";

export const Route = createFileRoute("/_app/master-data/")({
  component: MasterData,
});
