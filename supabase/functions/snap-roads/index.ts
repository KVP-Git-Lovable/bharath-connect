import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_maps";

interface LatLng {
  lat: number;
  lng: number;
}

function isValidPoint(p: any): p is LatLng {
  return (
    p &&
    typeof p.lat === "number" &&
    typeof p.lng === "number" &&
    Math.abs(p.lat) <= 90 &&
    Math.abs(p.lng) <= 180
  );
}

function haversineMeters(a: LatLng, b: LatLng) {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

function rawDistanceMeters(points: LatLng[]) {
  let meters = 0;
  for (let i = 1; i < points.length; i++) {
    meters += haversineMeters(points[i - 1], points[i]);
  }
  return meters;
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function providerFallback(points: LatLng[], status: number, details: string) {
  console.error(`snapToRoads gateway failed [${status}]: ${details.slice(0, 500)}`);
  return jsonResponse({
    path: points,
    distanceMeters: rawDistanceMeters(points),
    snapped: false,
    error: "Road snapping unavailable; using recorded GPS trail distance",
    status,
    details: details.slice(0, 1000),
  });
}

/**
 * Snap raw GPS breadcrumbs onto real road geometry using the Google Roads API
 * (`snapToRoads` with interpolate=true) and return the road-following path plus
 * the distance measured ALONG that geometry.
 *
 * This is different from the Routes API (`snap-gps-route`): Routes answers
 * "what is the best path from A to B", which underestimates a real journey with
 * detours and U-turns. snapToRoads answers "which road segments did this trail
 * actually cover", which is what Google Maps Timeline reports.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const GOOGLE_MAPS_API_KEY = Deno.env.get("GOOGLE_MAPS_API_KEY");
    if (!LOVABLE_API_KEY || !GOOGLE_MAPS_API_KEY) {
      return jsonResponse({ error: "Google Maps connector is not configured" }, 500);
    }

    const body = await req.json().catch(() => ({}));
    const points: LatLng[] = Array.isArray(body?.points) ? body.points.filter(isValidPoint) : [];
    // Roads API accepts up to 100 points per snapToRoads request.
    if (points.length < 2 || points.length > 100) {
      return jsonResponse({ error: "Provide between 2 and 100 valid points" }, 400);
    }

    const path = points.map((p) => `${p.lat},${p.lng}`).join("|");
    const query = `interpolate=true&path=${encodeURIComponent(path)}`;

    const callGateway = () =>
      fetch(`${GATEWAY_URL}/roads/v1/snapToRoads?${query}`, {
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "X-Connection-Api-Key": GOOGLE_MAPS_API_KEY,
        },
      });

    let response = await callGateway();
    for (let attempt = 1; attempt <= 2 && [429, 500, 502, 503, 504].includes(response.status); attempt++) {
      await response.body?.cancel();
      const retryAfter = Number(response.headers.get("Retry-After"));
      await new Promise((r) => setTimeout(r, Number.isFinite(retryAfter) ? retryAfter * 1000 : attempt * 500));
      response = await callGateway();
    }

    if (response.status === 403) {
      const body = await response.text().catch(() => "");
      let message = "Google Maps request was denied (403). Check the server key's restrictions in Google Cloud Console.";
      try {
        const parsed = JSON.parse(body);
        const details: Array<{ reason?: string }> = parsed?.error?.details ?? [];
        const reason = details.find((d) => d.reason)?.reason;
        if (reason === "API_KEY_HTTP_REFERRER_BLOCKED") {
          message =
            'Google Maps server key is referrer-restricted. In Google Cloud Console, set the server key\'s application restrictions to "None" or "IP addresses".';
        } else if (reason === "API_KEY_SERVICE_BLOCKED") {
          message =
            "Google Maps server key does not allow the Roads API. In Google Cloud Console, add Roads API to the server key's allowed-APIs list.";
        }
      } catch { /* body is not JSON */ }
      return providerFallback(points, response.status, message);
    }

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      return providerFallback(points, response.status, text);
    }

    const data = await response.json();
    const snapped: LatLng[] = (data?.snappedPoints ?? [])
      .map((sp: any) => ({ lat: sp?.location?.latitude, lng: sp?.location?.longitude }))
      .filter(isValidPoint);

    if (snapped.length < 2) {
      return jsonResponse({
        path: points,
        distanceMeters: rawDistanceMeters(points),
        snapped: false,
        error: "No road geometry returned; using recorded GPS trail distance",
      });
    }

    let distanceMeters = 0;
    for (let i = 1; i < snapped.length; i++) {
      distanceMeters += haversineMeters(snapped[i - 1], snapped[i]);
    }

    return jsonResponse({ path: snapped, distanceMeters, snapped: true });
  } catch (e) {
    console.error("snap-roads error", e);
    return jsonResponse({ error: "Unexpected error" }, 500);
  }
});
