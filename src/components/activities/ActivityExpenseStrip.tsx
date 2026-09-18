import { Bike, Bus, Car as CarIcon, IndianRupee, MapPinOff, Route, Timer, Truck } from "lucide-react";
import { useActivityTravelExpense } from "@/hooks/useActivityTravelExpense";

const inr = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

function vehicleIcon(name: string | null, noVehicle: boolean) {
  if (noVehicle) return MapPinOff;
  const n = (name || "").toLowerCase();
  if (n.includes("bike")) return Bike;
  if (n.includes("truck")) return Truck;
  if (n.includes("bus")) return Bus;
  return CarIcon;
}

interface Props {
  activity: {
    id: string;
    travel_distance_km?: number | null;
    manual_distance_km?: number | null;
    travel_time_mins?: number | null;
    start_time?: string | null;
    end_time?: string | null;
    status_history?: any;
  };
  className?: string;
}

/** Compact read-only travel & expense summary shown on the activity card. */
export function ActivityExpenseStrip({ activity, className = "" }: Props) {
  const { data: expense } = useActivityTravelExpense(activity.id);

  const km =
    activity.manual_distance_km != null
      ? Number(activity.manual_distance_km)
      : activity.travel_distance_km != null
        ? Number(activity.travel_distance_km)
        : null;

  const historyStart =
    [...((activity.status_history as any[]) || [])].reverse().find((h: any) => h?.status === "in_progress")?.at || null;
  const checkInAt = activity.start_time || historyStart;
  const meetingMins =
    checkInAt && activity.end_time
      ? Math.max(0, Math.round((new Date(activity.end_time).getTime() - new Date(checkInAt).getTime()) / 60000))
      : null;

  const travelMins = activity.travel_time_mins != null ? Number(activity.travel_time_mins) : null;

  const fixed = expense?.method === "fixed";
  const amount = expense
    ? expense.is_no_vehicle
      ? 0
      : fixed
        ? expense.rate
        : km != null
          ? Math.round(km * expense.rate * 100) / 100
          : null
    : null;

  // Nothing measured yet — keep the card clean.
  if (km == null && travelMins == null && meetingMins == null && amount == null) return null;

  const VIcon = vehicleIcon(expense?.vehicle_name ?? null, !!expense?.is_no_vehicle);
  const vehicle = expense?.vehicle_name || (expense?.is_no_vehicle ? "No vehicle" : null);

  const Metric = ({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) => (
    <div className="min-w-0 flex-1 rounded-md bg-background/70 px-2 py-1.5 text-center">
      <p className="flex items-center justify-center gap-1 text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
      </p>
      <p className="truncate text-[12px] font-semibold text-foreground">{value}</p>
    </div>
  );

  return (
    <div
      className={`rounded-lg border border-amber-200 bg-amber-50/70 px-2 py-2 dark:border-amber-500/30 dark:bg-amber-500/10 ${className}`}
    >
      <div className="flex items-center gap-1.5">
        <Metric icon={<Route className="h-3 w-3" />} label="Distance" value={km != null ? `${km} km` : "—"} />
        <Metric icon={<Timer className="h-3 w-3" />} label="Travel" value={travelMins != null ? `${travelMins} min` : "—"} />
        <Metric icon={<Timer className="h-3 w-3" />} label="Meeting" value={meetingMins != null ? `${meetingMins} min` : "—"} />
      </div>

      <div className="mt-1.5 flex items-center justify-between gap-2 border-t border-dashed border-amber-300 pt-1.5 dark:border-amber-500/30">
        <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-300">
          <IndianRupee className="h-3 w-3" /> Travel expense
        </span>
        <span className="flex items-center gap-1.5">
          {vehicle && (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">
              <VIcon className="h-3 w-3" />
              {vehicle}
            </span>
          )}
          <span className="text-[13px] font-bold text-foreground">{amount != null ? inr(amount) : "—"}</span>
        </span>
      </div>

      {expense && !expense.is_no_vehicle && (
        <p className="mt-0.5 text-right text-[10px] text-muted-foreground">
          {fixed ? "Fixed per day" : km != null ? `${km} km × ${inr(expense.rate)}/km` : `${inr(expense.rate)}/km`}
        </p>
      )}
    </div>
  );
}

export default ActivityExpenseStrip;
