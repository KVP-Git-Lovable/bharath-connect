import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Edit, Plus, Users } from "lucide-react";
import { useEvent, useEventTypes, useLeadsForEvent, useLeadStatuses, eventStatus, statusColorClasses } from "@/hooks/useLeadsEvents";
import { EventForm } from "@/components/leads/EventForm";
import { LeadForm } from "@/components/leads/LeadForm";
import { format } from "date-fns";
import { useMemo } from "react";

export default function EventDetail() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const { data: event, isLoading } = useEvent(id);
  const { data: types = [] } = useEventTypes(false);
  const { data: leads = [] } = useLeadsForEvent(id);
  const { data: statuses = [] } = useLeadStatuses(false);
  const statusMap = useMemo(() => Object.fromEntries(statuses.map((s) => [s.id, s])), [statuses]);

  const [editOpen, setEditOpen] = useState(false);
  const [leadOpen, setLeadOpen] = useState(false);

  if (isLoading || !event) return <div className="p-6 text-muted-foreground">Loading…</div>;

  const type = types.find((t) => t.id === event.event_type_id);
  const s = eventStatus(event);
  const converted = leads.filter((l) => !!l.converted_customer_id).length;

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-5xl mx-auto">
      <Button variant="ghost" size="sm" onClick={() => nav("/events")} className="-ml-2">
        <ArrowLeft className="h-4 w-4 mr-1" />Back
      </Button>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-xl flex items-center gap-2 flex-wrap">
              {event.name}
              <Badge variant="outline">{s}</Badge>
              {type && <Badge variant="secondary">{type.name}</Badge>}
            </CardTitle>
            <div className="text-sm text-muted-foreground">
              {event.start_date ? format(new Date(event.start_date), "dd MMM yyyy") : "—"} → {event.end_date ? format(new Date(event.end_date), "dd MMM yyyy") : "—"}
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}><Edit className="h-4 w-4 mr-1" />Edit</Button>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div><div className="text-xs text-muted-foreground">Budget</div><div className="font-semibold">₹{Number(event.budget_amount).toLocaleString()}</div></div>
          <div><div className="text-xs text-muted-foreground">Actual</div><div className="font-semibold">₹{Number(event.actual_amount).toLocaleString()}</div></div>
          <div><div className="text-xs text-muted-foreground">Leads</div><div className="font-semibold">{leads.length}</div></div>
          <div><div className="text-xs text-muted-foreground">Converted</div><div className="font-semibold">{converted}</div></div>
          {event.event_details && <div className="col-span-full"><div className="text-xs text-muted-foreground">Details</div><div className="text-sm whitespace-pre-wrap">{event.event_details}</div></div>}
          {event.expected_end_result && <div className="col-span-full"><div className="text-xs text-muted-foreground">Expected End Result</div><div className="text-sm whitespace-pre-wrap">{event.expected_end_result}</div></div>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2"><Users className="h-4 w-4" />Leads from this Event</CardTitle>
          <Button size="sm" onClick={() => setLeadOpen(true)}><Plus className="h-4 w-4 mr-1" />Add Lead</Button>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Name</TableHead><TableHead>Company</TableHead>
              <TableHead>Phone</TableHead><TableHead>Status</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {leads.map((l) => {
                const st = l.lead_status_id ? statusMap[l.lead_status_id] : null;
                return (
                  <TableRow key={l.id} className="cursor-pointer" onClick={() => nav(`/leads/${l.id}`)}>
                    <TableCell className="font-medium">{l.name}{l.converted_customer_id && <Badge variant="secondary" className="ml-2">Converted</Badge>}</TableCell>
                    <TableCell>{l.company ?? "—"}</TableCell>
                    <TableCell>{l.phone ?? "—"}</TableCell>
                    <TableCell>{st ? <Badge className={statusColorClasses(st.color)}>{st.name}</Badge> : "—"}</TableCell>
                  </TableRow>
                );
              })}
              {leads.length === 0 && <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No leads captured from this event yet</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <EventForm open={editOpen} onOpenChange={setEditOpen} event={event} />
      <LeadForm open={leadOpen} onOpenChange={setLeadOpen} defaultEventId={event.id} />
    </div>
  );
}
