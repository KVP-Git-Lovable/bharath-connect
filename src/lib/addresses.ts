import { supabase } from "@/integrations/supabase/client";

export interface AddressOption {
  id: string; // master_addresses uuid OR "site:<uuid>"
  name: string;
  full_address: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  gst_number: string | null;
  source: "manual" | "site";
}

/** Builds a single multi-line address snapshot (without the GST line). */
export function formatAddressSnapshot(a: AddressOption): string {
  const loc = [a.city, a.state, a.pincode].filter(Boolean).join(", ");
  return [a.name, a.full_address || "", loc].filter(Boolean).join("\n");
}

/** Fetch active addresses from the Address Book. */
export async function fetchAddressOptions(): Promise<AddressOption[]> {
  const { data: addrs } = await supabase
    .from("master_addresses")
    .select("id, address_name, full_address, city, state, pincode, gst_number")
    .eq("is_active", true)
    .order("address_name");

  const manual: AddressOption[] = ((addrs || []) as any[]).map((r) => ({
    id: r.id,
    name: r.address_name,
    full_address: r.full_address,
    city: r.city,
    state: r.state,
    pincode: r.pincode,
    gst_number: r.gst_number,
    source: "manual",
  }));

  return manual;
}
