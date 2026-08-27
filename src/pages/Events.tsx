import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Search, Calendar, IndianRupee, Wallet, Activity } from "lucide-react";
import { useEvents, eventStatus } from "@/hooks/useLeadsEvents";
import { EventForm } from "@/components/leads/EventForm";
import { format } from "date-fns";

function KpiCard({ icon: Icon, label, value, color }: any) {
  return (
    <Card><CardContent className="p-4 flex items-center gap-3">
      <div className={`p-2 rounded-lg ${color}`}><Icon className="h-5 w-5" /></div>
      <div><div className="text-xs text-muted-foreground">{label}</div><div className="text-xl font-bold">{value}</div></div>
    </CardContent></Card>
  );
}

export default function Events() {
  const nav = useNavigate();
  const { data: events = [] } = useEvents();

  const [q, setQ] = useState("");
  const [eventOpen, setEventOpen] = useState(false);

  const kpis = useMemo(() => {
    const totalBudget = events.reduce((s, e) => s + Number(e.budget_amount || 0), 0);
    const totalActual = events.reduce((s, e: any) => s + Number(e.actual_amount || 0), 0);
    const active = events.filter((e) => eventStatus(e) === "Ongoing").length;
    return { totalEvents: events.length, totalBudget, totalActual, active };
  }, [events]);

  const filteredEvents = events.filter((e) => !q || e.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <motion.div className="p-4 md:p-6 space-y-4 max-w-7xl mx-auto" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div>
        <h1 className="text-2xl font-bold">Events</h1>
        <p className="text-sm text-muted-foreground">Plan events and track budgets & outcomes</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard icon={Calendar} label="Total Events" value={kpis.totalEvents} color="bg-purple-100 text-purple-600" />
        <KpiCard icon={Activity} label="Ongoing" value={kpis.active} color="bg-blue-100 text-blue-600" />
        <KpiCard icon={IndianRupee} label="Budget" value={`₹${kpis.totalBudget.toLocaleString()}`} color="bg-amber-100 text-amber-600" />
        <KpiCard icon={Wallet} label="Actual" value={`₹${kpis.totalActual.toLocaleString()}`} color="bg-emerald-100 text-emerald-600" />
      </div>

      <div className="flex items-center justify-end gap-2 flex-wrap">
        <div className="relative"><Search className="h-4 w-4 absolute left-2 top-2.5 text-muted-foreground" /><Input placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} className="pl-8 w-56" /></div>
        <Button size="sm" onClick={() => setEventOpen(true)}><Plus className="h-4 w-4 mr-1" />New Event</Button>
      </div>

      <Card><CardContent className="p-0 overflow-x-auto">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Name</TableHead><TableHead>Start</TableHead><TableHead>End</TableHead>
            <TableHead>Budget</TableHead><TableHead>Status</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {filteredEvents.map((e) => {
              const s = eventStatus(e);
              return (
                <TableRow key={e.id} className="cursor-pointer" onClick={() => nav(`/events/${e.id}`)}>
                  <TableCell className="font-medium">{e.name}</TableCell>
                  <TableCell>{e.start_date ? format(new Date(e.start_date), "dd MMM yyyy") : "—"}</TableCell>
                  <TableCell>{e.end_date ? format(new Date(e.end_date), "dd MMM yyyy") : "—"}</TableCell>
                  <TableCell>₹{Number(e.budget_amount).toLocaleString()}</TableCell>
                  <TableCell><Badge variant="outline">{s}</Badge></TableCell>
                </TableRow>
              );
            })}
            {filteredEvents.length === 0 && <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No events yet</TableCell></TableRow>}
          </TableBody>
        </Table>
      </CardContent></Card>

      <EventForm open={eventOpen} onOpenChange={setEventOpen} />
    </motion.div>
  );
}
