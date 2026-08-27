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
  site_name: string | null;
}

export interface WorkforceFilters {
  userIds: string[];
  start: string;
  end: string;
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
        .select("id, user_id, activity_date, status, site_id")
        .gte("activity_date", start)
        .lte("activity_date", end);
      if (userIds.length > 0) actQuery = actQuery.in("user_id", userIds);
      const { data: activities, error: actErr } = await actQuery;
      if (actErr) throw actErr;

      const activityRows: WorkforceActivityRow[] = (activities || []).map((r) => ({
        id: r.id,
        user_id: r.user_id,
        activity_date: r.activity_date,
        status: r.status,
        site_id: r.site_id,
        full_name: userMap.get(r.user_id)?.full_name || "Unknown",
        site_name: r.site_id ? siteMap.get(r.site_id) || null : null,
      }));

      return { attendanceRows, activityRows };
    },
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });
}
