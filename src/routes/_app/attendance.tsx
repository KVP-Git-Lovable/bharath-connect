import { createFileRoute } from "@tanstack/react-router";
import Attendance from "@/pages/Attendance";

export const Route = createFileRoute("/_app/attendance")({
  component: Attendance,
});
