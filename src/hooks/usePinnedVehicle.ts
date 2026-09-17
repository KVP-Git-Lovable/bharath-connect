import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useDailyVehicleSelection } from "@/hooks/useDailyVehicleSelection";
import { backfillActivityVehicle } from "@/utils/activityVehicle";

/**
 * The user's pinned vehicle. Pinning is stored on the server, so it survives
 * check-out, logout and switching devices, and stays until the user unpins it.
 * While pinned, today is recorded with that vehicle automatically.
 * Other dates show the vehicle recorded for that day (read-only).
 */
export function usePinnedVehicle(userId: string, viewDate: string) {
  const today = format(new Date(), "yyyy-MM-dd");
  const isToday = viewDate === today;
  const todaySel = useDailyVehicleSelection(userId, today);
  const viewSel = useDailyVehicleSelection(userId, isToday ? "" : viewDate);
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const [pinLoading, setPinLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadPin = useCallback(async () => {
    if (!userId) { setPinnedId(null); setPinLoading(false); return; }
    const { data, error } = await supabase
      .from("user_pinned_vehicles" as any)
      .select("vehicle_type_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) console.error("[pinned vehicle] load failed:", error);
    setPinnedId((data as any)?.vehicle_type_id ?? null);
    setPinLoading(false);
  }, [userId]);

  useEffect(() => { setPinLoading(true); loadPin(); }, [loadPin]);

  // Pinned but today not recorded yet -> record it.
  useEffect(() => {
    if (pinLoading || todaySel.loading || !pinnedId || todaySel.selectedId) return;
    todaySel.selectVehicle(pinnedId).then((ok) => { if (ok) backfillActivityVehicle(userId, today, pinnedId); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinLoading, todaySel.loading, pinnedId, todaySel.selectedId]);

  const pin = useCallback(async (vehicleTypeId: string) => {
    if (!userId) return;
    setSaving(true);
    const prev = pinnedId;
    setPinnedId(vehicleTypeId);
    const { error } = await supabase
      .from("user_pinned_vehicles" as any)
      .upsert({ user_id: userId, vehicle_type_id: vehicleTypeId, pinned_at: new Date().toISOString() } as any, { onConflict: "user_id" });
    if (error) {
      setPinnedId(prev);
      setSaving(false);
      toast.error(/user_pinned_vehicles/.test(error.message) ? "Vehicle pinning isn't set up yet — apply the latest migration" : error.message);
      return;
    }
    const ok = await todaySel.selectVehicle(vehicleTypeId);
    if (ok) await backfillActivityVehicle(userId, today, vehicleTypeId);
    setSaving(false);
  }, [userId, pinnedId, todaySel, today]);

  const unpin = useCallback(async () => {
    if (!userId) return;
    setSaving(true);
    const prev = pinnedId;
    setPinnedId(null);
    const { error } = await supabase.from("user_pinned_vehicles" as any).delete().eq("user_id", userId);
    setSaving(false);
    if (error) { setPinnedId(prev); toast.error("Could not unpin the vehicle"); return; }
    toast.success("Vehicle unpinned");
  }, [userId, pinnedId]);

  return {
    loading: pinLoading || todaySel.loading || (!isToday && viewSel.loading),
    saving: saving || todaySel.saving,
    vehicles: todaySel.eligibleVehicles,
    isToday,
    pinnedId,
    /** What to highlight for the date being viewed. */
    shownId: isToday ? pinnedId : viewSel.selectedId,
    pin,
    unpin,
  };
}
