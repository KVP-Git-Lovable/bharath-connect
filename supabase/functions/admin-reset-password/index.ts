import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) return json({ error: "No authorization token" }, 401);

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
    );

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_ANON_KEY") || "",
      { global: { headers: { Authorization: `Bearer ${token}` } } },
    );

    const { data: { user: currentUser }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !currentUser) return json({ error: "Unauthorized" }, 401);

    const { target_user_id, new_password, must_change_password = true } = await req.json();
    if (!target_user_id || !new_password) {
      return json({ error: "target_user_id and new_password are required" }, 400);
    }
    if (String(new_password).length < 8) {
      return json({ error: "Password must be at least 8 characters" });
    }

    // Admin check: legacy admin role OR an Administrator security profile
    const { data: roleRows, error: roleError } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", currentUser.id);

    const { data: profileRows, error: profileError } = await supabaseAdmin
      .from("user_security_profiles")
      .select("security_profiles(name)")
      .eq("user_id", currentUser.id);

    if (roleError || profileError) {
      console.error("Admin verification failed:", roleError || profileError);
      return json({ error: "Failed to verify admin privileges" }, 500);
    }

    const hasAdminRole = (roleRows || []).some((r: any) => r.role === "admin");
    const hasAdminProfile = (profileRows || []).some((r: any) =>
      String(r.security_profiles?.name || "").toLowerCase().includes("administrator")
    );

    if (!hasAdminRole && !hasAdminProfile) {
      return json({ error: "Only administrators can reset passwords" }, 403);
    }

    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(target_user_id, {
      password: new_password,
      email_confirm: true,
    });

    if (updateError) {
      console.error("Password update failed:", updateError);
      const msg = String(updateError.message || "");
      const weak = /weak|easy to guess|pwned/i.test(msg);
      // Return 200 so the client surfaces the real reason instead of a generic
      // "Edge function returned 400" error.
      return json({
        error: weak
          ? "That password is known to be breached. Use the Generate button to create a strong one."
          : msg,
      });
    }

    await supabaseAdmin
      .from("profiles")
      .update({ must_change_password: !!must_change_password })
      .eq("id", target_user_id);

    return json({ success: true });
  } catch (err) {
    console.error("admin-reset-password error:", err);
    return json({ error: (err as Error).message }, 500);
  }
});
