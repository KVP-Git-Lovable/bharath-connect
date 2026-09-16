import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Switch } from "@/components/ui/switch";
import { Loader2, Car as CarIcon, Bike, Truck, Bus, MapPinOff, ChevronDown, ChevronUp, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useVehicleTypes, type VehicleType } from "@/hooks/useVehicleTypes";
import VehicleRateHistory from "./VehicleRateHistory";

const ICONS: Record<string, any> = { bike: Bike, car: CarIcon, truck: Truck, bus: Bus, "map-pin-off": MapPinOff };

interface Role { id: string; name: string; }

export default function VehicleTypesPolicy() {
  const { vehicleTypes, loading: vehiclesLoading, refetch: refetchVehicles } = useVehicleTypes(false);
  const [roles, setRoles] = useState<Role[]>([]);
  const [eligibility, setEligibility] = useState<Set<string>>(new Set()); // "profileId:vehicleTypeId"
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [rolesRes, elgRes] = await Promise.all([
      supabase.from("security_profiles" as any).select("id, name").order("name"),
      supabase.from("role_vehicle_types" as any).select("profile_id, vehicle_type_id"),
    ]);
    setRoles(((rolesRes.data || []) as any[]).map((r) => ({ id: r.id, name: r.name })));
    setEligibility(new Set(((elgRes.data || []) as any[]).map((r) => `${r.profile_id}:${r.vehicle_type_id}`)));
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const toggleActive = async (v: VehicleType, active: boolean) => {
    await supabase.from("vehicle_types" as any).update({ is_active: active }).eq("id", v.id);
    refetchVehicles();
  };

  const toggleEligibility = async (profileId: string, vehicleTypeId: string) => {
    const key = `${profileId}:${vehicleTypeId}`;
    const isSet = eligibility.has(key);
    // Optimistic update
    setEligibility((prev) => {
      const next = new Set(prev);
      if (isSet) next.delete(key); else next.add(key);
      return next;
    });
    if (isSet) {
      const { error } = await supabase.from("role_vehicle_types" as any)
        .delete().eq("profile_id", profileId).eq("vehicle_type_id", vehicleTypeId);
      if (error) { toast.error("Could not update"); fetchAll(); }
    } else {
      const { error } = await supabase.from("role_vehicle_types" as any)
        .insert({ profile_id: profileId, vehicle_type_id: vehicleTypeId } as any);
      if (error) { toast.error("Could not update"); fetchAll(); }
    }
  };

  if (loading || vehiclesLoading) {
    return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  const ratedVehicles = vehicleTypes.filter((v) => !v.is_no_vehicle);
  const noVehicleOption = vehicleTypes.find((v) => v.is_no_vehicle);

  return (
    <div className="space-y-5">
      <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
        <Info className="h-4 w-4 mt-0.5 shrink-0" />
        <span>Each vehicle has its own per-km rate and history. TA for a day is priced using whichever vehicle the person selected on the Activities page that day{noVehicleOption ? `; picking "${noVehicleOption.name}" means no vehicle was used, so no per-km TA applies that day` : ""}.</span>
      </p>

      <div className="space-y-2">
        {ratedVehicles.map((v) => {
          const Icon = ICONS[v.icon || ""] || CarIcon;
          const isOpen = expanded === v.id;
          return (
            <Collapsible key={v.id} open={isOpen} onOpenChange={() => setExpanded(isOpen ? null : v.id)}>
              <div className="flex items-center justify-between gap-3 rounded-md border border-border/70 p-3">
                <CollapsibleTrigger className="flex flex-1 items-center gap-3 text-left">
                  <span className="flex h-9 w-9 items-center justify-center rounded-md bg-info/10 text-info shrink-0"><Icon className="h-4 w-4" /></span>
                  <span className="font-medium">{v.name}</span>
                  {isOpen ? <ChevronUp className="h-4 w-4 ml-auto" /> : <ChevronDown className="h-4 w-4 ml-auto" />}
                </CollapsibleTrigger>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-muted-foreground">{v.is_active ? "Active" : "Inactive"}</span>
                  <Switch checked={v.is_active} onCheckedChange={(val) => toggleActive(v, val)} />
                </div>
              </div>
              <CollapsibleContent>
                <div className="mt-2">
                  <VehicleRateHistory vehicleTypeId={v.id} vehicleName={v.name} />
                </div>
              </CollapsibleContent>
            </Collapsible>
          );
        })}
        {noVehicleOption && (
          <div className="flex items-center justify-between gap-3 rounded-md border border-dashed border-border/70 p-3">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-md bg-muted text-muted-foreground shrink-0"><MapPinOff className="h-4 w-4" /></span>
              <div>
                <p className="font-medium">{noVehicleOption.name}</p>
                <p className="text-xs text-muted-foreground">No vehicle used — no per-km rate, no TA for that day.</p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs text-muted-foreground">{noVehicleOption.is_active ? "Active" : "Inactive"}</span>
              <Switch checked={noVehicleOption.is_active} onCheckedChange={(val) => toggleActive(noVehicleOption, val)} />
            </div>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <div>
          <p className="text-sm font-semibold text-foreground">Which vehicles can each role use</p>
          <p className="text-xs text-muted-foreground">A role with nothing ticked can use every active vehicle — tick to restrict it instead.</p>
        </div>
        <div className="overflow-x-auto rounded-md border border-border/60">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Role</TableHead>
                {vehicleTypes.map((v) => <TableHead key={v.id} className="text-xs text-center">{v.name}</TableHead>)}
              </TableRow>
            </TableHeader>
            <TableBody>
              {roles.length === 0 ? (
                <TableRow><TableCell colSpan={vehicleTypes.length + 1} className="text-center text-xs text-muted-foreground py-4">No roles found.</TableCell></TableRow>
              ) : roles.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-sm font-medium">{r.name}</TableCell>
                  {vehicleTypes.map((v) => (
                    <TableCell key={v.id} className="text-center">
                      <Checkbox
                        checked={eligibility.has(`${r.id}:${v.id}`)}
                        onCheckedChange={() => toggleEligibility(r.id, v.id)}
                      />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
