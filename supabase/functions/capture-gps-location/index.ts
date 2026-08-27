import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface GPSLocationRequest {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  speed: number | null;
  timestamp: string;
  date: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Get auth token from header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: corsHeaders,
      });
    }

    const token = authHeader.substring(7);

    // Create Supabase client with auth token
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_ANON_KEY") || "",
      {
        global: { headers: { Authorization: `Bearer ${token}` } },
      }
    );

    // Verify user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: corsHeaders,
      });
    }

    // Parse request body
    const body: GPSLocationRequest = await req.json();
    const { latitude, longitude, accuracy, speed, timestamp, date } = body;

    // Validate required fields
    if (latitude === undefined || longitude === undefined || !date) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: latitude, longitude, date" }),
        { status: 400, headers: corsHeaders }
      );
    }

    // Insert location into gps_tracking table
    const { error: insertError } = await supabase.from("gps_tracking").insert({
      user_id: user.id,
      date,
      latitude: Number(latitude),
      longitude: Number(longitude),
      accuracy: accuracy !== null ? Number(accuracy) : null,
      speed: speed !== null ? Number(speed) : null,
      timestamp: timestamp || new Date().toISOString(),
    });

    if (insertError) {
      console.error("Error inserting location:", insertError);
      return new Response(
        JSON.stringify({ error: "Failed to save location", details: insertError.message }),
        { status: 500, headers: corsHeaders }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Location captured",
        user_id: user.id,
      }),
      { status: 200, headers: corsHeaders }
    );
  } catch (error) {
    console.error("Error in capture-gps-location:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
