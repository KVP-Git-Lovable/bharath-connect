import { createFileRoute } from "@tanstack/react-router";
import MyTeam from "@/pages/MyTeam";

export const Route = createFileRoute("/_app/my-team")({
  component: MyTeam,
});
