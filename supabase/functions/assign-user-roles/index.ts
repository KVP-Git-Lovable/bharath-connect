import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: corsHeaders,
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') || '',
      Deno.env.get('SUPABASE_ANON_KEY') || '',
      { global: { headers: { Authorization: authHeader } } }
    )

    // Verify user is authenticated
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: corsHeaders,
      })
    }

    // Check if user is admin
    const { data: userData } = await supabase
      .from('users')
      .select('role_id, user_security_profiles!inner(profile_id)')
      .eq('id', user.id)
      .single()

    const { data: userRole } = await supabase
      .from('roles')
      .select('name')
      .eq('id', userData?.role_id)
      .single()

    if (userRole?.name !== 'Admin') {
      return new Response(JSON.stringify({ error: 'Only admins can assign roles' }), {
        status: 403,
        headers: corsHeaders,
      })
    }

    // Assign all users with roles to security profiles
    const { data: allUsers } = await supabase
      .from('users')
      .select('id, role_id')
      .not('role_id', 'is', null)

    let assigned = 0
    let failed = 0

    for (const user of allUsers || []) {
      try {
        // Get the security profile that matches this role
        const { data: roleData } = await supabase
          .from('roles')
          .select('name')
          .eq('id', user.role_id)
          .single()

        // Map role names to security profile names
        let profileName = ''
        switch (roleData?.name) {
          case 'Admin':
            profileName = 'System Administrator'
            break
          case 'Sales Manager':
            profileName = 'Sales Manager'
            break
          case 'Field User':
            profileName = 'Field Sales Executive'
            break
          case 'Data Viewer':
            profileName = 'Data Viewer'
            break
        }

        if (!profileName) continue

        // Get the security profile ID
        const { data: secProfile } = await supabase
          .from('security_profiles')
          .select('id')
          .eq('name', profileName)
          .single()

        if (!secProfile) {
          failed++
          continue
        }

        // Upsert the user security profile assignment
        const { error } = await supabase
          .from('user_security_profiles')
          .upsert(
            { user_id: user.id, profile_id: secProfile.id },
            { onConflict: 'user_id' }
          )

        if (error) {
          console.error(`Failed to assign role for user ${user.id}:`, error)
          failed++
        } else {
          assigned++
        }
      } catch (err) {
        console.error(`Error processing user ${user.id}:`, err)
        failed++
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Assigned ${assigned} users to security profiles, ${failed} failed`,
        assigned,
        failed
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (error) {
    console.error('Error in assign-user-roles:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    )
  }
})
