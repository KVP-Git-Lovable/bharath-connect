import { Bike, Bus, Car as CarIcon, Loader2, MapPinOff, Pin, PinOff, Truck } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useIsMobile } from "@/hooks/use-mobile";
import { usePinnedVehicle } from "@/hooks/usePinnedVehicle";
import { useVehicleTypes } from "@/hooks/useVehicleTypes";
import { cn } from "@/lib/utils";

const ICONS: Record<string, any> = { bike: Bike, car: CarIcon, truck: Truck, bus: Bus, "map-pin-off": MapPinOff };
const iconFor = (v: { icon: string | null; is_no_vehicle: boolean }) => ICONS[v.icon || ""] || (v.is_no_vehicle ? MapPinOff : CarIcon);

function PinDot() {
  return (
    <span className="flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-white" aria-hidden="true">
      <Pin className="h-2.5 w-2.5 fill-current" />
    </span>
  );
}

/**
 * Small vehicle picker for the Activities header. Choosing a vehicle pins it;
 * tapping the pinned one again (or "Unpin") removes the pin.
 */
export default function VehiclePinPicker({ userId, dateStr }: { userId: string; dateStr: string }) {
  const isMobile = useIsMobile();
  const { loading, saving, vehicles, isToday, shownId, pinnedId, pin, unpin } = usePinnedVehicle(userId, dateStr);
  const { vehicleTypes: allVehicles } = useVehicleTypes(false);

  if (loading) {
    return <Loader2 className="h-4 w-4 animate-spin text-primary-foreground/70" aria-label="Loading vehicles" />;
  }
  if (!vehicles.length) return null;

  const shown = allVehicles.find((v) => v.id === shownId) || null;
  const choose = (id: string) => (id === pinnedId ? unpin() : pin(id));

  // Other dates: show what was recorded, read-only.
  if (!isToday) {
    if (!shown) return <span className="text-[11px] text-primary-foreground/70">No vehicle recorded</span>;
    const Icon = iconFor(shown);
    return (
      <span className="inline-flex h-8 items-center gap-1.5 rounded-full border border-white/20 bg-white/15 px-3 text-xs font-medium text-primary-foreground" title="Vehicle recorded for this day">
        <Icon className="h-3.5 w-3.5" />{shown.name}
      </span>
    );
  }

  if (isMobile) {
    const Icon = shown ? iconFor(shown) : CarIcon;
    return (
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              "inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-semibold",
              shown ? "bg-white text-primary shadow-[0_0_0_3px_rgba(255,255,255,0.28)]" : "animate-pulse border border-amber-400 bg-amber-400/20 text-primary-foreground",
            )}
            aria-label={shown ? `Vehicle: ${shown.name}, pinned. Change vehicle` : "Choose your vehicle"}
          >
            <Icon className="h-4 w-4" />
            {shown ? shown.name : "Choose vehicle"}
            {shown && <PinDot />}
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-60 p-2">
          <p className="px-2 pb-2 text-xs text-muted-foreground">Vehicle you’re travelling with</p>
          {vehicles.map((v) => {
            const VIcon = iconFor(v);
            const on = v.id === pinnedId;
            return (
              <button key={v.id} type="button" disabled={saving} onClick={() => (on ? undefined : pin(v.id))}
                className={cn("flex w-full items-center gap-2.5 rounded-md px-2 py-2.5 text-left text-sm disabled:opacity-60",
                  on ? "bg-primary font-semibold text-primary-foreground" : "hover:bg-muted/60")}>
                <VIcon className="h-4 w-4" />
                <span className="flex-1">{v.name}</span>
                {on ? <PinDot /> : v.is_no_vehicle ? <span className="text-[11px] text-muted-foreground">no TA</span> : null}
              </button>
            );
          })}
          {pinnedId && (
            <button type="button" disabled={saving} onClick={unpin}
              className="mt-1 flex w-full items-center gap-2 border-t px-2 pb-1 pt-2.5 text-sm font-semibold text-destructive disabled:opacity-60">
              <PinOff className="h-4 w-4" />Unpin vehicle
            </button>
          )}
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <p className="flex items-center gap-1.5 text-[11px] text-primary-foreground/75">
        {pinnedId ? <><PinDot />Pinned vehicle · tap it again to unpin</> : <span className="rounded bg-amber-400 px-2 py-0.5 font-semibold text-amber-950">Choose the vehicle you are travelling with today</span>}
      </p>
      <div className="flex flex-wrap justify-end gap-1.5">
        {vehicles.map((v) => {
          const Icon = iconFor(v);
          const on = v.id === pinnedId;
          return (
            <button
              key={v.id}
              type="button"
              disabled={saving}
              onClick={() => choose(v.id)}
              aria-pressed={on}
              title={on ? "Pinned — tap to unpin" : `Pin ${v.name}`}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-xs transition-colors disabled:opacity-60",
                on
                  ? "border-white bg-white font-bold text-primary shadow-[0_0_0_3px_rgba(255,255,255,0.28)]"
                  : "border-white/20 bg-white/15 font-medium text-primary-foreground/90 hover:bg-white/25",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {v.name}
              {on && <PinDot />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
