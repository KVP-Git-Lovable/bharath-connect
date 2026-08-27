import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SessionRequest {
  action: "checkin" | "checkout"; // checkin or checkout
  userId: string;
  activityId: string;
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

    const body: SessionRequest = await req.json();
    const { action, userId, activityId } = body;

    if (action === "checkin") {
      // Create new session
      const { data: session, error } = await supabase
        .from("activity_sessions")
        .insert({
          user_id: userId,
          activity_id: activityId,
          checked_in_at: new Date().toISOString(),
          is_active: true,
        })
        .select()
        .single();

      if (error) throw error;

      return new Response(JSON.stringify({ success: true, session }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    else if (action === "checkout") {
      // Close active session
      const { data: session, error } = await supabase
        .from("activity_sessions")
        .update({
          checked_out_at: new Date().toISOString(),
          is_active: false,
        })
        .eq("activity_id", activityId)
        .eq("user_id", userId)
        .eq("is_active", true)
        .select()
        .single();

      if (error) throw error;

      return new Response(JSON.stringify({ success: true, session }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error("Invalid action");
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
