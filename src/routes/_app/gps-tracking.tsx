import { createFileRoute } from "@tanstack/react-router";
import GPSTracking from "@/pages/GPSTracking";

export const Route = createFileRoute("/_app/gps-tracking")({
  component: GPSTracking,
});
