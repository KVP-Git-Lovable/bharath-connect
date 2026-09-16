import { useState } from "react";
import { format } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useVehicleRates } from "@/hooks/useVehicleRates";

const fmtDate = (d: string | null) => (d ? format(new Date(`${d}T00:00:00`), "dd MMM yyyy") : "Ongoing");

export default function VehicleRateHistory({ vehicleTypeId, vehicleName }: { vehicleTypeId: string; vehicleName: string }) {
  const queryClient = useQueryClient();
  const { rates, loading, currentRate } = useVehicleRates(vehicleTypeId);
  const [rate, setRate] = useState("");
  const [from, setFrom] = useState(format(new Date(), "yyyy-MM-dd"));
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const addRate = async () => {
    const value = Number(rate);
    if (!Number.isFinite(value) || value <= 0) {
      toast.error("Enter a valid per KM rate");
      return;
    }
    if (rates.some((r) => r.effective_from === from)) {
      toast.error("A rate already starts on this date");
      return;
    }
    setSaving(true);
    try {
      const prev = rates.find((r) => r.effective_from < from && (!r.effective_to || r.effective_to >= from));
      if (prev) {
        const end = new Date(`${from}T00:00:00`);
        end.setDate(end.getDate() - 1);
        const { error } = await supabase
          .from("vehicle_rate_history" as any)
          .update({ effective_to: format(end, "yyyy-MM-dd") })
          .eq("id", prev.id);
        if (error) throw error;
      }
      const { error } = await supabase
        .from("vehicle_rate_history" as any)
        .insert({ vehicle_type_id: vehicleTypeId, per_km_rate: value, effective_from: from, note: note.trim() || null } as any);
      if (error) throw error;

      setRate("");
      setNote("");
      queryClient.invalidateQueries({ queryKey: ["vehicle-rate-history", vehicleTypeId] });
      toast.success(`${vehicleName} rate added — earlier records keep their old rate`);
    } catch (e: any) {
      toast.error(e?.message || "Could not add the rate");
    } finally {
      setSaving(false);
    }
  };

  const removeRate = async (id: string) => {
    const { error } = await supabase.from("vehicle_rate_history" as any).delete().eq("id", id);
    if (error) { toast.error("Could not delete the rate"); return; }
    queryClient.invalidateQueries({ queryKey: ["vehicle-rate-history", vehicleTypeId] });
    toast.success("Rate removed");
  };

  const today = format(new Date(), "yyyy-MM-dd");

  return (
    <div className="space-y-3 rounded-md border border-border/60 bg-muted/10 p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm font-semibold text-foreground">{vehicleName} rate</p>
        <Badge variant="secondary" className="w-fit text-sm">Current: <span className="font-bold">₹{currentRate}/km</span></Badge>
      </div>

      {loading ? (
        <div className="flex justify-center py-3"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="overflow-x-auto rounded-md border border-border/60">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Rate (₹/km)</TableHead>
                <TableHead className="text-xs">Effective From</TableHead>
                <TableHead className="text-xs">Effective To</TableHead>
                <TableHead className="text-xs">Note</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rates.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-xs text-muted-foreground">No rates configured yet</TableCell></TableRow>
              ) : rates.map((r) => {
                const active = r.effective_from <= today && (!r.effective_to || r.effective_to >= today);
                return (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs font-medium">
                      ₹{r.per_km_rate}
                      {active && <Badge className="ml-2 text-[10px]">Active</Badge>}
                    </TableCell>
                    <TableCell className="text-xs">{fmtDate(r.effective_from)}</TableCell>
                    <TableCell className="text-xs">{fmtDate(r.effective_to)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.note || "--"}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeRate(r.id)}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(110px,0.6fr)_minmax(150px,0.7fr)_minmax(180px,1.3fr)_auto] lg:items-end">
        <div className="space-y-1">
          <Label className="text-xs">New Rate (₹/km)</Label>
          <Input type="number" min="0" step="0.5" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="e.g. 9" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Effective From</Label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Note (optional)</Label>
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reason for revision" />
        </div>
        <Button onClick={addRate} disabled={saving} size="sm" className="h-9 w-full lg:w-auto">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Plus className="h-4 w-4 mr-1" />Add</>}
        </Button>
      </div>
    </div>
  );
}
