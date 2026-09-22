import { createFileRoute } from "@tanstack/react-router";
import AttendanceManagement from "@/pages/AttendanceManagement";

export const Route = createFileRoute("/_app/admin/attendance")({
  component: AttendanceManagement,
});
