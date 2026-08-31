import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
}

serve(async (req) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders
    })
  }

  try {
    // Get authorization header
    const authHeader = req.headers.get("authorization") || ""
    const token = authHeader.replace("Bearer ", "")

    if (!token) {
      return new Response(
        JSON.stringify({ error: "No authorization token" }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
      )
    }

    // Create Supabase client with service role (for admin operations)
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
    )

    // Create client with user token (to verify current user is admin)
    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_ANON_KEY") || "",
      {
        global: {
          headers: { Authorization: `Bearer ${token}` },
        },
      }
    )

    // Get current user
    const { data: { user: currentUser }, error: userError } = await supabaseUser.auth.getUser()

    if (userError || !currentUser) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
      )
    }

    // Parse request body
    const { target_user_id } = await req.json()

    if (!target_user_id) {
      return new Response(
        JSON.stringify({ error: "target_user_id is required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      )
    }

    // Verify current user is admin: legacy role OR admin security profile
    const { data: roleRows, error: roleError } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", currentUser.id)

    const { data: adminCheck, error: adminCheckError } = await supabaseAdmin
      .from("user_security_profiles")
      .select("profile_id, security_profiles(name)")
      .eq("user_id", currentUser.id)

    if (adminCheckError || roleError) {
      console.error("Admin check failed:", adminCheckError || roleError)
      return new Response(
        JSON.stringify({ error: "Failed to verify admin status" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      )
    }

    const hasAdminRole = (roleRows || []).some((r: any) => r.role === "admin")
    const hasAdminProfile = (adminCheck || []).some((a: any) =>
      /administrator/i.test(a.security_profiles?.name ?? "")
    )

    if (!hasAdminRole && !hasAdminProfile) {
      return new Response(
        JSON.stringify({ error: "Only administrators can impersonate users" }),
        { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } }
      )
    }


    // Get target user details
    const { data: targetUser, error: targetUserError } = await supabaseAdmin
      .from("users")
      .select("id, email")
      .eq("id", target_user_id)
      .single()

    if (targetUserError || !targetUser) {
      return new Response(
        JSON.stringify({ error: "Target user not found" }),
        { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } }
      )
    }

    // Log impersonation to audit table
    await supabaseAdmin.from("audit_logs").insert({
      action: "admin_impersonate_user",
      actor_user_id: currentUser.id,
      target_user_id: target_user_id,
      details: {
        admin_email: currentUser.email,
        target_email: targetUser.email,
        timestamp: new Date().toISOString(),
      },
    }).catch((err) => console.warn("Audit log error:", err))

    // Generate passwordless link for target user (email signin)
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: "email_signin",
      email: targetUser.email,
      options: {
        redirectTo: new URL(req.url).origin + "/auth/impersonate-callback",
      }
    })

    if (linkError || !linkData?.properties?.email_link) {
      console.error("Link generation error:", linkError)
      return new Response(
        JSON.stringify({ error: "Failed to generate impersonation link" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      )
    }

    // Extract access token from the magic link
    // The link contains a token parameter that can be used to authenticate
    const emailLink = linkData.properties.email_link
    const linkUrl = new URL(emailLink)
    const accessToken = linkUrl.searchParams.get("token_hash")

    // Return impersonation link and user details
    return new Response(
      JSON.stringify({
        success: true,
        impersonate_link: emailLink,
        direct_link: emailLink.split("?")[0] + "?token_hash=" + accessToken,
        user: {
          id: target_user_id,
          email: targetUser.email,
        },
        instructions: "Admin can click the impersonate_link or use the token_hash to authenticate as this user",
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    )
  } catch (error) {
    console.error("Edge function error:", error)
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    )
  }
})
