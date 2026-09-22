import { createFileRoute } from "@tanstack/react-router";
import NotificationRules from "@/pages/NotificationRules";

export const Route = createFileRoute("/_app/admin/notification-rules")({
  component: NotificationRules,
});
