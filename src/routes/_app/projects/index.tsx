import { createFileRoute } from "@tanstack/react-router";
import ProjectsPage from "@/pages/Projects";

export const Route = createFileRoute("/_app/projects/")({
  component: ProjectsPage,
});
