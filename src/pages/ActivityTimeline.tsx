import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  CalendarDays,
  ChevronLeft,
  Clock,
  LogIn,
  LogOut,
  Activity,
  MapPin,
  Download,
  Loader2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useActivities, type Activity as ActivityType } from "@/hooks/useActivities";
import { useUserProfile } from "@/hooks/useUserProfile";
import jsPDF from "jspdf";
import { toast } from "sonner";
import { downloadPDF as downloadPDFNative } from "@/utils/nativeDownload";
import ActivityDetailsDialog from "@/components/activities/ActivityDetailsDialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { Search, Filter } from "lucide-react";
import { useActivityTypeOptions, ACTIVITY_OUTCOMES } from "@/hooks/useLeadActivities";
import { UNPRODUCTIVE_OUTCOMES } from "@/pages/Activities";

const statusColors: Record<string, string> = {
  planned: "bg-muted text-muted-foreground",
  in_progress: "bg-info/10 text-info border-info/20",
  completed: "bg-success/10 text-success border-success/20",
};
const statusLabels: Record<string, string> = {
  planned: "Planned",
  in_progress: "In Progress",
  completed: "Completed",
};

export default function ActivityTimeline() {
  const navigate = useNavigate();
  const { activities, loading, users, fetchAttendanceForDate, fetchDropdowns } = useActivities();
  const { data: activityTypes = [] } = useActivityTypeOptions();
  const { isAdmin } = useUserProfile();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [currentUserId, setCurrentUserId] = useState("");
  const [attendance, setAttendance] = useState<{ check_in_time: string | null; check_out_time: string | null } | null>(null);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [detailActivity, setDetailActivity] = useState<ActivityType | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [outcomeFilter, setOutcomeFilter] = useState("all");
  const [riskFilter, setRiskFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [userFilter, setUserFilter] = useState("all");
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false);

  const dateStr = format(selectedDate, "yyyy-MM-dd");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setCurrentUserId(data.user.id);
    });
  }, []);

  useEffect(() => {
    if (!currentUserId) return;
    setAttendanceLoading(true);
    fetchAttendanceForDate(currentUserId, dateStr).then((data) => {
      setAttendance(data);
      setAttendanceLoading(false);
    });
  }, [currentUserId, dateStr, fetchAttendanceForDate]);

  useEffect(() => { fetchDropdowns(); }, [fetchDropdowns]);

  const dayActivities = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return activities
      .filter((a) => a.activity_date === dateStr)
      .filter((a) => {
        if (q) {
          const hay = [a.activity_name, a.activity_type, a.user_full_name, (a as any).lead_name, (a as any).lead_company]
            .filter(Boolean).join(" ").toLowerCase();
          if (!hay.includes(q)) return false;
        }
        if (typeFilter !== "all" && (a.activity_type || "") !== typeFilter) return false;
        if (outcomeFilter !== "all" && ((a as any).outcome || "") !== outcomeFilter) return false;
        if (riskFilter !== "all" && (((a as any).risk as string) || "green") !== riskFilter) return false;
        if (statusFilter !== "all" && a.status !== statusFilter) return false;
        if (userFilter !== "all" && a.user_id !== userFilter) return false;
        return true;
      })
      .sort((a, b) => {
        if (!a.start_time && !b.start_time) return 0;
        if (!a.start_time) return 1;
        if (!b.start_time) return -1;
        return new Date(a.start_time).getTime() - new Date(b.start_time).getTime();
      });
  }, [activities, dateStr, searchQuery, typeFilter, outcomeFilter, riskFilter, statusFilter, userFilter]);

  const stats = useMemo(() => {
    const completed = dayActivities.filter((a) => a.status === "completed");
    return {
      completed: completed.length,
      productive: completed.filter((a) => ((a as any).outcome || "") === "Productive").length,
      unproductive: completed.filter((a) => UNPRODUCTIVE_OUTCOMES.includes(((a as any).outcome || "") as string)).length,
    };
  }, [dayActivities]);

  const handleDownloadPDF = useCallback(async () => {
    try {
      const doc = new jsPDF();
      const title = `Timeline - ${format(selectedDate, "MMM dd, yyyy")}`;
      doc.setFontSize(16);
      doc.text(title, 14, 20);

      let y = 35;
      if (attendance?.check_in_time) {
        doc.setFontSize(11);
        doc.setTextColor(34, 139, 34);
        doc.text(`DAY START - ${format(parseISO(attendance.check_in_time), "h:mm a")}`, 14, y);
        y += 10;
      }

      doc.setTextColor(0, 0, 0);
      dayActivities.forEach((a) => {
        if (y > 270) { doc.addPage(); y = 20; }
        doc.setFontSize(10);
        const time = a.start_time ? format(parseISO(a.start_time), "h:mm a") : "--:--";
        doc.text(`${time} - ${a.activity_name} (${statusLabels[a.status] || a.status})`, 14, y);
        y += 6;
        if (a.description) {
          doc.setFontSize(8);
          doc.setTextColor(100);
          doc.text(a.description.substring(0, 80), 20, y);
          doc.setTextColor(0, 0, 0);
          y += 6;
        }
        y += 2;
      });

      if (attendance?.check_out_time) {
        if (y > 270) { doc.addPage(); y = 20; }
        doc.setFontSize(11);
        doc.setTextColor(200, 0, 0);
        doc.text(`DAY END - ${format(parseISO(attendance.check_out_time), "h:mm a")}`, 14, y);
      }

      await downloadPDFNative(doc, `timeline-${dateStr}.pdf`);
    } catch (err) {
      console.error('PDF download error:', err);
      toast.error('Failed to download PDF');
    }
  }, [selectedDate, attendance, dayActivities, dateStr]);

  const isLoading = loading || attendanceLoading;
  const hasCheckIn = attendance?.check_in_time;
  const hasCheckOut = attendance?.check_out_time;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-background border-b px-4 py-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate("/activities")}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-base font-semibold flex-1">
            Timeline View - {format(selectedDate, "MMM dd, yyyy")}
          </h1>
        </div>
      </div>

      {/* Timeline Header + Controls */}
      <div className="px-4 pt-4">
        <div className="mb-4 space-y-3">
          <div>
            <h2 className="text-xl font-extrabold tracking-tight">TIMELINE</h2>
            <div className="h-1 w-16 bg-foreground rounded-full mt-1" />
          </div>
          <div className="flex items-center gap-2 min-w-0">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="gap-2 text-xs flex-1 min-w-0 justify-start">
                  <CalendarDays className="h-4 w-4 shrink-0" />
                  <span className="truncate">{format(selectedDate, "MMM d, yyyy")}</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(d) => d && setSelectedDate(d)}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
            <Button variant="outline" size="icon" className="shrink-0" onClick={handleDownloadPDF} aria-label="Download PDF">
              <Download className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>


      {/* Roll-up summaries */}
      <div className="px-4 grid grid-cols-3 gap-2">
        <div className="bg-card rounded-xl p-3 text-center shadow-card border">
          <p className="text-lg font-bold text-emerald-600">{stats.completed}</p>
          <p className="text-[10px] text-muted-foreground">Completed</p>
        </div>
        <div className="bg-card rounded-xl p-3 text-center shadow-card border">
          <p className="text-lg font-bold text-sky-600">{stats.productive}</p>
          <p className="text-[10px] text-muted-foreground">Productive</p>
        </div>
        <div className="bg-card rounded-xl p-3 text-center shadow-card border">
          <p className="text-lg font-bold text-rose-600">{stats.unproductive}</p>
          <p className="text-[10px] text-muted-foreground">Unproductive</p>
        </div>
      </div>

      {/* Search + Filters */}
      <div className="px-4 pt-3 space-y-2">
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
            {(statusFilter !== "all" || userFilter !== "all") && (
              <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-primary" />
            )}
          </Button>
        </div>

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

        <Collapsible open={moreFiltersOpen} onOpenChange={setMoreFiltersOpen}>
          <CollapsibleContent>
            <div className="rounded-xl border bg-muted/30 p-3 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                {isAdmin && (
                  <div className="space-y-1 min-w-0">
                    <Label className="text-[10px] text-muted-foreground">Team member</Label>
                    <Select value={userFilter} onValueChange={setUserFilter}>
                      <SelectTrigger className="h-8 w-full min-w-0 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All users</SelectItem>
                        {users.map((u: any) => (
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
                      <SelectItem value="planned">Planned</SelectItem>
                      <SelectItem value="in_progress">In Progress</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
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
                  setStatusFilter("all"); setUserFilter("all");
                }}
              >
                Clear all filters
              </Button>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>

      {/* Timeline Content */}
      <div className="px-4 pb-24">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="relative">
            {/* Vertical line */}
            <div className="absolute left-[18px] top-0 bottom-0 w-0.5 bg-foreground/20" />

            {/* Day Start */}
            {hasCheckIn && (
              <div className="flex gap-4 mb-6 relative">
                <div className="z-10 shrink-0">
                  <div className="w-9 h-9 rounded-full bg-emerald-500 flex items-center justify-center">
                    <LogIn className="h-4 w-4 text-white" />
                  </div>
                </div>
                <div className="pt-1">
                  <p className="text-base font-bold">DAY START</p>
                  <p className="text-sm text-muted-foreground">
                    {format(parseISO(attendance!.check_in_time!), "hh:mm a")}
                  </p>
                </div>
              </div>
            )}

            {/* No check-in, no activities */}
            {!hasCheckIn && dayActivities.length === 0 && (
              <div className="text-center py-12">
                <Clock className="h-12 w-12 mx-auto mb-3 text-muted-foreground/40" />
                <p className="text-muted-foreground font-medium">No activities recorded for this date.</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Activities will appear here once you place orders or record no-order reasons.
                </p>
              </div>
            )}

            {/* Activity nodes */}
            {dayActivities.map((a) => {
              const leadCompany = (a as any).lead_company as string | undefined;
              const leadName = (a as any).lead_name as string | undefined;
              const leadDesignation = (a as any).lead_designation as string | undefined;
              const outcome = (a as any).outcome as string | undefined;
              const followUp = (a as any).next_follow_up_date as string | undefined;
              const label = a.activity_type || a.activity_name || "Activity";
              const context = leadCompany || leadName || a.site_name || a.project_name || "";
              const headline = context ? `${label} - ${context}` : label;
              const subLine = [leadName, leadDesignation].filter(Boolean).join(" - ");
              const lat = a.status_change_lat ?? a.location_lat;
              const lng = a.status_change_lng ?? a.location_lng;
              const mapsUrl =
                lat && lng
                  ? `https://www.google.com/maps/search/?api=1&query=${Number(lat)},${Number(lng)}`
                  : a.location_address
                    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(a.location_address)}`
                    : "";
              const accent =
                a.status === "completed" ? "border-l-emerald-500"
                  : a.status === "in_progress" ? "border-l-sky-500"
                    : "border-l-amber-400";

              return (
                <div key={a.id} className="flex gap-4 mb-5 relative">
                  <div className="z-10 shrink-0">
                    <div className="w-9 h-9 rounded-full bg-primary/15 border-2 border-primary/30 flex items-center justify-center">
                      <Activity className="h-4 w-4 text-primary" />
                    </div>
                  </div>
                  <div className="flex-1 min-w-0 pt-0.5">
                    <Card
                      className={`shadow-sm cursor-pointer border-l-4 ${accent}`}
                      onClick={() => setDetailActivity(a)}
                    >
                      <CardContent className="p-3">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <div className="min-w-0">
                            <p className="font-semibold text-sm break-words">{headline}</p>
                            {subLine && <p className="text-[11px] text-muted-foreground truncate">{subLine}</p>}
                          </div>
                          <div className="flex flex-col items-end gap-1 shrink-0">
                            <Badge variant="outline" className={`text-[10px] py-0 ${statusColors[a.status]}`}>
                              {statusLabels[a.status] || a.status}
                            </Badge>
                            {outcome && (
                              <span className="rounded-full border bg-muted px-2 py-0.5 text-[10px] font-medium max-w-[96px] truncate">
                                {outcome}
                              </span>
                            )}
                          </div>
                        </div>

                        <p className="text-xs text-muted-foreground">
                          🕒 {a.start_time ? format(parseISO(a.start_time), "h:mm a") : "--:--"}
                          {a.end_time && ` - ${format(parseISO(a.end_time), "h:mm a")}`}
                          {a.total_hours ? ` (${a.total_hours}h)` : ""}
                        </p>

                        {followUp && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            📅 Next follow-up: {format(parseISO(String(followUp).slice(0, 10)), "MMM d, yyyy")}
                          </p>
                        )}

                        {a.milestone_name && (
                          <p className="text-xs text-muted-foreground mt-0.5">🎯 {a.milestone_name}</p>
                        )}

                        <div className="rounded-lg border border-amber-200 bg-amber-50/80 dark:bg-amber-500/10 dark:border-amber-500/30 px-2.5 py-2 mt-1.5">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400 mb-0.5">Comment</p>
                          <p className="text-xs text-foreground/90 line-clamp-3 break-words">{a.description || "No comment added"}</p>
                        </div>

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
                      </CardContent>
                    </Card>
                  </div>
                </div>
              );
            })}


            {/* Day End */}
            {hasCheckOut && (
              <div className="flex gap-4 mb-6 relative">
                <div className="z-10 shrink-0">
                  <div className="w-9 h-9 rounded-full bg-red-500 flex items-center justify-center">
                    <LogOut className="h-4 w-4 text-white" />
                  </div>
                </div>
                <div className="pt-1">
                  <p className="text-base font-bold">DAY END</p>
                  <p className="text-sm text-muted-foreground">
                    {format(parseISO(attendance!.check_out_time!), "hh:mm a")}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <ActivityDetailsDialog
        activity={detailActivity}
        open={!!detailActivity}
        onClose={() => setDetailActivity(null)}
        attendance={attendance}
      />
    </div>
  );
}
