import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Navigation, Route, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { computeFilteredDistanceKm } from "@/utils/gpsDistance";

interface GPSPoint {
  latitude: number;
  longitude: number;
  timestamp: string;
  accuracy?: number | null;
  speed?: number | null;
}

interface TodayGPSRouteProps {
  userId: string;
  /** Final distance saved at check-out. When set, this value is shown as-is
   *  and never recalculated — the day's distance is locked. */
  lockedDistanceKm?: number | null;
}

export function TodayGPSRoute({ userId, lockedDistanceKm }: TodayGPSRouteProps) {
  const [points, setPoints] = useState<GPSPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Distance is locked at check-out — no need to recompute from raw points
    if (lockedDistanceKm != null) {
      setLoading(false);
      return;
    }

    const fetchRoute = async () => {
      const today = format(new Date(), "yyyy-MM-dd");
      const { data } = await supabase
        .from("gps_tracking")
        .select("latitude, longitude, timestamp, accuracy, speed")
        .eq("user_id", userId)
        .eq("date", today)
        .order("timestamp", { ascending: true });

      if (data) setPoints(data as GPSPoint[]);
      setLoading(false);
    };
    fetchRoute();
  }, [userId, lockedDistanceKm]);

  const distanceKm =
    lockedDistanceKm != null
      ? lockedDistanceKm
      : computeFilteredDistanceKm(points);

  const firstPoint = points[0];
  const lastPoint = points[points.length - 1];

  const durationMin =
    firstPoint && lastPoint
      ? Math.round(
          (new Date(lastPoint.timestamp).getTime() -
            new Date(firstPoint.timestamp).getTime()) /
            60000
        )
      : 0;

  if (loading) return null;
  if (lockedDistanceKm == null && points.length < 2) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Route className="h-4 w-4 text-primary" />
          Today's Route
          {lockedDistanceKm != null && (
            <span className="text-xs font-normal text-muted-foreground">(final)</span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Navigation className="h-4 w-4 text-muted-foreground" />
            <span className="text-2xl font-bold">{distanceKm.toFixed(1)} km</span>
          </div>
          {durationMin > 0 && (
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              {durationMin >= 60
                ? `${Math.floor(durationMin / 60)}h ${durationMin % 60}m`
                : `${durationMin}m`}
            </div>
          )}
        </div>
        {firstPoint && lastPoint && (
          <div className="text-xs text-muted-foreground space-y-1">
            <p>
              Start: {format(new Date(firstPoint.timestamp), "h:mm a")} ·{" "}
              {firstPoint.latitude.toFixed(4)}, {firstPoint.longitude.toFixed(4)}
            </p>
            <p>
              Latest: {format(new Date(lastPoint.timestamp), "h:mm a")} ·{" "}
              {lastPoint.latitude.toFixed(4)}, {lastPoint.longitude.toFixed(4)}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
