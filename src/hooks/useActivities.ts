import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  enqueueActivity,
  generateClientUUID,
  listQueue,
  subscribeQueue,
  cacheReference,
  readReference,
  type QueuedActivity,
} from "@/lib/offlineActivityQueue";
import { flushActivityQueue } from "@/hooks/useOfflineActivitySync";

export interface ActivityStatusEntry {
  status: string;
  at: string;
  lat?: number | null;
  lng?: number | null;
  address?: string | null;
}

export interface ActivityPhotoEntry {
  url: string;
  at: string;
  lat?: number | null;
  lng?: number | null;
  address?: string | null;
  name?: string | null;
  type?: string | null;
  by?: string | null;
}


export interface Activity {
  id: string;
  user_id: string;
  activity_name: string;
  activity_type: string;
  activity_date: string;
  start_time: string | null;
  end_time: string | null;
  duration_type: string | null;
  from_date: string | null;
  to_date: string | null;
  total_days: number | null;
  total_hours: number | null;
  description: string | null;
  remarks: string | null;
  status: string;
  activity_code: string | null;
  project_id: string | null;
  site_id: string | null;
  milestone_id: string | null;
  grn_po_id: string | null;
  customer_id: string | null;
  opportunity_id: string | null;
  location_lat: number | null;
  location_lng: number | null;
  location_address: string | null;
  status_changed_at: string | null;
  status_change_lat: number | null;
  status_change_lng: number | null;
  attachment_urls: string[];
  status_history: ActivityStatusEntry[];
  photo_urls: ActivityPhotoEntry[];
  created_at: string;
  // joined
  user_full_name?: string;
  project_name?: string;
  site_name?: string;
  site_flag?: string;
  milestone_name?: string;
  milestone_status?: string;
  lead_id?: string | null;
  lead_name?: string;
  lead_company?: string;
  lead_designation?: string;

  outcome?: string | null;
  risk?: string | null;
  next_follow_up_date?: string | null;

  // Offline queue metadata
  _pending?: boolean;
  _sync_error?: string | null;
  _client_uuid?: string;
}


export interface ActivityFilters {
  employee: string;
  project: string;
  dateFrom: string;
  dateTo: string;
  status: string;
}

export function useActivities() {
  const [serverActivities, setServerActivities] = useState<Activity[]>([]);
  const [pendingItems, setPendingItems] = useState<QueuedActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<{ id: string; full_name: string }[]>(
    () => readReference<{ id: string; full_name: string }[]>("users") || []
  );
  const [projects, setProjects] = useState<{ id: string; name: string }[]>(
    () => readReference<{ id: string; name: string }[]>("projects") || []
  );
  const [sites, setSites] = useState<{ id: string; site_name: string; is_active: boolean }[]>(
    () => readReference<{ id: string; site_name: string; is_active: boolean }[]>("sites") || []
  );
  const { toast } = useToast();

  const fetchActivities = useCallback(async (filters?: ActivityFilters) => {
    setLoading(true);
    try {
      let query = supabase
        .from("activity_events")
        .select("*")
        .order("activity_date", { ascending: false })
        .order("created_at", { ascending: false });

      if (filters?.employee) query = query.eq("user_id", filters.employee);
      if (filters?.project) query = query.eq("project_id", filters.project);
      if (filters?.status) query = query.eq("status", filters.status);
      if (filters?.dateFrom) query = query.gte("activity_date", filters.dateFrom);
      if (filters?.dateTo) query = query.lte("activity_date", filters.dateTo);

      const { data, error } = await query;
      if (error) throw error;

      // Fetch user names, project names, and site names
      const userIds = [...new Set((data || []).map((a: any) => a.user_id))];
      const projectIds = [...new Set((data || []).filter((a: any) => a.project_id).map((a: any) => a.project_id))];
      const siteIds = [...new Set((data || []).filter((a: any) => a.site_id).map((a: any) => a.site_id))];

      let userMap: Record<string, string> = {};
      let projectMap: Record<string, string> = {};
      let siteMap: Record<string, { name: string; active: boolean; flag: string }> = {};

      if (userIds.length > 0) {
        const { data: usersData } = await supabase.from("users").select("id, full_name").in("id", userIds);
        (usersData || []).forEach((u: any) => { userMap[u.id] = u.full_name || u.id; });
      }

      if (projectIds.length > 0) {
        const { data: projData } = await supabase.from("pm_projects").select("id, name").in("id", projectIds);
        (projData || []).forEach((p: any) => { projectMap[p.id] = p.name; });
      }

      if (siteIds.length > 0) {
        const { data: siteData } = await supabase.from("project_sites").select("id, site_name, is_active, flag").in("id", siteIds);
        (siteData || []).forEach((s: any) => { siteMap[s.id] = { name: s.site_name, active: s.is_active, flag: s.flag || "green" }; });
      }

      // Fetch milestone names
      const milestoneIds = [...new Set((data || []).filter((a: any) => a.milestone_id).map((a: any) => a.milestone_id))];
      let milestoneMap: Record<string, { name: string; status: string }> = {};
      if (milestoneIds.length > 0) {
        const { data: msData } = await supabase.from("site_milestones").select("id, name, status").in("id", milestoneIds);
        (msData || []).forEach((m: any) => { milestoneMap[m.id] = { name: m.name, status: m.status }; });
      }

      // Fetch lead names
      const leadIds = [...new Set((data || []).filter((a: any) => a.lead_id).map((a: any) => a.lead_id))];
      let leadMap: Record<string, { name: string; company: string; designation: string }> = {};
      if (leadIds.length > 0) {
        const { data: leadData } = await supabase.from("leads").select("id, company, name, title").in("id", leadIds);
        (leadData || []).forEach((l: any) => {
          leadMap[l.id] = { name: l.name || l.company || "Lead", company: l.company || "", designation: l.title || "" };
        });
      }


      const mapped: Activity[] = (data || []).map((a: any) => {
        const siteInfo = a.site_id ? siteMap[a.site_id] : null;
        const msInfo = a.milestone_id ? milestoneMap[a.milestone_id] : null;
        const leadInfo = a.lead_id ? leadMap[a.lead_id] : null;
        return {
          ...a,
          attachment_urls: a.attachment_urls || [],
          status_history: Array.isArray(a.status_history) ? a.status_history : [],
          photo_urls: Array.isArray(a.photo_urls) ? a.photo_urls : [],
          user_full_name: userMap[a.user_id] || "",
          project_name: a.project_id ? projectMap[a.project_id] || "" : "",
          site_name: siteInfo ? `${siteInfo.name}${!siteInfo.active ? " (Inactive)" : ""}` : "",
          site_flag: siteInfo?.flag || "",
          milestone_name: msInfo?.name || "",
          milestone_status: msInfo?.status || "",
          lead_name: leadInfo?.name || "",
          lead_company: leadInfo?.company || "",
          lead_designation: leadInfo?.designation || "",

        };
      });


      setServerActivities(mapped);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const fetchDropdowns = useCallback(async () => {
    const [usersRes, projRes, sitesRes] = await Promise.all([
      supabase.from("users").select("id, full_name").eq("is_active", true).order("full_name"),
      supabase.from("pm_projects").select("id, name").eq("is_template", false).order("name"),
      supabase.from("project_sites").select("id, site_name, is_active").order("site_name"),
    ]);
    const u = (usersRes.data || []).map((u: any) => ({ id: u.id, full_name: u.full_name || "" }));
    const p = (projRes.data || []).map((p: any) => ({ id: p.id, name: p.name }));
    const s = (sitesRes.data || []).map((s: any) => ({ id: s.id, site_name: s.site_name, is_active: s.is_active }));
    setUsers(u); setProjects(p); setSites(s);
    cacheReference("users", u); cacheReference("projects", p); cacheReference("sites", s);
  }, []);

  const fetchAttendanceForDate = useCallback(async (userId: string, date: string) => {
    const { data } = await supabase
      .from("attendance")
      .select("check_in_time, check_out_time")
      .eq("user_id", userId)
      .eq("date", date)
      .maybeSingle();
    return data;
  }, []);

  const checkInForDate = useCallback(async (userId: string, date: string) => {
    let location: { lat: number; lng: number } | null = null;
    try {
      location = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
          () => reject(),
          { enableHighAccuracy: true, timeout: 10000 }
        );
      });
    } catch {
      location = null;
    }

    const now = new Date().toISOString();
    const { data: existing } = await supabase
      .from("attendance")
      .select("id, check_in_time")
      .eq("user_id", userId)
      .eq("date", date)
      .maybeSingle();

    if (existing?.check_in_time) {
      return { check_in_time: existing.check_in_time, check_out_time: null };
    }

    const payload: any = { check_in_time: now, check_in_location: location, status: "present" };
    if (existing) {
      const { error } = await supabase.from("attendance").update(payload).eq("id", existing.id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from("attendance").insert({ user_id: userId, date, ...payload });
      if (error) throw error;
    }
    return { check_in_time: now, check_out_time: null };
  }, []);

  const fetchGPSTrackingForDate = useCallback(async (userId: string, date: string) => {
    const [pointsRes, stopsRes] = await Promise.all([
      supabase
        .from("gps_tracking")
        .select("*")
        .eq("user_id", userId)
        .eq("date", date)
        .order("timestamp", { ascending: true }),
      supabase
        .from("gps_tracking_stops")
        .select("*")
        .eq("user_id", userId)
        .gte("timestamp", `${date}T00:00:00`)
        .lte("timestamp", `${date}T23:59:59`)
    ]);
    return {
      points: pointsRes.data || [],
      stops: stopsRes.data || [],
    };
  }, []);

  const createActivity = useCallback(async (
    activity: Partial<Activity>,
    targetUserId?: string,
    silent?: boolean,
    options?: { clientUuid?: string; audio?: { blob: Blob; mimeType: string; fileExtension: string } | null }
  ) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    const clientUuid = options?.clientUuid || generateClientUUID();
    const basePayload: any = {
      activity_name: activity.activity_name!,
      activity_type: activity.activity_type!,
      activity_date: activity.activity_date!,
      start_time: activity.start_time || null,
      end_time: activity.end_time || null,
      duration_type: activity.duration_type || null,
      from_date: activity.from_date || null,
      to_date: activity.to_date || null,
      total_days: activity.total_days || null,
      total_hours: activity.total_hours || 0,
      description: activity.description || null,
      remarks: activity.remarks || null,
      status: activity.status || "planned",
      project_id: activity.project_id || null,
      site_id: activity.site_id || null,
      milestone_id: (activity as any).milestone_id || null,
      grn_po_id: (activity as any).grn_po_id || null,
      customer_id: (activity as any).customer_id || null,
      opportunity_id: (activity as any).opportunity_id || null,
      lead_id: (activity as any).lead_id || null,
      outcome: (activity as any).outcome || null,
      risk: (activity as any).risk || null,
      next_follow_up_date: (activity as any).next_follow_up_date || null,
      location_lat: activity.location_lat || null,
      location_lng: activity.location_lng || null,
      location_address: activity.location_address || null,
      attachment_urls: activity.attachment_urls || [],
      status_history: (activity.status_history as any) || [],
      photo_urls: (activity.photo_urls as any) || [],
    };

    const enqueueOffline = async (reason: string) => {
      await enqueueActivity({
        client_uuid: clientUuid,
        payload: basePayload,
        target_user_id: targetUserId || user.id,
        audio: options?.audio || null,
        created_at: Date.now(),
        attempts: 0,
        status: "pending",
        error: null,
        optimistic_user_id: user.id,
      });
      if (!silent) toast({
        title: "Saved offline",
        description: "Activity queued — will sync when you're back online.",
      });
      // Kick off flush attempt (no-op if offline)
      flushActivityQueue().catch(() => {});
      return {
        id: `pending:${clientUuid}`,
        user_id: targetUserId || user.id,
        ...basePayload,
        created_at: new Date().toISOString(),
        _pending: true,
        _client_uuid: clientUuid,
      } as unknown as Activity;
    };

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      return enqueueOffline("offline");
    }

    try {
      const { data, error } = await supabase
        .from("activity_events")
        .insert({ user_id: targetUserId || user.id, client_uuid: clientUuid, ...basePayload })
        .select("*")
        .single();

      if (error) throw error;
      if (!silent) toast({ title: "Activity Created", description: "Activity logged successfully" });

      return data
        ? ({
            ...data,
            attachment_urls: Array.isArray(data.attachment_urls) ? (data.attachment_urls as string[]) : [],
            status_history: Array.isArray((data as any).status_history) ? (data as any).status_history : [],
            photo_urls: Array.isArray((data as any).photo_urls) ? (data as any).photo_urls : [],
          } as unknown as Activity)
        : null;
    } catch (err: any) {
      // Network/fetch failures → queue for later. Real validation errors re-throw.
      const msg = `${err?.message || ""}`.toLowerCase();
      const isNetwork = msg.includes("failed to fetch") || msg.includes("network") || msg.includes("load failed");
      if (isNetwork) return enqueueOffline("network");
      throw err;
    }
  }, [toast]);

  const updateActivity = useCallback(async (id: string, updates: Partial<Activity>) => {
    const updatePayload: any = {};
    const fields = [
      'activity_name', 'activity_type', 'activity_date', 'start_time', 'end_time',
      'duration_type', 'total_hours', 'total_days', 'from_date', 'to_date',
      'description', 'remarks', 'status',
      'project_id', 'site_id', 'milestone_id', 'grn_po_id', 'customer_id', 'opportunity_id', 'lead_id', 'outcome', 'risk', 'next_follow_up_date', 'location_address',
      'status_changed_at', 'status_change_lat', 'status_change_lng',
      'location_lat', 'location_lng', 'attachment_urls',
      'status_history', 'photo_urls',
    ];
    fields.forEach((f) => {
      if ((updates as any)[f] !== undefined) updatePayload[f] = (updates as any)[f];
    });

    const { error } = await supabase
      .from("activity_events")
      .update(updatePayload)
      .eq("id", id);

    if (error) throw error;
    toast({ title: "Activity Updated" });
  }, [toast]);

  const deleteActivity = useCallback(async (id: string) => {
    const { error } = await supabase.from("activity_events").delete().eq("id", id);
    if (error) throw error;
    toast({ title: "Activity Deleted" });
  }, [toast]);

  useEffect(() => {
    fetchActivities();
    fetchDropdowns();
  }, [fetchActivities, fetchDropdowns]);

  // Subscribe to offline queue changes to show pending activities in the list.
  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      const items = await listQueue();
      if (alive) setPendingItems(items);
    };
    refresh();
    const unsub = subscribeQueue(refresh);
    const onSynced = () => { fetchActivities(); };
    window.addEventListener("activities:synced", onSynced);
    return () => {
      alive = false;
      unsub();
      window.removeEventListener("activities:synced", onSynced);
    };
  }, [fetchActivities]);

  // Merge pending offline items on top of server activities.
  const activities: Activity[] = [
    ...pendingItems.map((q) => {
      const p = q.payload || {};
      return {
        id: `pending:${q.client_uuid}`,
        user_id: q.target_user_id || q.optimistic_user_id,
        activity_name: p.activity_name || "",
        activity_type: p.activity_type || "",
        activity_date: p.activity_date || new Date().toISOString().slice(0, 10),
        start_time: p.start_time || null,
        end_time: p.end_time || null,
        duration_type: p.duration_type || null,
        from_date: p.from_date || null,
        to_date: p.to_date || null,
        total_days: p.total_days || null,
        total_hours: p.total_hours || 0,
        description: p.description || null,
        remarks: p.remarks || null,
        status: p.status || "planned",
        activity_code: null,
        project_id: p.project_id || null,
        site_id: p.site_id || null,
        milestone_id: p.milestone_id || null,
        grn_po_id: p.grn_po_id || null,
        customer_id: p.customer_id || null,
        opportunity_id: p.opportunity_id || null,
        location_lat: p.location_lat || null,
        location_lng: p.location_lng || null,
        location_address: p.location_address || null,
        status_changed_at: null,
        status_change_lat: null,
        status_change_lng: null,
        attachment_urls: p.attachment_urls || [],
        status_history: p.status_history || [],
        photo_urls: p.photo_urls || [],
        created_at: new Date(q.created_at).toISOString(),
        _pending: true,
        _sync_error: q.error || null,
        _client_uuid: q.client_uuid,
      } as Activity;
    }),
    ...serverActivities,
  ];

  return {
    activities,
    loading,
    users,
    projects,
    sites,
    fetchActivities,
    fetchDropdowns,
    createActivity,
    updateActivity,
    deleteActivity,
    fetchAttendanceForDate,
    checkInForDate,
    fetchGPSTrackingForDate,
  };
}
