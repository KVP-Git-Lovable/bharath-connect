import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface GPSValidationRequest {
  userId: string;
  timestamp: string; // ISO timestamp of GPS point
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

    const body: GPSValidationRequest = await req.json();
    const { userId, timestamp } = body;

    // Check if there's an active session for this user at this timestamp
    const { data: session, error } = await supabase
      .from("activity_sessions")
      .select("id, checked_in_at, checked_out_at")
      .eq("user_id", userId)
      .lte("checked_in_at", timestamp)
      .or(`checked_out_at.is.null,checked_out_at.gte.${timestamp}`)
      .order("checked_in_at", { ascending: false })
      .limit(1)
      .single();

    if (error) {
      // No active session found
      return new Response(
        JSON.stringify({
          valid: false,
          message: "No active check-in session for this timestamp",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // GPS point is within a valid session
    return new Response(
      JSON.stringify({
        valid: true,
        sessionId: session.id,
        message: "GPS point is within active session",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ valid: false, error: error.message }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
