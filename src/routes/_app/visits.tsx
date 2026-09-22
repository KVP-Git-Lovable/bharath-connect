import { createFileRoute } from "@tanstack/react-router";
import Visits from "@/pages/Visits";

export const Route = createFileRoute("/_app/visits")({
  component: Visits,
});
