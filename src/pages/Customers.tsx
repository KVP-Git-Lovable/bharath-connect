import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Plus, Search, Building2 } from "lucide-react";
import {
  useCustomers, useCreateCustomer,
  useOpportunities, useOppStages, useUserLookup,
} from "@/hooks/useCustomers";
import { MobileCardList, MobileCard, Field } from "@/components/ui/mobile-card";
import { sumByCurrency, formatMixedCurrencyTotals } from "@/lib/currency";

const STATUS_OPTIONS = ["active", "prospect", "inactive"];

export default function Customers() {
  const nav = useNavigate();
  const { data: customers = [] } = useCustomers();
  const { data: opps = [] } = useOpportunities();
  const { data: stages = [] } = useOppStages();
  const { data: users = [] } = useUserLookup();

  const usersMap = useMemo(
    () => Object.fromEntries(users.map((u) => [u.id, u.full_name || u.username || u.email])),
    [users]
  );
  const stageMap = useMemo(() => Object.fromEntries(stages.map((s) => [s.name, s])), [stages]);

  const stats = useMemo(() => {
    const m = new Map<string, { open: number; pipelineRows: any[] }>();
    opps.forEach((o) => {
      if (!o.customer_id) return;
      const isClosed = stageMap[o.stage ?? ""]?.is_closed;
      const cur = m.get(o.customer_id) || { open: 0, pipelineRows: [] as any[] };
      if (!isClosed) {
        cur.open += 1;
        cur.pipelineRows.push(o);
      }
      m.set(o.customer_id, cur);
    });
    return m;
  }, [opps, stageMap]);

  const pipelineLabel = (rows: any[]) =>
    formatMixedCurrencyTotals(sumByCurrency(rows, (o) => Number(o.amount || 0), (o) => o.currency));

  const [search, setSearch] = useState("");
  const [fStatus, setFStatus] = useState("all");
  const [fOwner, setFOwner] = useState("all");
  const [newOpen, setNewOpen] = useState(false);

  const filtered = customers.filter((c) => {
    if (fStatus !== "all" && c.status !== fStatus) return false;
    if (fOwner !== "all" && c.owner_id !== fOwner) return false;
    if (search && !(c.name || "").toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Customers</h1>
          <p className="text-sm text-muted-foreground">All customer accounts and their pipeline</p>
        </div>
        <Button size="sm" onClick={() => setNewOpen(true)}>
          <Plus className="h-4 w-4 mr-1" />New Customer
        </Button>
      </div>

      <Card>
        <CardContent className="p-3 grid grid-cols-1 md:grid-cols-3 gap-2">
          <div className="relative">
            <Search className="h-4 w-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search customers…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>
          <Select value={fStatus} onValueChange={setFStatus}>
            <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={fOwner} onValueChange={setFOwner}>
            <SelectTrigger><SelectValue placeholder="Owner" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All owners</SelectItem>
              {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.full_name || u.username || u.email}</SelectItem>)}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {/* Desktop / tablet table */}
          <div className="hidden md:block overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Industry</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead className="text-right">Open Opps</TableHead>
                <TableHead className="text-right">Pipeline Value</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {filtered.map((c) => {
                  const s = stats.get(c.id) || { open: 0, pipelineRows: [] as any[] };
                  return (
                    <TableRow key={c.id} className="cursor-pointer" onClick={() => nav(`/customers/${c.id}`)}>
                      <TableCell className="font-medium flex items-center gap-2">
                        <div className="h-8 w-8 rounded-md bg-primary/10 text-primary flex items-center justify-center">
                          <Building2 className="h-4 w-4" />
                        </div>
                        {c.name}
                      </TableCell>
                      <TableCell>{c.industry || "—"}</TableCell>
                      <TableCell><Badge variant="outline">{c.status}</Badge></TableCell>
                      <TableCell>{c.owner_id ? usersMap[c.owner_id] ?? "—" : "—"}</TableCell>
                      <TableCell className="text-right">{s.open}</TableCell>
                      <TableCell className="text-right font-medium">{pipelineLabel(s.pipelineRows)}</TableCell>
                    </TableRow>
                  );
                })}
                {filtered.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    No customers found. Click "New Customer" to add one.
                  </TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {/* Mobile cards */}
          <MobileCardList className="md:hidden p-3">
            {filtered.map((c) => {
              const s = stats.get(c.id) || { open: 0, pipelineRows: [] as any[] };
              return (
                <MobileCard
                  key={c.id}
                  onClick={() => nav(`/customers/${c.id}`)}
                  title={
                    <span className="flex items-center gap-2">
                      <div className="h-7 w-7 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
                        <Building2 className="h-4 w-4" />
                      </div>
                      <span className="truncate">{c.name}</span>
                    </span>
                  }
                  badge={<Badge variant="outline">{c.status}</Badge>}
                >
                  <Field label="Industry" value={c.industry || "—"} />
                  <Field label="Owner" value={c.owner_id ? usersMap[c.owner_id] ?? "—" : "—"} />
                  <Field label="Open Opps" value={s.open} />
                  <Field label="Pipeline" value={pipelineLabel(s.pipelineRows)} />
                </MobileCard>
              );
            })}
            {filtered.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-8">
                No customers found. Click "New Customer" to add one.
              </p>
            )}
          </MobileCardList>
        </CardContent>
      </Card>


      <NewCustomerDialog open={newOpen} onOpenChange={setNewOpen} />
    </div>
  );
}

function NewCustomerDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const create = useCreateCustomer();
  const { data: users = [] } = useUserLookup();
  const [form, setForm] = useState({ name: "", industry: "", status: "active", owner_id: "" });

  const submit = async () => {
    if (!form.name.trim()) return;
    await create.mutateAsync({
      name: form.name.trim(),
      industry: form.industry || null,
      status: form.status,
      owner_id: form.owner_id || null,
    });
    setForm({ name: "", industry: "", status: "active", owner_id: "" });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>New Customer</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Name *</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <Label>Industry</Label>
            <Input value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Owner</Label>
              <Select value={form.owner_id || "none"} onValueChange={(v) => setForm({ ...form, owner_id: v === "none" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.full_name || u.username || u.email}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!form.name.trim()}>Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
