import { lazy, Suspense, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { BarChart3 } from "lucide-react";
import { OverviewTab } from "@/components/analytics/OverviewTab";
import { ReportProvider, useReportContext, ReportTabKey } from "@/components/analytics/ReportContext";
import { useAppConfiguration } from "@/hooks/useAppConfiguration";

const AttendanceReport = lazy(() => import("@/components/reports/AttendanceReport"));
const ProcurementReport = lazy(() => import("@/components/reports/ProcurementReport"));
const ActivityReport = lazy(() => import("@/components/reports/ActivityReport"));
const ExpenseReport = lazy(() => import("@/components/reports/ExpenseReport"));
const LeaveReport = lazy(() => import("@/components/reports/LeaveReport"));
const LeadReport = lazy(() => import("@/components/reports/LeadReport"));

const TABS: { key: ReportTabKey; label: string; configKey?: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "leads", label: "Leads", configKey: "leadReport" },
  { key: "activities", label: "Activities", configKey: "activityReport" },
  { key: "attendance", label: "Attendance", configKey: "attendanceReport" },
  { key: "leave", label: "Leave", configKey: "leaveReport" },
  { key: "procurement", label: "Procurement", configKey: "procurementReport" },
  { key: "expenses", label: "Expenses", configKey: "expenseReport" },
];



function Fallback() {
  return (
    <div className="flex items-center justify-center min-h-[40vh]">
      <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function AnalyticsInner() {
  const { tab, setTab } = useReportContext();
  const { getValue } = useAppConfiguration();

  const visibleTabs = useMemo(
    () => TABS.filter((t) => !t.configKey || getValue<boolean>("reports", t.configKey) !== false),
    [getValue]
  );

  useEffect(() => {
    if (!visibleTabs.some((t) => t.key === tab)) setTab("overview");
  }, [visibleTabs, tab, setTab]);

  const isOn = (key: ReportTabKey) => visibleTabs.some((t) => t.key === key);

  return (
    <div className="pb-24">
      <div className="gradient-hero text-primary-foreground p-5 rounded-b-2xl">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-white/20 flex items-center justify-center">
            <BarChart3 className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold">Analytics</h1>
            <p className="text-xs opacity-80">Module insights, charts and downloadable reports</p>
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b">
        <div className="max-w-6xl mx-auto overflow-x-auto no-scrollbar">
          <div className="flex gap-1 px-3 py-2 min-w-max">
            {visibleTabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                  tab === t.key
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto p-4">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
        >
          {tab === "overview" && <OverviewTab />}
          <Suspense fallback={<Fallback />}>
            {tab === "attendance" && isOn("attendance") && <AttendanceReport />}
            {tab === "procurement" && isOn("procurement") && <ProcurementReport />}
            {tab === "activities" && isOn("activities") && <ActivityReport />}
            {tab === "leads" && isOn("leads") && <LeadReport />}
            {tab === "expenses" && isOn("expenses") && <ExpenseReport />}
            {tab === "leave" && isOn("leave") && <LeaveReport />}

          </Suspense>
        </motion.div>
      </div>
    </div>
  );
}



export default function Analytics() {
  return (
    <ReportProvider>
      <AnalyticsInner />
    </ReportProvider>
  );
}
