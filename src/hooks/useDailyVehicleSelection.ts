import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useVehicleTypes, type VehicleType } from "@/hooks/useVehicleTypes";

/**
 * Vehicle types eligible for this user's role, plus their saved choice for
 * one date, and a setter that upserts the choice. A role with no eligibility
 * rows configured falls back to every active vehicle type, so nothing is
 * blocked while admins are still setting up role assignments.
 */
export function useDailyVehicleSelection(userId: string, dateStr: string) {
  const { vehicleTypes, loading: typesLoading } = useVehicleTypes();
  const [eligibleIds, setEligibleIds] = useState<Set<string> | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadEligibility = useCallback(async () => {
    if (!userId) { setEligibleIds(null); return; }
    const { data: prof, error: profErr } = await supabase
      .from("user_security_profiles" as any)
      .select("profile_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (profErr) { console.error("[vehicle selector] load profile failed:", profErr); setEligibleIds(null); return; }
    const profileId = (prof as any)?.profile_id as string | undefined;
    if (!profileId) { setEligibleIds(null); return; } // no role set -> allow all
    const { data: rows, error: rowsErr } = await supabase
      .from("role_vehicle_types" as any)
      .select("vehicle_type_id")
      .eq("profile_id", profileId);
    if (rowsErr) { console.error("[vehicle selector] load eligibility failed:", rowsErr); setEligibleIds(null); return; }
    const ids = ((rows || []) as any[]).map((r) => r.vehicle_type_id as string);
    setEligibleIds(ids.length ? new Set(ids) : null); // no rows configured -> allow all
  }, [userId]);

  const loadSelection = useCallback(async () => {
    if (!userId || !dateStr) { setSelectedId(null); return; }
    const { data, error } = await supabase
      .from("daily_vehicle_selections" as any)
      .select("vehicle_type_id")
      .eq("user_id", userId)
      .eq("activity_date", dateStr)
      .maybeSingle();
    if (error) { console.error("[vehicle selector] load selection failed:", error); setSelectedId(null); return; }
    setSelectedId((data as any)?.vehicle_type_id ?? null);
  }, [userId, dateStr]);

  useEffect(() => {
    setLoading(true);
    Promise.all([loadEligibility(), loadSelection()]).finally(() => setLoading(false));
  }, [loadEligibility, loadSelection]);

  const eligibleVehicles: VehicleType[] = eligibleIds
    ? vehicleTypes.filter((v) => eligibleIds.has(v.id))
    : vehicleTypes;

  const selectVehicle = useCallback(async (vehicleTypeId: string) => {
    if (!userId || !dateStr) return;
    setSaving(true);
    const prevId = selectedId;
    setSelectedId(vehicleTypeId); // optimistic
    const { error } = await supabase
      .from("daily_vehicle_selections" as any)
      .upsert({ user_id: userId, activity_date: dateStr, vehicle_type_id: vehicleTypeId } as any, { onConflict: "user_id,activity_date" });
    setSaving(false);
    if (error) {
      console.error("[vehicle selector] save failed:", error);
      setSelectedId(prevId); // revert on failure
      toast.error(error.message || "Could not save your vehicle for today");
    }
    return !error;
  }, [userId, dateStr, selectedId]);

  return {
    loading: loading || typesLoading,
    saving,
    eligibleVehicles,
    selectedId,
    selectVehicle,
  };
}

