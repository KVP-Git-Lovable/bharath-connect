import { supabase } from "@/integrations/supabase/client";

export type ClaimLineType = "travel" | "meeting" | "petty_cash" | "expense";
export type ClaimStatus = "draft" | "submitted" | "approved" | "rejected";

export interface ClaimLine {
  id?: string;
  claim_id?: string;
  line_type: ClaimLineType;
  activity_id: string | null;
  expense_id: string | null;
  description: string | null;
  distance_km: number | null;
  minutes: number | null;
  amount: number;
  bill_url: string | null;
}

export interface Claim {
  id: string;
  user_id: string;
  claim_date: string;
  status: ClaimStatus;
  approver_id: string | null;
  total_amount: number;
  notes: string | null;
  submitted_at: string | null;
  decided_at: string | null;
  rejection_reason: string | null;
}

export const LINE_LABEL: Record<ClaimLineType, string> = {
  travel: "Travel",
  meeting: "Meeting",
  petty_cash: "Petty cash",
  expense: "Expense",
};

export const inr = (n: number) => `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

// Tables are new; keep the client untyped here so this works before types refresh.
const db = supabase as any;

function meetingMinutes(a: any): number | null {
  const hist = Array.isArray(a.status_history) ? [...a.status_history].reverse() : [];
  const start = a.start_time || hist.find((h: any) => h?.status === "in_progress")?.at || null;
  if (!start || !a.end_time) return null;
  return Math.max(0, Math.round((new Date(a.end_time).getTime() - new Date(start).getTime()) / 60000));
}

/**
 * Build the auto lines for a person's day: one travel + one meeting line per
 * activity, plus every open expense entry of that day not already on a claim.
 */
export async function buildAutoLines(userId: string, date: string, excludeClaimId?: string): Promise<ClaimLine[]> {
  const lines: ClaimLine[] = [];

  const { data: acts } = await db
    .from("activity_events")
    .select("id, activity_code, activity_type, activity_date, start_time, end_time, status_history, travel_distance_km, manual_distance_km, manual_fare_amount, travel_time_mins")
    .eq("user_id", userId)
    .eq("activity_date", date)
    .order("start_time", { ascending: true });

  const { data: exps } = await db
    .from("additional_expenses")
    .select("id, category, custom_category, amount, description, bill_url, activity_id, status")
    .eq("user_id", userId)
    .eq("expense_date", date)
    .in("status", ["pending", "submitted"]);

  const expIds = (exps || []).map((e: any) => e.id);
  let taken = new Set<string>();
  if (expIds.length) {
    const { data: used } = await db.from("expense_claim_lines").select("expense_id, claim_id").in("expense_id", expIds);
    taken = new Set((used || []).filter((u: any) => u.claim_id !== excludeClaimId).map((u: any) => u.expense_id));
  }
  const fareActs = new Set((exps || []).filter((e: any) => e.activity_id).map((e: any) => e.activity_id));

  for (const a of acts || []) {
    const label = [a.activity_code, a.activity_type].filter(Boolean).join(" · ");
    const km = a.manual_distance_km != null ? Number(a.manual_distance_km) : a.travel_distance_km != null ? Number(a.travel_distance_km) : null;
    let amount = 0;
    if (!fareActs.has(a.id)) {
      const { data: te } = await db.rpc("get_activity_travel_expense", { _activity_id: a.id });
      if (te && !te.is_no_vehicle) {
        amount = te.method === "fixed" ? Number(te.rate || 0) : km != null ? Math.round(km * Number(te.rate || 0) * 100) / 100 : 0;
      }
    }
    lines.push({
      line_type: "travel", activity_id: a.id, expense_id: null,
      description: `${label}${a.travel_time_mins != null ? ` · ${a.travel_time_mins} min travel` : ""}${fareActs.has(a.id) ? " · fare claimed separately" : ""}`,
      distance_km: km, minutes: a.travel_time_mins ?? null, amount, bill_url: null,
    });
    const mm = meetingMinutes(a);
    if (mm != null) {
      lines.push({ line_type: "meeting", activity_id: a.id, expense_id: null, description: label, distance_km: null, minutes: mm, amount: 0, bill_url: null });
    }
  }

  for (const e of exps || []) {
    if (taken.has(e.id)) continue;
    lines.push({
      line_type: "expense", activity_id: e.activity_id, expense_id: e.id,
      description: `${e.category === "Other" ? e.custom_category || "Other" : e.category}${e.description ? ` · ${e.description}` : ""}`,
      distance_km: null, minutes: null, amount: Number(e.amount || 0), bill_url: e.bill_url,
    });
  }
  return lines;
}

export async function getOrCreateDraft(userId: string, date: string): Promise<Claim> {
  const { data: existing } = await db.from("expense_claims").select("*").eq("user_id", userId).eq("claim_date", date).maybeSingle();
  if (existing) return existing;
  const { data, error } = await db.from("expense_claims").insert({ user_id: userId, claim_date: date }).select("*").single();
  if (error) throw error;
  return data;
}

export async function loadLines(claimId: string): Promise<ClaimLine[]> {
  const { data, error } = await db.from("expense_claim_lines").select("*").eq("claim_id", claimId).order("created_at");
  if (error) throw error;
  return (data || []).map((l: any) => ({ ...l, amount: Number(l.amount || 0) }));
}

/** Replace the auto lines (travel/meeting/expense) with a fresh build; keeps petty cash. */
export async function refreshAutoLines(claim: Claim): Promise<void> {
  const fresh = await buildAutoLines(claim.user_id, claim.claim_date, claim.id);
  const { error: delErr } = await db.from("expense_claim_lines").delete().eq("claim_id", claim.id).neq("line_type", "petty_cash");
  if (delErr) throw delErr;
  if (fresh.length) {
    const { error } = await db.from("expense_claim_lines").insert(fresh.map((l) => ({ ...l, claim_id: claim.id })));
    if (error) throw error;
  }
  await recalcTotal(claim.id);
}

export async function recalcTotal(claimId: string) {
  const lines = await loadLines(claimId);
  const total = lines.reduce((s, l) => s + l.amount, 0);
  await db.from("expense_claims").update({ total_amount: total }).eq("id", claimId);
  return total;
}

export async function addPettyCash(claimId: string, description: string, amount: number) {
  const { error } = await db.from("expense_claim_lines").insert({
    claim_id: claimId, line_type: "petty_cash", description, amount,
    activity_id: null, expense_id: null, distance_km: null, minutes: null, bill_url: null,
  });
  if (error) throw error;
  await recalcTotal(claimId);
}

export async function removeLine(claimId: string, lineId: string) {
  const { error } = await db.from("expense_claim_lines").delete().eq("id", lineId);
  if (error) throw error;
  await recalcTotal(claimId);
}

export async function submitClaim(claimId: string) {
  const { error } = await db.rpc("submit_expense_claim", { _claim_id: claimId });
  if (error) throw error;
}

export async function decideClaim(claimId: string, approve: boolean, reason?: string) {
  const { error } = await db.rpc("decide_expense_claim", { _claim_id: claimId, _approve: approve, _reason: reason ?? null });
  if (error) throw error;
}

export async function listClaims(opts: { userIds?: string[] | null; from?: string; to?: string; status?: string; approverId?: string }): Promise<Claim[]> {
  let q = db.from("expense_claims").select("*").order("claim_date", { ascending: false });
  if (opts.from) q = q.gte("claim_date", opts.from);
  if (opts.to) q = q.lte("claim_date", opts.to);
  if (opts.status && opts.status !== "all") q = q.eq("status", opts.status);
  if (opts.userIds) q = q.in("user_id", opts.userIds.length ? opts.userIds : ["00000000-0000-0000-0000-000000000000"]);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map((c: any) => ({ ...c, total_amount: Number(c.total_amount || 0) }));
}
