import { createFileRoute } from "@tanstack/react-router";
import InstallApp from "@/pages/InstallApp";

export const Route = createFileRoute("/install")({
  component: InstallApp,
});
