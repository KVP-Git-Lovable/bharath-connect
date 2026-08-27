import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DateField } from "@/components/reports/ReportFilters";
import { useReportScope } from "@/components/reports/useReportScope";
import { generateReportPdf } from "@/components/reports/reportPdf";
import { useReportContext } from "@/components/analytics/ReportContext";
import { OverviewTrends } from "./OverviewTrends";
import { SummaryByUserChart, UserDatum } from "./SummaryByUserChart";
import {
  Activity,
  CalendarCheck,
  Building2,
  Users,
  ShoppingCart,
  Clock,
  Receipt,
  Download,
  Loader2,
  ChevronRight,
} from "lucide-react";

const fmtCompact = (n: number) =>
  n >= 1000 ? `₹${(n / 1000).toFixed(0)}K` : `₹${n.toLocaleString("en-IN")}`;
const inr = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

export function OverviewTab() {
  const scope = useReportScope();
  const { from, to, setFrom, setTo, goToPendingProcurement } = useReportContext();
  const chartRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);

  const scopeIds = scope.userIds;
  const isAdmin = scope.isAdmin;
  const ready = !scope.loading;

  const { data, isFetching } = useQuery({
    queryKey: ["analytics-overview", from, to, isAdmin, scopeIds],
    enabled: ready,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const inScope = (q: any): any => {
        if (isAdmin) return q;
        const ids = scopeIds && scopeIds.length ? scopeIds : ["00000000-0000-0000-0000-000000000000"];
        return q.in("user_id", ids);
      };

      let actQ = supabase
        .from("activity_events")
        .select("user_id")
        .gte("activity_date", from)
        .lte("activity_date", to);
      actQ = inScope(actQ);
      const { data: acts } = await actQ;

      let attQ = supabase
        .from("attendance")
        .select("user_id")
        .in("status", ["present", "regularized"])
        .gte("date", from)
        .lte("date", to);
      attQ = inScope(attQ);
      const { data: att } = await attQ;

      const { count: siteCount } = await supabase
        .from("project_sites")
        .select("id", { count: "exact", head: true })
        .eq("is_active", true);

      const { data: pos } = await supabase
        .from("procurement_orders")
        .select("total_amount")
        .gte("order_date", from)
        .lte("order_date", to);

      const { count: pendingLeaves } = await supabase
        .from("leave_applications")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending");
      const { count: pendingExp } = await supabase
        .from("additional_expenses")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending");

      let expQ = supabase
        .from("additional_expenses")
        .select("amount")
        .gte("expense_date", from)
        .lte("expense_date", to);
      expQ = inScope(expQ);
      const { data: exps } = await expQ;

      const userActivityCounts = new Map<string, number>();
      (acts || []).forEach((a) => {
        if (!a.user_id) return;
        userActivityCounts.set(a.user_id, (userActivityCounts.get(a.user_id) || 0) + 1);
      });

      return {
        totalActivities: acts?.length || 0,
        presentDays: att?.length || 0,
        activeSites: siteCount || 0,
        poValue: (pos || []).reduce((s, p) => s + (Number(p.total_amount) || 0), 0),
        pendingApprovals: (pendingLeaves || 0) + (pendingExp || 0),
        totalExpenses: (exps || []).reduce((s, e) => s + (Number(e.amount) || 0), 0),
        userActivityCounts: Array.from(userActivityCounts.entries()),
      };
    },
  });

  const range = `${format(new Date(from), "dd MMM")} - ${format(new Date(to), "dd MMM, yyyy")}`;

  const kpis = [
    { label: "Total Active Sites", value: String(data?.activeSites ?? 0), icon: Building2, onClick: undefined as (() => void) | undefined },
    { label: "Total Employees", value: String(scope.users.length), icon: Users, onClick: undefined },
    { label: "Total PO Value", value: fmtCompact(data?.poValue ?? 0), icon: ShoppingCart, onClick: undefined },
    {
      label: "Pending Approvals",
      value: String(data?.pendingApprovals ?? 0),
      icon: Clock,
      onClick: goToPendingProcurement,
    },
    { label: "Total Expenses", value: fmtCompact(data?.totalExpenses ?? 0), icon: Receipt, onClick: undefined },
  ];

  const userActivityData: UserDatum[] = useMemo(() => {
    if (!data) return [];
    const nameMap = new Map(scope.users.map((u) => [u.id, u.full_name]));
    return data.userActivityCounts.map(([id, value]) => ({
      id,
      name: nameMap.get(id) || "Unknown",
      value,
    }));
  }, [data, scope.users]);

  const download = async () => {
    if (!data) return;
    setDownloading(true);
    try {
      let chartImage: { data: string; aspect: number } | undefined;
      if (chartRef.current) {
        try {
          const { default: html2canvas } = await import("html2canvas");
          const canvas = await html2canvas(chartRef.current, { scale: 2, backgroundColor: "#ffffff" });
          chartImage = { data: canvas.toDataURL("image/png"), aspect: canvas.width / canvas.height };
        } catch {
          /* chart capture optional */
        }
      }

      await generateReportPdf({
        title: "Business Overview",
        orientation: "portrait",
        fileName: `business-overview-${from}-to-${to}.pdf`,
        generatedBy: scope.generatedBy,
        filters: [`Period: ${from} to ${to}`],
        columns: [
          { header: "Metric", width: 3 },
          { header: "Value", width: 2, align: "right" },
        ],
        rows: [
          ["Total Activities", data.totalActivities.toLocaleString("en-IN")],
          ["Present Days", data.presentDays.toLocaleString("en-IN")],
          ["Total Active Sites", String(data.activeSites)],
          ["Total Employees", String(scope.users.length)],
          ["Total PO Value", inr(data.poValue)],
          ["Pending Approvals", String(data.pendingApprovals)],
          ["Total Expenses", inr(data.totalExpenses)],
        ],
        summary: [
          { label: "Total Activities", value: data.totalActivities.toLocaleString("en-IN") },
          { label: "Present Days", value: data.presentDays.toLocaleString("en-IN") },
          { label: "Total PO Value", value: inr(data.poValue) },
          { label: "Total Expenses", value: inr(data.totalExpenses) },
        ],
        chartImage,
      });
      toast.success("PDF downloaded");
    } catch {
      toast.error("Failed to download PDF");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-bold">Overview</h2>
        <Button variant="outline" size="sm" onClick={download} disabled={!data || downloading}>
          {downloading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
          Download PDF
        </Button>
      </div>

      <Card className="shadow-card">
        <CardContent className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <DateField label="From Date" value={from} onChange={setFrom} />
          <DateField label="To Date" value={to} onChange={setTo} />
        </CardContent>
      </Card>

      {/* Banner cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="relative overflow-hidden rounded-2xl p-5 gradient-hero text-primary-foreground shadow-hero border-2 border-gold">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm opacity-80 flex items-center gap-2">
                <Activity className="h-4 w-4" /> Total Activities
              </p>
              <p className="text-4xl font-extrabold mt-1">
                {(data?.totalActivities ?? 0).toLocaleString("en-IN")}
              </p>
              <p className="text-xs opacity-70 mt-2">{range}</p>
            </div>
          </div>
        </div>
        <div className="relative overflow-hidden rounded-2xl p-5 bg-primary text-primary-foreground shadow-hero">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm opacity-80 flex items-center gap-2">
                <CalendarCheck className="h-4 w-4" /> Present Days
              </p>
              <p className="text-4xl font-extrabold mt-1">
                {(data?.presentDays ?? 0).toLocaleString("en-IN")}
              </p>
              <p className="text-xs opacity-70 mt-2">{range}</p>
            </div>
          </div>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {kpis.map((k) => {
          const clickable = !!k.onClick;
          return (
            <Card
              key={k.label}
              className={`shadow-card ${clickable ? "cursor-pointer transition-colors hover:bg-muted/50 hover:border-primary/40" : ""}`}
              onClick={k.onClick}
              role={clickable ? "button" : undefined}
              tabIndex={clickable ? 0 : undefined}
              onKeyDown={clickable ? (e) => (e.key === "Enter" || e.key === " ") && k.onClick?.() : undefined}
            >
              <CardContent className="p-3 flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
                  <k.icon className="h-4 w-4 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] text-muted-foreground truncate">{k.label}</p>
                  <p className="text-base font-bold">{k.value}</p>
                </div>
                {clickable && <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* 4 mini trend sparklines (avoids unit-mismatch on a single axis) */}
      <OverviewTrends from={from} to={to} scope={scope} />

      {/* Activity Summary by User */}
      <div ref={chartRef}>
        <SummaryByUserChart
          title="Activity Summary by User"
          description="Activities logged per user for the selected period"
          data={userActivityData}
          valueLabel="Activities"
        />
      </div>

      {isFetching && (
        <p className="text-center text-xs text-muted-foreground">Updating…</p>
      )}
    </div>
  );
}
