import { useState } from "react";
import { format, isToday } from "date-fns";
import { CalendarClock, CheckCircle2, FileBarChart, History, Loader2, MoreVertical, Pause, Pencil, Play, Plus, Search, Send, Smartphone, Trash2, Inbox } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  RECIPIENT_MODES, moduleName, periodName, scheduleText,
  useDeleteSubscription, useDeliveryLog, useDeliveryStats, useReportSubscriptions, useRunNow, useSetSubscriptionStatus,
  type ReportSubscription,
} from "@/hooks/useReportSubscriptions";
import SubscriptionEditorDialog from "./SubscriptionEditorDialog";

function Stat({ icon: Icon, label, value, tone }: { icon: typeof Inbox; label: string; value: number | string; tone: string }) {
  return (
    <Card>
      <CardContent className="p-3 sm:p-4 flex items-center gap-3">
        <div className={`h-9 w-9 sm:h-10 sm:w-10 rounded-lg flex items-center justify-center shrink-0 ${tone}`}>
          <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-xl sm:text-2xl font-bold leading-none">{value}</p>
          <p className="text-[11px] sm:text-xs text-muted-foreground mt-1 truncate">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

const recipientsText = (s: ReportSubscription) =>
  s.recipient_mode === "users"
    ? `${s.recipient_user_ids.length} ${s.recipient_user_ids.length === 1 ? "person" : "people"}`
    : s.recipient_mode === "role"
      ? `Profile: ${s.recipient_role}`
      : RECIPIENT_MODES.find((m) => m.value === s.recipient_mode)?.label ?? s.recipient_mode;

const when = (iso: string | null) => (iso ? format(new Date(iso), isToday(new Date(iso)) ? "'Today' h:mm a" : "d MMM, h:mm a") : "—");

function DeliveryHistoryDialog({ sub, onClose }: { sub: ReportSubscription | null; onClose: () => void }) {
  const { data = [], isLoading } = useDeliveryLog(sub?.id ?? null);
  const tone: Record<string, string> = {
    sent: "bg-emerald-100 text-emerald-700",
    no_recipients: "bg-amber-100 text-amber-800",
    failed: "bg-red-100 text-red-700",
    running: "bg-slate-100 text-slate-700",
  };
  return (
    <Dialog open={!!sub} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Delivery history</DialogTitle>
          <DialogDescription>{sub?.name} — last 50 runs</DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : data.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Not sent yet.</p>
        ) : (
          <div className="divide-y rounded-lg border">
            {data.map((d) => (
              <div key={d.id} className="flex items-start justify-between gap-3 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm">
                    {format(new Date(d.created_at), "d MMM yyyy, h:mm a")}
                    {d.is_manual && <Badge variant="outline" className="ml-1.5 font-normal text-[10px]">Run now</Badge>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {d.period_from ? `Covers ${d.period_from === d.period_to ? d.period_from : `${d.period_from} → ${d.period_to}`}` : ""}
                    {d.error ? ` · ${d.error}` : ""}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] ${tone[d.status] ?? tone['running']}`}>
                    {d.status === "no_recipients" ? "No recipients" : d.status[0]!.toUpperCase() + d.status.slice(1)}
                  </span>
                  <p className="text-[11px] text-muted-foreground mt-1">{d.recipients} sent</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function ReportSubscriptionsTab() {
  const { data: subs = [], isLoading } = useReportSubscriptions();
  const { data: stats } = useDeliveryStats();
  const setStatus = useSetSubscriptionStatus();
  const remove = useDeleteSubscription();
  const runNow = useRunNow();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [editing, setEditing] = useState<ReportSubscription | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [deleting, setDeleting] = useState<ReportSubscription | null>(null);
  const [historyFor, setHistoryFor] = useState<ReportSubscription | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);

  const filtered = subs.filter((s) => {
    if (statusFilter !== "all" && s.status !== statusFilter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return [s.name, moduleName(s.module), s.saved_report_name].some((v) => v?.toLowerCase().includes(q));
  });

  const openNew = () => { setEditing(null); setEditorOpen(true); };
  const openEdit = (s: ReportSubscription) => { setEditing(s); setEditorOpen(true); };

  const toggle = async (s: ReportSubscription, on: boolean) => {
    try {
      await setStatus.mutateAsync({ id: s.id, status: on ? "active" : "paused" });
      toast.success(on ? `"${s.name}" resumed` : `"${s.name}" paused`);
    } catch (e) {
      toast.error("Could not update", { description: (e as Error).message });
    }
  };

  const onRunNow = async (s: ReportSubscription) => {
    setRunningId(s.id);
    try {
      const n = await runNow.mutateAsync(s.id);
      if (n > 0) toast.success(`Sent to ${n} ${n === 1 ? "person" : "people"}`, { description: "The schedule is unchanged." });
      else toast.warning("Nobody received it", { description: "No active users match the recipients." });
    } catch (e) {
      toast.error("Run failed", { description: (e as Error).message });
    } finally {
      setRunningId(null);
    }
  };

  const onDelete = async () => {
    if (!deleting) return;
    try {
      await remove.mutateAsync(deleting.id);
      toast.success("Subscription deleted");
    } catch (e) {
      toast.error("Could not delete", { description: (e as Error).message });
    } finally {
      setDeleting(null);
    }
  };

  const active = subs.filter((s) => s.status === "active");
  const today = active.filter((s) => s.next_run_at && isToday(new Date(s.next_run_at))).length;

  const Actions = ({ s }: { s: ReportSubscription }) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Subscription actions">
          {runningId === s.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreVertical className="h-4 w-4" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => openEdit(s)}><Pencil className="h-4 w-4 mr-2" /> Edit</DropdownMenuItem>
        <DropdownMenuItem onClick={() => onRunNow(s)}><Send className="h-4 w-4 mr-2" /> Run now</DropdownMenuItem>
        <DropdownMenuItem onClick={() => setHistoryFor(s)}><History className="h-4 w-4 mr-2" /> Delivery history</DropdownMenuItem>
        <DropdownMenuItem onClick={() => toggle(s, s.status !== "active")}>
          {s.status === "active" ? <><Pause className="h-4 w-4 mr-2" /> Pause</> : <><Play className="h-4 w-4 mr-2" /> Resume</>}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeleting(s)}>
          <Trash2 className="h-4 w-4 mr-2" /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Report Subscriptions</h2>
          <p className="text-sm text-muted-foreground">Schedule a report and deliver it in-app, with optional phone push.</p>
        </div>
        <Button onClick={openNew} className="shrink-0"><Plus className="h-4 w-4 mr-1.5" /> New subscription</Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat icon={FileBarChart} label="Total subscriptions" value={subs.length} tone="bg-violet-100 text-violet-600" />
        <Stat icon={CheckCircle2} label="Active" value={active.length} tone="bg-emerald-100 text-emerald-600" />
        <Stat icon={CalendarClock} label="Scheduled today" value={today} tone="bg-amber-100 text-amber-600" />
        <Stat icon={Inbox} label="Delivered (7 days)" value={stats?.delivered7d ?? "–"} tone="bg-sky-100 text-sky-600" />
      </div>

      <Card>
        <CardContent className="p-3 sm:p-4 space-y-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search subscriptions…" className="pl-8" />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="paused">Paused</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
          ) : filtered.length === 0 ? (
            <div className="py-10 text-center space-y-2">
              <FileBarChart className="h-8 w-8 mx-auto text-muted-foreground" />
              <p className="text-sm text-muted-foreground">{subs.length === 0 ? "No subscriptions yet." : "No subscriptions match."}</p>
              {subs.length === 0 && (
                <Button variant="outline" size="sm" onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Create the first one</Button>
              )}
            </div>
          ) : (
            <>
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Subscription</TableHead>
                      <TableHead>Schedule</TableHead>
                      <TableHead>Recipients</TableHead>
                      <TableHead>Next run</TableHead>
                      <TableHead>Last sent</TableHead>
                      <TableHead className="w-20">Active</TableHead>
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((s) => (
                      <TableRow key={s.id} className={s.status === "active" ? "" : "opacity-70"}>
                        <TableCell>
                          <button className="text-left" onClick={() => openEdit(s)}>
                            <p className="font-medium text-sm hover:underline">{s.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {moduleName(s.module)} · {periodName(s.period)}
                              {s.saved_report_name ? ` · ${s.saved_report_name}` : ""}
                            </p>
                          </button>
                        </TableCell>
                        <TableCell className="text-sm">{scheduleText(s)}</TableCell>
                        <TableCell className="text-sm">
                          {recipientsText(s)}
                          {s.push_to_phone && <Smartphone className="inline h-3.5 w-3.5 ml-1 text-muted-foreground" aria-label="Push" />}
                        </TableCell>
                        <TableCell className="text-sm">{s.status === "active" ? when(s.next_run_at) : "Paused"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{when(s.last_run_at)}</TableCell>
                        <TableCell><Switch checked={s.status === "active"} onCheckedChange={(v) => toggle(s, v)} aria-label="Active" /></TableCell>
                        <TableCell><Actions s={s} /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="md:hidden space-y-2">
                {filtered.map((s) => (
                  <div key={s.id} className={`rounded-lg border p-3 ${s.status === "active" ? "" : "opacity-70"}`}>
                    <div className="flex items-start justify-between gap-2">
                      <button className="text-left min-w-0" onClick={() => openEdit(s)}>
                        <p className="font-medium text-sm truncate">{s.name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{moduleName(s.module)} · {periodName(s.period)}</p>
                      </button>
                      <div className="flex items-center gap-1 shrink-0">
                        <Switch checked={s.status === "active"} onCheckedChange={(v) => toggle(s, v)} aria-label="Active" />
                        <Actions s={s} />
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 mt-2 text-[11px]">
                      <Badge variant="outline" className="font-normal">{scheduleText(s)}</Badge>
                      <Badge variant="outline" className="font-normal">{recipientsText(s)}</Badge>
                      {s.status === "active" && <span className="text-muted-foreground">Next: {when(s.next_run_at)}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <SubscriptionEditorDialog open={editorOpen} onOpenChange={setEditorOpen} subscription={editing} />
      <DeliveryHistoryDialog sub={historyFor} onClose={() => setHistoryFor(null)} />

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this subscription?</AlertDialogTitle>
            <AlertDialogDescription>
              "{deleting?.name}" will stop sending. Reports already delivered stay in people's notifications. To stop it
              temporarily, pause it instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={onDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
