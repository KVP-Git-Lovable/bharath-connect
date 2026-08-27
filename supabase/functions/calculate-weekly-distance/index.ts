import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface GPSPoint {
  latitude: number;
  longitude: number;
  timestamp: string;
  user_id: string;
  user_name?: string;
}

interface UserDistance {
  user_id: string;
  user_name: string;
  distance_km: number;
  points_count: number;
  api_cost_usd: number;
}

interface WeeklyReport {
  week_start: string;
  week_end: string;
  total_users: number;
  total_distance_km: number;
  total_distance_miles: number;
  average_distance_per_user_km: number;
  average_distance_per_user_miles: number;
  total_gps_points: number;
  api_cost_from_requests_usd: number;
  api_cost_from_distance_usd: number;
  total_api_cost_usd: number;
  user_breakdown: UserDistance[];
}

// Haversine formula to calculate distance between two points
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Calculate date range: last 7 days
    const today = new Date();
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

    const weekStart = weekAgo.toISOString().split("T")[0];
    const weekEnd = today.toISOString().split("T")[0];

    // Fetch GPS data for the week
    const { data: gpsData, error: gpsError } = await supabase
      .from("gps_tracking")
      .select("user_id, latitude, longitude, timestamp")
      .gte("date", weekStart)
      .lte("date", weekEnd)
      .order("user_id, timestamp", { ascending: true });

    if (gpsError) throw gpsError;

    // Fetch user names
    const { data: usersData } = await supabase
      .from("users")
      .select("id, full_name, email");

    const userMap = new Map(
      (usersData || []).map((u: any) => [u.id, u.full_name || u.email])
    );

    // Calculate distances by user
    const userDistances = new Map<string, { distance: number; points: number }>();
    const points = (gpsData || []) as GPSPoint[];

    // Group points by user
    const pointsByUser = new Map<string, GPSPoint[]>();
    for (const point of points) {
      if (!pointsByUser.has(point.user_id)) {
        pointsByUser.set(point.user_id, []);
      }
      pointsByUser.get(point.user_id)!.push(point);
    }

    // Calculate distance for each user
    for (const [userId, userPoints] of pointsByUser.entries()) {
      let totalDistance = 0;

      // Sort by timestamp to ensure proper distance calculation
      userPoints.sort((a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );

      // Calculate distances between consecutive points
      for (let i = 1; i < userPoints.length; i++) {
        const prev = userPoints[i - 1];
        const curr = userPoints[i];

        // Only count distances > 10 meters (filter GPS noise)
        const distance = haversineDistance(
          prev.latitude,
          prev.longitude,
          curr.latitude,
          curr.longitude
        );

        if (distance > 0.01) { // > 10 meters
          totalDistance += distance;
        }
      }

      userDistances.set(userId, {
        distance: Math.round(totalDistance * 100) / 100,
        points: userPoints.length,
      });
    }

    // Build response
    const userBreakdown: UserDistance[] = [];
    let totalDistance = 0;
    let totalPoints = 0;

    for (const [userId, stats] of userDistances.entries()) {
      const userName = userMap.get(userId) || "Unknown";
      const apiCost = stats.points * 0.005 + stats.distance * 0.001;

      userBreakdown.push({
        user_id: userId,
        user_name: userName,
        distance_km: stats.distance,
        points_count: stats.points,
        api_cost_usd: Math.round(apiCost * 10000) / 10000,
      });

      totalDistance += stats.distance;
      totalPoints += stats.points;
    }

    // Sort by distance descending
    userBreakdown.sort((a, b) => b.distance_km - a.distance_km);

    // Calculate totals
    const apiCostFromRequests = Math.round(totalPoints * 0.005 * 100) / 100;
    const apiCostFromDistance = Math.round(totalDistance * 0.001 * 100) / 100;
    const totalApiCost = Math.round((apiCostFromRequests + apiCostFromDistance) * 100) / 100;

    const report: WeeklyReport = {
      week_start: weekStart,
      week_end: weekEnd,
      total_users: userDistances.size,
      total_distance_km: Math.round(totalDistance * 100) / 100,
      total_distance_miles: Math.round(totalDistance * 0.621371 * 100) / 100,
      average_distance_per_user_km:
        userDistances.size > 0
          ? Math.round((totalDistance / userDistances.size) * 100) / 100
          : 0,
      average_distance_per_user_miles:
        userDistances.size > 0
          ? Math.round((totalDistance * 0.621371 / userDistances.size) * 100) / 100
          : 0,
      total_gps_points: totalPoints,
      api_cost_from_requests_usd: apiCostFromRequests,
      api_cost_from_distance_usd: apiCostFromDistance,
      total_api_cost_usd: totalApiCost,
      user_breakdown: userBreakdown,
    };

    return new Response(JSON.stringify(report), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
