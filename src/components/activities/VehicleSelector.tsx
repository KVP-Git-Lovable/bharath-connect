import { Car as CarIcon, Bike, Truck, Bus, MapPinOff, Loader2 } from "lucide-react";
import { useDailyVehicleSelection } from "@/hooks/useDailyVehicleSelection";
import { cn } from "@/lib/utils";

const ICONS: Record<string, any> = { bike: Bike, car: CarIcon, truck: Truck, bus: Bus, "map-pin-off": MapPinOff };

export default function VehicleSelector({ userId, dateStr }: { userId: string; dateStr: string }) {
  const { loading, saving, eligibleVehicles, selectedId, selectVehicle } = useDailyVehicleSelection(userId, dateStr);

  if (loading) {
    return <div className="flex items-center gap-2 py-1 text-xs text-primary-foreground/70"><Loader2 className="h-3.5 w-3.5 animate-spin" />Loading vehicles…</div>;
  }
  if (!eligibleVehicles.length) return null;

  return (
    <div className="mt-3">
      <p className="mb-1.5 text-xs text-primary-foreground/70">Vehicle used today</p>
      <div className="grid grid-cols-5 gap-1.5">
        {eligibleVehicles.map((v) => {
          const Icon = ICONS[v.icon || ""] || CarIcon;
          const isSelected = selectedId === v.id;
          return (
            <button
              key={v.id}
              type="button"
              disabled={saving}
              onClick={() => selectVehicle(v.id)}
              aria-pressed={isSelected}
              className={cn(
                "flex flex-col items-center justify-center gap-1 rounded-lg py-2 text-center transition-colors disabled:opacity-60",
                isSelected ? "bg-white text-primary font-semibold ring-2 ring-white" : "bg-white/15 text-primary-foreground/80 hover:bg-white/25"
              )}
            >
              <Icon className="h-4 w-4" />
              <span className="text-[10px] leading-tight">{v.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
