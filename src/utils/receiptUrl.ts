import { TRAVEL_PROOF_BUCKET } from "@/utils/activityTravel";
import { resolveSignedUrl } from "@/utils/signedStorage";

/** Manually entered claims upload their bill here. */
export const EXPENSE_BILL_BUCKET = "expense-bills";

/**
 * additional_expenses.bill_url holds a storage path, not a URL, and the two
 * kinds of claim live in different private buckets: a fare carries the travel
 * proof the rep attached to the activity, everything else carries a bill
 * uploaded from the Expenses form. Opening the raw value resolves it against
 * the current page and 404s, so it has to be signed first.
 */
export function receiptBucket(claim: { activity_id?: string | null }): string {
  return claim.activity_id ? TRAVEL_PROOF_BUCKET : EXPENSE_BILL_BUCKET;
}

/** Signed, openable URL for a claim's receipt. Empty string when there is none. */
export async function resolveReceiptUrl(claim: {
  bill_url?: string | null;
  activity_id?: string | null;
}): Promise<string> {
  if (!claim.bill_url) return "";
  return resolveSignedUrl(receiptBucket(claim), claim.bill_url);
}
