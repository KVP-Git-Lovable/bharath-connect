import { useMemo } from "react";
import { format, startOfMonth, endOfMonth, isWithinInterval } from "date-fns";
import { motion } from "framer-motion";
import {
  Clock,
  CheckCircle,
  LogIn,
  Users,
  Timer,
  Activity,
  ThumbsUp,
  Trophy,
  TrendingUp,
  CalendarClock,
  UserPlus,
  Briefcase,
} from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { useNavigate } from "react-router-dom";
import { useUserProfile } from "@/hooks/useUserProfile";
import { useDashboard } from "@/hooks/useDashboard";
import { useProfilePermissions } from "@/hooks/useProfilePermissions";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useLeads } from "@/hooks/useLeadsEvents";
import { formatCurrencyCompact } from "@/lib/currency";
import WorkforceOverviewSection from "@/components/dashboard/WorkforceOverviewSection";
import WorkforceFilters from "@/components/dashboard/WorkforceFilters";
import {
  WorkforceFilterProvider,
  useWorkforceFilterContext,
} from "@/components/dashboard/WorkforceFilterContext";
import { SignedAvatarImage, SignedImage } from "@/components/ui/signed-image";
import { setReportPrefill } from "@/components/reports/reportPrefill";



const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06 } },
};
const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0 },
};

const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return "Good Morning!";
  if (hour < 18) return "Good Afternoon!";
  return "Good Evening!";
};

function OverviewSkeleton() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <div key={i} className="rounded-xl border border-border p-4 text-center">
          <Skeleton className="h-5 w-5 mx-auto mb-2 rounded-full" />
          <Skeleton className="h-6 w-10 mx-auto mb-1" />
          <Skeleton className="h-3 w-16 mx-auto" />
        </div>
      ))}
    </div>
  );
}

function openReport(
  navigate: ReturnType<typeof useNavigate>,
  tab: string,
  prefill?: Record<string, unknown>,
) {
  sessionStorage.setItem("analytics-tab", tab);
  if (prefill) setReportPrefill(tab, prefill);
  navigate("/reports");
}

function DashboardContent() {
  const navigate = useNavigate();
  const { profile, isAdmin, initials, loading: profileLoading } = useUserProfile();
  const { hasModuleAccess } = useProfilePermissions();
  const { userId } = useCurrentUser();
  const { user } = useCurrentUser();
  const displayName = profile?.full_name || profile?.username || user?.email?.split('@')[0] || "User";

  const {
    dayStarted,
    attendance,
    isLoading,
  } = useDashboard(userId);

  const {
    data: workforce,
    isLoading: workforceLoading,
    rangeLabel,
    selectedUsers,
    startStr,
    endStr,
  } = useWorkforceFilterContext();

  const workforceKpis = useMemo(() => {
    const attendanceRows = workforce?.attendanceRows || [];
    const activityRows = workforce?.activityRows || [];
    const present = attendanceRows.filter((r) => !!r.check_in_time).length;
    const totalHours = attendanceRows.reduce((s, r) => s + (r.active_hours || 0), 0);
    const productive = activityRows.filter(
      (a) => String(a.outcome || "").trim().toLowerCase() === "productive"
    ).length;
    return {
      present,
      totalHours,
      productive,
      activities: activityRows.length,
      wonDeals: workforce?.wonDeals || 0,
      newLeads: (workforce as any)?.newLeads || 0,
      newOpportunities: (workforce as any)?.newOpportunities || 0,
    };
  }, [workforce]);

  const { data: leads = [] } = useLeads();
  const leadKpis = useMemo(() => {
    const now = new Date();
    const monthRange = { start: startOfMonth(now), end: endOfMonth(now) };
    const pipeline = leads.reduce((s: number, l: any) => s + (Number(l.opportunity_value) || 0), 0);
    const closingValue = leads.reduce((s: number, l: any) => {
      const d = l.opportunity_close_date ? new Date(l.opportunity_close_date) : null;
      if (!d || isNaN(d.getTime()) || !isWithinInterval(d, monthRange)) return s;
      return s + (Number(l.opportunity_value) || 0);
    }, 0);
    return { pipeline, closingValue };
  }, [leads]);
  const money = (n: number) => formatCurrencyCompact(n, "INR");

  const handleStartDay = () => {
    navigate("/attendance");
  };

  // The exact filter state behind each number, so the report opens with the
  // same rows that produced it.
  const employeeFilter = selectedUsers.length === 1 ? selectedUsers[0] : "all";
  const dateScope = (field: string) => ({
    field,
    preset: "custom",
    customFrom: startStr,
    customTo: endStr,
  });
  const wonStatusId = (workforce as any)?.wonStatusIds?.[0] ?? "all";

  const quoteStatusId = (workforce as any)?.quoteStatusIds?.[0] ?? "all";

  const overviewCards = [
    { label: "Present (Days)", value: workforceKpis.present, icon: Users, colorClass: "bg-primary/5 text-primary", onClick: () => openReport(navigate, "attendance", { ...dateScope("date"), employee: employeeFilter, status: "all" }), module: "module_attendance" },
    { label: "Active Hours", value: `${workforceKpis.totalHours.toFixed(1)}h`, icon: Timer, colorClass: "bg-info/5 text-info", onClick: () => openReport(navigate, "attendance", { ...dateScope("date"), employee: employeeFilter, status: "all" }), module: "module_attendance" },
    { label: "Total Activities", value: workforceKpis.activities, icon: Activity, colorClass: "bg-warning/5 text-warning", onClick: () => openReport(navigate, "activities", { ...dateScope("activity_date"), employee: employeeFilter }), module: "module_activities" },
    { label: "Productive Activities", value: workforceKpis.productive, icon: ThumbsUp, colorClass: "bg-success/5 text-success", onClick: () => openReport(navigate, "activities", { ...dateScope("activity_date"), employee: employeeFilter, outcome: "Productive" }), module: "module_activities" },
    { label: "New Leads added", value: workforceKpis.newLeads, icon: UserPlus, colorClass: "bg-primary/5 text-primary", onClick: () => openReport(navigate, "leads", { ...dateScope("created_at"), owner: employeeFilter }), module: "module_leads" },
    { label: "New Opportunities added", value: workforceKpis.newOpportunities, icon: Briefcase, colorClass: "bg-info/5 text-info", onClick: () => openReport(navigate, "leads", { ...dateScope("updated_at"), owner: employeeFilter, status: quoteStatusId }), module: "module_leads" },
    { label: "Total Pipeline", value: money(leadKpis.pipeline), icon: TrendingUp, colorClass: "bg-info/5 text-info", onClick: () => openReport(navigate, "leads", { ...dateScope("created_at"), owner: employeeFilter }), module: "module_leads" },
    { label: "Closing", value: money(leadKpis.closingValue), icon: CalendarClock, colorClass: "bg-warning/5 text-warning", onClick: () => openReport(navigate, "leads", { field: "opportunity_close_date", preset: "current_month", customFrom: startStr, customTo: endStr, owner: employeeFilter }), module: "module_leads" },
    { label: "Won Deals", value: workforceKpis.wonDeals, icon: Trophy, colorClass: "bg-success/5 text-success", onClick: () => openReport(navigate, "leads", { ...dateScope("updated_at"), owner: employeeFilter, status: wonStatusId }), module: "module_leads" },
  ];



  // Filter cards by module access for all users (including admins)
  // Only show cards for enabled modules
  const visibleCards = overviewCards.filter((c) => !c.module || hasModuleAccess(c.module));


  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5">
      {/* Header with gradient */}
      <div className="relative overflow-hidden gradient-hero text-primary-foreground">
        <div className="absolute inset-0 bg-gradient-to-r from-black/10 to-transparent" />
        <div className="relative p-4">
          <div className="flex items-center">
            <div
              className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity"
              onClick={() => navigate("/more")}
            >
              <Avatar className="h-10 w-10 border-2 border-white/30">
                {profile?.profile_picture_url ? (
                  <SignedAvatarImage src={profile.profile_picture_url} alt="Profile" />
                ) : null}
                <AvatarFallback className="bg-white/20 text-primary-foreground font-bold text-sm">
                  {profileLoading ? "..." : initials}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="text-[10px] opacity-80">{getGreeting()}</p>
                {profileLoading ? (
                  <Skeleton className="h-4 w-24 bg-white/20" />
                ) : (
                  <h1 className="text-base font-bold leading-tight">{displayName}</h1>
                )}
                <p className="text-[10px] opacity-70">{isAdmin ? "Admin" : "Team Member"}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Dashboard Content */}
      <motion.div
        className="p-4 -mt-3 relative z-10 space-y-4"
        variants={container}
        initial="hidden"
        animate="show"
      >
        {/* Check-in Status Banner */}
        {hasModuleAccess("module_attendance") && (
          <motion.div variants={item}>
            {isLoading ? (
              <Skeleton className="h-24 w-full rounded-xl" />
            ) : !dayStarted ? (
              <Card className="bg-gradient-to-r from-accent/20 to-accent/10 border-accent/30">
                <div className="p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-full bg-accent/30 flex items-center justify-center">
                      <Clock className="h-5 w-5 text-accent-foreground" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold">Day Not Started</p>
                      <p className="text-xs text-muted-foreground">
                        Start your day by marking attendance
                      </p>
                    </div>
                  </div>
                  <Button
                    onClick={handleStartDay}
                    className="w-full bg-accent hover:bg-accent/90 text-accent-foreground"
                  >
                    <LogIn className="h-4 w-4 mr-2" />
                    Start My Day
                  </Button>
                </div>
              </Card>
            ) : (
              <Card className="bg-gradient-to-r from-success/10 to-success/5 border-success/20">
                <div className="p-4 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-success/20 flex items-center justify-center">
                    <CheckCircle className="h-5 w-5 text-success" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-success">Day Started</p>
                    <p className="text-xs text-muted-foreground">
                      {attendance?.check_in_time
                        ? format(new Date(attendance.check_in_time), "h:mm a")
                        : ""}
                    </p>
                  </div>
                </div>
              </Card>
            )}
          </motion.div>
        )}

        {/* Module Stats Grid */}
        <motion.div variants={item}>
          <Card className="shadow-card">
            <CardContent className="p-4">
              <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-bold">Overview</p>
                  <p className="text-[11px] text-muted-foreground">{rangeLabel}</p>
                </div>
                <WorkforceFilters />
              </div>
              {workforceLoading ? (
                <OverviewSkeleton />
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {visibleCards.map((card) => (
                    <div
                      key={card.label}
                      className={`rounded-xl border border-border ${card.colorClass.split(" ")[0]} p-4 text-center cursor-pointer hover:shadow-md transition-shadow`}
                      onClick={card.onClick}
                    >
                      <card.icon className={`h-5 w-5 mx-auto mb-1 ${card.colorClass.split(" ")[1]}`} />
                      <p className="text-xl font-bold">{card.value}</p>
                      <p className="text-[10px] text-muted-foreground">{card.label}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>


        {/* Attendance & Workforce Overview (permission-gated) */}
        <motion.div variants={item}>
          <WorkforceOverviewSection />
        </motion.div>
      </motion.div>
    </div>
  );
}

export default function Dashboard() {
  return (
    <WorkforceFilterProvider>
      <DashboardContent />
    </WorkforceFilterProvider>
  );
}

