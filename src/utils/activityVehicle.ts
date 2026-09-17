import { supabase } from "@/integrations/supabase/client";

/**
 * The vehicle to stamp on an activity at check-in: the day's recorded vehicle,
 * or — for the signed-in user's own activity — their pinned vehicle (which is
 * then recorded for that day too). Returns null when nothing is chosen.
 */
export async function resolveActivityVehicle(userId: string, activityDate: string): Promise<string | null> {
  const { data: day } = await supabase
    .from("daily_vehicle_selections" as any)
    .select("vehicle_type_id")
    .eq("user_id", userId)
    .eq("activity_date", activityDate)
    .maybeSingle();
  const dayId = (day as any)?.vehicle_type_id as string | undefined;
  if (dayId) return dayId;

  const { data: auth } = await supabase.auth.getUser();
  if (auth.user?.id !== userId) return null;

  const { data: pin } = await supabase
    .from("user_pinned_vehicles" as any)
    .select("vehicle_type_id")
    .eq("user_id", userId)
    .maybeSingle();
  const pinId = (pin as any)?.vehicle_type_id as string | undefined;
  if (!pinId) return null;

  await supabase
    .from("daily_vehicle_selections" as any)
    .upsert({ user_id: userId, activity_date: activityDate, vehicle_type_id: pinId } as any, { onConflict: "user_id,activity_date" });
  return pinId;
}

/** Give a vehicle to the user's activities on a date that were checked in without one. */
export async function backfillActivityVehicle(userId: string, activityDate: string, vehicleTypeId: string) {
  await supabase
    .from("activity_events")
    .update({ vehicle_type_id: vehicleTypeId } as any)
    .eq("user_id", userId)
    .eq("activity_date", activityDate)
    .is("vehicle_type_id" as any, null)
    .not("start_time", "is", null);
}
