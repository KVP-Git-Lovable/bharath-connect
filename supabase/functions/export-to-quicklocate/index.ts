import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TABLES = [
  "activity_events","activity_types_master","additional_expenses","app_configuration",
  "attendance","attendance_policy","beat_allowances","beat_plans","company_profile",
  "customer_activities","customer_contact_roles","customer_contacts","customer_documents",
  "customer_opportunities","customers","employee_documents","employees","events",
  "expense_approval_rules","expense_approval_workflows","expense_categories",
  "expense_group_members","expense_groups","expense_master_config","expense_overrides",
  "expense_policy","global_leave_policy","gps_tracking","gps_tracking_stops","holidays",
  "lead_audit_log","leads","leave_applications","leave_balance","leave_policy",
  "leave_type_policy_override","leave_types","master_addresses","master_categories",
  "master_currencies","master_entities","master_event_types","master_lead_sources",
  "master_lead_statuses","master_payment_terms","master_products","master_uom",
  "monthly_leave_accrual","notifications","opportunity_milestones","opportunity_quote_items",
  "opportunity_quotes","opportunity_stages","opportunity_types","order_items","orders",
  "permission_definitions","permissions","pm_ai_insights","pm_ideas","pm_knowledge_documents",
  "pm_milestones","pm_project_members","pm_project_resources","pm_projects","pm_risks",
  "pm_sections","pm_sprints","pm_support_requests","pm_task_attachments",
  "pm_task_collaborators","pm_task_comments","pm_task_dependencies","pm_task_templates",
  "pm_tasks","pm_template_attachments","pm_template_dependencies","pm_template_sections",
  "pm_template_tasks","pm_templates","pm_time_logs","procurement_grn_items",
  "procurement_grns","procurement_invoice_attachments","procurement_invoice_items",
  "procurement_invoice_payments","procurement_invoices","procurement_items",
  "procurement_orders","procurement_vendor_feedback","product_categories",
  "product_schemes","products","profile_object_permissions","profiles","project_sites",
  "push_tokens","regularization_policy","regularization_requests","retailers",
  "role_permissions","roles","security_profiles","site_assignments",
  "site_milestone_comments","site_milestones","user_roles","user_security_profiles",
  "users","vendors","visits","web_push_subscriptions","week_off_config",
  "working_days_config",
];

const BATCH_SIZE = 500;

async function migrateTable(
  supabase: ReturnType<typeof createClient>,
  table: string,
  targetUrl: string,
  secret: string,
) {
  let offset = 0;
  let sent = 0;
  let failed = 0;
  const errors: string[] = [];

  while (true) {
    const { data: rows, error: rowErr } = await supabase
      .from(table)
      .select("*")
      .range(offset, offset + BATCH_SIZE - 1);
    if (rowErr) throw new Error(`select(${table}): ${rowErr.message}`);
    if (!rows || rows.length === 0) break;

    const dataRes = await fetch(targetUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-migration-secret": secret },
      body: JSON.stringify({ table, rows }),
    });

    if (!dataRes.ok) {
      failed += rows.length;
      errors.push(await dataRes.text());
    } else {
      sent += rows.length;
    }

    offset += BATCH_SIZE;
    if (rows.length < BATCH_SIZE) break;
  }

  return { sent, failed, errors };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const targetUrl = Deno.env.get("MIGRATION_TARGET_URL");
  const secret = Deno.env.get("MIGRATION_SHARED_SECRET");
  if (!targetUrl || !secret) {
    return new Response(JSON.stringify({ error: "MIGRATION_TARGET_URL or MIGRATION_SHARED_SECRET not set" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const url = new URL(req.url);
  const single = url.searchParams.get("table");
  const tablesToRun = single ? [single] : TABLES;

  const results: Record<string, unknown> = {};

  for (const table of tablesToRun) {
    try {
      results[table] = await migrateTable(supabase, table, targetUrl, secret);
    } catch (e) {
      results[table] = { error: String(e instanceof Error ? e.message : e) };
    }
  }

  return new Response(JSON.stringify(results, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
