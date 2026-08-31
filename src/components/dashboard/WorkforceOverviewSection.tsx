import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Users, CalendarCheck } from "lucide-react";
import { useProfilePermissions } from "@/hooks/useProfilePermissions";
import { useUserProfile } from "@/hooks/useUserProfile";
import WorkforceAttendanceTable from "./WorkforceAttendanceTable";
import WorkforceActivityCalendar from "./WorkforceActivityCalendar";
import { useWorkforceFilterContext } from "./WorkforceFilterContext";

export default function WorkforceOverviewSection() {
  const { hasWidgetPermission, isLoading: permsLoading } = useProfilePermissions();
  const { isAdmin } = useUserProfile();
  const canView = isAdmin || hasWidgetPermission("widget_admin_attendance_overview");

  const { data, isLoading, start, rangeLabel } = useWorkforceFilterContext();

  const attendanceRows = useMemo(() => data?.attendanceRows || [], [data]);
  const activityRows = useMemo(() => data?.activityRows || [], [data]);

  if (permsLoading || !canView) return null;

  return (
    <Card className="overflow-hidden shadow-card">
      <CardContent className="space-y-5 p-4 sm:p-5">
        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <Users className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-base font-bold leading-tight text-foreground sm:text-lg">
                Attendance &amp; Workforce
              </h2>
              <p className="text-xs text-muted-foreground">{rangeLabel}</p>
            </div>
          </div>
        </div>


        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <CalendarCheck className="h-4 w-4 text-primary" />
            <p className="text-sm font-semibold">Attendance Log</p>
          </div>
          <WorkforceAttendanceTable rows={attendanceRows} isLoading={isLoading} />
        </div>

        <WorkforceActivityCalendar activities={activityRows} anchorDate={start} />
      </CardContent>
    </Card>
  );
}
