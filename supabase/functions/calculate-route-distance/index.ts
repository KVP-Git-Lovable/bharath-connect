import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const GOOGLE_MAPS_API_KEY = Deno.env.get("GOOGLE_MAPS_API_KEY");

interface GPSPoint {
  lat: number;
  lng: number;
  timestamp?: string;
}

interface DistanceResult {
  totalDistance: number; // in meters
  distanceKm: number; // in kilometers
  segments: Array<{
    from: string;
    to: string;
    distance: number; // in meters
    duration: number; // in seconds
  }>;
  error?: string;
}

async function getRouteDistance(points: GPSPoint[]): Promise<DistanceResult> {
  if (!points || points.length < 2) {
    return {
      totalDistance: 0,
      distanceKm: 0,
      segments: [],
      error: "At least 2 points required",
    };
  }

  if (!GOOGLE_MAPS_API_KEY) {
    return {
      totalDistance: 0,
      distanceKm: 0,
      segments: [],
      error: "Google Maps API key not configured",
    };
  }

  try {
    const segments: DistanceResult["segments"] = [];
    let totalDistance = 0;

    // Calculate distance between consecutive points
    for (let i = 0; i < points.length - 1; i++) {
      const from = points[i];
      const to = points[i + 1];

      const origin = `${from.lat},${from.lng}`;
      const destination = `${to.lat},${to.lng}`;

      const url = new URL("https://maps.googleapis.com/maps/api/directions/json");
      url.searchParams.append("origin", origin);
      url.searchParams.append("destination", destination);
      url.searchParams.append("mode", "driving");
      url.searchParams.append("key", GOOGLE_MAPS_API_KEY);

      const response = await fetch(url.toString());
      const data = await response.json();

      if (data.status === "OK" && data.routes.length > 0) {
        const route = data.routes[0];
        let segmentDistance = 0;
        let segmentDuration = 0;

        // Sum up all legs in the route
        route.legs.forEach((leg: any) => {
          segmentDistance += leg.distance.value; // in meters
          segmentDuration += leg.duration.value; // in seconds
        });

        totalDistance += segmentDistance;

        segments.push({
          from: origin,
          to: destination,
          distance: segmentDistance,
          duration: segmentDuration,
        });
      } else if (data.status === "ZERO_RESULTS") {
        // Route not found, use straight-line distance as fallback
        const straightLineDistance = calculateHaversineDistance(from, to);
        totalDistance += straightLineDistance;

        segments.push({
          from: origin,
          to: destination,
          distance: straightLineDistance,
          duration: 0,
        });
      } else {
        console.error(
          `Directions API error for segment ${i}: ${data.status}`,
          data.error_message
        );
      }

      // Add delay to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    return {
      totalDistance,
      distanceKm: Math.round((totalDistance / 1000) * 100) / 100, // Round to 2 decimals
      segments,
    };
  } catch (error) {
    console.error("Error calculating route distance:", error);
    return {
      totalDistance: 0,
      distanceKm: 0,
      segments: [],
      error: `Error: ${error.message}`,
    };
  }
}

function calculateHaversineDistance(
  point1: GPSPoint,
  point2: GPSPoint
): number {
  const R = 6371000; // Earth's radius in meters
  const dLat =
    ((point2.lat - point1.lat) * Math.PI) / 180;
  const dLng =
    ((point2.lng - point1.lng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((point1.lat * Math.PI) / 180) *
      Math.cos((point2.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

serve(async (req) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  try {
    const { points } = await req.json();

    if (!Array.isArray(points)) {
      return new Response(
        JSON.stringify({
          error: "Points must be an array of {lat, lng} objects",
        }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    const result = await getRouteDistance(points);

    return new Response(JSON.stringify(result), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: `Server error: ${error.message}`,
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }
});
