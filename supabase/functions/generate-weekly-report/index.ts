import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { PDFDocument, rgb, degrees } from "https://esm.sh/pdf-lib@1.17.1";
import { encode } from "https://esm.sh/base64-arraybuffer@1.0.2";

const EXCLUDED_USERS = ["Suyog", "Prajwal", "Shravan", "Ajay"];

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Missing Supabase credentials");
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch leads
    const { data: leads } = await supabase
      .from("leads")
      .select("*, lead_statuses(name), users!owner_id(full_name, email)")
      .order("created_at", { ascending: false });

    // Fetch activities
    const { data: activities } = await supabase
      .from("activity_events")
      .select("*, users(full_name, email)");

    // Fetch users
    const { data: users } = await supabase
      .from("users")
      .select("id, full_name, email, phone")
      .eq("is_active", true);

    // Filter excluded users
    const filteredLeads = (leads || []).filter(
      (l) => l.users && !EXCLUDED_USERS.includes(l.users.full_name)
    );
    const filteredActivities = (activities || []).filter(
      (a) => a.users && !EXCLUDED_USERS.includes(a.users.full_name)
    );
    const filteredUsers = (users || []).filter(
      (u) => !EXCLUDED_USERS.includes(u.full_name)
    );

    // Calculate metrics
    const totalLeadValue = filteredLeads.reduce(
      (sum, l) => sum + (Number(l.opportunity_value) || 0),
      0
    );

    const activitiesByType: Record<string, number> = {};
    filteredActivities.forEach((a) => {
      activitiesByType[a.activity_type] = (activitiesByType[a.activity_type] || 0) + 1;
    });

    const completedActivities = filteredActivities.filter(
      (a) => a.status === "completed"
    ).length;

    const topOwners: Array<{ name: string; count: number; value: number }> = [];
    const ownerStats: Record<string, { count: number; value: number }> = {};

    filteredLeads.forEach((lead) => {
      if (lead.owner_id) {
        if (!ownerStats[lead.owner_id]) {
          ownerStats[lead.owner_id] = { count: 0, value: 0 };
        }
        ownerStats[lead.owner_id].count += 1;
        ownerStats[lead.owner_id].value += Number(lead.opportunity_value) || 0;
      }
    });

    Object.entries(ownerStats)
      .map(([id, stats]) => {
        const owner = filteredLeads.find((l) => l.owner_id === id)?.users;
        return {
          name: owner?.full_name || "Unknown",
          count: stats.count,
          value: stats.value,
        };
      })
      .sort((a, b) => b.value - a.value)
      .slice(0, 5)
      .forEach((o) => topOwners.push(o));

    // Create PDF
    const pdfDoc = await PDFDocument.create();
    let page = pdfDoc.addPage([850, 600]);
    const { width, height } = page.getSize();

    const margin = 30;
    let y = height - margin;

    // Header
    page.drawText("SBEE CABLES INDIA LTD", {
      x: margin,
      y: y - 30,
      size: 24,
      color: rgb(0.86, 0.1, 0.1),
    });

    page.drawText("Weekly Executive Report", {
      x: margin,
      y: y - 50,
      size: 14,
      color: rgb(0, 0, 0),
    });

    const today = new Date();
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - today.getDay());
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);

    page.drawText(
      `Period: ${weekStart.toLocaleDateString()} - ${weekEnd.toLocaleDateString()}`,
      {
        x: margin,
        y: y - 65,
        size: 10,
        color: rgb(0.4, 0.4, 0.4),
      }
    );

    y -= 85;

    // Divider line
    page.drawLine({
      start: { x: margin, y },
      end: { x: width - margin, y },
      thickness: 1,
      color: rgb(0.86, 0.1, 0.1),
    });

    y -= 20;

    // Key Metrics
    page.drawText("KEY METRICS", {
      x: margin,
      y,
      size: 12,
      color: rgb(0.08, 0.11, 0.24),
    });

    y -= 20;

    const metrics = [
      { label: "Total Leads", value: filteredLeads.length.toString() },
      {
        label: "Pipeline Value",
        value: `₹${(totalLeadValue / 10000000).toFixed(2)}Cr`,
      },
      {
        label: "Activities",
        value: filteredActivities.length.toString(),
      },
      {
        label: "Completion Rate",
        value:
          filteredActivities.length > 0
            ? `${((completedActivities / filteredActivities.length) * 100).toFixed(1)}%`
            : "0%",
      },
    ];

    metrics.forEach((m) => {
      page.drawText(`${m.label}:`, {
        x: margin,
        y,
        size: 10,
        color: rgb(0.2, 0.2, 0.2),
      });

      page.drawText(m.value, {
        x: width - margin - 100,
        y,
        size: 10,
        color: rgb(0.08, 0.11, 0.24),
      });

      y -= 18;
    });

    y -= 15;

    // Top Performers
    page.drawText("TOP PERFORMERS", {
      x: margin,
      y,
      size: 12,
      color: rgb(0.08, 0.11, 0.24),
    });

    y -= 20;

    topOwners.slice(0, 5).forEach((owner, idx) => {
      page.drawText(
        `${idx + 1}. ${owner.name} - ${owner.count} leads (₹${(owner.value / 10000000).toFixed(2)}Cr)`,
        {
          x: margin + 10,
          y,
          size: 9,
          color: rgb(0.3, 0.3, 0.3),
        }
      );
      y -= 16;
    });

    y -= 15;

    // Activity Types
    page.drawText("ACTIVITIES BY TYPE", {
      x: margin,
      y,
      size: 12,
      color: rgb(0.08, 0.11, 0.24),
    });

    y -= 20;

    Object.entries(activitiesByType)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 8)
      .forEach(([type, count]) => {
        const percentage = (
          (count / filteredActivities.length) *
          100
        ).toFixed(1);
        page.drawText(`${type}:`, {
          x: margin + 10,
          y,
          size: 9,
          color: rgb(0.3, 0.3, 0.3),
        });

        page.drawText(`${count} (${percentage}%)`, {
          x: width - margin - 80,
          y,
          size: 9,
          color: rgb(0.3, 0.3, 0.3),
        });

        y -= 16;
      });

    y -= 15;

    // User Performance (if space)
    if (y > 100) {
      page.drawText("TOP USERS", {
        x: margin,
        y,
        size: 12,
        color: rgb(0.08, 0.11, 0.24),
      });

      y -= 20;

      const userStats = filteredUsers
        .map((user) => ({
          name: user.full_name || user.email,
          leadsOwned: filteredLeads.filter((l) => l.owner_id === user.id)
            .length,
          activitiesDone: filteredActivities.filter((a) => a.user_id === user.id)
            .length,
        }))
        .filter((s) => s.leadsOwned > 0 || s.activitiesDone > 0)
        .sort((a, b) => b.leadsOwned - a.leadsOwned)
        .slice(0, 5);

      userStats.forEach((user) => {
        page.drawText(`${user.name}`, {
          x: margin + 10,
          y,
          size: 9,
          color: rgb(0.3, 0.3, 0.3),
        });

        page.drawText(`Leads: ${user.leadsOwned}`, {
          x: width - margin - 180,
          y,
          size: 9,
          color: rgb(0.3, 0.3, 0.3),
        });

        page.drawText(`Activities: ${user.activitiesDone}`, {
          x: width - margin - 80,
          y,
          size: 9,
          color: rgb(0.3, 0.3, 0.3),
        });

        y -= 16;
      });
    }

    // Footer
    page.drawText(
      `Generated on ${new Date().toLocaleString()} • Read-only report`,
      {
        x: margin,
        y: 15,
        size: 8,
        color: rgb(0.6, 0.6, 0.6),
      }
    );

    // Save PDF
    const pdfBytes = await pdfDoc.save();
    const pdfBase64 = encode(pdfBytes);

    return new Response(pdfBase64, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="SBEE_Weekly_Report_${new Date().toISOString().split("T")[0]}.pdf"`,
      },
    });
  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
