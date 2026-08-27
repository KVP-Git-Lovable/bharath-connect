const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const GOOGLE_MAPS_API_KEY = Deno.env.get("GOOGLE_MAPS_API_KEY");
    if (!LOVABLE_API_KEY || !GOOGLE_MAPS_API_KEY) {
      return new Response(JSON.stringify({ error: "Google Maps connector is not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const points: LatLng[] = Array.isArray(body?.points) ? body.points.filter(isValidPoint) : [];
    if (points.length < 2 || points.length > 27) {
      return new Response(JSON.stringify({ error: "Provide between 2 and 27 valid points" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const wp = (p: LatLng) => ({ location: { latLng: { latitude: p.lat, longitude: p.lng } } });

    const requestBody = JSON.stringify({
      origin: wp(points[0]),
      destination: wp(points[points.length - 1]),
      intermediates: points.slice(1, -1).map(wp),
      travelMode: "DRIVE",
      polylineQuality: "HIGH_QUALITY",
    });

    const callGateway = () =>
      fetch(`${GATEWAY_URL}/routes/directions/v2:computeRoutes`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "X-Connection-Api-Key": GOOGLE_MAPS_API_KEY,
          "Content-Type": "application/json",
          "X-Goog-FieldMask": "routes.polyline.encodedPolyline,routes.distanceMeters,routes.duration",
        },
        body: requestBody,
      });

    // The gateway occasionally drops the upstream connection (502/503/504).
    // Retry those transient failures with a short backoff before giving up.
    let response = await callGateway();
    for (let attempt = 1; attempt <= 2 && [429, 500, 502, 503, 504].includes(response.status); attempt++) {
      await response.body?.cancel();
      await new Promise((r) => setTimeout(r, attempt * 500));
      console.warn(`Routes gateway transient failure, retry ${attempt}`);
      response = await callGateway();
    }

    if (response.status === 403) {
      const details: Array<{ reason?: string }> = (await response.json().catch(() => ({})))?.error?.details ?? [];
      const reason = details.find((d) => d.reason)?.reason;
      let message = "Google Maps request was denied (403). Check the server key's restrictions in Google Cloud Console.";
      if (reason === "API_KEY_HTTP_REFERRER_BLOCKED") {
        message =
          'Google Maps server key is referrer-restricted. In Google Cloud Console, set the server key\'s application restrictions to "None" or "IP addresses".';
      } else if (reason === "API_KEY_SERVICE_BLOCKED") {
        message =
          "Google Maps server key does not allow the Routes API. In Google Cloud Console, add Routes API to the server key's allowed-APIs list.";
      }
      console.error("Routes API 403:", reason);
      return new Response(JSON.stringify({ error: message }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`Routes gateway failed [${response.status}]: ${errorBody}`);
      return new Response(
        JSON.stringify({ error: "Routes request failed", status: response.status, details: errorBody }),
        { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const route = data?.routes?.[0];

    return new Response(
      JSON.stringify({
        polyline: route?.polyline?.encodedPolyline ?? null,
        distanceMeters: route?.distanceMeters ?? null,
        duration: route?.duration ?? null,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("snap-gps-route error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
