import { createFileRoute } from "@tanstack/react-router";
import More from "@/pages/More";

export const Route = createFileRoute("/_app/more")({
  component: More,
});
