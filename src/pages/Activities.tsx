import { SignedAudio } from "@/components/ui/signed-image";
import { useState, useEffect, useMemo, useRef, Suspense, lazy, useCallback } from "react";
import { motion } from "framer-motion";
import { useNavigate, useSearchParams } from "react-router-dom";
import { format, startOfWeek, addDays, isSameDay, addWeeks, subWeeks, parseISO, isToday } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import { updateMilestoneProgress } from "@/utils/milestoneProgress";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Navigation2,
  ClipboardCheck,
  Clock,
  Users,

  MapPin,
  Activity,
  CheckCircle2,
  AlertCircle,
  Plus,
  Search,
  Filter,
  Trash2,
  Edit,
  Loader2,
  LogIn,
  LogOut,
  Route,
  Octagon,
  Timer,
  Mic,
  
  AudioLines,
  Square,
  Play,
  Pause,
  X,
  ChevronDown,
} from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import { getCurrentPosition } from "@/utils/nativePermissions";
import { useActivities, type Activity as ActivityType, type ActivityPhotoEntry, type ActivityStatusEntry } from "@/hooks/useActivities";
import { useUserProfile } from "@/hooks/useUserProfile";
import { ACTIVITY_OUTCOMES } from "@/hooks/useLeadActivities";
import { toast } from "sonner";
import { Separator } from "@/components/ui/separator";
import ActivityReportGenerator from "@/components/activities/ActivityReportGenerator";
import ActivityPhotoManager from "@/components/activities/ActivityPhotoManager";
import { MultiUserPicker } from "@/components/pm/MultiUserPicker";
import { milestoneStatusLabel } from "@/components/admin/SiteMilestonesDialog";
import CreativeActivityForm from "@/components/activities/CreativeActivityForm";
import OpenGRNPicker from "@/components/procurement/OpenGRNPicker";
import ReceiveGoodsDialog from "@/components/procurement/ReceiveGoodsDialog";

interface MilestoneOption {
  id: string;
  name: string;
  status: string;
  percent_complete: number;
  start_date: string;
  end_date: string;
  actual_start_date: string | null;
  actual_end_date: string | null;
  notes: string | null;
}
import { PlayCircle } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAudioRecorder } from "@/hooks/useAudioRecorder";

const LeafletMap = lazy(() => import("@/components/LeafletMap"));

const statusOptions = ["planned", "in_progress", "completed"];
export const UNPRODUCTIVE_OUTCOMES = ["Unproductive", "Visited but not available", "Postponed", "Cancelled"];

const statusColors: Record<string, string> = {
  planned: "bg-muted text-muted-foreground",
  in_progress: "bg-info/10 text-info border-info/20",
  completed: "bg-success/10 text-success border-success/20",
};

const statusLabels: Record<string, string> = {
  planned: "Planned",
  in_progress: "Work In Progress",
  completed: "Completed",
};

const getActivitySeriesKey = (activity: ActivityType) =>
  [
    activity.user_id,
    activity.activity_name,
    activity.activity_type,
    activity.from_date ?? "",
    activity.to_date ?? "",
    activity.project_id ?? "",
    activity.site_id ?? "",
    activity.description ?? "",
    activity.total_days ?? "",
  ].join("::");

const buildRecurringDates = (form: {
  recurrence_pattern: string;
  recurrence_interval: number;
  recurrence_start_date: string;
  recurrence_end_date: string;
  recurrence_no_end: boolean;
}): string[] => {
  if (!form.recurrence_start_date) return [];
  const start = new Date(`${form.recurrence_start_date}T00:00:00`);
  if (isNaN(start.getTime())) return [];
  const MAX_OCCURRENCES = 366;
  let end: Date;
  if (form.recurrence_no_end || !form.recurrence_end_date) {
    end = new Date(start);
    end.setDate(end.getDate() + 90);
  } else {
    end = new Date(`${form.recurrence_end_date}T00:00:00`);
    if (isNaN(end.getTime()) || end < start) return [];
  }
  const dates: string[] = [];
  const d = new Date(start);
  while (d <= end && dates.length < MAX_OCCURRENCES) {
    dates.push(format(d, "yyyy-MM-dd"));
    switch (form.recurrence_pattern) {
      case "weekly":
        d.setDate(d.getDate() + 7);
        break;
      case "monthly":
        d.setMonth(d.getMonth() + 1);
        break;
      case "custom":
        d.setDate(d.getDate() + Math.max(1, form.recurrence_interval || 1));
        break;
      default:
        d.setDate(d.getDate() + 1);
    }
  }
  return dates;
};

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.05 } },
};
const item = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0 },
};

type SiteFlag = "red" | "orange" | "green";

const FLAG_CONFIG: Record<SiteFlag, { color: string; label: string }> = {
  red: { color: "bg-red-500", label: "Critical / Urgent" },
  orange: { color: "bg-orange-500", label: "Needs Attention" },
  green: { color: "bg-emerald-500", label: "On Track" },
};

const defaultForm = {
  activity_name: "",
  activity_type: "",
  custom_activity_name: "",
  activity_date: format(new Date(), "yyyy-MM-dd"),
  start_time: "",
  end_time: "",
  duration_type: "hour_based",
  half_day_type: "",
  from_date: "",
  to_date: "",
  recurrence_pattern: "daily",
  recurrence_interval: 1,
  recurrence_start_date: format(new Date(), "yyyy-MM-dd"),
  recurrence_end_date: "",
  recurrence_no_end: false,
  description: "",
  site_id: "",
  milestone_id: "",
  milestone_progress: 0,
  grn_po_id: "",
  customer_id: "",
  opportunity_id: "",
  link_type: "" as "" | "site" | "opportunity",
  site_flag: "" as string,
  site_status: "" as string,
  location_address: "",
  total_hours: 0,
  owner_user_id: "",
  assigned_user_ids: [] as string[],
  photos: [] as ActivityPhotoEntry[],
};

export default function Activities() {
  const { activities, loading, users, projects, sites, fetchActivities, fetchDropdowns, createActivity, updateActivity, deleteActivity, fetchAttendanceForDate, fetchGPSTrackingForDate } = useActivities();
  const { isAdmin, role } = useUserProfile();
  const navigate = useNavigate();
  const isManagerOrAdmin = isAdmin || role === "sales_manager";

  const [selectedDate, setSelectedDate] = useState(new Date());
  const [activeTab, setActiveTab] = useState<"timeline" | "gps" | "activity">("activity");
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [outcomeFilter, setOutcomeFilter] = useState("all");
  const [riskFilter, setRiskFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false);
  const [reportFiltersOpen, setReportFiltersOpen] = useState(false);

  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editActivityObj, setEditActivityObj] = useState<ActivityType | null>(null);
  const [form, setForm] = useState(defaultForm);
  const [customersList, setCustomersList] = useState<Array<{ id: string; name: string }>>([]);
  const [opportunitiesList, setOpportunitiesList] = useState<Array<{ id: string; name: string; customer_id: string }>>([]);
  const [receivePoId, setReceivePoId] = useState<string>("");
  const [searchParams, setSearchParams] = useSearchParams();
  const [saving, setSaving] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [subordinateIds, setSubordinateIds] = useState<string[]>([]);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const { isRecording, isFinalizing, recording, elapsed, startRecording, stopRecording, clearRecording, formatDuration } = useAudioRecorder();
  const [micMenuOpen, setMicMenuOpen] = useState(false);
  const audioPreviewRef = useRef<HTMLAudioElement | null>(null);
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);
  const [voiceToTextMode, setVoiceToTextMode] = useState(false);
  const [isStartingRecording, setIsStartingRecording] = useState(false);

  // Dynamic activity types from DB
  const [activityTypes, setActivityTypes] = useState<string[]>([]);

  // Add new site dialog
  const [showAddSiteDialog, setShowAddSiteDialog] = useState(false);
  const [newSiteName, setNewSiteName] = useState("");
  const [addingSite, setAddingSite] = useState(false);

  // Active milestones for selected site (read-only, sourced from Site master)
  const [siteMilestones, setSiteMilestones] = useState<MilestoneOption[]>([]);

  // Transcribe audio recording via edge function
  const transcribeAudio = useCallback(async (audioBlob: Blob) => {
    setIsTranscribing(true);
    try {
      const formData = new FormData();
      const extension = audioBlob.type.includes("mp4") || audioBlob.type.includes("aac") ? "m4a" : audioBlob.type.includes("ogg") ? "ogg" : "webm";
      formData.append("audio", audioBlob, `recording.${extension}`);
      formData.append("lang", "en");

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Please sign in to use voice-to-text");
        return;
      }

      const response = await supabase.functions.invoke("transcribe-audio", {
        body: formData,
      });

      if (response.error) throw response.error;

      const transcript = response.data?.transcript?.trim();
      if (transcript) {
        setForm((prev: any) => ({
          ...prev,
          description: prev.description ? prev.description + " " + transcript : transcript,
        }));
        toast.success("Voice transcribed successfully");
      } else {
        toast.error("Could not understand the audio. Please try again.");
      }
    } catch (err: any) {
      console.error("Transcription error:", err);
      toast.error("Transcription failed: " + (err.message || "Unknown error"));
    } finally {
      setIsTranscribing(false);
    }
  }, []);

  // Auto-transcribe when voice-to-text recording finishes
  useEffect(() => {
    if (voiceToTextMode && recording && !isRecording && !isTranscribing) {
      transcribeAudio(recording.blob);
      clearRecording();
      setVoiceToTextMode(false);
    }
  }, [voiceToTextMode, recording, isRecording, isTranscribing, transcribeAudio, clearRecording]);

  const handleMicOptionClick = useCallback(async (mode: 'text' | 'audio') => {
    if (isTranscribing || isStartingRecording || isFinalizing) return;

    if (isRecording) {
      setMicMenuOpen(false);
      await stopRecording();
      return;
    }

    clearRecording();
    setVoiceToTextMode(mode === 'text');
    setIsStartingRecording(true);

    try {
      await startRecording();
      setMicMenuOpen(false);
    } catch (err: any) {
      console.error('[Activities] Failed to start recording:', err);
      setVoiceToTextMode(false);
      toast.error(err.message || 'Could not start recording');
    } finally {
      setIsStartingRecording(false);
    }
  }, [clearRecording, isFinalizing, isRecording, isStartingRecording, isTranscribing, startRecording, stopRecording]);

  const fetchActivityTypes = useCallback(async () => {
    const { data } = await supabase
      .from("activity_types_master")
      .select("name")
      .eq("is_active", true)
      .order("sort_order");
    setActivityTypes((data || []).map((d: any) => d.name));
  }, []);

  // Fetch customers & opportunities for activity linking
  useEffect(() => {
    (async () => {
      const [{ data: custs }, { data: opps }] = await Promise.all([
        supabase.from("customers").select("id, name").order("name"),
        supabase.from("customer_opportunities").select("id, name, customer_id").order("created_at", { ascending: false }),
      ]);
      setCustomersList((custs || []) as any);
      setOpportunitiesList((opps || []) as any);
    })();
  }, []);


  // Fetch milestones and flag when site_id changes in form
  useEffect(() => {
    if (!form.site_id || form.site_id === "__add_new_site__") {
      setSiteMilestones([]);
      setForm(f => ({ ...f, site_flag: "", site_status: "" }));
      return;
    }
    supabase
      .from("site_milestones")
      .select("id, name, status, percent_complete, start_date, end_date, actual_start_date, actual_end_date, notes")
      .eq("site_id", form.site_id)
      .eq("is_active", true)
      .order("start_date")
      .then(({ data }) => {
        const mapped = (data || []).map((m: any) => ({
          id: m.id,
          name: m.name,
          status: m.status,
          percent_complete: m.percent_complete ?? 0,
          start_date: m.start_date,
          end_date: m.end_date,
          actual_start_date: m.actual_start_date,
          actual_end_date: m.actual_end_date,
          notes: m.notes,
        }));
        setSiteMilestones(mapped);
        setForm((f) => {
          const sel = mapped.find((m) => m.id === f.milestone_id);
          return sel ? { ...f, milestone_progress: sel.percent_complete } : f;
        });
      });
    supabase.from("project_sites").select("flag, status").eq("id", form.site_id).maybeSingle().then(({ data }) => {
      setForm(f => ({ ...f, site_flag: data?.flag || "green", site_status: data?.status || "planned" }));
    });
  }, [form.site_id]);

  useEffect(() => {
    fetchActivityTypes();
  }, [fetchActivityTypes]);




  // Timeline state
  const [attendance, setAttendance] = useState<{ check_in_time: string | null; check_out_time: string | null } | null>(null);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  // Attendance snapshot for the activity form's selected date/user
  const [formAttendance, setFormAttendance] = useState<{ check_in_time: string | null; check_out_time: string | null } | null>(null);

  // GPS state
  const [gpsData, setGpsData] = useState<{ points: any[]; stops: any[] }>({ points: [], stops: [] });
  const [gpsLoading, setGpsLoading] = useState(false);

  const weekStart = startOfWeek(selectedDate, { weekStartsOn: 0 });
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const dateStr = format(selectedDate, "yyyy-MM-dd");

  // Get current user id and fetch subordinates
  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (data.user) {
        setCurrentUserId(data.user.id);
        // Fetch subordinates using the DB function
        const { data: subs } = await supabase.rpc("get_user_hierarchy", { _manager_id: data.user.id });
        if (subs && subs.length > 0) {
          setSubordinateIds(subs.map((s: any) => s.user_id));
        }
      }
    });
  }, []);

  const effectiveUserId = selectedUserId && selectedUserId !== "all" ? selectedUserId : currentUserId;

  // Filter users to only show subordinates (+ self) for the dropdown
  const hasSubordinates = subordinateIds.length > 0;
  const selectableUsers = useMemo(() => {
    if (!hasSubordinates) return [];
    const subSet = new Set(subordinateIds);
    return users.filter((u) => subSet.has(u.id) || u.id === currentUserId);
  }, [users, subordinateIds, currentUserId, hasSubordinates]);

  // Fetch attendance & GPS when tab/date/user changes
  useEffect(() => {
    if (!effectiveUserId) return;
    if (activeTab === "timeline") {
      setAttendanceLoading(true);
      fetchAttendanceForDate(effectiveUserId, dateStr).then((data) => {
        setAttendance(data);
        setAttendanceLoading(false);
      });
    }
  }, [activeTab, effectiveUserId, dateStr, fetchAttendanceForDate]);

  useEffect(() => {
    if (!effectiveUserId) return;
    if (activeTab === "gps") {
      setGpsLoading(true);
      fetchGPSTrackingForDate(effectiveUserId, dateStr).then((data) => {
        setGpsData(data);
        setGpsLoading(false);
      });
    }
  }, [activeTab, effectiveUserId, dateStr, fetchGPSTrackingForDate]);

  // Auto-open activity detail when navigated with ?id=...
  useEffect(() => {
    const id = searchParams.get("id");
    if (!id || loading || activities.length === 0) return;
    const found = activities.find((a) => a.id === id);
    if (found) {
      handleOpenEdit(found);
      // Remove the id param so refreshing won't reopen it
      const next = new URLSearchParams(searchParams);
      next.delete("id");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, activities, loading, setSearchParams]);

  // Filter activities by selected date and optionally by user.
  // Prefer exact per-date rows; only fall back to legacy ranged rows when no dedicated row exists for that date.
  const dayActivities = useMemo(() => {
    const matchesSelectedUser = (activity: ActivityType) =>
      !selectedUserId || selectedUserId === "all" || activity.user_id === selectedUserId;

    const exactDateSeriesKeys = new Set(
      activities
        .filter(
          (activity) =>
            matchesSelectedUser(activity) &&
            activity.activity_date === dateStr &&
            activity.duration_type === "multiple_days" &&
            activity.from_date &&
            activity.to_date,
        )
        .map(getActivitySeriesKey),
    );

    return activities.filter((activity) => {
      if (!matchesSelectedUser(activity)) return false;

      if (activity.activity_date === dateStr) return true;

      if (activity.duration_type === "multiple_days" && activity.from_date && activity.to_date) {
        const isInRange = dateStr >= activity.from_date && dateStr <= activity.to_date;
        if (!isInRange) return false;

        return !exactDateSeriesKeys.has(getActivitySeriesKey(activity));
      }

      return false;
    });
  }, [activities, dateStr, selectedUserId]);

  const getStatusUpdateTargetId = useCallback(async (activity: ActivityType, targetDate: string) => {
    if (activity.duration_type !== "multiple_days" || !activity.from_date || !activity.to_date) {
      return activity.id;
    }

    const seriesKey = getActivitySeriesKey(activity);
    const seriesActivities = activities.filter((item) => getActivitySeriesKey(item) === seriesKey);
    const existingDates = new Set(seriesActivities.map((item) => item.activity_date));
    let targetId =
      seriesActivities.find((item) => item.activity_date === targetDate)?.id ??
      (activity.activity_date === targetDate ? activity.id : "");

    const startDate = parseISO(activity.from_date);
    const endDate = parseISO(activity.to_date);

    for (let cursor = new Date(startDate); cursor <= endDate; cursor = addDays(cursor, 1)) {
      const currentDate = format(cursor, "yyyy-MM-dd");
      if (existingDates.has(currentDate)) continue;

      const created = await createActivity(
        {
          activity_name: activity.activity_name,
          activity_type: activity.activity_type,
          activity_date: currentDate,
          start_time: currentDate === activity.activity_date ? activity.start_time : null,
          end_time: currentDate === activity.activity_date ? activity.end_time : null,
          duration_type: activity.duration_type,
          from_date: activity.from_date,
          to_date: activity.to_date,
          total_days: activity.total_days,
          total_hours: activity.total_hours,
          description: activity.description,
          remarks: activity.remarks,
          status: activity.status,
          project_id: activity.project_id,
          site_id: activity.site_id,
          location_lat: currentDate === activity.activity_date ? activity.location_lat : null,
          location_lng: currentDate === activity.activity_date ? activity.location_lng : null,
          location_address: currentDate === activity.activity_date ? activity.location_address : null,
          attachment_urls: activity.attachment_urls,
        },
        activity.user_id,
        true,
      );

      existingDates.add(currentDate);
      if (currentDate === targetDate && created?.id) {
        targetId = created.id;
      }
    }

    return targetId || activity.id;
  }, [activities, createActivity]);

  const filteredActivities = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return dayActivities.filter((a) => {
      if (q) {
        const hay = [a.activity_name, a.activity_type, a.user_full_name, (a as any).lead_name, (a as any).lead_company]
          .filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (typeFilter !== "all" && (a.activity_type || "") !== typeFilter) return false;
      if (outcomeFilter !== "all" && ((a as any).outcome || "") !== outcomeFilter) return false;
      if (riskFilter !== "all" && (((a as any).risk as string) || "green") !== riskFilter) return false;
      if (statusFilter !== "all" && a.status !== statusFilter) return false;
      return true;
    });
  }, [dayActivities, searchQuery, typeFilter, outcomeFilter, riskFilter, statusFilter]);


  // Sort by start_time for timeline
  const timelineSorted = useMemo(() => {
    return [...filteredActivities].sort((a, b) => {
      if (!a.start_time && !b.start_time) return 0;
      if (!a.start_time) return 1;
      if (!b.start_time) return -1;
      return new Date(a.start_time).getTime() - new Date(b.start_time).getTime();
    });
  }, [filteredActivities]);

  // Stats for selected date
  const stats = useMemo(() => {
    const completed = dayActivities.filter((a) => a.status === "completed");
    const productive = completed.filter((a) => ((a as any).outcome || "") === "Productive");
    const unproductive = completed.filter((a) =>
      UNPRODUCTIVE_OUTCOMES.includes(((a as any).outcome || "") as string)
    );
    return {
      completed: completed.length,
      productive: productive.length,
      unproductive: unproductive.length,
    };
  }, [dayActivities]);


  // Check which days have activities (green dot) — scoped to the active user selection
  const daysWithActivities = useMemo(() => {
    const normalizeDayKey = (value: string | null | undefined) => {
      if (!value) return null;
      const parsed = parseISO(value);
      return Number.isNaN(parsed.getTime()) ? value.slice(0, 10) : format(parsed, "yyyy-MM-dd");
    };

    const indicatorUserId = selectedUserId === "all" ? null : selectedUserId || currentUserId || null;
    const scopedActivities = indicatorUserId
      ? activities.filter((activity) => activity.user_id === indicatorUserId)
      : selectedUserId === "all"
        ? activities
        : [];

    return scopedActivities.reduce((dateSet, activity) => {
      const activityDay = normalizeDayKey(activity.activity_date);
      if (activityDay) {
        dateSet.add(activityDay);
      }

      if (activity.duration_type === "multiple_days" && activity.from_date && activity.to_date) {
        const start = parseISO(activity.from_date);
        const end = parseISO(activity.to_date);

        for (let day = new Date(start); day <= end; day = addDays(day, 1)) {
          dateSet.add(format(day, "yyyy-MM-dd"));
        }
      }

      return dateSet;
    }, new Set<string>());
  }, [activities, selectedUserId, currentUserId]);

  // GPS distance calculation
  const gpsStats = useMemo(() => {
    const pts = gpsData.points;
    if (pts.length < 2) return { distance: 0, stops: gpsData.stops.length, duration: 0 };
    let dist = 0;
    for (let i = 1; i < pts.length; i++) {
      dist += haversine(pts[i - 1].latitude, pts[i - 1].longitude, pts[i].latitude, pts[i].longitude);
    }
    const duration = pts.length >= 2
      ? (new Date(pts[pts.length - 1].timestamp).getTime() - new Date(pts[0].timestamp).getTime()) / 3600000
      : 0;
    return { distance: Math.round(dist * 10) / 10, stops: gpsData.stops.length, duration: Math.round(duration * 10) / 10 };
  }, [gpsData]);

  const handleOpenCreate = () => {
    setForm({ ...defaultForm, activity_date: dateStr, owner_user_id: currentUserId });
    setEditingId(null);
    setFormAttendance(null);
    setShowForm(true);
    fetchAttendanceForDate(currentUserId, dateStr).then(setFormAttendance).catch(() => {});
  };

  const handleAddNewSite = async () => {
    const trimmed = newSiteName.trim();
    if (!trimmed) return;
    setAddingSite(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("project_sites").insert({ site_name: trimmed, created_by: user?.id });
      if (error) throw error;
      await fetchDropdowns();
      const newSite = sites.find(s => s.site_name === trimmed) || (await supabase.from("project_sites").select("id").eq("site_name", trimmed).maybeSingle()).data;
      if (newSite) setForm((f) => ({ ...f, site_id: newSite.id }));
      setNewSiteName("");
      setShowAddSiteDialog(false);
      toast.success(`"${trimmed}" added`);
    } catch (err: any) {
      toast.error(err.message || "Failed to add site");
    } finally {
      setAddingSite(false);
    }
  };

  const handleOpenEdit = (a: ActivityType) => {
    setForm({
      activity_name: a.activity_name,
      activity_type: a.activity_type,
      custom_activity_name: a.activity_type?.trim().toLowerCase() === "other" ? a.activity_name : "",
      activity_date: a.activity_date,
      start_time: a.start_time ? format(parseISO(a.start_time), "HH:mm") : "",
      end_time: a.end_time ? format(parseISO(a.end_time), "HH:mm") : "",
      duration_type: a.duration_type || "hour_based",
      half_day_type: (a as any).half_day_type || "",
      from_date: a.from_date || "",
      to_date: a.to_date || "",
      recurrence_pattern: "daily",
      recurrence_interval: 1,
      recurrence_start_date: a.activity_date || format(new Date(), "yyyy-MM-dd"),
      recurrence_end_date: "",
      recurrence_no_end: false,
      description: a.description || "",
      site_id: a.site_id || "",
      milestone_id: a.milestone_id || "",
      milestone_progress: 0,
      grn_po_id: (a as any).grn_po_id || "",
      customer_id: (a as any).customer_id || "",
      opportunity_id: (a as any).opportunity_id || "",
      link_type: (a as any).opportunity_id ? "opportunity" : (a.site_id ? "site" : ""),
      site_flag: "",
      site_status: "",
      location_address: a.location_address || "",
      total_hours: a.total_hours || 0,
      owner_user_id: a.user_id,
      assigned_user_ids: Array.isArray((a as any).assigned_user_ids) ? (a as any).assigned_user_ids : [],
      photos: a.photo_urls || [],
    });
    setEditingId(a.id);
    setEditActivityObj(a);
    setFormAttendance(null);
    setShowForm(true);
    fetchAttendanceForDate(a.user_id || currentUserId, a.activity_date || dateStr)
      .then(setFormAttendance)
      .catch(() => {});
  };

  const handleSave = async () => {
    if (!form.activity_type) return;
    const isOther = form.activity_type.trim().toLowerCase() === "other";
    const isGrnType = form.activity_type.trim().toLowerCase().includes("grn");
    if (isOther && !form.custom_activity_name.trim()) {
      toast.error("Please enter a name for the 'Other' activity type.");
      return;
    }
    if (isGrnType && !form.grn_po_id) {
      toast.error("Please select an open purchase order (GRN) to receive against.");
      return;
    }
    setSaving(true);
    try {
      // Upload audio if recorded
      let audioUrl: string | null = null;
      if (recording) {
        const { data: { user } } = await supabase.auth.getUser();
        const extension = recording.fileExtension || (recording.mimeType.includes("mp4") || recording.mimeType.includes("aac") ? "m4a" : recording.mimeType.includes("ogg") ? "ogg" : "webm");
        const fileName = `${user!.id}/${Date.now()}.${extension}`;
        const { error: uploadErr } = await supabase.storage
          .from("activity-audio")
          .upload(fileName, recording.blob, { contentType: recording.mimeType || "audio/webm" });
        if (uploadErr) throw uploadErr;
        const { data: urlData } = supabase.storage.from("activity-audio").getPublicUrl(fileName);
        audioUrl = urlData.publicUrl;
      }

      const attachmentUrls: string[] = [];
      if (audioUrl) attachmentUrls.push(audioUrl);

      const payload: any = {
        activity_name: isOther ? form.custom_activity_name.trim() : form.activity_type,
        activity_type: form.activity_type,
        activity_date: form.activity_date,
        start_time: form.start_time ? `${form.activity_date}T${form.start_time}:00` : null,
        end_time: form.end_time ? `${form.activity_date}T${form.end_time}:00` : null,
        duration_type: form.duration_type,
        from_date: form.duration_type === "multiple_days" && form.from_date ? form.from_date : null,
        to_date: form.duration_type === "multiple_days" && form.to_date ? form.to_date : null,
        total_days: form.duration_type === "multiple_days" && form.from_date && form.to_date
          ? Math.max(1, Math.ceil((new Date(form.to_date).getTime() - new Date(form.from_date).getTime()) / 86400000) + 1)
          : null,
        description: form.description || null,
        site_id: form.link_type === "site" ? (form.site_id || null) : null,
        milestone_id: form.link_type === "site" ? (form.milestone_id || null) : null,
        grn_po_id: isGrnType ? (form.grn_po_id || null) : null,
        customer_id: form.customer_id || null,
        opportunity_id: form.link_type === "opportunity" ? (form.opportunity_id || null) : null,
        location_address: form.location_address || null,
        total_hours: form.total_hours || 0,
        photo_urls: form.photos || [],
        ...(isManagerOrAdmin ? { assigned_user_ids: form.assigned_user_ids || [] } : {}),
        ...(attachmentUrls.length > 0 ? { attachment_urls: attachmentUrls } : {}),
      };
      if (editingId) {
        await updateActivity(editingId, payload);
      } else {
        payload.status = "planned";
        payload.status_history = [{ status: "planned", at: new Date().toISOString() } as ActivityStatusEntry];
        const targetUserId = isManagerOrAdmin && form.owner_user_id ? form.owner_user_id : undefined;
        if (form.duration_type === "multiple_days" && form.from_date && form.to_date) {
          const start = new Date(form.from_date);
          const end = new Date(form.to_date);
          for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            const dateStr = d.toISOString().split("T")[0];
            await createActivity({
              ...payload,
              activity_date: dateStr,
            }, targetUserId, true);
          }
          toast.success(`Activity logged for ${payload.total_days} days`);
        } else if (form.duration_type === "recurring") {
          const dates = buildRecurringDates(form);
          if (dates.length === 0) {
            toast.error("Please set a valid recurrence schedule.");
            setSaving(false);
            return;
          }
          for (const dateStr of dates) {
            await createActivity({
              ...payload,
              activity_date: dateStr,
              start_time: form.start_time ? `${dateStr}T${form.start_time}:00` : null,
              end_time: form.end_time ? `${dateStr}T${form.end_time}:00` : null,
            }, targetUserId, true);
          }
          toast.success(`Recurring activity created for ${dates.length} occurrences`);
        } else {
          await createActivity(payload, targetUserId);
        }
      }
      // Update site flag if changed
      if (form.site_id && form.site_flag) {
        await supabase.from("project_sites").update({ flag: form.site_flag }).eq("id", form.site_id);
      }
      // Sync milestone progress (single source of truth)
      if (form.milestone_id) {
        const sel = siteMilestones.find((m) => m.id === form.milestone_id);
        if (sel && form.milestone_progress !== sel.percent_complete) {
          try {
            await updateMilestoneProgress(form.milestone_id, form.milestone_progress, sel.status);
          } catch (e) {
            console.error("Failed to update milestone progress", e);
          }
        }
      }
      clearRecording();
      setShowForm(false);
      fetchActivities();
    } catch (err: any) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this activity?")) return;
    await deleteActivity(id);
    fetchActivities();
  };

  return (
    <motion.div className="space-y-0" variants={container} initial="hidden" animate="show">
      {/* Gradient Header */}
      <motion.div variants={item} className="gradient-hero text-primary-foreground p-4 pb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold">Activities</h1>
            <p className="text-xs opacity-80">Log & track daily work</p>
          </div>
          {hasSubordinates && (
            <Select value={selectedUserId} onValueChange={setSelectedUserId}>
              <SelectTrigger className="w-[140px] h-8 bg-white/15 border-white/20 text-primary-foreground text-xs">
                <Users className="h-3.5 w-3.5 mr-1 opacity-80" />
                <SelectValue placeholder="My Activities" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Users</SelectItem>
                {selectableUsers.map((u) => (
                  <SelectItem key={u.id} value={u.id}>{u.full_name || "Unknown"}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Week Info + Navigation */}
        <div className="flex items-center gap-2 mt-3 mb-3">
          <CalendarDays className="h-4 w-4 opacity-80" />
          <span className="text-xs opacity-80">Week of {format(weekStart, "MMM d, yyyy")}</span>
          <div className="ml-auto flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7 text-primary-foreground/70 hover:text-primary-foreground hover:bg-white/10" onClick={() => setSelectedDate(subWeeks(selectedDate, 1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-primary-foreground/70 hover:text-primary-foreground hover:bg-white/10" onClick={() => setSelectedDate(addWeeks(selectedDate, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Week Day Selector */}
        <div className="grid grid-cols-7 gap-1.5">
          {weekDays.map((day) => {
            const isActive = isSameDay(day, selectedDate);
            const dayKey = format(day, "yyyy-MM-dd");
            const hasActivities = daysWithActivities.has(dayKey);
            return (
              <button
                key={day.toISOString()}
                onClick={() => setSelectedDate(day)}
                className={`rounded-lg py-2 text-center transition-colors relative ${isActive ? "bg-white text-primary font-semibold" : "bg-white/15 text-primary-foreground/80 hover:bg-white/25"}`}
              >
                <p className="text-[10px]">{format(day, "EEE")}</p>
                <p className="text-sm font-semibold">{format(day, "d")}</p>
                {hasActivities && (
                  <span className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-emerald-400" />
                )}
              </button>
            );
          })}
        </div>

        {/* Action Buttons Row */}
        <div className="grid grid-cols-3 gap-2 mt-3">
          <button
            className="flex items-center justify-center gap-1.5 h-10 px-4 rounded-xl text-xs font-medium bg-white/10 text-white/70 hover:bg-white/20 transition-all"
            onClick={() => navigate("/activity-timeline")}
          >
            <Clock className="h-4 w-4" />Timeline
          </button>
          <button
            className="flex items-center justify-center gap-1.5 h-10 px-4 rounded-xl text-xs font-medium bg-white/10 text-white/70 hover:bg-white/20 transition-all"
            onClick={() => navigate("/gps-tracking")}
          >
            <Navigation2 className="h-4 w-4" />GPS Track
          </button>
          <button
            className="flex items-center justify-center gap-1.5 h-10 px-4 rounded-xl text-xs font-medium bg-white/10 text-white/70 hover:bg-white/20 transition-all"
            onClick={handleOpenCreate}
          >
            <ClipboardCheck className="h-4 w-4" />Activity
          </button>
        </div>
      </motion.div>

      {/* Stats Row */}
      <motion.div variants={item} className="p-4 grid grid-cols-3 gap-2">
        <div className="bg-card rounded-xl p-3 text-center shadow-card">
          <p className="text-lg font-bold text-emerald-600">{stats.completed}</p>
          <p className="text-[10px] text-muted-foreground">Completed</p>
        </div>
        <div className="bg-card rounded-xl p-3 text-center shadow-card">
          <p className="text-lg font-bold text-sky-600">{stats.productive}</p>
          <p className="text-[10px] text-muted-foreground">Productive</p>
        </div>
        <div className="bg-card rounded-xl p-3 text-center shadow-card">
          <p className="text-lg font-bold text-rose-600">{stats.unproductive}</p>
          <p className="text-[10px] text-muted-foreground">Unproductive</p>
        </div>
      </motion.div>


      {/* Search + Filters + New Button */}
      <motion.div variants={item} className="px-4 space-y-2">
        <div className="flex items-center gap-2">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search..." className="pl-9 w-full" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
          </div>
          <Button
            variant={moreFiltersOpen ? "secondary" : "outline"}
            size="icon"
            className="shrink-0 h-10 w-10 relative"
            onClick={() => setMoreFiltersOpen((open) => !open)}
            aria-label="More filters"
          >
            <Filter className="h-4 w-4" />
            {(statusFilter !== "all" || (selectedUserId && selectedUserId !== "")) && (
              <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-primary" />
            )}
          </Button>
          <Button className="gradient-hero text-primary-foreground shrink-0 px-3" onClick={handleOpenCreate}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        {/* Activity type / Outcome / Risk filters — fit inside the mobile width */}
        <div className="grid grid-cols-3 gap-2">
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="h-8 w-full min-w-0 text-xs"><SelectValue placeholder="Type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {activityTypes.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={outcomeFilter} onValueChange={setOutcomeFilter}>
            <SelectTrigger className="h-8 w-full min-w-0 text-xs"><SelectValue placeholder="Outcome" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All outcomes</SelectItem>
              {ACTIVITY_OUTCOMES.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={riskFilter} onValueChange={setRiskFilter}>
            <SelectTrigger className="h-8 w-full min-w-0 text-xs"><SelectValue placeholder="Risk" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All risk</SelectItem>
              <SelectItem value="green">On Track</SelectItem>
              <SelectItem value="orange">Attention</SelectItem>
              <SelectItem value="red">Critical</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Collapsible advanced filters */}
        <Collapsible open={moreFiltersOpen} onOpenChange={setMoreFiltersOpen}>
          <CollapsibleContent>
            <div className="rounded-xl border bg-muted/30 p-3 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                {(isAdmin || hasSubordinates) && (
                  <div className="space-y-1 min-w-0">
                    <Label className="text-[10px] text-muted-foreground">Team member</Label>
                    <Select value={selectedUserId || "me"} onValueChange={(v) => setSelectedUserId(v === "me" ? "" : v)}>
                      <SelectTrigger className="h-8 w-full min-w-0 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="me">My activities</SelectItem>
                        <SelectItem value="all">All users</SelectItem>
                        {selectableUsers.map((u) => (
                          <SelectItem key={u.id} value={u.id}>{u.full_name || "Unknown"}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="space-y-1 min-w-0">
                  <Label className="text-[10px] text-muted-foreground">Status</Label>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="h-8 w-full min-w-0 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All statuses</SelectItem>
                      {statusOptions.map((s) => <SelectItem key={s} value={s}>{statusLabels[s]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs w-full"
                onClick={() => {
                  setTypeFilter("all"); setOutcomeFilter("all"); setRiskFilter("all");
                  setStatusFilter("all"); setSelectedUserId("");
                }}
              >
                Clear all filters
              </Button>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </motion.div>


      {/* Activity Report Generator - hidden from UI */}
      {false && (isAdmin || hasSubordinates) && (
        <motion.div variants={item} className="px-4">
          <ActivityReportGenerator isAdmin={!!isAdmin} filtersOpen={reportFiltersOpen} onFiltersOpenChange={setReportFiltersOpen} />
        </motion.div>
      )}


      {/* Content based on active tab */}
      <motion.div variants={item} className="px-4 pb-24 pt-3 space-y-3">
        {activeTab === "activity" && (
          <>
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filteredActivities.length === 0 ? (
              <Card className="shadow-card">
                <CardContent className="p-8 text-center">
                  <CalendarDays className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
                  <p className="text-sm font-semibold text-muted-foreground">No activities found</p>
                  <p className="text-xs text-muted-foreground mt-1">Log a new activity for this date</p>
                </CardContent>
              </Card>
            ) : (
              filteredActivities.map((a) => (
                <ActivityCard
                  key={a.id}
                  a={a}
                  isAdmin={isAdmin}
                  onEdit={handleOpenEdit}
                  onDelete={handleDelete}
                  onOpenDetails={handleOpenEdit}
                  onReceiveGoods={(poId) => setReceivePoId(poId)}
                  onStatusChanged={() => fetchActivities()}
                  updateActivity={updateActivity}
                  getStatusUpdateTargetId={getStatusUpdateTargetId}
                  selectedDateStr={dateStr}
                />
              ))
            )}
          </>

        )}

        {activeTab === "gps" && (
          <GPSTrackView
            gpsData={gpsData}
            gpsStats={gpsStats}
            gpsLoading={gpsLoading}
            activities={filteredActivities}
          />
        )}
      </motion.div>

      {/* Create/Edit Activity Dialog - creative composer for creation, legacy dialog for editing */}
      {!editingId || editActivityObj ? (
        <CreativeActivityForm
          open={showForm}
          onOpenChange={(open) => {
            if (!open) {
              if (isRecording) {
                stopRecording();
              }
              clearRecording();
              setVoiceToTextMode(false);
              setEditingId(null);
              setEditActivityObj(null);
            }
            setShowForm(open);
          }}
          projects={sites.filter((s) => s.is_active).map((s) => ({ id: s.id, name: s.site_name }))}
          users={users}
          activityTypes={activityTypes}
          currentUserId={currentUserId}
          createActivity={createActivity}
          updateActivity={updateActivity}
          editActivity={editActivityObj}
          onDelete={handleDelete}
          onCreated={() => fetchActivities()}
        />

      ) : (
        <Dialog open={showForm} onOpenChange={(open) => { if (!open) { if (isRecording) { stopRecording(); } clearRecording(); setVoiceToTextMode(false); } setShowForm(open); }}>
          <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Activity" : "Log New Activity"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            {/* Activity Owner - only for managers/admins */}
            {isManagerOrAdmin && !editingId && (
              <div>
                <Label className="text-xs font-medium">Activity Owner</Label>
                <Select value={form.owner_user_id} onValueChange={(v) => setForm({ ...form, owner_user_id: v })}>
                  <SelectTrigger>
                    <Users className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                    <SelectValue placeholder="Select owner" />
                  </SelectTrigger>
                  <SelectContent>
                    {users.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.full_name || "Unknown"} {u.id === currentUserId ? "(You)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {/* Customer */}
            <div>
              <Label className="text-xs">Customer</Label>
              <Select
                value={form.customer_id || "__none__"}
                onValueChange={(v) => {
                  const id = v === "__none__" ? "" : v;
                  // Reset opportunity if customer changes
                  setForm({ ...form, customer_id: id, opportunity_id: "" });
                }}
              >
                <SelectTrigger><SelectValue placeholder="Select customer (optional)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {customersList.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Link to Project/Site OR Opportunity */}
            <div>
              <Label className="text-xs mb-2 block">Link to</Label>
              <div className="flex items-center gap-2 mb-2">
                {(["site", "opportunity"] as const).map((lt) => (
                  <button
                    key={lt}
                    type="button"
                    onClick={() => setForm({ ...form, link_type: form.link_type === lt ? "" : lt, site_id: lt === "site" ? form.site_id : "", milestone_id: lt === "site" ? form.milestone_id : "", opportunity_id: lt === "opportunity" ? form.opportunity_id : "" })}
                    className={`flex-1 px-2.5 py-1.5 rounded-lg border text-xs transition-colors capitalize ${
                      form.link_type === lt ? "border-primary bg-primary/10 font-medium" : "border-border hover:bg-muted/50"
                    }`}
                  >
                    {lt === "site" ? "Project / Site" : "Opportunity"}
                  </button>
                ))}
              </div>

              {form.link_type === "site" && (
                <>
                  <Select value={form.site_id} onValueChange={(v) => {
                    if (v === "__add_new_site__") {
                      setShowAddSiteDialog(true);
                      return;
                    }
                    setForm({ ...form, site_id: v, milestone_id: "" });
                  }}>
                    <SelectTrigger><SelectValue placeholder="Select site" /></SelectTrigger>
                    <SelectContent>
                      {sites.filter(s => s.is_active).map((s) => <SelectItem key={s.id} value={s.id}>{s.site_name}</SelectItem>)}
                      <Separator className="my-1" />
                      <SelectItem value="__add_new_site__" className="text-primary font-medium">
                        <span className="flex items-center gap-1.5"><Plus className="h-3.5 w-3.5" />Add new site...</span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  {form.site_status && form.site_id !== "__add_new_site__" && (
                    <p className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1.5">
                      Site Status:
                      <Badge variant="outline" className="text-[10px] capitalize">{form.site_status}</Badge>
                    </p>
                  )}
                </>
              )}

              {form.link_type === "opportunity" && (
                <Select
                  value={form.opportunity_id || "__none__"}
                  onValueChange={(v) => setForm({ ...form, opportunity_id: v === "__none__" ? "" : v })}
                >
                  <SelectTrigger><SelectValue placeholder="Select opportunity" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None</SelectItem>
                    {opportunitiesList
                      .filter((o) => !form.customer_id || o.customer_id === form.customer_id)
                      .map((o) => (
                        <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Milestone selection (read-only, sourced from Site master) */}
            {form.link_type === "site" && form.site_id && form.site_id !== "__add_new_site__" && (
              <div>
                <Label className="text-xs">Milestone</Label>
                {siteMilestones.length === 0 ? (
                  <p className="text-xs text-muted-foreground mt-1">
                    No active milestones for this site. Add milestones in Projects / Sites.
                  </p>
                ) : (
                  <Select
                    value={form.milestone_id || "__none__"}
                    onValueChange={(v) => {
                      const id = v === "__none__" ? "" : v;
                      const sel = siteMilestones.find((m) => m.id === id);
                      setForm({ ...form, milestone_id: id, milestone_progress: sel ? sel.percent_complete : 0 });
                    }}
                  >
                    <SelectTrigger><SelectValue placeholder="Select milestone (optional)" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">None</SelectItem>
                      {siteMilestones.map((m) => (
                        <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {(() => {
                  const sel = siteMilestones.find((m) => m.id === form.milestone_id);
                  if (!sel) return null;
                  return (
                    <div className="mt-2 border rounded-lg p-2.5 bg-muted/30 space-y-2 text-xs">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px]">{milestoneStatusLabel(sel.status)}</Badge>
                        <span className="text-muted-foreground">{sel.percent_complete}% complete</span>
                      </div>
                      <div className="text-muted-foreground">
                        Planned: {format(new Date(sel.start_date), "dd MMM yyyy")} → {format(new Date(sel.end_date), "dd MMM yyyy")}
                      </div>
                      {(sel.actual_start_date || sel.actual_end_date) && (
                        <div className="text-muted-foreground">
                          Actual: {sel.actual_start_date ? format(new Date(sel.actual_start_date), "dd MMM yyyy") : "—"} → {sel.actual_end_date ? format(new Date(sel.actual_end_date), "dd MMM yyyy") : "—"}
                        </div>
                      )}
                      {sel.notes && <p className="text-muted-foreground italic">{sel.notes}</p>}
                      <div className="border-t pt-2 space-y-1.5">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Update milestone progress</span>
                          <span className="font-semibold text-foreground tabular-nums">{form.milestone_progress}%</span>
                        </div>
                        <Slider
                          value={[form.milestone_progress]}
                          min={0}
                          max={100}
                          step={1}
                          onValueChange={(v) => setForm({ ...form, milestone_progress: v[0] })}
                        />
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
            {form.link_type === "site" && form.site_id && form.site_id !== "__add_new_site__" && (
              <div>
                <Label className="text-xs flex items-center gap-1.5 mb-2">Site Flag</Label>
                <div className="flex items-center gap-3">
                  {(["green", "orange", "red"] as SiteFlag[]).map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setForm({ ...form, site_flag: f })}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs transition-colors ${
                        form.site_flag === f ? "border-primary bg-primary/10 font-medium" : "border-border hover:bg-muted/50"
                      }`}
                    >
                      <span className={`inline-block rounded-full h-3 w-3 ${FLAG_CONFIG[f].color}`} />
                      {FLAG_CONFIG[f].label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Activity Type *</Label>
                <Select value={form.activity_type} onValueChange={(v) => {
                    if (v === "__add_new__") {
                      navigate("/activity-types");
                      return;
                    }
                    setForm({ ...form, activity_type: v });
                  }}>
                  <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                  <SelectContent side="bottom" align="start" className="max-h-60 overflow-y-auto">
                    {activityTypes.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    <Separator className="my-1" />
                    <SelectItem value="__add_new__" className="text-primary font-medium">
                      <span className="flex items-center gap-1.5"><Plus className="h-3.5 w-3.5" />Add new type...</span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {isManagerOrAdmin && (
              <div>
                <MultiUserPicker
                  label="Assign To"
                  compact
                  selectedUsers={users
                    .filter((u) => form.assigned_user_ids.includes(u.id))
                    .map((u) => ({ id: u.id, full_name: u.id === currentUserId ? `${u.full_name || "You"} (You)` : u.full_name || "Unknown" }))}
                  onAdd={(u) =>
                    setForm((prev: any) => ({
                      ...prev,
                      assigned_user_ids: prev.assigned_user_ids.includes(u.id) ? prev.assigned_user_ids : [...prev.assigned_user_ids, u.id],
                    }))
                  }
                  onRemove={(id) =>
                    setForm((prev: any) => ({
                      ...prev,
                      assigned_user_ids: prev.assigned_user_ids.filter((uid: string) => uid !== id),
                    }))
                  }
                />
              </div>
            )}
            {form.activity_type.trim().toLowerCase() === "other" && (
              <div>
                <Label className="text-xs">Custom Activity Name *</Label>
                <Input
                  value={form.custom_activity_name}
                  onChange={(e) => setForm({ ...form, custom_activity_name: e.target.value })}
                  placeholder="Enter custom activity name"
                  maxLength={100}
                />
              </div>
            )}
            {form.activity_type.trim().toLowerCase().includes("grn") && (
              <OpenGRNPicker
                siteId={form.site_id && form.site_id !== "__add_new_site__" ? form.site_id : ""}
                value={form.grn_po_id}
                onChange={(poId) => setForm({ ...form, grn_po_id: poId })}
              />
            )}
            <div>
              <Label className="text-xs">Activity Date</Label>
              <Input type="date" value={form.activity_date} onChange={(e) => setForm({ ...form, activity_date: e.target.value })} />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <Label className="text-xs">Description</Label>
                <Popover open={micMenuOpen} onOpenChange={setMicMenuOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className={`h-7 w-7 p-0 rounded-full ${isRecording || isTranscribing ? "text-destructive animate-pulse" : "text-muted-foreground hover:text-foreground"}`}
                      title="Voice options"
                    >
                      <Mic className="h-4 w-4" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-52 p-1" align="end">
                    <button
                      className="flex items-center gap-2 w-full px-3 py-2 text-sm rounded-md hover:bg-accent transition-colors"
                      disabled={isTranscribing || isStartingRecording}
                      onClick={() => {
                        void handleMicOptionClick('text');
                      }}
                    >
                      {isStartingRecording ? <Loader2 className="h-4 w-4 animate-spin" /> : isRecording && voiceToTextMode ? <Square className="h-4 w-4 text-destructive" /> : <Mic className="h-4 w-4" />}
                      {isStartingRecording ? 'Starting...' : isRecording && voiceToTextMode ? "Stop & Transcribe" : isTranscribing ? "Transcribing..." : "Voice to Text"}
                    </button>
                    <button
                      className="flex items-center gap-2 w-full px-3 py-2 text-sm rounded-md hover:bg-accent transition-colors"
                      disabled={isTranscribing || isStartingRecording}
                      onClick={() => {
                        void handleMicOptionClick('audio');
                      }}
                    >
                      {isStartingRecording ? <Loader2 className="h-4 w-4 animate-spin" /> : isRecording && !voiceToTextMode ? <Square className="h-4 w-4 text-destructive" /> : <AudioLines className="h-4 w-4" />}
                      {isStartingRecording ? 'Starting...' : isRecording && !voiceToTextMode ? "Stop Recording" : "Record Audio"}
                    </button>
                  </PopoverContent>
                </Popover>
              </div>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Activity details..." rows={3} />
              {isTranscribing && (
                <div className="flex items-center gap-2 mt-2 p-2 rounded-lg bg-primary/10 border border-primary/20">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  <span className="text-xs font-medium text-primary">Transcribing audio...</span>
                </div>
              )}
              {isRecording && (
                <div className="flex items-center gap-2 mt-2 p-2 rounded-lg bg-destructive/10 border border-destructive/20">
                  <span className="h-2 w-2 rounded-full bg-destructive animate-pulse" />
                  <span className="text-xs font-medium text-destructive">Recording {formatDuration(elapsed)}</span>
                  <Button type="button" variant="ghost" size="sm" className="ml-auto h-6 px-2 text-xs" onClick={() => stopRecording()}>
                    <Square className="h-3 w-3 mr-1" /> Stop
                  </Button>
                </div>
              )}
              {isFinalizing && (
                <div className="flex items-center gap-2 mt-2 p-2 rounded-lg bg-primary/10 border border-primary/20">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  <span className="text-xs font-medium text-primary">Finalizing recording...</span>
                </div>
              )}
              {recording && !isRecording && (
                <div className="flex items-center gap-2 mt-2 p-2 rounded-lg bg-muted border">
                  <audio ref={audioPreviewRef} src={recording.url} onEnded={() => setIsPlayingPreview(false)} />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={() => {
                      if (isPlayingPreview) {
                        audioPreviewRef.current?.pause();
                        setIsPlayingPreview(false);
                      } else {
                        audioPreviewRef.current?.play();
                        setIsPlayingPreview(true);
                      }
                    }}
                  >
                    {isPlayingPreview ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  </Button>
                  <span className="text-xs text-muted-foreground">Audio ({formatDuration(recording.duration)})</span>
                  <Button type="button" variant="ghost" size="sm" className="ml-auto h-6 w-6 p-0 text-destructive" onClick={clearRecording} title="Delete recording">
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </div>
            <div>
              <Label className="text-xs">Photos</Label>
              <div className="mt-1">
                <ActivityPhotoManager
                  photos={form.photos}
                  editable
                  onChange={(photos) => setForm((f) => ({ ...f, photos }))}
                />
              </div>
            </div>
            <Collapsible>

              <CollapsibleTrigger className="flex items-center justify-between w-full px-3 py-2 rounded-md border bg-muted/50 text-sm font-medium hover:bg-muted transition-colors">
                <span>Others</span>
                <ChevronDown className="h-4 w-4 transition-transform duration-200 [&[data-state=open]>svg]:rotate-180" />
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-3 pt-3">

                <div>
                  <Label className="text-xs">Duration Type</Label>
                  <Select value={form.duration_type} onValueChange={(v) => setForm(prev => ({ ...prev, duration_type: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hour_based">Hour Based</SelectItem>
                      <SelectItem value="half_day">Half Day</SelectItem>
                      <SelectItem value="full_day">Full Day</SelectItem>
                      <SelectItem value="multiple_days">Multiple Days</SelectItem>
                      <SelectItem value="recurring">Recurring</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {form.duration_type === "recurring" && (
                  <div className="space-y-3 rounded-md border bg-muted/30 p-3">
                    <div>
                      <Label className="text-xs">Repeat</Label>
                      <Select value={form.recurrence_pattern} onValueChange={(v) => setForm(prev => ({ ...prev, recurrence_pattern: v }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="daily">Daily</SelectItem>
                          <SelectItem value="weekly">Weekly</SelectItem>
                          <SelectItem value="monthly">Monthly</SelectItem>
                          <SelectItem value="custom">Custom Interval</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {form.recurrence_pattern === "custom" && (
                      <div>
                        <Label className="text-xs">Every N days *</Label>
                        <Input
                          type="number"
                          min={1}
                          value={form.recurrence_interval}
                          onChange={(e) => setForm({ ...form, recurrence_interval: Math.max(1, parseInt(e.target.value) || 1) })}
                        />
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs">Start Date *</Label>
                        <Input type="date" value={form.recurrence_start_date} onChange={(e) => setForm({ ...form, recurrence_start_date: e.target.value })} />
                      </div>
                      <div>
                        <Label className="text-xs">End Date {form.recurrence_no_end ? "" : "*"}</Label>
                        <Input type="date" value={form.recurrence_end_date} min={form.recurrence_start_date || undefined} disabled={form.recurrence_no_end} onChange={(e) => setForm({ ...form, recurrence_end_date: e.target.value })} />
                      </div>
                    </div>
                    <label className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={form.recurrence_no_end}
                        onChange={(e) => setForm({ ...form, recurrence_no_end: e.target.checked })}
                      />
                      No End Date (generate next 90 days)
                    </label>
                  </div>
                )}
                {form.duration_type === "half_day" && (
                  <div>
                    <Label className="text-xs">Half Day Period</Label>
                    <Select value={form.half_day_type} onValueChange={(v) => setForm(prev => ({ ...prev, half_day_type: v }))}>
                      <SelectTrigger><SelectValue placeholder="Select half day period" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="first_half">First Half</SelectItem>
                        <SelectItem value="second_half">Second Half</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {form.duration_type === "multiple_days" && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">From Date *</Label>
                      <Input type="date" value={form.from_date} onChange={(e) => setForm({ ...form, from_date: e.target.value })} />
                    </div>
                    <div>
                      <Label className="text-xs">To Date *</Label>
                      <Input type="date" value={form.to_date} min={form.from_date || undefined} onChange={(e) => setForm({ ...form, to_date: e.target.value })} />
                    </div>
                    {form.from_date && form.to_date && (
                      <div className="col-span-2">
                        <p className="text-xs text-muted-foreground">
                          Total Days: <span className="font-semibold text-foreground">{Math.max(1, Math.ceil((new Date(form.to_date).getTime() - new Date(form.from_date).getTime()) / 86400000) + 1)}</span>
                        </p>
                      </div>
                    )}
                  </div>
                )}
                {form.duration_type === "hour_based" && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Start Time</Label>
                      <Input type="time" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} />
                    </div>
                    <div>
                      <Label className="text-xs">End Time</Label>
                      <Input type="time" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} />
                    </div>
                  </div>
                )}
              </CollapsibleContent>
            </Collapsible>
            <Button className="w-full" onClick={handleSave} disabled={saving || !form.activity_type || (form.activity_type.trim().toLowerCase() === "other" && !form.custom_activity_name.trim()) || isFinalizing || isRecording}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {saving ? "Saving..." : editingId ? "Update Activity" : "Log Activity"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      )}

      {/* Add New Site Dialog */}
      <Dialog open={showAddSiteDialog} onOpenChange={setShowAddSiteDialog}>
        <DialogContent className="sm:max-w-[360px]">
          <DialogHeader>
            <DialogTitle>Add New Site</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <Input
              placeholder="e.g. Koramangala Site"
              value={newSiteName}
              onChange={(e) => setNewSiteName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddNewSite()}
              autoFocus
            />
            <Button className="w-full" onClick={handleAddNewSite} disabled={addingSite || !newSiteName.trim()}>
              {addingSite ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
              {addingSite ? "Adding..." : "Add Site"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Activity details open in the full composer view (see CreativeActivityForm above) */}


      {/* Receive Goods (GRN) Dialog */}
      {receivePoId && (
        <ReceiveGoodsDialog
          open={!!receivePoId}
          onOpenChange={(o) => { if (!o) setReceivePoId(""); }}
          poId={receivePoId}
          currentUserId={currentUserId}
          onSaved={() => { setReceivePoId(""); fetchActivities(); }}
        />
      )}
    </motion.div>

  );
}

// ---- Timeline View Component ----
function TimelineView({
  activities,
  attendance,
  attendanceLoading,
  loading,
  isAdmin,
  onEdit,
  onDelete,
}: {
  activities: ActivityType[];
  attendance: { check_in_time: string | null; check_out_time: string | null } | null;
  attendanceLoading: boolean;
  loading: boolean;
  isAdmin: boolean;
  onEdit: (a: ActivityType) => void;
  onDelete: (id: string) => void;
}) {
  if (loading || attendanceLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const hasCheckIn = attendance?.check_in_time;
  const hasCheckOut = attendance?.check_out_time;

  if (!hasCheckIn && activities.length === 0) {
    return (
      <Card className="shadow-card">
        <CardContent className="p-8 text-center">
          <Clock className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
          <p className="text-sm font-semibold text-muted-foreground">No day start recorded</p>
          <p className="text-xs text-muted-foreground mt-1">No attendance or activities for this date</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="relative">
      {/* Vertical line */}
      <div className="absolute left-[22px] top-0 bottom-0 w-0.5 bg-border" />

      {/* Day Started */}
      {hasCheckIn && (
        <TimelineNode
          time={format(parseISO(attendance!.check_in_time!), "h:mm a")}
          icon={<LogIn className="h-3.5 w-3.5 text-emerald-600" />}
          color="bg-emerald-100 border-emerald-300"
        >
          <p className="text-sm font-semibold text-emerald-700">Day Started</p>
          <p className="text-xs text-muted-foreground">Check-in recorded</p>
        </TimelineNode>
      )}

      {/* Activity nodes */}
      {activities.map((a) => (
        <TimelineNode
          key={a.id}
          time={a.start_time ? format(parseISO(a.start_time), "h:mm a") : "--:--"}
          icon={<Activity className="h-3.5 w-3.5 text-primary" />}
          color="bg-primary/10 border-primary/30"
        >
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-sm truncate">{a.activity_name}</span>
                <Badge variant="outline" className={`text-[10px] py-0 ${statusColors[a.status]}`}>
                  {statusLabels[a.status] || a.status}
                </Badge>
                {(a as any)._pending && (
                  <Badge variant="outline" className="text-[10px] py-0 bg-amber-50 text-amber-700 border-amber-300">
                    {(a as any)._sync_error ? "Sync failed" : "Pending sync"}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{a.activity_type}</p>
              {a.location_address && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  <MapPin className="h-3 w-3 inline mr-1" />{a.location_address}
                </p>
              )}
              {a.total_hours ? (
                <p className="text-xs text-muted-foreground mt-0.5">Duration: {a.total_hours}h</p>
              ) : null}
              {isAdmin && a.user_full_name && (
                <p className="text-xs text-muted-foreground mt-0.5">👤 {a.user_full_name}</p>
              )}
            </div>
            <div className="flex gap-1 shrink-0 ml-2">
              {!(a as any)._pending && (
                <>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(a)}>
                    <Edit className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => onDelete(a.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </>
              )}
            </div>
          </div>
        </TimelineNode>
      ))}

      {/* Day Ended */}
      {hasCheckOut && (
        <TimelineNode
          time={format(parseISO(attendance!.check_out_time!), "h:mm a")}
          icon={<LogOut className="h-3.5 w-3.5 text-red-600" />}
          color="bg-red-100 border-red-300"
        >
          <p className="text-sm font-semibold text-red-700">Day Ended</p>
          <p className="text-xs text-muted-foreground">Check-out recorded</p>
        </TimelineNode>
      )}
    </div>
  );
}

function TimelineNode({ time, icon, color, children }: { time: string; icon: React.ReactNode; color: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 mb-4 relative">
      <div className="flex flex-col items-center shrink-0 z-10">
        <div className={`w-11 h-11 rounded-full border-2 flex items-center justify-center ${color} bg-card`}>
          {icon}
        </div>
      </div>
      <div className="flex-1 pt-1">
        <p className="text-[10px] text-muted-foreground font-mono mb-0.5">{time}</p>
        <Card className="shadow-card">
          <CardContent className="p-3">{children}</CardContent>
        </Card>
      </div>
    </div>
  );
}

// ---- GPS Track View Component ----
function GPSTrackView({
  gpsData,
  gpsStats,
  gpsLoading,
  activities,
}: {
  gpsData: { points: any[]; stops: any[] };
  gpsStats: { distance: number; stops: number; duration: number };
  gpsLoading: boolean;
  activities: ActivityType[];
}) {
  if (gpsLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (gpsData.points.length === 0) {
    return (
      <Card className="shadow-card">
        <CardContent className="p-8 text-center">
          <Navigation2 className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
          <p className="text-sm font-semibold text-muted-foreground">No GPS data</p>
          <p className="text-xs text-muted-foreground mt-1">GPS tracking data will appear once the day is started</p>
        </CardContent>
      </Card>
    );
  }

  const activityMarkers = activities
    .filter((a) => a.location_lat && a.location_lng)
    .map((a) => ({ lat: Number(a.location_lat), lng: Number(a.location_lng), name: a.activity_name }));

  return (
    <div className="space-y-3">
      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-2">
        <Card className="shadow-card">
          <CardContent className="p-3 text-center">
            <Route className="h-4 w-4 mx-auto text-primary mb-1" />
            <p className="text-sm font-bold">{gpsStats.distance} km</p>
            <p className="text-[10px] text-muted-foreground">Distance</p>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="p-3 text-center">
            <Octagon className="h-4 w-4 mx-auto text-amber-500 mb-1" />
            <p className="text-sm font-bold">{gpsStats.stops}</p>
            <p className="text-[10px] text-muted-foreground">Stops</p>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="p-3 text-center">
            <Timer className="h-4 w-4 mx-auto text-violet-500 mb-1" />
            <p className="text-sm font-bold">{gpsStats.duration}h</p>
            <p className="text-[10px] text-muted-foreground">Duration</p>
          </CardContent>
        </Card>
      </div>

      {/* Map */}
      <Card className="shadow-card overflow-hidden">
        <CardContent className="p-0">
          <div className="h-[400px] relative">
            <Suspense fallback={
              <div className="h-full w-full flex items-center justify-center bg-muted">
                <p className="text-sm text-muted-foreground">Loading map...</p>
              </div>
            }>
              <LeafletMap gpsPoints={gpsData.points} activityMarkers={activityMarkers} />
            </Suspense>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ---- Activity Card Component ----
function ActivityCard({ a, isAdmin, onEdit, onDelete, onOpenDetails, onReceiveGoods, onStatusChanged, updateActivity, getStatusUpdateTargetId, selectedDateStr }: { a: ActivityType; isAdmin: boolean; onEdit: (a: ActivityType) => void; onDelete: (id: string) => void; onOpenDetails: (a: ActivityType) => void; onReceiveGoods: (poId: string) => void; onStatusChanged: () => void; updateActivity: (id: string, updates: Partial<ActivityType>) => Promise<void>; getStatusUpdateTargetId: (activity: ActivityType, targetDate: string) => Promise<string>; selectedDateStr: string }) {
  const [changingStatus, setChangingStatus] = useState(false);
  const navigate = useNavigate();
  const [editingComment, setEditingComment] = useState(false);
  const [commentDraft, setCommentDraft] = useState(a.description || "");
  const [savingComment, setSavingComment] = useState(false);

  const saveComment = async () => {
    setSavingComment(true);
    try {
      await updateActivity(a.id, { description: commentDraft.trim() || null } as Partial<ActivityType>);
      setEditingComment(false);
      onStatusChanged();
      toast.success("Comment updated");
    } catch {
      toast.error("Could not update the comment");
    } finally {
      setSavingComment(false);
    }
  };


  const handleStatusChange = async (newStatus: string) => {
    if (newStatus === a.status) return;
    if (newStatus === "completed") {
      const missing: string[] = [];
      if (!a.description?.trim()) missing.push("activity comment");
      if (!a.activity_type) missing.push("activity type");
      if (!(a as any).outcome) missing.push("outcome");
      if (missing.length) {
        toast.error(`Add ${missing.join(", ")} before completing`);
        onOpenDetails(a);
        return;
      }
    }
    setChangingStatus(true);

    try {
      const now = new Date().toISOString();
      const updates: Partial<ActivityType> = {
        status: newStatus,
        status_changed_at: now,
      };

      const historyEntry: ActivityStatusEntry = { status: newStatus, at: now };

      // Capture GPS location
      try {
        toast.loading("Requesting location access...");
        const pos = await getCurrentPosition({ timeout: 20000, enableHighAccuracy: true });
        updates.status_change_lat = pos.latitude;
        updates.status_change_lng = pos.longitude;
        updates.location_lat = pos.latitude;
        updates.location_lng = pos.longitude;
        historyEntry.lat = pos.latitude;
        historyEntry.lng = pos.longitude;

        // Reverse geocode
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${pos.latitude}&lon=${pos.longitude}&format=json`);
          const geo = await res.json();
          if (geo.display_name) {
            updates.location_address = geo.display_name;
            historyEntry.address = geo.display_name;
          }
        } catch {}
        toast.dismiss();
      } catch (geoErr) {
        toast.dismiss();
        console.warn("Geolocation failed:", geoErr);
        toast.error("Location access required: Please enable location permission in your device settings and ensure GPS is turned on.");
      }

      // Set start/end time based on transition
      if (newStatus === "in_progress" && !a.start_time) {
        updates.start_time = now;
      } else if (newStatus === "completed") {
        updates.end_time = now;
      }

      updates.status_history = [...(a.status_history || []), historyEntry];

      const targetId = await getStatusUpdateTargetId(a, selectedDateStr);
      await updateActivity(targetId, updates);
      toast.success(`Status changed to ${statusLabels[newStatus]}`);
      onStatusChanged();

    } catch (err: any) {
      toast.error(err.message || "Failed to update status");
    } finally {
      setChangingStatus(false);
    }
  };

  const leadId = (a as any).lead_id as string | undefined;
  const leadName = (a as any).lead_name as string | undefined;
  const leadCompany = (a as any).lead_company as string | undefined;
  const leadDesignation = (a as any).lead_designation as string | undefined;
  const outcome = (a as any).outcome as string | undefined;
  const activityLabel = a.activity_type || a.activity_name || "Activity";
  const contextName = leadCompany || leadName || a.site_name || a.project_name || "";
  const headline = contextName ? `${activityLabel} - ${contextName}` : activityLabel;
  const subLine = [leadName, leadDesignation].filter(Boolean).join(" - ");
  const followUpDate = (a as any).next_follow_up_date as string | undefined;
  const audioUrls = (a.attachment_urls || []).filter((url: string) => url.includes("activity-audio"));

  const lat = a.status_change_lat ?? a.location_lat;
  const lng = a.status_change_lng ?? a.location_lng;
  const mapsUrl =
    lat && lng
      ? `https://www.google.com/maps/search/?api=1&query=${Number(lat)},${Number(lng)}`
      : a.location_address
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(a.location_address)}`
        : "";

  const accent =
    a.status === "completed"
      ? "border-l-emerald-500"
      : a.status === "in_progress"
        ? "border-l-sky-500"
        : "border-l-amber-400";

  const outcomeStyles: Record<string, { icon: React.ReactNode; cls: string }> = {
    "Productive": { icon: <CheckCircle2 className="h-3 w-3" />, cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    "Unproductive": { icon: <AlertCircle className="h-3 w-3" />, cls: "bg-rose-50 text-rose-700 border-rose-200" },
    "Visited but not available": { icon: <Octagon className="h-3 w-3" />, cls: "bg-orange-50 text-orange-700 border-orange-200" },
    "Postponed": { icon: <Timer className="h-3 w-3" />, cls: "bg-amber-50 text-amber-700 border-amber-200" },
    "Cancelled": { icon: <X className="h-3 w-3" />, cls: "bg-slate-100 text-slate-600 border-slate-200" },
    "Not started": { icon: <Clock className="h-3 w-3" />, cls: "bg-violet-50 text-violet-700 border-violet-200" },
  };
  const outcomeStyle = outcome ? outcomeStyles[outcome] : undefined;

  const Row = ({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) => (
    <div className="flex items-start gap-1.5 text-xs text-muted-foreground min-w-0">
      <span className="shrink-0 mt-[1px]">{icon}</span>
      <span className="min-w-0 break-words">{children}</span>
    </div>
  );

  return (
    <Card className={`shadow-card overflow-hidden border-l-4 ${accent}`}>
      <CardContent className="p-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0 cursor-pointer" onClick={() => onOpenDetails(a)}>

            <div className="flex items-start gap-2 mb-1">
              <span className="h-7 w-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <Activity className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                {leadId ? (
                  <button
                    type="button"
                    className="font-semibold text-sm text-primary text-left break-words"
                    onClick={(e) => { e.stopPropagation(); navigate(`/leads/${leadId}`); }}
                  >
                    {headline}
                  </button>
                ) : (
                  <span className="font-semibold text-sm break-words">{headline}</span>
                )}
                {subLine && (
                  <p className="text-[11px] text-muted-foreground truncate">{subLine}</p>
                )}
              </div>
              {!leadId && a.site_flag && (
                <span className={`mt-1 inline-block h-2 w-2 rounded-full shrink-0 ${a.site_flag === "red" ? "bg-red-500" : a.site_flag === "orange" ? "bg-orange-500" : "bg-emerald-500"}`} />
              )}
              {(a as any)._pending && (
                <Badge variant="outline" className="text-[10px] py-0 bg-amber-50 text-amber-700 border-amber-300 shrink-0">
                  {(a as any)._sync_error ? "Sync failed" : "Pending sync"}
                </Badge>
              )}
            </div>

            <div className="ml-9 space-y-1">
              <Row icon={<Clock className="h-3 w-3 text-sky-500" />}>
                {a.start_time
                  ? `${format(parseISO(a.start_time), "h:mm a")}${a.end_time ? ` - ${format(parseISO(a.end_time), "h:mm a")}` : ""}${a.total_hours ? ` (${a.total_hours}h)` : ""}`
                  : "—"}
              </Row>

              {followUpDate && (
                <Row icon={<CalendarDays className="h-3 w-3 text-violet-500" />}>
                  Next follow-up: {format(parseISO(String(followUpDate).slice(0, 10)), "MMM d, yyyy")}
                </Row>
              )}

              {a.milestone_name && (
                <Row icon={<span>🎯</span>}>
                  {a.milestone_name}
                  <span className="ml-1.5 text-[10px]">({milestoneStatusLabel(a.milestone_status)})</span>
                </Row>
              )}

              {/* Highlighted activity comment — inline editable */}
              <div
                className="rounded-lg border border-amber-200 bg-amber-50/80 dark:bg-amber-500/10 dark:border-amber-500/30 px-2.5 py-2 mt-1.5"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between gap-2 mb-0.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">Comment</p>
                  {!editingComment && (
                    <button
                      type="button"
                      className="text-amber-700 dark:text-amber-400"
                      aria-label="Edit comment"
                      onClick={() => { setCommentDraft(a.description || ""); setEditingComment(true); }}
                    >
                      <Edit className="h-3 w-3" />
                    </button>
                  )}
                </div>
                {editingComment ? (
                  <div className="space-y-1.5">
                    <Textarea
                      rows={3}
                      value={commentDraft}
                      onChange={(e) => setCommentDraft(e.target.value)}
                      className="text-xs bg-background"
                      placeholder="Update the comment"
                    />
                    <div className="flex gap-1.5 justify-end">
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditingComment(false)} disabled={savingComment}>
                        Cancel
                      </Button>
                      <Button size="sm" className="h-7 text-xs" onClick={saveComment} disabled={savingComment}>
                        {savingComment ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-foreground/90 line-clamp-3 break-words">{a.description || "No comment added"}</p>
                )}
              </div>


              {audioUrls.length > 0 && (
                <div className="pt-1">
                  {audioUrls.map((url: string, idx: number) => (
                    <SignedAudio key={idx} src={url} className="h-8 w-full max-w-[240px]" />
                  ))}
                </div>
              )}

              <div className="pt-1.5 text-[10px] text-muted-foreground space-y-1">
                {(a.photo_urls?.length || 0) > 0 && (
                  <p>📷 {a.photo_urls!.length} photo{a.photo_urls!.length === 1 ? "" : "s"}</p>
                )}
                <p>
                  🕘 {a.status_changed_at
                    ? `Status updated ${format(parseISO(a.status_changed_at), "h:mm a, MMM d")}`
                    : "No status update yet"}
                  {a.user_full_name ? ` by ${a.user_full_name}` : ""}
                </p>
                {mapsUrl && (
                  <button
                    type="button"
                    className="flex items-start gap-1 text-left text-sky-600 dark:text-sky-400 underline underline-offset-2"
                    onClick={(e) => { e.stopPropagation(); window.open(mapsUrl, "_blank", "noopener,noreferrer"); }}
                  >
                    <MapPin className="h-3 w-3 mt-[1px] shrink-0" />
                    <span className="break-words">
                      {a.location_address || "View location"}
                      {lat && lng ? ` (${Number(lat).toFixed(4)}, ${Number(lng).toFixed(4)})` : ""}
                    </span>
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-col items-end gap-1.5 shrink-0">
            <Badge variant="outline" className={statusColors[a.status] || ""}>
              {statusLabels[a.status] || a.status}
            </Badge>
            {outcome && (
              <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${outcomeStyle?.cls || "bg-muted text-muted-foreground"}`}>
                {outcomeStyle?.icon}
                <span className="max-w-[86px] truncate">{outcome}</span>
              </span>
            )}
            {a.activity_type?.trim().toLowerCase().includes("grn") && (a as any).grn_po_id && (
              <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => onReceiveGoods((a as any).grn_po_id)}>
                <Route className="h-3.5 w-3.5" />
                Receive Goods
              </Button>
            )}
            {a.status === "planned" && (
              <Button size="sm" className="h-8 gap-1.5" onClick={() => handleStatusChange("in_progress")} disabled={changingStatus}>
                {changingStatus ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PlayCircle className="h-3.5 w-3.5" />}
                Start
              </Button>
            )}
            {a.status === "in_progress" && (
              <Button size="sm" className="h-8 gap-1.5 bg-success text-success-foreground hover:bg-success/90" onClick={() => handleStatusChange("completed")} disabled={changingStatus}>
                {changingStatus ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                Complete
              </Button>
            )}
            <div className="flex gap-1">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(a)}>
                <Edit className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => onDelete(a.id)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

        </div>
      </CardContent>
    </Card>
  );
}



// ---- Haversine distance calculation (km) ----
function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
// Cache buster: 1785932685
