import { createFileRoute } from "@tanstack/react-router";
import ConfigurationWorkflow from "@/pages/ConfigurationWorkflow";

export const Route = createFileRoute("/_app/admin/configuration")({
  component: ConfigurationWorkflow,
});
