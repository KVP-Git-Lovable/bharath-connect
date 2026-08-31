import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface WorkforceUser {
  id: string;
  full_name: string;
  username: string;
}

export interface WorkforceAttendanceRow {
  id: string;
  user_id: string;
  date: string;
  check_in_time: string | null;
  check_out_time: string | null;
  total_hours: number | null;
  full_name: string;
  active_hours: number | null;
}

export interface WorkforceActivityRow {
  id: string;
  user_id: string;
  activity_date: string;
  status: string;
  site_id: string | null;
  full_name: string;
  short_name: string;
  site_name: string | null;
  customer_name: string | null;
  activity_type: string | null;
  outcome: string | null;
}

export interface WorkforceFilters {
  userIds: string[];
  start: string;
  end: string;
}

/** "Nagananda Beegamudre" -> "NB" */
export function toShortName(name: string) {
  return (name || "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || "")
    .join("");
}

export function useWorkforceUsers() {
  return useQuery({
    queryKey: ["workforce-users"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("users")
        .select("id, full_name, username")
        .eq("is_active", true)
        .order("full_name");
      if (error) throw error;
      return (data || []) as WorkforceUser[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useWorkforceOverview(filters: WorkforceFilters) {
  const { userIds, start, end } = filters;

  return useQuery({
    queryKey: ["workforce-overview", userIds.join(","), start, end],
    queryFn: async () => {
      // Users (for name lookup)
      const { data: users, error: usersErr } = await supabase
        .from("users")
        .select("id, full_name, username")
        .eq("is_active", true);
      if (usersErr) throw usersErr;
      const userMap = new Map((users || []).map((u) => [u.id, u]));

      // Sites (for name lookup)
      const { data: sites } = await supabase
        .from("project_sites")
        .select("id, site_name");
      const siteMap = new Map((sites || []).map((s) => [s.id, s.site_name]));

      // Customers & leads (for the customer label on activities)
      const { data: customers } = await supabase.from("customers").select("id, name");
      const customerMap = new Map((customers || []).map((c) => [c.id, c.name]));
      const { data: leadRows } = await supabase.from("leads").select("id, name, company");
      const leadMap = new Map(
        (leadRows || []).map((l) => [l.id, l.company || l.name])
      );

      // Attendance
      let attQuery = supabase
        .from("attendance")
        .select("id, user_id, date, check_in_time, check_out_time, total_hours")
        .gte("date", start)
        .lte("date", end)
        .order("date", { ascending: false });
      if (userIds.length > 0) attQuery = attQuery.in("user_id", userIds);
      const { data: attendance, error: attErr } = await attQuery;
      if (attErr) throw attErr;

      const attendanceRows: WorkforceAttendanceRow[] = (attendance || []).map((r) => {
        let activeHours: number | null = r.total_hours;
        if (r.check_in_time && r.check_out_time) {
          activeHours =
            (new Date(r.check_out_time).getTime() - new Date(r.check_in_time).getTime()) /
            (1000 * 60 * 60);
        } else if (r.check_in_time && !r.check_out_time) {
          activeHours = null;
        }
        return {
          ...r,
          full_name: userMap.get(r.user_id)?.full_name || "Unknown",
          active_hours: activeHours,
        };
      });

      // Activities
      let actQuery = supabase
        .from("activity_events")
        .select(
          "id, user_id, activity_date, status, site_id, customer_id, lead_id, activity_type, outcome"
        )
        .gte("activity_date", start)
        .lte("activity_date", end);
      if (userIds.length > 0) actQuery = actQuery.in("user_id", userIds);
      const { data: activities, error: actErr } = await actQuery;
      if (actErr) throw actErr;

      const activityRows: WorkforceActivityRow[] = (activities || []).map((r) => {
        const fullName = userMap.get(r.user_id)?.full_name || "Unknown";
        return {
          id: r.id,
          user_id: r.user_id,
          activity_date: r.activity_date,
          status: r.status,
          site_id: r.site_id,
          full_name: fullName,
          short_name: toShortName(fullName),
          site_name: r.site_id ? siteMap.get(r.site_id) || null : null,
          customer_name:
            (r.customer_id ? customerMap.get(r.customer_id) : null) ||
            (r.lead_id ? leadMap.get(r.lead_id) : null) ||
            null,
          activity_type: r.activity_type || null,
          outcome: r.outcome || null,
        };
      });

      // Won deals — leads sitting in a "won" status, touched within the range
      const { data: statuses } = await supabase
        .from("master_lead_statuses")
        .select("id, name");
      const wonStatusIds = (statuses || [])
        .filter((s) => /won/i.test(s.name || ""))
        .map((s) => s.id);

      let wonDeals = 0;
      if (wonStatusIds.length > 0) {
        let wonQuery = supabase
          .from("leads")
          .select("id", { count: "exact", head: true })
          .in("lead_status_id", wonStatusIds)
          .gte("updated_at", `${start}T00:00:00`)
          .lte("updated_at", `${end}T23:59:59`);
        if (userIds.length > 0) wonQuery = wonQuery.in("owner_id", userIds);
        const { count } = await wonQuery;
        wonDeals = count || 0;
      }

      // New leads created in the range
      let newLeadsQuery = supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .gte("created_at", `${start}T00:00:00`)
        .lte("created_at", `${end}T23:59:59`);
      if (userIds.length > 0) newLeadsQuery = newLeadsQuery.in("owner_id", userIds);
      const { count: newLeadsCount } = await newLeadsQuery;

      // New opportunities — leads moved into a "Quote submitted" status in range
      const quoteStatusIds = (statuses || [])
        .filter((s) => /quote\s*submitted/i.test(s.name || ""))
        .map((s) => s.id);
      let newOppsCount = 0;
      if (quoteStatusIds.length > 0) {
        let newOppsQuery = supabase
          .from("leads")
          .select("id", { count: "exact", head: true })
          .in("lead_status_id", quoteStatusIds)
          .gte("updated_at", `${start}T00:00:00`)
          .lte("updated_at", `${end}T23:59:59`);
        if (userIds.length > 0) newOppsQuery = newOppsQuery.in("owner_id", userIds);
        const { count } = await newOppsQuery;
        newOppsCount = count || 0;
      }


      return {
        attendanceRows,
        activityRows,
        wonDeals,
        wonStatusIds,
        quoteStatusIds,

        newLeads: newLeadsCount || 0,
        newOpportunities: newOppsCount || 0,
      };

    },
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });
}
