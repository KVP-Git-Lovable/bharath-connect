import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, BarChart3, TrendingUp, Users, Activity } from "lucide-react";
import { format, startOfWeek, endOfWeek } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import jsPDF from "jspdf";
import "jspdf-autotable";

interface LeadSummary {
  total: number;
  value: number;
  byStatus: Record<string, number>;
  topOwners: { name: string; count: number; value: number }[];
}

interface ActivitySummary {
  total: number;
  byUser: Record<string, number>;
  byType: Record<string, number>;
  completed: number;
}

interface UserStats {
  name: string;
  email: string;
  leadsOwned: number;
  activitiesCompleted: number;
  pipeline: number;
}

export default function WeeklyExecutiveReport() {
  const [loading, setLoading] = useState(false);
  const [leadData, setLeadData] = useState<LeadSummary | null>(null);
  const [activityData, setActivityData] = useState<ActivitySummary | null>(null);
  const [userStats, setUserStats] = useState<UserStats[]>([]);

  useEffect(() => {
    fetchReportData();
  }, []);

  const fetchReportData = async () => {
    try {
      const now = new Date();
      const weekStart = startOfWeek(now);
      const weekEnd = endOfWeek(now);

      // Fetch leads
      const { data: leads } = await supabase
        .from("leads")
        .select("*, lead_statuses(name)")
        .gte("created_at", weekStart.toISOString())
        .lte("created_at", weekEnd.toISOString());

      // Fetch activities
      const { data: activities } = await supabase
        .from("activity_events")
        .select("*")
        .gte("activity_date", format(weekStart, "yyyy-MM-dd"))
        .lte("activity_date", format(weekEnd, "yyyy-MM-dd"));

      // Fetch users
      const { data: users } = await supabase
        .from("users")
        .select("id, full_name, email")
        .eq("is_active", true);

      // Process leads
      const leadsByStatus: Record<string, number> = {};
      let totalLeadValue = 0;
      const ownerStats: Record<string, { count: number; value: number }> = {};

      (leads || []).forEach((lead) => {
        const status = (lead.lead_statuses as any)?.name || "Unknown";
        leadsByStatus[status] = (leadsByStatus[status] || 0) + 1;
        const value = Number(lead.opportunity_value) || 0;
        totalLeadValue += value;

        if (lead.owner_id) {
          if (!ownerStats[lead.owner_id]) {
            ownerStats[lead.owner_id] = { count: 0, value: 0 };
          }
          ownerStats[lead.owner_id].count += 1;
          ownerStats[lead.owner_id].value += value;
        }
      });

      const userMap = new Map((users || []).map((u) => [u.id, u.full_name || u.email]));
      const topOwners = Object.entries(ownerStats)
        .map(([id, stats]) => ({
          name: userMap.get(id) || "Unknown",
          count: stats.count,
          value: stats.value,
        }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 5);

      setLeadData({
        total: leads?.length || 0,
        value: totalLeadValue,
        byStatus: leadsByStatus,
        topOwners,
      });

      // Process activities
      const activitiesByType: Record<string, number> = {};
      const activitiesByUser: Record<string, number> = {};
      let completedCount = 0;

      (activities || []).forEach((activity) => {
        activitiesByType[activity.activity_type] = (activitiesByType[activity.activity_type] || 0) + 1;
        activitiesByUser[activity.user_id] = (activitiesByUser[activity.user_id] || 0) + 1;
        if (activity.status === "completed") completedCount++;
      });

      setActivityData({
        total: activities?.length || 0,
        byUser: activitiesByUser,
        byType: activitiesByType,
        completed: completedCount,
      });

      // Calculate user stats
      const stats = (users || []).map((user) => ({
        name: user.full_name || user.email,
        email: user.email,
        leadsOwned: (leads || []).filter((l) => l.owner_id === user.id).length,
        activitiesCompleted: (activities || []).filter(
          (a) => a.user_id === user.id && a.status === "completed"
        ).length,
        pipeline: (leads || [])
          .filter((l) => l.owner_id === user.id)
          .reduce((sum, l) => sum + (Number(l.opportunity_value) || 0), 0),
      }));

      setUserStats(stats.filter((s) => s.leadsOwned > 0 || s.activitiesCompleted > 0));
    } catch (error) {
      toast.error("Failed to fetch report data");
      console.error(error);
    }
  };

  const generatePDF = async () => {
    if (!leadData || !activityData) {
      toast.error("Report data not loaded");
      return;
    }

    setLoading(true);
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 15;
      let yPos = 15;

      // Header with logo and title
      doc.setFont("helvetica", "bold");
      doc.setFontSize(20);
      doc.setTextColor(220, 38, 38); // Red color for SBEE
      doc.text("SBEE CABLES INDIA LTD", margin, yPos);

      yPos += 8;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      doc.setTextColor(100, 100, 100);
      doc.text("Weekly Executive Report", margin, yPos);

      yPos += 2;
      const weekStart = startOfWeek(new Date());
      const weekEnd = endOfWeek(new Date());
      doc.setFontSize(9);
      doc.text(
        `Report Period: ${format(weekStart, "dd MMM yyyy")} - ${format(weekEnd, "dd MMM yyyy")}`,
        margin,
        yPos
      );

      // Divider line
      yPos += 8;
      doc.setDrawColor(220, 38, 38);
      doc.setLineWidth(1);
      doc.line(margin, yPos, pageWidth - margin, yPos);

      yPos += 8;

      // Key Metrics Section
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(20, 30, 60);
      doc.text("KEY METRICS", margin, yPos);

      yPos += 6;
      const metrics = [
        { label: "Total Leads Created", value: leadData.total.toString() },
        { label: "Pipeline Value", value: `₹${(leadData.value / 100000).toFixed(2)}Cr` },
        { label: "Activities Completed", value: activityData.completed.toString() },
        {
          label: "Completion Rate",
          value: `${((activityData.completed / activityData.total) * 100).toFixed(1)}%`,
        },
      ];

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(50, 50, 50);
      metrics.forEach((metric) => {
        doc.text(`${metric.label}:`, margin, yPos);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(20, 30, 60);
        doc.text(metric.value, pageWidth - margin - 40, yPos, { align: "right" });
        doc.setFont("helvetica", "normal");
        doc.setTextColor(50, 50, 50);
        yPos += 5;
      });

      yPos += 5;

      // Top Performers Section
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(20, 30, 60);
      doc.text("TOP PERFORMERS", margin, yPos);

      yPos += 6;
      (leadData.topOwners || []).slice(0, 5).forEach((owner, idx) => {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(50, 50, 50);
        const text = `${idx + 1}. ${owner.name} - ${owner.count} leads (₹${(owner.value / 100000).toFixed(2)}Cr)`;
        doc.text(text, margin + 2, yPos);
        yPos += 5;
      });

      yPos += 5;

      // Activity Breakdown Table
      if (yPos > 220) {
        doc.addPage();
        yPos = 15;
      }

      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(20, 30, 60);
      doc.text("ACTIVITY BREAKDOWN BY TYPE", margin, yPos);

      yPos += 6;
      const activityTypes = Object.entries(activityData.byType).sort(([, a], [, b]) => b - a);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(50, 50, 50);
      activityTypes.forEach(([type, count]) => {
        const percentage = ((count / activityData.total) * 100).toFixed(1);
        doc.text(`${type}:`, margin + 2, yPos);
        doc.text(`${count} (${percentage}%)`, pageWidth - margin - 30, yPos, { align: "right" });
        yPos += 5;
      });

      yPos += 5;

      // Lead Status Breakdown
      if (yPos > 220) {
        doc.addPage();
        yPos = 15;
      }

      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(20, 30, 60);
      doc.text("LEADS BY STATUS", margin, yPos);

      yPos += 6;
      const statusEntries = Object.entries(leadData.byStatus).sort(([, a], [, b]) => b - a);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(50, 50, 50);
      statusEntries.forEach(([status, count]) => {
        const percentage = ((count / leadData.total) * 100).toFixed(1);
        doc.text(`${status}:`, margin + 2, yPos);
        doc.text(`${count} (${percentage}%)`, pageWidth - margin - 30, yPos, { align: "right" });
        yPos += 5;
      });

      yPos += 8;

      // User Performance Table
      if (yPos > 200) {
        doc.addPage();
        yPos = 15;
      }

      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(20, 30, 60);
      doc.text("USER PERFORMANCE", margin, yPos);

      yPos += 8;
      const tableData = userStats
        .sort((a, b) => b.pipeline - a.pipeline)
        .slice(0, 10)
        .map((user) => [
          user.name,
          user.leadsOwned.toString(),
          user.activitiesCompleted.toString(),
          `₹${(user.pipeline / 100000).toFixed(2)}Cr`,
        ]);

      (doc as any).autoTable({
        startY: yPos,
        head: [["Name", "Leads Owned", "Activities", "Pipeline"]],
        body: tableData,
        margin: { left: margin, right: margin },
        theme: "grid",
        headStyles: { fillColor: [220, 38, 38], textColor: [255, 255, 255] },
        alternateRowStyles: { fillColor: [244, 246, 250] },
        didDrawPage: (data: any) => {
          // Footer
          const pageSize = doc.internal.pageSize;
          const pageHeight = pageSize.getHeight();
          const pageWidth = pageSize.getWidth();
          doc.setFontSize(8);
          doc.setTextColor(150, 150, 150);
          doc.text(
            `Generated on ${format(new Date(), "dd MMM yyyy HH:mm")}`,
            pageWidth / 2,
            pageHeight - 10,
            { align: "center" }
          );
        },
      });

      doc.save(`SBEE-Weekly-Report-${format(new Date(), "dd-MM-yyyy")}.pdf`);
      toast.success("Report generated successfully!");
    } catch (error) {
      toast.error("Failed to generate PDF");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Weekly Executive Report</h1>
          <p className="text-muted-foreground">
            {format(startOfWeek(new Date()), "dd MMM")} - {format(endOfWeek(new Date()), "dd MMM yyyy")}
          </p>
        </div>
        <Button onClick={generatePDF} disabled={loading} size="lg" className="gap-2">
          <Download className="h-4 w-4" />
          {loading ? "Generating..." : "Download PDF Report"}
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Leads</p>
                <p className="text-3xl font-bold">{leadData?.total || 0}</p>
              </div>
              <TrendingUp className="h-8 w-8 text-red-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Pipeline Value</p>
                <p className="text-3xl font-bold">₹{((leadData?.value || 0) / 10000000).toFixed(1)}Cr</p>
              </div>
              <BarChart3 className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Activities</p>
                <p className="text-3xl font-bold">{activityData?.total || 0}</p>
              </div>
              <Activity className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Active Users</p>
                <p className="text-3xl font-bold">{userStats.length}</p>
              </div>
              <Users className="h-8 w-8 text-purple-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-6">
          <h2 className="text-xl font-bold mb-4">Top Performers</h2>
          <div className="space-y-3">
            {leadData?.topOwners.map((owner, idx) => (
              <div key={idx} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                <div className="flex items-center gap-3">
                  <Badge>{idx + 1}</Badge>
                  <div>
                    <p className="font-semibold">{owner.name}</p>
                    <p className="text-sm text-muted-foreground">{owner.count} leads</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-bold">₹{(owner.value / 10000000).toFixed(2)}Cr</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
