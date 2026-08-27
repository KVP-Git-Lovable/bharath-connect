import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NumberInput } from "@/components/ui/number-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EventRow, useEventTypes, useSaveEvent } from "@/hooks/useLeadsEvents";
import { useCurrentUser } from "@/hooks/useCurrentUser";

export function EventForm({
  open, onOpenChange, event,
}: { open: boolean; onOpenChange: (v: boolean) => void; event?: EventRow }) {
  const save = useSaveEvent();
  const { data: types = [] } = useEventTypes();
  const { userId } = useCurrentUser();
  const isEdit = !!event;

  const [f, setF] = useState({
    name: "", event_type_id: "", budget_amount: 0, actual_amount: 0,
    start_date: "", end_date: "", event_details: "", expected_end_result: "",
  });

  useEffect(() => {
    if (event) {
      setF({
        name: event.name,
        event_type_id: event.event_type_id ?? "",
        budget_amount: Number(event.budget_amount),
        actual_amount: Number(event.actual_amount),
        start_date: event.start_date ?? "",
        end_date: event.end_date ?? "",
        event_details: event.event_details ?? "",
        expected_end_result: event.expected_end_result ?? "",
      });
    } else {
      setF({ name: "", event_type_id: "", budget_amount: 0, actual_amount: 0, start_date: "", end_date: "", event_details: "", expected_end_result: "" });
    }
  }, [event, open]);

  const submit = async () => {
    if (!f.name.trim()) return;
    await save.mutateAsync({
      id: event?.id,
      name: f.name.trim(),
      event_type_id: f.event_type_id || null,
      budget_amount: Number(f.budget_amount) || 0,
      actual_amount: Number(f.actual_amount) || 0,
      start_date: f.start_date || null,
      end_date: f.end_date || null,
      event_details: f.event_details || null,
      expected_end_result: f.expected_end_result || null,
      owner_id: event?.owner_id ?? userId ?? null,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{isEdit ? "Edit Event" : "New Event"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Event Name *</Label>
            <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>Event Type</Label>
              <Select value={f.event_type_id} onValueChange={(v) => setF({ ...f, event_type_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>{types.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Budget</Label><NumberInput value={f.budget_amount} onValueChange={(v) => setF({ ...f, budget_amount: v })} /></div>
              <div><Label>Actual</Label><NumberInput value={f.actual_amount} onValueChange={(v) => setF({ ...f, actual_amount: v })} /></div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Start Date</Label><Input type="date" value={f.start_date} onChange={(e) => setF({ ...f, start_date: e.target.value })} /></div>
            <div><Label>End Date</Label><Input type="date" value={f.end_date} onChange={(e) => setF({ ...f, end_date: e.target.value })} /></div>
          </div>
          <div>
            <Label>Event Details</Label>
            <Textarea value={f.event_details} onChange={(e) => setF({ ...f, event_details: e.target.value })} rows={3} />
          </div>
          <div>
            <Label>Expected End Result</Label>
            <Textarea value={f.expected_end_result} onChange={(e) => setF({ ...f, expected_end_result: e.target.value })} rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!f.name.trim() || save.isPending}>{isEdit ? "Save" : "Create"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
