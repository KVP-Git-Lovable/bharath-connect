import { useMemo, useState } from "react";
import {
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  subWeeks,
  format,
} from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Users, Clock, CalendarCheck, Activity, LogIn } from "lucide-react";
import { cn } from "@/lib/utils";
import { useProfilePermissions } from "@/hooks/useProfilePermissions";
import { useUserProfile } from "@/hooks/useUserProfile";
import {
  useWorkforceUsers,
  useWorkforceOverview,
} from "@/hooks/useWorkforceOverview";
import WorkforceFilters, { type DatePreset } from "./WorkforceFilters";
import WorkforceAttendanceTable from "./WorkforceAttendanceTable";
import WorkforceActivityCalendar from "./WorkforceActivityCalendar";

function resolveRange(preset: DatePreset, customStart: string, customEnd: string) {
  const now = new Date();
  if (preset === "this_week") {
    return { start: startOfWeek(now), end: endOfWeek(now) };
  }
  if (preset === "last_week") {
    const lw = subWeeks(now, 1);
    return { start: startOfWeek(lw), end: endOfWeek(lw) };
  }
  if (preset === "this_month") {
    return { start: startOfMonth(now), end: endOfMonth(now) };
  }
  // custom
  const start = customStart ? new Date(customStart) : startOfMonth(now);
  const end = customEnd ? new Date(customEnd) : endOfMonth(now);
  return { start, end };
}

interface StatCardProps {
  icon: React.ElementType;
  label: string;
  value: string;
  accent: string;
}

function StatCard({ icon: Icon, label, value, accent }: StatCardProps) {
  return (
    <div className="relative overflow-hidden rounded-xl border bg-card p-3 sm:p-4">
      <div
        className={cn(
          "absolute -right-4 -top-4 h-16 w-16 rounded-full opacity-10",
          accent
        )}
      />
      <div className="flex items-center gap-2.5">
        <div
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white",
            accent
          )}
        >
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          <p className="text-lg font-bold leading-tight sm:text-xl">{value}</p>
        </div>
      </div>
    </div>
  );
}

export default function WorkforceOverviewSection() {
  const { hasWidgetPermission, isLoading: permsLoading } = useProfilePermissions();
  const { isAdmin } = useUserProfile();
  const canView = isAdmin || hasWidgetPermission("widget_admin_attendance_overview");

  const [preset, setPreset] = useState<DatePreset>("this_week");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);

  const { data: users = [] } = useWorkforceUsers();

  const range = useMemo(
    () => resolveRange(preset, customStart, customEnd),
    [preset, customStart, customEnd]
  );
  const startStr = format(range.start, "yyyy-MM-dd");
  const endStr = format(range.end, "yyyy-MM-dd");

  const { data, isLoading } = useWorkforceOverview({
    userIds: selectedUsers,
    start: startStr,
    end: endStr,
  });

  const attendanceRows = data?.attendanceRows || [];
  const activityRows = data?.activityRows || [];

  const stats = useMemo(() => {
    const present = new Set(attendanceRows.map((r) => r.user_id)).size;
    const totalHours = attendanceRows.reduce(
      (sum, r) => sum + (r.active_hours || 0),
      0
    );
    const checkedIn = attendanceRows.filter(
      (r) => r.check_in_time && !r.check_out_time
    ).length;
    const completed = activityRows.filter((a) => a.status === "completed").length;
    return {
      present,
      totalHours,
      checkedIn,
      activities: activityRows.length,
      completed,
    };
  }, [attendanceRows, activityRows]);

  if (permsLoading || !canView) return null;

  const rangeLabel = `${format(range.start, "MMM d")} – ${format(range.end, "MMM d, yyyy")}`;

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
          <WorkforceFilters
            users={users}
            preset={preset}
            onPresetChange={setPreset}
            customStart={customStart}
            customEnd={customEnd}
            onCustomStartChange={setCustomStart}
            onCustomEndChange={setCustomEnd}
            selectedUsers={selectedUsers}
            onSelectedUsersChange={setSelectedUsers}
            rangeLabel={rangeLabel}
          />
        </div>

        {/* KPI grid */}
        <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
          <StatCard
            icon={Users}
            label="Present"
            value={String(stats.present)}
            accent="bg-primary"
          />
          <StatCard
            icon={Clock}
            label="Active Hours"
            value={`${stats.totalHours.toFixed(1)}h`}
            accent="bg-info"
          />
          <StatCard
            icon={LogIn}
            label="Checked In"
            value={String(stats.checkedIn)}
            accent="bg-warning"
          />
          <StatCard
            icon={Activity}
            label="Activities"
            value={String(stats.activities)}
            accent="bg-success"
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <CalendarCheck className="h-4 w-4 text-primary" />
            <p className="text-sm font-semibold">Attendance Log</p>
          </div>
          <WorkforceAttendanceTable rows={attendanceRows} isLoading={isLoading} />
        </div>

        <WorkforceActivityCalendar activities={activityRows} anchorDate={range.start} />
      </CardContent>
    </Card>
  );
}
