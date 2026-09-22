import { createFileRoute } from "@tanstack/react-router";
import MyNotifications from "@/pages/MyNotifications";

export const Route = createFileRoute("/_app/notifications")({
  component: MyNotifications,
});
