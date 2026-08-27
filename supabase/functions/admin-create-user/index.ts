import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Verify the caller is an admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Create a client with the caller's JWT to check their role
    const callerClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? supabaseServiceKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user: callerUser }, error: callerError } = await callerClient.auth.getUser();
    if (callerError || !callerUser) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check admin role using service client
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);
    const { data: roleData } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", callerUser.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Forbidden: admin role required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse request body
    const body = await req.json();
    const { email, password, full_name, username, phone, role, hq, salary, da, date_of_joining } = body;

    if (!email || !password || !full_name) {
      return new Response(JSON.stringify({ error: "email, password, and full_name are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create user with admin API (does not affect caller's session)
    const { data: newUserData, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { username: username || email, full_name },
    });

    if (createError) {
      const msg = String(createError.message || "");
      const isDuplicate = /already been registered|already registered|already exists/i.test(msg);
      return new Response(
        JSON.stringify({
          error: isDuplicate
            ? `An account with the email ${email} already exists. Use a different email or edit the existing user.`
            : msg,
          code: isDuplicate ? "email_exists" : "create_failed",
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const userId = newUserData.user.id;

    // Map role string to roles table id
    const roleNameMap: Record<string, string> = {
      admin: "Admin",
      user: "Field User",
      sales_manager: "Sales Manager",
      data_viewer: "Data Viewer",
      site_engineer: "Site Engineer",
      sales_marketing_executive: "Sales and Marketing Executive",
      accountant: "Accountant",
    };
    let roleId = null;
    if (role && roleNameMap[role]) {
      const { data: roleRow } = await adminClient
        .from("roles")
        .select("id")
        .eq("name", roleNameMap[role])
        .single();
      if (roleRow) roleId = roleRow.id;
    }

    // Insert into app users table
    await adminClient.from("users").upsert({
      id: userId,
      email,
      full_name: full_name || null,
      username: username || email,
      role_id: roleId,
      phone: phone || null,
    }, { onConflict: "id" });

    // Update profile: set phone and force password change on first login
    await adminClient.from("profiles").update({
      ...(phone ? { phone_number: phone } : {}),
      must_change_password: true,
    }).eq("id", userId);

    // Create employee record
    const { error: empError } = await adminClient.from("employees").insert({
      user_id: userId,
      monthly_salary: salary ? parseFloat(salary) : 0,
      daily_da_allowance: da ? parseFloat(da) : 0,
      hq: hq || null,
      date_of_joining: date_of_joining || null,
    });

    if (empError) {
      console.error("Employee insert error:", empError);
    }

    // If admin role requested, update role (handle_new_user trigger already inserts 'user' role)
    if (role === "admin") {
      // Update existing role to admin
      const { error: roleError } = await adminClient
        .from("user_roles")
        .update({ role: "admin" })
        .eq("user_id", userId);

      if (roleError) {
        console.error("Role update error:", roleError);
      }
    }

    return new Response(JSON.stringify({ success: true, user_id: userId }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
