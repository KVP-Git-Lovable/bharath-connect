import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Activity, ActivityPhotoEntry } from "@/hooks/useActivities";
import { attachmentName, attachmentPath } from "@/utils/siteAttachments";

export interface HubMilestone {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  actual_start_date: string | null;
  actual_end_date: string | null;
  percent_complete: number;
  status: string;
  notes: string | null;
  is_active: boolean;
  at_risk: boolean;
  parent_id: string | null;
}

export interface HubAssignedUser {
  id: string;
  full_name: string;
}

export interface HubGalleryPhoto {
  kind: "activity" | "site";
  storageKey: string;
  uploadedBy: string;
  at: string | null;
  activityCode: string | null;
  activityId: string | null;
  label: string;
}

export interface HubAttendance {
  check_in_time: string | null;
  check_out_time: string | null;
}

const IMAGE_RE = /\.(jpe?g|png|gif|webp|bmp|heic|heif|avif)$/i;

export function useSiteHub(siteId: string | null) {
  const [loading, setLoading] = useState(false);
  const [milestones, setMilestones] = useState<HubMilestone[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [assignedUsers, setAssignedUsers] = useState<HubAssignedUser[]>([]);
  const [gallery, setGallery] = useState<HubGalleryPhoto[]>([]);
  const [documents, setDocuments] = useState<{ stored: string; name: string }[]>([]);
  const [attendanceByActivity, setAttendanceByActivity] = useState<Record<string, HubAttendance>>({});

  const load = useCallback(async () => {
    if (!siteId) return;
    setLoading(true);
    try {
      const [msRes, actRes, assignRes, siteRes] = await Promise.all([
        supabase.from("site_milestones").select("*").eq("site_id", siteId).order("start_date"),
        supabase
          .from("activity_events")
          .select("*")
          .eq("site_id", siteId)
          .order("activity_date", { ascending: false })
          .order("created_at", { ascending: false }),
        supabase.from("site_assignments").select("user_id").eq("site_id", siteId),
        supabase.from("project_sites").select("attachment_urls").eq("id", siteId).maybeSingle(),
      ]);

      const ms: HubMilestone[] = (msRes.data || []).map((m: any) => ({
        id: m.id,
        name: m.name,
        start_date: m.start_date,
        end_date: m.end_date,
        actual_start_date: m.actual_start_date,
        actual_end_date: m.actual_end_date,
        percent_complete: m.percent_complete ?? 0,
        status: m.status,
        notes: m.notes,
        is_active: m.is_active,
        at_risk: !!m.at_risk,
        parent_id: m.parent_id ?? null,
      }));
      setMilestones(ms);

      const rawActs = actRes.data || [];
      const msMap: Record<string, { name: string; status: string }> = {};
      ms.forEach((m) => { msMap[m.id] = { name: m.name, status: m.status }; });

      const assignIds = (assignRes.data || []).map((a: any) => a.user_id);
      const actUserIds = rawActs.map((a: any) => a.user_id);
      const allUserIds = [...new Set([...assignIds, ...actUserIds])];
      const userMap: Record<string, string> = {};
      if (allUserIds.length > 0) {
        const { data: usersData } = await supabase.from("users").select("id, full_name").in("id", allUserIds);
        (usersData || []).forEach((u: any) => { userMap[u.id] = u.full_name || "Unknown"; });
      }

      const mappedActs: Activity[] = rawActs.map((a: any) => ({
        ...a,
        attachment_urls: a.attachment_urls || [],
        status_history: Array.isArray(a.status_history) ? a.status_history : [],
        photo_urls: Array.isArray(a.photo_urls) ? a.photo_urls : [],
        user_full_name: userMap[a.user_id] || "Unknown",
        milestone_name: a.milestone_id ? msMap[a.milestone_id]?.name || "" : "",
        milestone_status: a.milestone_id ? msMap[a.milestone_id]?.status || "" : "",
      }));
      setActivities(mappedActs);

      setAssignedUsers(assignIds.map((id: string) => ({ id, full_name: userMap[id] || "Unknown" })));

      const galleryItems: HubGalleryPhoto[] = [];
      mappedActs.forEach((a) => {
        (a.photo_urls || []).forEach((p: ActivityPhotoEntry) => {
          galleryItems.push({
            kind: "activity",
            storageKey: p.url,
            uploadedBy: a.user_full_name || "Unknown",
            at: p.at || null,
            activityCode: a.activity_code,
            activityId: a.id,
            label: "",
          });
        });
      });

      const siteAttachments: string[] = (siteRes.data?.attachment_urls as string[]) || [];
      const docs: { stored: string; name: string }[] = [];
      siteAttachments.forEach((stored) => {
        const name = attachmentName(stored);
        if (IMAGE_RE.test(name) || IMAGE_RE.test(attachmentPath(stored))) {
          galleryItems.push({
            kind: "site",
            storageKey: stored,
            uploadedBy: "Site upload",
            at: null,
            activityCode: null,
            activityId: null,
            label: name,
          });
        } else {
          docs.push({ stored, name });
        }
      });
      galleryItems.sort((x, y) => (y.at || "").localeCompare(x.at || ""));
      setGallery(galleryItems);
      setDocuments(docs);

      const attMap: Record<string, HubAttendance> = {};
      const attKeys = [...new Set(mappedActs.map((a) => `${a.user_id}|${a.activity_date}`))];
      if (attKeys.length > 0) {
        const { data: attData } = await supabase
          .from("attendance")
          .select("user_id, date, check_in_time, check_out_time")
          .in("user_id", [...new Set(mappedActs.map((a) => a.user_id))]);
        const keyed: Record<string, HubAttendance> = {};
        (attData || []).forEach((r: any) => {
          keyed[`${r.user_id}|${r.date}`] = { check_in_time: r.check_in_time, check_out_time: r.check_out_time };
        });
        mappedActs.forEach((a) => {
          const k = `${a.user_id}|${a.activity_date}`;
          if (keyed[k]) attMap[a.id] = keyed[k];
        });
      }
      setAttendanceByActivity(attMap);
    } finally {
      setLoading(false);
    }
  }, [siteId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const onVis = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [load]);

  return { loading, milestones, activities, assignedUsers, gallery, documents, attendanceByActivity, reload: load };
}
