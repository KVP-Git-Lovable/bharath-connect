import { useState, useEffect, useCallback, useMemo, Suspense, lazy } from "react";
import { motion } from "framer-motion";
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { MapPin, AlertTriangle, RefreshCw, Clock, Navigation, CalendarIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getCurrentPosition, openAppSettings, isNative, prepareNativeLocationSettings } from "@/utils/nativePermissions";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useGPSTeamMembers } from "@/hooks/useGPSTeamMembers";
import { getSnappedRoute, type SnappedRoute } from "@/utils/googleRoute";
import {
  processTrajectory,
  GPS_PROCESSING_CONFIG,
  type ProcessedTrajectory,
} from "@/utils/gpsDistance";
import { filterPointsByAttendance } from "@/utils/attendanceGate";
import { getGpsQueueStats, flushPendingGpsPoints, type GpsQueueStats } from "@/services/gpsSyncQueue";


const GoogleTrackMap = lazy(() =>
  import("@/components/GoogleTrackMap").catch(() => {
    window.location.reload();
    return import("@/components/GoogleTrackMap");
  })
);


type DateRangeOption = "today" | "this_week" | "this_month" | "custom";

interface GPSPoint {
  latitude: number;
  longitude: number;
  timestamp: string;
  speed: number | null;
  accuracy: number | null;
  heading?: number | null;
}

interface GPSStop {
  latitude: number;
  longitude: number;
  timestamp: string;
  duration_minutes: number | null;
  reason: string | null;
}

interface ActivityAtLocation {
  lat: number;
  lng: number;
  name: string;
  activity_type?: string;
  status?: string;
  timestamp?: string;
}

const MapFallback = () => (
  <div className="h-full w-full flex items-center justify-center bg-muted">
    <p className="text-sm text-muted-foreground">Loading map...</p>
  </div>
);

const UserSelector = ({
  value,
  onChange,
  teamMembers,
  currentUserId,
}: {
  value: string;
  onChange: (v: string) => void;
  teamMembers: { id: string; full_name: string }[];
  currentUserId: string | null;
}) => (
  <Select value={value} onValueChange={onChange}>
    <SelectTrigger>
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="me">My Data</SelectItem>
      {teamMembers
        .filter((m) => m.id !== currentUserId)
        .map((m) => (
          <SelectItem key={m.id} value={m.id}>{m.full_name}</SelectItem>
        ))}
    </SelectContent>
  </Select>
);

// Supabase caps a single select at 1000 rows; a dense tracking day (or a
// week/month range) exceeds that. Page until exhausted; if the hard safety
// cap is ever hit, say so instead of presenting partial data as complete.
const GPS_FETCH_PAGE_SIZE = 1000;
const GPS_FETCH_MAX_PAGES = 30;

async function fetchAllGpsRows(
  userId: string,
  from: string,
  to: string
): Promise<{ rows: (GPSPoint & { date?: string })[]; truncated: boolean }> {
  const rows: (GPSPoint & { date?: string })[] = [];
  for (let page = 0; page < GPS_FETCH_MAX_PAGES; page++) {
    const { data, error } = await supabase
      .from("gps_tracking")
      .select("latitude, longitude, timestamp, speed, accuracy, heading, date")
      .eq("user_id", userId)
      .gte("date", from)
      .lte("date", to)
      .order("timestamp", { ascending: true })
      .order("id", { ascending: true })
      .range(page * GPS_FETCH_PAGE_SIZE, (page + 1) * GPS_FETCH_PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as (GPSPoint & { date?: string })[]));
    if (!data || data.length < GPS_FETCH_PAGE_SIZE) return { rows, truncated: false };
  }
  return { rows, truncated: true };
}

export default function GPSTracking() {
  const [activeTab, setActiveTab] = useState("current");
  const { currentUserId, isAdmin, teamMembers } = useGPSTeamMembers();
  const { toast } = useToast();

  // ===== Current Location state =====
  const [currentSelectedUser, setCurrentSelectedUser] = useState<string>("me");
  const [currentLocation, setCurrentLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationAccuracy, setLocationAccuracy] = useState<number | null>(null);
  const [locationError, setLocationError] = useState(false);
  const [fetchingUserLocation, setFetchingUserLocation] = useState(false);

  // ===== Day Tracking state =====
  const [dateRangeOption, setDateRangeOption] = useState<DateRangeOption>("today");
  const [customFromDate, setCustomFromDate] = useState<Date | undefined>(new Date());
  const [customToDate, setCustomToDate] = useState<Date | undefined>(new Date());
  const [selectedUser, setSelectedUser] = useState<string>("me");
  const [trajectory, setTrajectory] = useState<ProcessedTrajectory | null>(null);
  const [latestFix, setLatestFix] = useState<GPSPoint | null>(null);
  const [gpsStops, setGpsStops] = useState<GPSStop[]>([]);
  const [activityMarkers, setActivityMarkers] = useState<ActivityAtLocation[]>([]);
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [route, setRoute] = useState<SnappedRoute | null>(null);
  // Internal flag: the paged GPS fetch hit its hard safety cap, so the
  // dataset (and therefore the distance) is incomplete. Not shown in the UI
  // yet, but the system must know the day was truncated.
  const [trackingDataTruncated, setTrackingDataTruncated] = useState(false);
  // Local capture/sync health: distinguishes "nothing captured" from
  // "captured but stuck in the device queue" without attaching DevTools.
  const [queueStats, setQueueStats] = useState<GpsQueueStats>(() => getGpsQueueStats());

  useEffect(() => {
    const tick = () => setQueueStats(getGpsQueueStats());
    tick();
    const id = window.setInterval(tick, 10_000);
    return () => window.clearInterval(id);
  }, []);




  // Get own location
  useEffect(() => {
    if (currentSelectedUser === "me") {
      setLocationAccuracy(null);
      getCurrentPosition({ enableHighAccuracy: true, timeout: 20000 })
        .then((pos) => {
          setCurrentLocation({ lat: pos.latitude, lng: pos.longitude });
          setLocationAccuracy(pos.accuracy ?? null);
          setLocationError(false);
        })
        .catch(() => setLocationError(true));
    }
  }, [currentSelectedUser]);

  // Fetch selected user's latest GPS location
  useEffect(() => {
    if (!currentUserId || currentSelectedUser === "me") return;

    const fetchUserLocation = async () => {
      setFetchingUserLocation(true);
      setLocationError(false);
      try {
        const today = format(new Date(), "yyyy-MM-dd");
        const userId = currentSelectedUser === "me" ? currentUserId : currentSelectedUser;
        const { data } = await supabase
          .from("gps_tracking")
          .select("latitude, longitude, timestamp")
          .eq("user_id", userId)
          .eq("date", today)
          .order("timestamp", { ascending: false })
          .limit(1);

        if (data && data.length > 0) {
          setCurrentLocation({ lat: Number(data[0].latitude), lng: Number(data[0].longitude) });
        } else {
          setCurrentLocation(null);
          setLocationError(true);
        }
      } catch {
        setLocationError(true);
      } finally {
        setFetchingUserLocation(false);
      }
    };
    fetchUserLocation();
  }, [currentUserId, currentSelectedUser]);

  const retryLocation = () => {
    setLocationError(false);
    setLocationAccuracy(null);
    if (currentSelectedUser === "me") {
      getCurrentPosition({ enableHighAccuracy: true, timeout: 20000 })
        .then((pos) => {
          setCurrentLocation({ lat: pos.latitude, lng: pos.longitude });
          setLocationAccuracy(pos.accuracy ?? null);
        })
        .catch(() => setLocationError(true));
    } else {
      // Re-trigger by toggling user
      const u = currentSelectedUser;
      setCurrentSelectedUser("me");
      setTimeout(() => setCurrentSelectedUser(u), 50);
    }
  };

  // ===== Day Tracking logic =====
  const getDateRange = useCallback((): { from: string; to: string } => {
    const today = new Date();
    switch (dateRangeOption) {
      case "today":
        return { from: format(today, "yyyy-MM-dd"), to: format(today, "yyyy-MM-dd") };
      case "this_week":
        return {
          from: format(startOfWeek(today, { weekStartsOn: 1 }), "yyyy-MM-dd"),
          to: format(endOfWeek(today, { weekStartsOn: 1 }), "yyyy-MM-dd"),
        };
      case "this_month":
        return {
          from: format(startOfMonth(today), "yyyy-MM-dd"),
          to: format(endOfMonth(today), "yyyy-MM-dd"),
        };
      case "custom":
        return {
          from: customFromDate ? format(customFromDate, "yyyy-MM-dd") : format(today, "yyyy-MM-dd"),
          to: customToDate ? format(customToDate, "yyyy-MM-dd") : format(today, "yyyy-MM-dd"),
        };
      default:
        return { from: format(today, "yyyy-MM-dd"), to: format(today, "yyyy-MM-dd") };
    }
  }, [dateRangeOption, customFromDate, customToDate]);

  const fetchTrackingData = useCallback(async () => {
    if (!currentUserId) return;
    const userId = selectedUser === "me" ? currentUserId : selectedUser;
    const { from, to } = getDateRange();
    setTrackingLoading(true);
    try {
      const [pointsRes, attendanceRes, stopsRes, activitiesRes] = await Promise.all([
        fetchAllGpsRows(userId, from, to),
        // Check-in windows live in `attendance` (activity_sessions is unused)
        supabase
          .from("attendance")
          .select("date, check_in_time, check_out_time")
          .eq("user_id", userId)
          .gte("date", from)
          .lte("date", to),
        supabase
          .from("gps_tracking_stops")
          .select("latitude, longitude, timestamp, duration_minutes, reason")
          .eq("user_id", userId)
          .gte("timestamp", `${from}T00:00:00`)
          .lte("timestamp", `${to}T23:59:59`),
        supabase
          .from("activity_events")
          .select("activity_name, activity_type, status, status_change_lat, status_change_lng, status_changed_at, location_lat, location_lng, start_time")
          .eq("user_id", userId)
          .gte("activity_date", from)
          .lte("activity_date", to),
      ]);

      const { rows: points, truncated } = pointsRes;
      setTrackingDataTruncated(truncated);

      // Attendance gating: points inside a check-in window; a day with no
      // attendance record keeps its points rather than blanking the trail
      // (grace + open-session + overnight rules live in attendanceGate.ts).
      const sessionFilteredPoints = filterPointsByAttendance(
        points,
        (attendanceRes.data || []) as {
          date: string;
          check_in_time: string | null;
          check_out_time: string | null;
        }[]
      );

      // Validated-trajectory engine — shared algorithm on web, dashboard, APK
      // (sort, dedup, accuracy bands, jump + stationary + gap handling).
      const processed = processTrajectory(sessionFilteredPoints);
      setTrajectory(processed);

      // The stationary filter collapses a cluster, so the "Latest" reading can
      // lag. Track the last usable raw fix for DISPLAY ONLY (pins/timeline) —
      // it never enters the trajectory, the snapping input, or the distance.
      const lastRaw = [...sessionFilteredPoints]
        .reverse()
        .find(
          (p) => p.accuracy != null && p.accuracy <= GPS_PROCESSING_CONFIG.MAX_ACCURACY_METERS
        );
      setLatestFix((lastRaw as GPSPoint) ?? null);

      if (import.meta.env.DEV) {
        console.debug("[GPSTracking] processed", {
          ...processed.metrics,
          trackingDataTruncated: truncated,
          rawRowsFetched: points.length,
        });
        if (truncated) {
          console.warn(
            `[GPSTracking] GPS fetch hit the ${GPS_FETCH_MAX_PAGES}-page safety cap — dataset is incomplete`
          );
        }
      }

      setGpsStops(stopsRes.data || []);

      const markers: ActivityAtLocation[] = [];
      (activitiesRes.data || []).forEach((a: any) => {
        const lat = a.status_change_lat || a.location_lat;
        const lng = a.status_change_lng || a.location_lng;
        if (lat && lng) {
          markers.push({
            lat: Number(lat),
            lng: Number(lng),
            name: `${a.activity_name} (${a.activity_type})`,
            activity_type: a.activity_type,
            status: a.status,
            timestamp: a.status_changed_at || a.start_time,
          });
        }
      });
      setActivityMarkers(markers);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setTrackingLoading(false);
    }
  }, [currentUserId, selectedUser, getDateRange, toast]);

  useEffect(() => {
    if (activeTab === "tracking") {
      fetchTrackingData();
    }
  }, [activeTab, fetchTrackingData]);

  // Display trajectory: validated points, plus the latest raw fix appended
  // for the pins/timeline (display only — never part of the distance).
  const gpsPoints = useMemo<GPSPoint[]>(() => {
    const pts = (trajectory?.points ?? []) as GPSPoint[];
    if (
      latestFix &&
      (pts.length === 0 || pts[pts.length - 1].timestamp !== latestFix.timestamp)
    ) {
      return [...pts, latestFix];
    }
    return pts;
  }, [trajectory, latestFix]);

  // Resolve the real road route + distance once per processed trajectory.
  // Validated segments go to snapping — the engine is the only segmentation
  // authority, and gap bridging distance comes back classified as estimated.
  useEffect(() => {
    let cancelled = false;
    if (!trajectory || trajectory.points.length < 2) {
      setRoute(null);
      return;
    }
    getSnappedRoute(trajectory.segments)
      .then((res) => !cancelled && setRoute(res))
      .catch(() => !cancelled && setRoute(null));
    return () => {
      cancelled = true;
    };
  }, [trajectory]);

  // Build markers (stable identity — the map tears down overlays on change)
  const allMapMarkers = useMemo(
    () => [
      ...gpsStops.map((s) => ({
        lat: s.latitude,
        lng: s.longitude,
        name: s.reason || `Stop (${s.duration_minutes || 0} min)`,
      })),
      ...activityMarkers.map((a) => ({
        lat: a.lat,
        lng: a.lng,
        name: `${a.name}${a.status ? ` · ${a.status}` : ""}${a.timestamp ? ` · ${format(new Date(a.timestamp), "hh:mm a")}` : ""}`,
      })),
    ],
    [gpsStops, activityMarkers]
  );

  // Distance ladder: road-snapped total when routing succeeded, otherwise the
  // validated trajectory distance. Raw unfiltered GPS distance is never used.
  const isRoadDistance = route?.distanceMeters != null;
  const totalDistance = isRoadDistance
    ? (route!.distanceMeters as number) / 1000
    : trajectory?.trackedDistanceKm ?? 0;
  // Kilometres reconstructed across tracking blackouts (estimated, not recorded)
  const bridgedKm = (route?.estimatedMeters ?? 0) / 1000;
  // Truthful label: "road-snapped" only when snapping genuinely completed with
  // no estimated stretch; anything mixed/bridged reads "part estimated".
  const distanceLabel = isRoadDistance
    ? route!.source === "road-snapped"
      ? "road-snapped"
      : "part estimated"
    : "estimated";

  // Capture diagnostics — a long hole in the trail means the phone stopped
  // reporting (Doze / battery optimisation), and no route API can recover
  // kilometres that were never recorded.
  const longestGapMinutes = trajectory?.metrics.longestGapMinutes ?? 0;

  // Android won't let an app silently disable its own battery optimisation
  // or upgrade location to "Allow all the time" — both need the user's tap
  // in Settings. This opens the app's settings screen directly instead of
  // leaving the user to find Battery/Permissions themselves.
  const handleFixTrackingGap = async () => {
    if (isNative()) {
      await prepareNativeLocationSettings();
      toast({
        title: "Device settings opened",
        description: "Allow the battery prompt if shown, then set Location to \"Allow all the time\" and Battery to Unrestricted.",
      });
      return;
    }

    const opened = await openAppSettings();
    if (!opened) {
      toast({
        title: isNative() ? "Couldn't open settings" : "Not available on web",
        description: "Open your device Settings > Apps, find this app, then set Battery to Unrestricted and Location to \"Allow all the time\".",
      });
    }
  };




  const firstPoint = gpsPoints.length > 0 ? gpsPoints[0] : null;
  const lastPoint = gpsPoints.length > 0 ? gpsPoints[gpsPoints.length - 1] : null;
  const { from: displayFrom, to: displayTo } = getDateRange();

  const hasTeamMembers = teamMembers.length > 0;

  const selectedCurrentUserName = currentSelectedUser === "me"
    ? "My Location"
    : teamMembers.find(m => m.id === currentSelectedUser)?.full_name || "Selected User";

  return (
    <motion.div
      className="p-4 space-y-4 max-w-4xl mx-auto"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div>
        <h1 className="text-2xl font-bold">GPS Track</h1>
        <p className="text-sm text-muted-foreground">Monitor field movement with GPS tracking</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full">
          <TabsTrigger value="current" className="flex-1">Current Location</TabsTrigger>
          <TabsTrigger value="tracking" className="flex-1">Day Tracking</TabsTrigger>
        </TabsList>

        {/* ========== CURRENT LOCATION TAB ========== */}
        <TabsContent value="current" className="mt-4 space-y-3">
          {/* User selector for admins/managers */}
          {hasTeamMembers && (
            <Card className="shadow-card">
              <CardContent className="p-4 space-y-2">
                <p className="text-sm font-medium">Select User</p>
                <UserSelector
                  value={currentSelectedUser}
                  onChange={setCurrentSelectedUser}
                  teamMembers={teamMembers}
                  currentUserId={currentUserId}
                />
              </CardContent>
            </Card>
          )}

          {currentSelectedUser === "me" && currentLocation && locationAccuracy != null && (
            <div className={cn(
              "flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-xs",
              locationAccuracy > 500 ? "bg-accent/10 border-accent/40 text-accent-foreground" : "bg-muted/40"
            )}>
              <span>
                Accuracy: ±{locationAccuracy < 1000 ? `${Math.round(locationAccuracy)} m` : `${(locationAccuracy / 1000).toFixed(1)} km`}
                {locationAccuracy > 500 && " — low accuracy (Wi-Fi/IP based). Enable device GPS or move near a window for a better fix."}
              </span>
              <Button variant="ghost" size="sm" className="h-7 px-2" onClick={retryLocation}>
                <RefreshCw className="h-3.5 w-3.5 mr-1" /> Refresh
              </Button>
            </div>
          )}


          <Card className="shadow-card overflow-hidden">
            <CardContent className="p-0">
              <div className="h-[500px] relative">
                {fetchingUserLocation ? (
                  <MapFallback />
                ) : (
                  <Suspense fallback={<MapFallback />}>
                    <GoogleTrackMap
                      location={currentLocation}
                      activityMarkers={currentLocation ? [{
                        lat: currentLocation.lat,
                        lng: currentLocation.lng,
                        name: selectedCurrentUserName,
                      }] : []}
                    />
                  </Suspense>
                )}

                {locationError && !fetchingUserLocation && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/80 z-10">
                    <AlertTriangle className="h-10 w-10 text-accent mb-2" />
                    <p className="font-semibold text-sm">Location Unavailable</p>
                    <p className="text-xs text-muted-foreground text-center max-w-xs mt-1">
                      {currentSelectedUser === "me"
                        ? "Location permission denied. Please enable location access in your device settings."
                        : "No GPS data found for this user today."}
                    </p>
                    <Button variant="outline" size="sm" className="mt-3" onClick={retryLocation}>
                      <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                      Retry
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ========== DAY TRACKING TAB ========== */}
        <TabsContent value="tracking" className="mt-4 space-y-4">
          <Card className="shadow-card">
            <CardContent className="p-4 space-y-3">
              {hasTeamMembers && (
                <>
                  <p className="text-sm font-medium">Select Team Member</p>
                  <UserSelector
                    value={selectedUser}
                    onChange={setSelectedUser}
                    teamMembers={teamMembers}
                    currentUserId={currentUserId}
                  />
                </>
              )}

              <p className="text-sm font-medium">Select Date Range</p>
              <Select value={dateRangeOption} onValueChange={(v) => setDateRangeOption(v as DateRangeOption)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="this_week">This Week</SelectItem>
                  <SelectItem value="this_month">This Month</SelectItem>
                  <SelectItem value="custom">Custom Date Range</SelectItem>
                </SelectContent>
              </Select>

              {dateRangeOption === "custom" && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">From</p>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm" className={cn("w-full justify-start text-left font-normal", !customFromDate && "text-muted-foreground")}>
                          <CalendarIcon className="h-3.5 w-3.5 mr-1.5" />
                          {customFromDate ? format(customFromDate, "MMM d, yyyy") : "Pick date"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar mode="single" selected={customFromDate} onSelect={setCustomFromDate} initialFocus className="p-3 pointer-events-auto" />
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">To</p>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm" className={cn("w-full justify-start text-left font-normal", !customToDate && "text-muted-foreground")}>
                          <CalendarIcon className="h-3.5 w-3.5 mr-1.5" />
                          {customToDate ? format(customToDate, "MMM d, yyyy") : "Pick date"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar mode="single" selected={customToDate} onSelect={setCustomToDate} initialFocus className="p-3 pointer-events-auto" />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
              )}

              <p className="text-xs text-muted-foreground">
                Showing: {format(new Date(displayFrom + "T00:00:00"), "MMM d")}
                {displayFrom !== displayTo && ` — ${format(new Date(displayTo + "T00:00:00"), "MMM d, yyyy")}`}
                {displayFrom === displayTo && `, ${format(new Date(displayFrom + "T00:00:00"), "yyyy")}`}
              </p>
            </CardContent>
          </Card>

          {/* Summary cards */}
          {gpsPoints.length > 0 && (
            <div className="grid grid-cols-3 gap-2" data-truncated={trackingDataTruncated || undefined}>
              <Card className="shadow-card">
                <CardContent className="p-3 text-center">
                  <Navigation className="h-4 w-4 mx-auto mb-1 text-primary" />
                  <p className="text-xs text-muted-foreground">Distance</p>
                  <p className="text-sm font-semibold">{totalDistance.toFixed(1)} km</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {distanceLabel}
                  </p>
                  {bridgedKm >= 0.1 && (
                    <p className="text-[10px] text-amber-600 mt-0.5">
                      incl. {bridgedKm.toFixed(1)} km across tracking gaps
                    </p>
                  )}


                </CardContent>
              </Card>
              <Card className="shadow-card">
                <CardContent className="p-3 text-center">
                  <MapPin className="h-4 w-4 mx-auto mb-1 text-primary" />
                  <p className="text-xs text-muted-foreground">Points</p>
                  <p className="text-sm font-semibold">{gpsPoints.length}</p>
                </CardContent>
              </Card>
              <Card className="shadow-card">
                <CardContent className="p-3 text-center">
                  <Clock className="h-4 w-4 mx-auto mb-1 text-primary" />
                  <p className="text-xs text-muted-foreground">Activities</p>
                  <p className="text-sm font-semibold">{activityMarkers.length}</p>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Tracking-gap warning: recorded distance can only be as complete as the trail */}
          {gpsPoints.length > 1 && longestGapMinutes > 15 && (
            <Card className="shadow-card border-destructive/40 bg-destructive/5">
              <CardContent className="p-3 space-y-2">
                <p className="text-xs font-semibold text-destructive">
                  Tracking gap detected — {Math.round(longestGapMinutes)} min without a location fix
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Distance travelled during the gap could not be recorded. Set Battery to
                  Unrestricted and Location to "Allow all the time" for this app to capture the
                  full route.
                </p>
                <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={handleFixTrackingGap}>
                  Open Settings
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Sync health: points captured on this device but not yet uploaded */}
          {(queueStats.pending > 0 || queueStats.dropped > 0 || queueStats.lastError) && (
            <Card className="shadow-card">
              <CardContent className="p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold">Location sync</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={async () => {
                      await flushPendingGpsPoints();
                      setQueueStats(getGpsQueueStats());
                    }}
                  >
                    Sync now
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {queueStats.pending} point{queueStats.pending === 1 ? "" : "s"} waiting on this
                  device
                  {queueStats.dropped > 0 && ` · ${queueStats.dropped} discarded`}
                  {queueStats.failures > 0 && ` · ${queueStats.failures} failed attempt(s)`}
                </p>
                {queueStats.lastError && (
                  <p className="text-[11px] text-destructive">Last error: {queueStats.lastError}</p>
                )}
              </CardContent>
            </Card>
          )}



          {/* Timeline info */}
          {firstPoint && lastPoint && (
            <Card className="shadow-card">
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <div>
                    <p className="text-muted-foreground">Start</p>
                    <p className="font-medium">{format(new Date(firstPoint.timestamp), "hh:mm a")}</p>
                  </div>
                  <div className="flex-1 mx-3 border-t border-dashed border-muted-foreground/30" />
                  <div className="text-right">
                    <p className="text-muted-foreground">Latest</p>
                    <p className="font-medium">{format(new Date(lastPoint.timestamp), "hh:mm a")}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Map */}
          <Card className="shadow-card overflow-hidden">
            <CardContent className="p-0">
              <div className="h-[400px] relative">
                {trackingLoading ? (
                  <MapFallback />
                ) : gpsPoints.length > 0 || activityMarkers.length > 0 ? (
                  <>
                    <Suspense fallback={<MapFallback />}>
                      <GoogleTrackMap
                        gpsPoints={gpsPoints}
                        activityMarkers={allMapMarkers}
                        routePath={route?.path ?? null}
                      />
                    </Suspense>
                    <div className="absolute top-2 right-2 z-[400] bg-primary text-primary-foreground text-xs font-semibold px-3 py-1.5 rounded-full shadow-md">
                      Traveled: {totalDistance.toFixed(1)} km
                    </div>

                  </>
                ) : (
                  <div className="h-full w-full flex flex-col items-center justify-center bg-muted/50">
                    <MapPin className="h-12 w-12 mb-3 text-muted-foreground/50" />
                    <p className="text-sm font-semibold text-muted-foreground">No tracking data</p>
                    <p className="text-xs text-muted-foreground mt-1">No GPS data found for this period</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Activity & Stops list */}
          {(activityMarkers.length > 0 || gpsStops.length > 0) && (
            <Card className="shadow-card">
              <CardContent className="p-4 space-y-3">
                <p className="text-sm font-medium">Locations & Activities</p>
                {activityMarkers.map((a, i) => (
                  <div key={`act-${i}`} className="flex items-start gap-3 text-xs border-b border-border pb-2 last:border-0 last:pb-0">
                    <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Navigation className="h-3 w-3 text-primary" />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium">{a.name}</p>
                      <p className="text-muted-foreground">
                        {a.status && <span className="capitalize">{a.status}</span>}
                        {a.timestamp && ` · ${format(new Date(a.timestamp), "hh:mm a")}`}
                      </p>
                    </div>
                  </div>
                ))}
                {gpsStops.map((stop, i) => (
                  <div key={`stop-${i}`} className="flex items-start gap-3 text-xs border-b border-border pb-2 last:border-0 last:pb-0">
                    <div className="w-6 h-6 rounded-full bg-accent/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <MapPin className="h-3 w-3 text-accent-foreground" />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium">{stop.reason || "Stop"}</p>
                      <p className="text-muted-foreground">
                        {format(new Date(stop.timestamp), "hh:mm a")}
                        {stop.duration_minutes ? ` · ${stop.duration_minutes} min` : ""}
                      </p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </motion.div>
  );
}
