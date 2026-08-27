import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { getCurrentPosition } from "@/utils/nativePermissions";

interface AttendanceRecord {
  id: string;
  user_id: string;
  date: string;
  check_in_time: string | null;
  check_out_time: string | null;
  check_in_location: any;
  check_out_location: any;
  check_in_photo_url: string | null;
  check_out_photo_url: string | null;
  check_in_address: string | null;
  check_out_address: string | null;
  status: string;
  total_hours: number | null;
  face_verification_status: string | null;
  face_match_confidence: number | null;
}

interface Holiday {
  id: string;
  date: string;
  holiday_name: string;
}

interface WeekOffConfig {
  id: string;
  day_of_week: number;
  is_off: boolean;
  alternate_pattern: string | null;
}

interface LeaveRecord {
  id: string;
  from_date: string;
  to_date: string;
  status: string;
  is_half_day: boolean | null;
  half_day_period: string | null;
  leave_types?: { name: string } | { name: string }[] | null;
}

interface RegularizationRequest {
  id: string;
  date: string;
  status: string;
  requested_check_in_time: string | null;
  requested_check_out_time: string | null;
  reason: string | null;
  rejection_reason: string | null;
  created_at: string;
}

export const isWeekOffDate = (date: Date, weekOffConfigs: WeekOffConfig[]): boolean => {
  const dayOfWeek = date.getDay();
  const dayConfig = weekOffConfigs.filter(c => c.day_of_week === dayOfWeek && c.is_off);
  for (const config of dayConfig) {
    const pattern = config.alternate_pattern || "all";
    if (pattern === "all") return true;
    const weekNumber = Math.ceil(date.getDate() / 7);
    if (pattern === "1st_3rd" && (weekNumber === 1 || weekNumber === 3)) return true;
    if (pattern === "2nd_4th" && (weekNumber === 2 || weekNumber === 4)) return true;
  }
  return false;
};

interface CheckInData {
  photoUrl?: string;
  location?: any;
  faceVerificationStatus?: string;
  faceMatchConfidence?: number;
}

interface CheckOutData {
  photoUrl?: string;
  location?: any;
  faceVerificationStatus?: string;
  faceMatchConfidence?: number;
}

export function useAttendance(userId: string | undefined) {
  const [todayRecord, setTodayRecord] = useState<AttendanceRecord | null>(null);
  const [monthRecords, setMonthRecords] = useState<AttendanceRecord[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [weekOffConfig, setWeekOffConfig] = useState<WeekOffConfig[]>([]);
  const [leaveRecords, setLeaveRecords] = useState<LeaveRecord[]>([]);
  const [regularizationRequests, setRegularizationRequests] = useState<RegularizationRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const today = format(new Date(), "yyyy-MM-dd");

  const fetchData = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const [todayRes, monthRes, holidayRes, weekOffRes, leaveRes, regRes] = await Promise.all([
        supabase.from("attendance").select("*").eq("user_id", userId).eq("date", today).maybeSingle(),
        supabase.from("attendance").select("*").eq("user_id", userId).order("date", { ascending: false }),
        supabase.from("holidays").select("id, date, holiday_name"),
        supabase.from("week_off_config").select("*"),
        supabase.from("leave_applications").select("*, leave_types!leave_applications_leave_type_id_fkey(name)").eq("user_id", userId).order("created_at", { ascending: false }),
        supabase.from("regularization_requests").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
      ]);

      setTodayRecord(todayRes.data);
      setMonthRecords(monthRes.data || []);
      setHolidays(holidayRes.data || []);
      setWeekOffConfig(weekOffRes.data || []);
      const normalizedLeaves = (leaveRes.data || []).map((l: any) => ({
        ...l,
        leave_types: Array.isArray(l.leave_types) ? (l.leave_types.length > 0 ? l.leave_types[0] : null) : l.leave_types,
      }));
      setLeaveRecords(normalizedLeaves);
      setRegularizationRequests(regRes.data || []);
    } catch (err) {
      console.error("Error fetching attendance:", err);
    } finally {
      setLoading(false);
    }
  }, [userId, today]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Refetch when page becomes visible (e.g., returning from admin)
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        fetchData();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [fetchData]);

  const checkIn = async (data?: CheckInData) => {
    if (!userId) return;
    
    let location = data?.location || null;
    if (!location) {
      try {
        location = await getCurrentPosition();
      } catch {}
    }

    const now = new Date().toISOString();
    const insertData: any = {
      check_in_time: now,
      check_in_location: location,
      status: "present",
    };
    
    if (data?.photoUrl) insertData.check_in_photo_url = data.photoUrl;
    if (data?.faceVerificationStatus) insertData.face_verification_status = data.faceVerificationStatus;
    if (data?.faceMatchConfidence !== undefined) insertData.face_match_confidence = data.faceMatchConfidence;

    if (todayRecord) {
      const { error } = await supabase.from("attendance").update(insertData).eq("id", todayRecord.id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from("attendance").insert({ user_id: userId, date: today, ...insertData });
      if (error) throw error;
    }

    await fetchData();

    // Notify ALL active users about check-in (broadcast)
    try {
      const { broadcastNotificationToActiveUsers } = await import('@/utils/notificationHelpers');
      const { data: userData } = await supabase
        .from('users')
        .select('full_name')
        .eq('id', userId)
        .single();

      await broadcastNotificationToActiveUsers(userId, {
        title: `Check-In - ${userData?.full_name || 'Employee'}`,
        message: `Checked in at ${format(new Date(), 'h:mm a, MMM dd yyyy')}`,
        type: 'attendance',
        related_table: 'attendance',
      });
    } catch (notifError) {
      console.error('Error sending check-in notification:', notifError);
    }

  };

  const checkOut = async (data?: CheckOutData) => {
    if (!userId || !todayRecord) return;
    
    let location = data?.location || null;
    if (!location) {
      try {
        location = await getCurrentPosition();
      } catch {}
    }

    const now = new Date().toISOString();
    const checkInTime = new Date(todayRecord.check_in_time!);
    const totalHours = (new Date(now).getTime() - checkInTime.getTime()) / (1000 * 60 * 60);

    // Lock the day's final GPS distance at check-out so it never
    // fluctuates afterwards (shared algorithm with Day Tracking page)
    let lockedDistanceKm: number | null = null;
    try {
      const { data: track } = await supabase
        .from("gps_tracking")
        .select("latitude, longitude, timestamp, accuracy, speed")
        .eq("user_id", userId)
        .eq("date", today)
        .order("timestamp", { ascending: true });
      if (track && track.length >= 2) {
        const { computeFilteredDistanceKm } = await import("@/utils/gpsDistance");
        lockedDistanceKm = Math.round(computeFilteredDistanceKm(track as any) * 100) / 100;
      }
    } catch (e) {
      console.warn("[Attendance] Could not compute final distance:", e);
    }

    const updateData: any = {
      check_out_time: now,
      check_out_location: location,
      total_hours: Math.round(totalHours * 100) / 100,
    };
    if (lockedDistanceKm != null) updateData.total_distance_km = lockedDistanceKm;
    
    if (data?.photoUrl) updateData.check_out_photo_url = data.photoUrl;
    if (data?.faceVerificationStatus) updateData.face_verification_status_out = data.faceVerificationStatus;
    if (data?.faceMatchConfidence !== undefined) updateData.face_match_confidence_out = data.faceMatchConfidence;

    const { error } = await supabase.from("attendance").update(updateData).eq("id", todayRecord.id);
    if (error) throw error;

    // Let useGPSTracker know check-out succeeded so it can stop tracking
    // immediately instead of waiting for the next visibility-change re-check.
    window.dispatchEvent(new Event("attendance-changed"));

    await fetchData();

    // Notify ALL active users about check-out / Day End (broadcast)
    try {
      const { broadcastNotificationToActiveUsers } = await import('@/utils/notificationHelpers');
      const { data: userData } = await supabase
        .from('users')
        .select('full_name')
        .eq('id', userId)
        .single();

      await broadcastNotificationToActiveUsers(userId, {
        title: `Day End - ${userData?.full_name || 'Employee'}`,
        message: `Checked out at ${format(new Date(), 'h:mm a, MMM dd yyyy')}`,
        type: 'attendance',
        related_table: 'attendance',
      });
    } catch (notifError) {
      console.error('Error sending check-out notification:', notifError);
    }

  };

  // Build attendance map
  const attendanceMap: Record<string, string> = {};
  const holidayDates = new Set(holidays.map((h) => h.date));

  monthRecords.forEach((r) => {
    if ((r.status === "present" || r.status === "regularized") && r.check_in_time) {
      attendanceMap[r.date] = "present";
    } else if (r.status === "leave") {
      attendanceMap[r.date] = "leave";
    } else if (r.status === "half-day") {
      attendanceMap[r.date] = "half-day";
    } else {
      attendanceMap[r.date] = "absent";
    }
  });

  holidays.forEach((h) => {
    if (!attendanceMap[h.date]) attendanceMap[h.date] = "holiday";
  });

  const marketHours = useMemo(() => {
    if (!todayRecord?.check_in_time) return null;
    const checkInTime = new Date(todayRecord.check_in_time);
    const checkOutTime = todayRecord.check_out_time ? new Date(todayRecord.check_out_time) : new Date();
    const activeHours = (checkOutTime.getTime() - checkInTime.getTime()) / (1000 * 60 * 60);
    return {
      firstCheckIn: format(checkInTime, "h:mm a"),
      lastActivity: todayRecord.check_out_time ? format(checkOutTime, "h:mm a") : "Active",
      activeHours: Math.round(activeHours * 10) / 10,
    };
  }, [todayRecord]);

  const isCheckedIn = !!todayRecord?.check_in_time && !todayRecord?.check_out_time;
  const isCheckedOut = !!todayRecord?.check_out_time;

  return {
    todayRecord, monthRecords, attendanceMap, holidays, holidayDates, weekOffConfig,
    leaveRecords, regularizationRequests, marketHours, loading, isCheckedIn, isCheckedOut,
    checkIn, checkOut, refetch: fetchData,
  };
}
