import { supabase } from "@/integrations/supabase/client";

/**
 * A public transport fare is a reimbursement claim, so it lives in
 * additional_expenses alongside every other claim rather than in a second
 * approval flow of its own. That gives it approve / reject, auto-approval by
 * category limit, the Overview totals and the audit trail for free.
 *
 * One claim per activity, keyed by additional_expenses.activity_id.
 */

/** The category a fare is filed under. Create it in Expense Categories. */
export const FARE_CATEGORY = "Public Transport";

export interface FareClaimInput {
  activityId: string;
  userId: string;
  /** yyyy-MM-dd */
  activityDate: string;
  /** null removes the claim (vehicle changed, or the fare was cleared). */
  fare: number | null;
  /** Storage path of the ticket / meter / invoice, if one was attached. */
  billPath: string | null;
  /** Shown on the claim so an approver knows which trip it belongs to. */
  description: string;
}

export type FareClaimOutcome =
  | { kind: "none" }
  | { kind: "removed" }
  | { kind: "locked"; amount: number }
  | { kind: "saved"; autoApproved: boolean };

interface ExistingClaim {
  id: string;
  status: string;
  amount: number;
}

/**
 * The approved claim for this activity, if there is one. Callers check this
 * before writing the fare so an approved amount is never silently changed.
 */
export async function approvedFareClaim(activityId: string): Promise<{ amount: number } | null> {
  const claim = await findClaim(activityId);
  return claim && claim.status === "approved" ? { amount: claim.amount } : null;
}

async function findClaim(activityId: string): Promise<ExistingClaim | null> {
  const { data } = await supabase
    .from("additional_expenses")
    .select("id, status, amount")
    .eq("activity_id", activityId)
    .maybeSingle();
  return data ? { id: data.id, status: data.status, amount: Number(data.amount || 0) } : null;
}

/**
 * Mirror the fare into additional_expenses.
 *
 * An approved claim is never rewritten: once an approver has signed off an
 * amount, changing it from the activity would alter a settled reimbursement
 * without anyone reviewing it. The caller surfaces "locked" to the rep.
 */
export async function syncFareClaim(input: FareClaimInput): Promise<FareClaimOutcome> {
  const existing = await findClaim(input.activityId);

  if (existing && existing.status === "approved") {
    return { kind: "locked", amount: existing.amount };
  }

  if (input.fare == null) {
    if (!existing) return { kind: "none" };
    const { error } = await supabase.from("additional_expenses").delete().eq("id", existing.id);
    if (error) throw error;
    return { kind: "removed" };
  }

  const { data: cat } = await supabase
    .from("expense_categories")
    .select("id, auto_approval_limit")
    .eq("name", FARE_CATEGORY)
    .eq("is_active", true)
    .maybeSingle();

  const limit = cat?.auto_approval_limit ?? null;
  const autoApproved = limit != null && input.fare < Number(limit);

  const payload = {
    category: FARE_CATEGORY,
    category_id: cat?.id ?? null,
    amount: input.fare,
    description: input.description,
    expense_date: input.activityDate,
    bill_url: input.billPath,
    status: autoApproved ? "approved" : "submitted",
    month_key: input.activityDate.substring(0, 7),
    activity_id: input.activityId,
  };

  const { error } = existing
    ? await supabase.from("additional_expenses").update(payload).eq("id", existing.id)
    : await supabase.from("additional_expenses").insert({ ...payload, user_id: input.userId });
  if (error) throw error;

  return { kind: "saved", autoApproved };
}
