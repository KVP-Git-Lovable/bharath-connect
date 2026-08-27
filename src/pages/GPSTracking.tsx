import { useState, useEffect, useCallback, Suspense, lazy } from "react";
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
import { filterTrackPoints } from "@/utils/gpsDistance";


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
  const [gpsPoints, setGpsPoints] = useState<GPSPoint[]>([]);
  const [gpsStops, setGpsStops] = useState<GPSStop[]>([]);
  const [activityMarkers, setActivityMarkers] = useState<ActivityAtLocation[]>([]);
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [route, setRoute] = useState<SnappedRoute | null>(null);


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
        supabase
          .from("gps_tracking")
          .select("latitude, longitude, timestamp, speed, accuracy, date")
          .eq("user_id", userId)
          .gte("date", from)
          .lte("date", to)
          .order("timestamp", { ascending: true }),
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

      // Filter GPS points - remove noise/jitter while keeping real movement
      let points = (pointsRes.data || []) as (GPSPoint & { date?: string })[];
      const attendanceRows = (attendanceRes.data || []).filter((a: any) => a.check_in_time);
      const attendanceDates = new Set(attendanceRows.map((a: any) => a.date));

      // Keep points inside a check-in window; if a day has no attendance record
      // at all, keep that day's points rather than blanking the trail.
      const isInActiveSession = (p: { timestamp: string; date?: string }): boolean => {
        if (p.date && !attendanceDates.has(p.date)) return true;
        const pointTime = new Date(p.timestamp).getTime();
        return attendanceRows.some((a: any) => {
          const checkinTime = new Date(a.check_in_time).getTime();
          const checkoutTime = a.check_out_time ? new Date(a.check_out_time).getTime() : Infinity;
          return pointTime >= checkinTime && pointTime <= checkoutTime;
        });
      };

      const sessionFilteredPoints = points.filter((p) => isInActiveSession(p));


      // Shared filtering — identical algorithm on web, dashboard, and APK
      // (accuracy ≤100m, 20m stationary jitter, 160 km/h jump, 5-min gap split)
      const cleanedPoints = filterTrackPoints(sessionFilteredPoints) as GPSPoint[];


      console.log("Filtered from", points.length, "to", cleanedPoints.length, "points");
      setGpsPoints(cleanedPoints);
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

  // Resolve the real road route + distance once per set of GPS points
  const routeKey = gpsPoints.map((p) => `${p.latitude.toFixed(5)},${p.longitude.toFixed(5)}`).join("|");
  useEffect(() => {
    let cancelled = false;
    if (gpsPoints.length < 2) {
      setRoute(null);
      return;
    }
    getSnappedRoute(gpsPoints)
      .then((res) => !cancelled && setRoute(res))
      .catch(() => !cancelled && setRoute(null));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeKey]);



  // Build markers
  const allMapMarkers = [
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
  ];

  // Straight-line fallback estimate
  const haversineDistance = gpsPoints.length > 1
    ? gpsPoints.reduce((acc, p, i) => {
        if (i === 0) return 0;
        const prev = gpsPoints[i - 1];
        const R = 6371;
        const dLat = ((p.latitude - prev.latitude) * Math.PI) / 180;
        const dLon = ((p.longitude - prev.longitude) * Math.PI) / 180;
        const a =
          Math.sin(dLat / 2) ** 2 +
          Math.cos((prev.latitude * Math.PI) / 180) *
            Math.cos((p.latitude * Math.PI) / 180) *
            Math.sin(dLon / 2) ** 2;
        return acc + R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      }, 0)
    : 0;

  // Real road distance snapped onto actual roads (falls back to straight-line)
  const isRoadDistance = route?.distanceMeters != null;
  const totalDistance = isRoadDistance ? (route!.distanceMeters as number) / 1000 : haversineDistance;

  // Capture diagnostics — a long hole in the trail means the phone stopped
  // reporting (Doze / battery optimisation), and no route API can recover
  // kilometres that were never recorded.
  const longestGapMinutes = gpsPoints.reduce((max, p, i) => {
    if (i === 0) return 0;
    const gap =
      (new Date(p.timestamp).getTime() - new Date(gpsPoints[i - 1].timestamp).getTime()) / 60000;
    return Math.max(max, gap);
  }, 0);

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

  const UserSelector = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
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
                <UserSelector value={currentSelectedUser} onChange={setCurrentSelectedUser} />
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
                  <UserSelector value={selectedUser} onChange={setSelectedUser} />
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
            <div className="grid grid-cols-3 gap-2">
              <Card className="shadow-card">
                <CardContent className="p-3 text-center">
                  <Navigation className="h-4 w-4 mx-auto mb-1 text-primary" />
                  <p className="text-xs text-muted-foreground">Distance</p>
                  <p className="text-sm font-semibold">{totalDistance.toFixed(1)} km</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {isRoadDistance ? (route?.snapped ? "road-snapped" : "part estimated") : "estimated"}
                  </p>

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
