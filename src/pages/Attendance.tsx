import { resolveEmployeePhotoUrl } from "@/utils/signedStorage";
import { useState, useEffect, useMemo, useRef } from "react";
import { motion } from "framer-motion";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, subMonths } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CheckCircle, XCircle, LogOut, Loader2, Clock, Edit3, Camera, Shield, MapPin, Save, Upload, CalendarDays, Download, Users } from "lucide-react";
import jsPDF from "jspdf";
import { downloadPDF as downloadPDFNative } from "@/utils/nativeDownload";

import { supabase } from "@/integrations/supabase/client";
import { getCurrentPosition } from "@/utils/nativePermissions";
import MyTeamAttendance from "@/components/attendance/MyTeamAttendance";
import { useAttendance, isWeekOffDate } from "@/hooks/useAttendance";
import { useFaceMatching } from "@/hooks/useFaceMatching";
import { AttendanceCalendarView } from "@/components/attendance/AttendanceCalendarView";
import LeaveBalanceCards from "@/components/LeaveBalanceCards";
import MyLeaveApplications from "@/components/MyLeaveApplications";
import HolidayManagement from "@/components/HolidayManagement";
import RegularizationRequestModal from "@/components/RegularizationRequestModal";
import CameraCapture from "@/components/CameraCapture";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

import ProfileSetupModal from "@/components/ProfileSetupModal";

type ProcessingStep = "location" | "photo" | "face" | "saving" | "done" | null;

const VERIFICATION_STEPS = ["location", "photo", "face", "saving", "done"] as const;
const STEP_LABELS: Record<string, string> = {
  location: "Location",
  photo: "Photo",
  face: "Face",
  saving: "Save",
  done: "Done",
};

export default function Attendance() {
  const [activeView, setActiveView] = useState<"my" | "team">("my");
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [userId, setUserId] = useState<string>();
  const [actionLoading, setActionLoading] = useState(false);
  const [regModalOpen, setRegModalOpen] = useState(false);
  const [selectedRecordForReg, setSelectedRecordForReg] = useState<any>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [dateFilter, setDateFilter] = useState("current-month");
  const [showPresentDaysDialog, setShowPresentDaysDialog] = useState(false);
  const [showAbsentDaysDialog, setShowAbsentDaysDialog] = useState(false);
  const [timelineDate, setTimelineDate] = useState<string | null>(null);
  const [timelineActivities, setTimelineActivities] = useState<any[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineCheckIn, setTimelineCheckIn] = useState<string | null>(null);
  const [timelineCheckOut, setTimelineCheckOut] = useState<string | null>(null);

  // Camera & face verification state
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraMode, setCameraMode] = useState<"checkin" | "checkout">("checkin");
  const [processingStep, setProcessingStep] = useState<ProcessingStep>(null);
  const [profilePictureUrl, setProfilePictureUrl] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [showFaceRegistration, setShowFaceRegistration] = useState(false);
  const [pendingAction, setPendingAction] = useState<"checkin" | "checkout" | null>(null);

  const { compareImages, matching } = useFaceMatching();

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setUserId(user.id);
        // Fetch profile picture for face matching
        supabase.from("profiles").select("profile_picture_url").eq("id", user.id).single()
          .then(({ data }) => {
            if (data?.profile_picture_url) setProfilePictureUrl(data.profile_picture_url);
          });
      }
    });
  }, []);

  const {
    todayRecord, monthRecords, holidays, holidayDates, weekOffConfig,
    leaveRecords, regularizationRequests,
    loading, isCheckedIn, isCheckedOut, checkIn, checkOut, refetch,
  } = useAttendance(userId);

  const dateRange = useMemo(() => {
    const now = new Date();
    if (dateFilter === "last-month") {
      const lastMonth = subMonths(now, 1);
      return { start: startOfMonth(lastMonth), end: endOfMonth(lastMonth) };
    }
    return { start: startOfMonth(now), end: endOfMonth(now) };
  }, [dateFilter]);

  const days = useMemo(() => eachDayOfInterval({ start: dateRange.start, end: dateRange.end }), [dateRange]);

  const filteredRecords = useMemo(() => {
    const startStr = format(dateRange.start, "yyyy-MM-dd");
    const endStr = format(dateRange.end, "yyyy-MM-dd");
    return monthRecords.filter((r) => r.date >= startStr && r.date <= endStr);
  }, [monthRecords, dateRange]);

  const approvedLeaveDates = useMemo(() => {
    const dates = new Set<string>();
    const startStr = format(dateRange.start, "yyyy-MM-dd");
    const endStr = format(dateRange.end, "yyyy-MM-dd");
    leaveRecords.filter(l => l.status === "approved").forEach(l => {
      const from = new Date(l.from_date);
      const to = new Date(l.to_date);
      for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
        const key = format(d, "yyyy-MM-dd");
        if (key >= startStr && key <= endStr && !l.is_half_day) {
          dates.add(key);
        }
      }
    });
    return dates;
  }, [leaveRecords, dateRange]);

  const stats = useMemo(() => {
    const presentDays = filteredRecords.filter((r) => r.status === "present" || r.status === "regularized").length;
    const totalWorkingDays = days.filter((d) => {
      const key = format(d, "yyyy-MM-dd");
      if (holidayDates.has(key)) return false;
      if (isWeekOffDate(d, weekOffConfig)) return false;
      if (approvedLeaveDates.has(key)) return false;
      return true;
    }).length;
    const pct = totalWorkingDays > 0 ? Math.round((presentDays / totalWorkingDays) * 100) : 0;
    return { presentDays, totalWorkingDays, pct };
  }, [filteredRecords, days, holidayDates, weekOffConfig, approvedLeaveDates]);

  const presentDatesList = useMemo(() => {
    return filteredRecords.filter((r) => r.status === "present" || r.status === "regularized").map((r) => r.date).sort();
  }, [filteredRecords]);

  const absentDatesList = useMemo(() => {
    const presentSet = new Set(presentDatesList);
    const today = format(new Date(), "yyyy-MM-dd");
    return days.map((d) => format(d, "yyyy-MM-dd")).filter((key) => {
      if (key > today) return false;
      if (presentSet.has(key)) return false;
      if (holidayDates.has(key)) return false;
      if (isWeekOffDate(new Date(key), weekOffConfig)) return false;
      const rec = filteredRecords.find((r) => r.date === key);
      if (rec && (rec.status === "leave" || rec.status === "half-day")) return false;
      return true;
    }).sort();
  }, [days, presentDatesList, holidayDates, weekOffConfig, filteredRecords]);

  const attendanceData = useMemo(() => {
    const absentRecords = absentDatesList.map((date) => ({
      id: `absent-${date}`, date, status: "absent", check_in_time: null, check_out_time: null, total_hours: null, isAbsentPlaceholder: true,
    }));
    return [...filteredRecords, ...absentRecords].sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [filteredRecords, absentDatesList]);

  const regMap = useMemo(() => {
    const map = new Map<string, any>();
    regularizationRequests.forEach((r) => map.set(r.date, r));
    return map;
  }, [regularizationRequests]);

  // --- Camera + Face Verification Flow ---
  const handleStartDay = () => {
    // Force face registration if no profile picture
    if (!profilePictureUrl) {
      setPendingAction("checkin");
      setShowFaceRegistration(true);
      return;
    }
    setCameraMode("checkin");
    setRetryCount(0);
    setCameraOpen(true);
  };

  const handleEndDay = () => {
    // Force face registration if no profile picture
    if (!profilePictureUrl) {
      setPendingAction("checkout");
      setShowFaceRegistration(true);
      return;
    }
    setCameraMode("checkout");
    setRetryCount(0);
    setCameraOpen(true);
  };

  const handleFaceRegistrationComplete = () => {
    setShowFaceRegistration(false);
    // Re-fetch profile picture
    if (userId) {
      supabase.from("profiles").select("profile_picture_url").eq("id", userId).single()
        .then(({ data }) => {
          if (data?.profile_picture_url) {
            setProfilePictureUrl(data.profile_picture_url);
            // Now proceed with the pending action
            if (pendingAction) {
              setCameraMode(pendingAction);
              setRetryCount(0);
              setCameraOpen(true);
              setPendingAction(null);
            }
          }
        });
    }
  };

  const handleCameraCapture = async (blob: Blob) => {
    if (!userId) return;
    setActionLoading(true);
    setCameraOpen(false);

    try {
      // Step 1: Get location
      setProcessingStep("location");
      let location: any = null;
      try {
        location = await getCurrentPosition();
      } catch {}

      // Step 2: Upload photo
      setProcessingStep("photo");
      const dateStr = format(new Date(), "yyyy-MM-dd");
      const type = cameraMode === "checkin" ? "checkin" : "checkout";
      const timestamp = Date.now();
      const filePath = `${userId}/attendance/${dateStr}_${type}_${timestamp}.jpg`;

      const { error: uploadError } = await supabase.storage
        .from("attendance-photos")
        .upload(filePath, blob, { contentType: "image/jpeg", upsert: true });

      if (uploadError) throw uploadError;

      const { data: signedData, error: signedError } = await supabase.storage
        .from("attendance-photos")
        .createSignedUrl(filePath, 300); // 5 min expiry for face verification
      if (signedError || !signedData?.signedUrl) throw new Error("Failed to get photo URL");
      const photoUrl = signedData.signedUrl;

      // Step 3: Face verification
      let faceVerificationStatus = "bypassed";
      let faceMatchConfidence = 0;

      if (profilePictureUrl) {
        setProcessingStep("face");
        const signedBaseline = await resolveEmployeePhotoUrl(profilePictureUrl);
        const matchResult = await compareImages(signedBaseline || profilePictureUrl, photoUrl);
        faceVerificationStatus = matchResult.status;
        faceMatchConfidence = matchResult.confidence;

        // If face match failed or bypassed (service error), treat as failure
        if (matchResult.status === "failed" || matchResult.status === "bypassed") {
          if (retryCount < 2) {
            setRetryCount((prev) => prev + 1);
            setActionLoading(false);
            setProcessingStep(null);
            const msg = matchResult.status === "bypassed"
              ? `Face verification service error. Attempt ${retryCount + 1}/3. Please try again.`
              : `Face does not match your profile photo (${matchResult.confidence}% confidence). Attempt ${retryCount + 1}/3. Please try again.`;
            toast.error(msg);
            setCameraOpen(true);
            return;
          }
          // All retries exhausted — block attendance
          setActionLoading(false);
          setProcessingStep(null);
          toast.error(
            "Face verification failed after 3 attempts. Your face does not match the registered profile photo. Please contact your admin.",
            { duration: 6000 }
          );
          return;
        }
      }

      // Step 4: Save attendance
      setProcessingStep("saving");
      if (cameraMode === "checkin") {
        await checkIn({ photoUrl, location, faceVerificationStatus, faceMatchConfidence });
      } else {
        await checkOut({ photoUrl, location, faceVerificationStatus, faceMatchConfidence });
      }

      // Step 5: Done
      setProcessingStep("done");
      toast.success(cameraMode === "checkin" ? "Day started successfully!" : "Day ended successfully!");
      await new Promise((r) => setTimeout(r, 1500));
    } catch (err: any) {
      console.error("Attendance error:", err);
      toast.error(err.message || "Failed to record attendance");
    } finally {
      setActionLoading(false);
      setProcessingStep(null);
    }
  };

  const handleOpenRegularizationModal = (record: any) => {
    setSelectedRecordForReg(record);
    setRegModalOpen(true);
  };

  const openTimelineView = async (record: any) => {
    const dateStr = format(new Date(record.date), "yyyy-MM-dd");
    setTimelineDate(dateStr);
    setTimelineCheckIn(record.check_in_time || null);
    setTimelineCheckOut(record.check_out_time || null);
    await loadTimelineForDate(dateStr);
  };

  const loadTimelineForDate = async (dateStr: string) => {
    setTimelineLoading(true);
    try {
      // Load activities
      const { data: activities } = await supabase
        .from("activity_events")
        .select("*, retailers(name)")
        .eq("user_id", userId!)
        .eq("activity_date", dateStr)
        .order("start_time", { ascending: true });
      setTimelineActivities(activities || []);

      // Load attendance for that date to get check-in/out times
      const { data: att } = await supabase
        .from("attendance")
        .select("check_in_time, check_out_time")
        .eq("user_id", userId!)
        .eq("date", dateStr)
        .maybeSingle();
      setTimelineCheckIn(att?.check_in_time || null);
      setTimelineCheckOut(att?.check_out_time || null);
    } catch (err) {
      console.error("Error loading timeline:", err);
    } finally {
      setTimelineLoading(false);
    }
  };

  const handleTimelineDateChange = (date: Date | undefined) => {
    if (!date) return;
    const dateStr = format(date, "yyyy-MM-dd");
    setTimelineDate(dateStr);
    loadTimelineForDate(dateStr);
  };

  const handleDownloadTimelinePDF = async () => {
    if (!timelineDate) return;
    try {
      const doc = new jsPDF();
      const dateLabel = format(new Date(timelineDate), "MMMM do, yyyy");

      doc.setFontSize(18);
      doc.text("TIMELINE", 14, 20);
      doc.setFontSize(11);
      doc.text(dateLabel, 14, 28);

      let y = 40;

      if (timelineCheckIn) {
        doc.setFontSize(12);
        doc.setFont("helvetica", "bold");
        doc.text("DAY START", 20, y);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.text(format(new Date(timelineCheckIn), "h:mm a"), 20, y + 6);
        y += 16;
      }

      timelineActivities.forEach((activity: any) => {
        if (y > 270) { doc.addPage(); y = 20; }
        doc.setFontSize(12);
        doc.setFont("helvetica", "bold");
        doc.text(activity.activity_name, 20, y);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        const timeStr = [
          activity.start_time ? format(new Date(activity.start_time), "h:mm a") : "",
          activity.end_time ? format(new Date(activity.end_time), "h:mm a") : "",
        ].filter(Boolean).join(" - ");
        if (timeStr) doc.text(timeStr, 20, y + 6);
        if (activity.retailers?.name) doc.text(activity.retailers.name, 20, y + 12);
        y += activity.retailers?.name ? 22 : 16;
      });

      if (timelineCheckOut) {
        if (y > 270) { doc.addPage(); y = 20; }
        doc.setFontSize(12);
        doc.setFont("helvetica", "bold");
        doc.text("DAY END", 20, y);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.text(format(new Date(timelineCheckOut), "h:mm a"), 20, y + 6);
      }

      if (timelineActivities.length === 0 && !timelineCheckIn) {
        doc.setFontSize(12);
        doc.text("No activities recorded for this date.", 14, y);
      }

      await downloadPDFNative(doc, `timeline-${timelineDate}.pdf`);
    } catch (err: any) {
      console.error("PDF download error:", err);
      toast.error("Failed to download PDF. Please try again.");
    }
  };

  const handleRefresh = () => {
    refetch();
    setRefreshTrigger((prev) => prev + 1);
  };

  const formatTime = (timeString: string | null) => {
    if (!timeString) return "--:--";
    return new Date(timeString).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  };

  const existingRegRequest = useMemo(() => {
    if (!selectedRecordForReg) return null;
    return regMap.get(selectedRecordForReg.date) || null;
  }, [selectedRecordForReg, regMap]);

  const stepDescriptions: Record<string, string> = {
    location: "Getting location...",
    photo: "Uploading photo...",
    face: "Verifying face match...",
    saving: "Saving attendance...",
    done: "Completed!",
  };

  return (
    <motion.div className="p-4 space-y-4 pb-24" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
      <div className="text-center">
        <h1 className="text-2xl font-bold">Attendance</h1>
        <p className="text-sm text-muted-foreground">Track your daily attendance and working hours</p>
      </div>

      {/* My Attendance / My Team Toggle */}
      <div className="grid grid-cols-2 gap-0 rounded-full border overflow-hidden">
        <button
          onClick={() => setActiveView("my")}
          className={cn(
            "py-3 text-sm font-semibold transition-all",
            activeView === "my"
              ? "bg-card text-foreground shadow-sm"
              : "bg-muted/50 text-muted-foreground hover:text-foreground"
          )}
        >
          My Attendance
        </button>
        <button
          onClick={() => setActiveView("team")}
          className={cn(
            "py-3 text-sm font-semibold transition-all",
            activeView === "team"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "bg-muted/50 text-muted-foreground hover:text-foreground"
          )}
        >
          My Team
        </button>
      </div>

      {activeView === "team" ? (
        <MyTeamAttendance />
      ) : (
      <>

      {/* Monthly Summary Cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-card rounded-2xl p-5 text-center shadow-sm">
          <div className="text-3xl font-bold text-foreground">{stats.pct}%</div>
          <div className="text-xs font-medium text-muted-foreground mt-1">This Month</div>
        </div>
        <div className="bg-card rounded-2xl p-5 text-center shadow-sm">
          <div className="text-3xl font-bold text-foreground">{stats.presentDays}/{stats.totalWorkingDays}</div>
          <div className="text-xs font-medium text-muted-foreground mt-1">Present Days</div>
        </div>
      </div>

      {/* Step-by-step Verification Stepper */}
      {processingStep && (
        <div className="rounded-[1.75rem] border border-border bg-card px-4 py-5 shadow-card">
          <div className="mx-auto max-w-2xl">
            <div className="mb-5 flex items-center justify-center gap-2 text-center text-sm font-semibold text-foreground">
              {processingStep !== "done" && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
              <span>{stepDescriptions[processingStep]}</span>
            </div>

            <div className="flex items-start justify-between gap-0.5 px-1 sm:gap-1">
              {VERIFICATION_STEPS.map((step, idx) => {
                const currentIdx = VERIFICATION_STEPS.indexOf(processingStep as any);
                const isComplete = processingStep === "done" || idx < currentIdx;
                const isActive = processingStep !== "done" && idx === currentIdx;
                const isUpcoming = !isComplete && !isActive;

                return (
                  <div key={step} className="flex flex-1 items-start last:flex-none">
                    <div className="flex min-w-[52px] flex-col items-center text-center">
                      <div
                        className={cn(
                          "flex h-10 w-10 items-center justify-center rounded-full border-2 text-sm font-semibold transition-all duration-200",
                          isComplete && "border-[hsl(var(--success))] bg-[hsl(var(--success))] text-[hsl(var(--success-foreground))]",
                          isActive && "border-primary bg-primary text-primary-foreground shadow-sm",
                          isUpcoming && "border-border bg-background text-muted-foreground"
                        )}
                      >
                        {isComplete ? <CheckCircle className="h-4 w-4" /> : <span>{idx + 1}</span>}
                      </div>

                      <span
                        className={cn(
                          "mt-2 text-[11px] font-medium leading-tight",
                          isComplete && "text-[hsl(var(--success))]",
                          isActive && "text-foreground",
                          isUpcoming && "text-muted-foreground"
                        )}
                      >
                        {STEP_LABELS[step]}
                      </span>
                    </div>

                    {idx < VERIFICATION_STEPS.length - 1 && (
                      <div className="mt-5 flex-1 px-1">
                        <div className="h-[2px] w-full rounded-full bg-border">
                          <div
                            className={cn(
                              "h-full rounded-full transition-all duration-300",
                              isComplete ? "w-full bg-[hsl(var(--success))]" : "w-0 bg-transparent"
                            )}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Check-in / Check-out */}
      <div className="flex gap-3">
        <button
          onClick={handleStartDay}
          disabled={actionLoading || isCheckedIn || isCheckedOut}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 py-3 rounded-full text-sm font-semibold transition-all border",
            isCheckedIn || isCheckedOut
              ? "bg-card text-muted-foreground border-border cursor-default"
              : "bg-card text-foreground border-border hover:bg-accent"
          )}
        >
          {actionLoading && cameraMode === "checkin" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4 text-[hsl(150,50%,45%)]" />}
          {isCheckedIn ? "Day Started" : isCheckedOut ? "Day Ended" : "Start My Day"}
        </button>
        <button
          onClick={handleEndDay}
          disabled={actionLoading || !isCheckedIn || isCheckedOut}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 py-3 rounded-full text-sm font-semibold transition-all",
            !isCheckedIn || isCheckedOut
              ? "bg-destructive/10 text-destructive/50 cursor-default opacity-60"
              : "bg-destructive text-destructive-foreground hover:bg-destructive/90"
          )}
        >
          {actionLoading && cameraMode === "checkout" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
          {isCheckedOut ? "Day Ended" : "End My Day"}
        </button>
      </div>

      {/* Calendar View with Present/Absent Summary */}
      <div className="bg-background rounded-2xl p-4 shadow-sm space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-[hsl(150,35%,93%)] rounded-xl p-2.5 text-center cursor-pointer hover:shadow-md transition-shadow" onClick={() => setShowPresentDaysDialog(true)}>
            <div className="flex items-center justify-center gap-1.5">
              <CheckCircle className="h-4 w-4 text-[hsl(150,50%,45%)]" />
              <span className="text-lg font-bold text-[hsl(150,45%,30%)]">{stats.presentDays}</span>
            </div>
            <div className="text-[11px] font-medium text-[hsl(150,35%,40%)]">Present Days</div>
          </div>
          <div className="bg-[hsl(0,40%,95%)] rounded-xl p-2.5 text-center cursor-pointer hover:shadow-md transition-shadow" onClick={() => setShowAbsentDaysDialog(true)}>
            <div className="flex items-center justify-center gap-1.5">
              <XCircle className="h-4 w-4 text-[hsl(0,50%,55%)]" />
              <span className="text-lg font-bold text-[hsl(0,45%,35%)]">{absentDatesList.length}</span>
            </div>
            <div className="text-[11px] font-medium text-[hsl(0,35%,45%)]">Absent Days</div>
          </div>
        </div>
        <AttendanceCalendarView attendanceRecords={monthRecords} leaveRecords={leaveRecords} weekOffConfig={weekOffConfig} holidayDates={holidayDates} currentMonth={currentMonth} onMonthChange={setCurrentMonth} />
      </div>

      {/* Present Days Dialog */}
      <Dialog open={showPresentDaysDialog} onOpenChange={setShowPresentDaysDialog}>
        <DialogContent className="max-w-md max-h-[70vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-[hsl(150,50%,45%)]" />
              Present Days ({presentDatesList.length})
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 mt-4">
            {presentDatesList.length > 0 ? presentDatesList.map((date) => (
              <div key={date} className="flex items-center gap-3 p-3 bg-[hsl(150,35%,94%)] rounded-xl">
                <CheckCircle className="h-4 w-4 text-[hsl(150,50%,45%)]" />
                <span className="font-medium text-sm">{format(new Date(date), "EEE, MMM dd, yyyy")}</span>
              </div>
            )) : <div className="text-center text-muted-foreground py-4">No present days recorded</div>}
          </div>
        </DialogContent>
      </Dialog>

      {/* Absent Days Dialog */}
      <Dialog open={showAbsentDaysDialog} onOpenChange={setShowAbsentDaysDialog}>
        <DialogContent className="max-w-md max-h-[70vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-[hsl(0,50%,55%)]" />
              Absent Days ({absentDatesList.length})
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 mt-4">
            {absentDatesList.length > 0 ? absentDatesList.map((date) => (
              <div key={date} className="flex items-center gap-3 p-3 bg-[hsl(0,40%,95%)] rounded-xl">
                <XCircle className="h-4 w-4 text-[hsl(0,50%,55%)]" />
                <span className="font-medium text-sm">{format(new Date(date), "EEE, MMM dd, yyyy")}</span>
              </div>
            )) : <div className="text-center text-muted-foreground py-4">No absent days recorded</div>}
          </div>
        </DialogContent>
      </Dialog>

      {/* Market Hours */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Clock className="h-5 w-5" />Today's Market Hours</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {todayRecord?.check_in_time ? (
              <div className="bg-green-100 dark:bg-green-900 p-4 rounded-lg border border-green-200 dark:border-green-800">
                <div className="text-center">
                  <CheckCircle className="h-5 w-5 mx-auto mb-2 text-green-600" />
                  <div className="font-semibold text-green-800 dark:text-green-200 text-sm">First Check In</div>
                  <div className="text-sm text-green-600 dark:text-green-400 mt-1">{format(new Date(todayRecord.check_in_time), "hh:mm a")}</div>
                </div>
              </div>
            ) : (
              <div className="bg-muted p-4 rounded-lg border"><div className="text-center text-muted-foreground"><CheckCircle className="h-5 w-5 mx-auto mb-2" /><div className="font-semibold text-sm">First Check In</div><div className="text-xs mt-1">Not started</div></div></div>
            )}
            <div className={`p-4 rounded-lg border ${todayRecord?.check_out_time ? "bg-blue-100 dark:bg-blue-900 border-blue-200 dark:border-blue-800" : "bg-muted border-border"}`}>
              <div className="text-center">
                <Clock className={`h-5 w-5 mx-auto mb-2 ${todayRecord?.check_out_time ? "text-blue-600" : "text-muted-foreground"}`} />
                <div className={`font-semibold text-sm ${todayRecord?.check_out_time ? "text-blue-800 dark:text-blue-200" : "text-muted-foreground"}`}>Active Market Hours</div>
                <div className={`text-sm mt-1 ${todayRecord?.check_out_time ? "text-blue-600 dark:text-blue-400" : "text-muted-foreground"}`}>
                  {todayRecord?.check_in_time && todayRecord?.check_out_time ? (() => { const diffMs = new Date(todayRecord.check_out_time).getTime() - new Date(todayRecord.check_in_time).getTime(); const hours = Math.floor(diffMs / (1000 * 60 * 60)); const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60)); return `${hours}h ${minutes}m`; })() : "--:--"}
                </div>
              </div>
            </div>
            {todayRecord?.check_out_time ? (
              <div className="bg-orange-100 dark:bg-orange-900 p-4 rounded-lg border border-orange-200 dark:border-orange-800">
                <div className="text-center"><LogOut className="h-5 w-5 mx-auto mb-2 text-orange-600" /><div className="font-semibold text-orange-800 dark:text-orange-200 text-sm">Last Check Out</div><div className="text-sm text-orange-600 dark:text-orange-400 mt-1">{format(new Date(todayRecord.check_out_time), "hh:mm a")}</div></div>
              </div>
            ) : (
              <div className="bg-muted p-4 rounded-lg border"><div className="text-center text-muted-foreground"><LogOut className="h-5 w-5 mx-auto mb-2" /><div className="font-semibold text-sm">Last Check Out</div><div className="text-xs mt-1">Not ended</div></div></div>
            )}
          </div>
          <div className="text-sm text-muted-foreground text-center mt-4">Market hours are automatically tracked from your attendance</div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="attendance" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="attendance">My Attendance</TabsTrigger>
          <TabsTrigger value="leave">Leave</TabsTrigger>
          <TabsTrigger value="holiday">Holiday</TabsTrigger>
        </TabsList>

        <TabsContent value="attendance" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Recent Attendance</CardTitle>
              <Select value={dateFilter} onValueChange={setDateFilter}>
                <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="current-month">This Month</SelectItem>
                  <SelectItem value="last-month">Last Month</SelectItem>
                </SelectContent>
              </Select>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {attendanceData.length > 0 ? (
                  attendanceData.slice(0, 15).map((record: any) => {
                    const isAbsent = record.status === "absent" || record.isAbsentPlaceholder;
                    const isRegularized = record.status === "regularized";
                    const existingReq = regMap.get(record.date);
                    const hasPendingRequest = existingReq?.status === "pending";
                    const hasRejectedRequest = existingReq?.status === "rejected";

                    return (
                      <div key={record.id} className={cn("flex flex-col gap-3 p-4 border rounded-lg hover:shadow-md transition-all", isAbsent && "bg-red-50/50 dark:bg-red-950/30 border-red-200 dark:border-red-800", isRegularized && "bg-purple-50/50 dark:bg-purple-950/30 border-purple-200 dark:border-purple-800")}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3 flex-1">
                            {isAbsent ? <XCircle className="h-5 w-5 text-red-600" /> : isRegularized ? <CheckCircle className="h-5 w-5 text-purple-600" /> : <CheckCircle className="h-5 w-5 text-green-600" />}
                            <div className="flex-1">
                              <div className="font-medium">{format(new Date(record.date), "EEE, MMM dd, yyyy")}</div>
                              {isAbsent ? (
                                <div className="text-sm text-red-600 dark:text-red-400">Absent - No attendance recorded</div>
                              ) : (
                                <>
                                  <div className="text-sm text-muted-foreground">In: {formatTime(record.check_in_time)} | Out: {formatTime(record.check_out_time)}</div>
                                  {record.total_hours && <div className="text-xs text-blue-600">Total: {record.total_hours.toFixed(1)} hours</div>}
                                </>
                              )}
                            </div>
                            <div className="flex flex-col gap-1 items-end">
                              {!isAbsent && record.face_match_confidence !== null && record.face_match_confidence !== undefined && (
                                <Badge
                                  variant={
                                    record.face_match_confidence >= 70 ? 'default' :
                                    record.face_match_confidence >= 40 ? 'secondary' :
                                    'destructive'
                                  }
                                  className={cn(
                                    record.face_match_confidence >= 70 && "bg-green-500 hover:bg-green-600",
                                    record.face_match_confidence >= 40 && record.face_match_confidence < 70 && "bg-amber-500 hover:bg-amber-600"
                                  )}
                                >
                                  {record.face_match_confidence >= 70 ? '✅' :
                                   record.face_match_confidence >= 40 ? '⚠️' : '❌'}
                                  {' '}{Math.round(record.face_match_confidence)}%
                                </Badge>
                              )}
                              {isAbsent && !hasPendingRequest && !hasRejectedRequest && <Badge variant="destructive">Absent</Badge>}
                              {isRegularized && <Badge className="bg-purple-500 hover:bg-purple-600">Regularized</Badge>}
                              {hasPendingRequest && <Badge className="bg-yellow-500 hover:bg-yellow-600">Pending Approval</Badge>}
                              {hasRejectedRequest && <Badge variant="destructive" className="text-xs">Rejected - Resubmit</Badge>}
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button size="icon" variant="outline" className="h-8 w-8 border-orange-300 text-orange-700 hover:bg-orange-50" onClick={() => handleOpenRegularizationModal(record)} title={hasRejectedRequest ? "Resubmit Regularization" : "Request Regularization"}>
                            <Edit3 className="h-4 w-4" />
                          </Button>

                          {!isAbsent && (
                            <Button
                              size="icon"
                              variant="outline"
                              className="h-8 w-8"
                              onClick={() => openTimelineView(record)}
                              title="Timeline View"
                            >
                              <CalendarDays className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-center text-muted-foreground py-8">
                    <Clock className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
                    <p>No attendance records found for the selected period</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="leave">
          <div className="space-y-4">
            <LeaveBalanceCards refreshTrigger={refreshTrigger} onApplicationSubmitted={handleRefresh} />
            <MyLeaveApplications refreshTrigger={refreshTrigger} />
          </div>
        </TabsContent>

        <TabsContent value="holiday">
          <HolidayManagement readOnly />
        </TabsContent>
      </Tabs>

      {userId && (
        <RegularizationRequestModal
          isOpen={regModalOpen}
          onClose={() => { setRegModalOpen(false); setSelectedRecordForReg(null); }}
          attendanceRecord={selectedRecordForReg}
          existingRequest={existingRegRequest}
          onSubmit={handleRefresh}
          userId={userId}
        />
      )}

      {/* Timeline View Dialog */}
      <Dialog open={!!timelineDate} onOpenChange={(open) => { if (!open) setTimelineDate(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>Timeline View - {timelineDate ? format(new Date(timelineDate), "MMM dd, yyyy") : ""}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold tracking-wide">TIMELINE</h2>
                <div className="h-1 w-20 bg-primary mt-1 rounded-full" />
              </div>
              <div className="flex gap-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm">
                      <CalendarDays className="h-4 w-4 mr-2" />
                      {timelineDate ? format(new Date(timelineDate), "MMMM do, yyyy") : ""}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="end">
                    <Calendar
                      mode="single"
                      selected={timelineDate ? new Date(timelineDate) : undefined}
                      onSelect={handleTimelineDateChange}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                <Button variant="outline" size="sm" onClick={handleDownloadTimelinePDF}>
                  <Download className="h-4 w-4 mr-2" />
                  Download PDF
                </Button>
              </div>
            </div>

            {timelineLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="relative pl-8">
                {/* Vertical line */}
                <div className="absolute left-3 top-2 bottom-2 w-0.5 bg-muted-foreground/30" />

                {/* Day Start */}
                {timelineCheckIn && (
                  <div className="relative mb-6">
                    <div className="absolute -left-5 top-1 h-3 w-3 rounded-full bg-[hsl(150,50%,45%)] border-2 border-background" />
                    <div>
                      <div className="font-bold text-sm">DAY START</div>
                      <div className="text-sm text-muted-foreground">{format(new Date(timelineCheckIn), "h:mm a")}</div>
                    </div>
                  </div>
                )}

                {/* Activities */}
                {timelineActivities.map((activity: any) => (
                  <div key={activity.id} className="relative mb-6">
                    <div className="absolute -left-5 top-1 h-3 w-3 rounded-full bg-primary border-2 border-background" />
                    <div>
                      <div className="font-bold text-sm">{activity.activity_name}</div>
                      <div className="text-sm text-muted-foreground">
                        {activity.start_time ? format(new Date(activity.start_time), "h:mm a") : ""}
                        {activity.end_time ? ` - ${format(new Date(activity.end_time), "h:mm a")}` : ""}
                      </div>
                      {activity.retailers?.name && (
                        <div className="text-xs text-muted-foreground mt-0.5">{activity.retailers.name}</div>
                      )}
                      {activity.remarks && (
                        <div className="text-xs text-muted-foreground mt-0.5">{activity.remarks}</div>
                      )}
                    </div>
                  </div>
                ))}

                {/* Day End */}
                {timelineCheckOut && (
                  <div className="relative mb-2">
                    <div className="absolute -left-5 top-1 h-3 w-3 rounded-full bg-destructive border-2 border-background" />
                    <div>
                      <div className="font-bold text-sm">DAY END</div>
                      <div className="text-sm text-muted-foreground">{format(new Date(timelineCheckOut), "h:mm a")}</div>
                    </div>
                  </div>
                )}

                {/* Empty state */}
                {timelineActivities.length === 0 && !timelineCheckIn && (
                  <div className="text-center py-8 text-muted-foreground">
                    <p className="font-medium">No activities recorded for this date.</p>
                    <p className="text-sm mt-1">Activities will appear here once you place orders or record no-order reasons.</p>
                  </div>
                )}

                {timelineActivities.length === 0 && timelineCheckIn && (
                  <div className="text-center py-8 text-muted-foreground">
                    <p className="font-medium">No activities recorded for this date.</p>
                    <p className="text-sm mt-1">Activities will appear here once you place orders or record no-order reasons.</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Camera Capture Dialog */}
      <CameraCapture
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCapture={handleCameraCapture}
        title={cameraMode === "checkin" ? "Check-in Selfie" : "Check-out Selfie"}
      />

      {/* Face Registration Modal - shown when user tries to check in without a profile photo */}
      {userId && showFaceRegistration && (
        <ProfileSetupModal
          userId={userId}
          profilePictureUrl={null}
          onComplete={handleFaceRegistrationComplete}
        />
      )}
      </>
      )}
    </motion.div>
  );
}
