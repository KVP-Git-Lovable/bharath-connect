import { useMemo, useState } from "react";
import { Activity, BellRing, CheckCircle2, Loader2, MoreVertical, Pencil, Plus, Search, Send, Smartphone, Trash2, Zap } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  receiverLabel,
  sendTestNotification,
  useDeleteNotificationRule,
  useNotificationEventTypes,
  useNotificationRules,
  useNotificationRuleStats,
  usePeopleOptions,
  useToggleNotificationRule,
  type NotificationRule,
} from "@/hooks/useNotificationRules";
import RuleEditorDialog from "./RuleEditorDialog";

function StatCard({ icon: Icon, label, value, tone }: { icon: typeof BellRing; label: string; value: number | string; tone: string }) {
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

export default function NotificationCenterTab() {
  const { data: rules = [], isLoading } = useNotificationRules();
  const { data: eventTypes = [] } = useNotificationEventTypes();
  const { data: stats } = useNotificationRuleStats();
  const { data: people } = usePeopleOptions();
  const toggle = useToggleNotificationRule();
  const remove = useDeleteNotificationRule();

  const [search, setSearch] = useState("");
  const [moduleFilter, setModuleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [editing, setEditing] = useState<NotificationRule | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [deleting, setDeleting] = useState<NotificationRule | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);

  const eventLabel = (r: NotificationRule) =>
    eventTypes.find((e) => e.source_table === r.source_table && e.event_code === r.event_code);
  const userName = (id: string | null) => people?.users.find((u) => u.id === id)?.name;

  const modules = useMemo(() => {
    const m = new Map<string, string>();
    eventTypes.forEach((e) => m.set(e.source_table, e.module_label));
    return Array.from(m, ([value, label]) => ({ value, label }));
  }, [eventTypes]);

  const filtered = rules.filter((r) => {
    if (moduleFilter !== "all" && r.source_table !== moduleFilter) return false;
    if (statusFilter === "active" && !r.is_active) return false;
    if (statusFilter === "inactive" && r.is_active) return false;
    if (search) {
      const q = search.toLowerCase();
      const ev = eventLabel(r);
      return [r.name, r.title_template, ev?.label, ev?.module_label].some((s) => s?.toLowerCase().includes(q));
    }
    return true;
  });

  const openNew = () => {
    setEditing(null);
    setEditorOpen(true);
  };
  const openEdit = (r: NotificationRule) => {
    setEditing(r);
    setEditorOpen(true);
  };

  const onToggle = async (r: NotificationRule, v: boolean) => {
    try {
      await toggle.mutateAsync({ id: r.id, is_active: v });
      toast.success(v ? `"${r.name}" is on` : `"${r.name}" is off`);
    } catch (e) {
      toast.error("Could not update rule", { description: (e as Error).message });
    }
  };

  const onTest = async (r: NotificationRule) => {
    setTestingId(r.id);
    try {
      const res = await sendTestNotification(r.id);
      toast.success("Test sent to you", {
        description: res?.push ? "Check the bell and your phone." : "Check the bell (push is off for this rule).",
      });
    } catch (e) {
      toast.error("Test failed", { description: (e as Error).message });
    } finally {
      setTestingId(null);
    }
  };

  const onDelete = async () => {
    if (!deleting) return;
    try {
      await remove.mutateAsync(deleting.id);
      toast.success("Rule deleted");
    } catch (e) {
      toast.error("Could not delete rule", { description: (e as Error).message });
    } finally {
      setDeleting(null);
    }
  };

  const activeCount = rules.filter((r) => r.is_active).length;

  const RuleActions = ({ r }: { r: NotificationRule }) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Rule actions">
          {testingId === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreVertical className="h-4 w-4" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => openEdit(r)}>
          <Pencil className="h-4 w-4 mr-2" /> Edit
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onTest(r)}>
          <Send className="h-4 w-4 mr-2" /> Send test to me
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeleting(r)}>
          <Trash2 className="h-4 w-4 mr-2" /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Notification Center</h2>
          <p className="text-sm text-muted-foreground">Automatically notify people when something happens in the app.</p>
        </div>
        <Button onClick={openNew} className="shrink-0">
          <Plus className="h-4 w-4 mr-1.5" /> New rule
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={BellRing} label="Total rules" value={rules.length} tone="bg-violet-100 text-violet-600" />
        <StatCard icon={CheckCircle2} label="Active" value={activeCount} tone="bg-emerald-100 text-emerald-600" />
        <StatCard icon={Zap} label="Events today" value={stats?.eventsToday ?? "–"} tone="bg-amber-100 text-amber-600" />
        <StatCard icon={Activity} label="Sent (7 days)" value={stats?.sent7d ?? "–"} tone="bg-sky-100 text-sky-600" />
      </div>

      <Card>
        <CardContent className="p-3 sm:p-4 space-y-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search rules…" className="pl-8" />
            </div>
            <div className="flex gap-2">
              <Select value={moduleFilter} onValueChange={setModuleFilter}>
                <SelectTrigger className="w-full sm:w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All modules</SelectItem>
                  {modules.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {isLoading ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-10 text-center space-y-2">
              <BellRing className="h-8 w-8 mx-auto text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {rules.length === 0 ? "No rules yet." : "No rules match these filters."}
              </p>
              {rules.length === 0 && (
                <Button variant="outline" size="sm" onClick={openNew}>
                  <Plus className="h-4 w-4 mr-1" /> Create the first rule
                </Button>
              )}
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Rule</TableHead>
                      <TableHead>When</TableHead>
                      <TableHead>Send to</TableHead>
                      <TableHead>Delivery</TableHead>
                      <TableHead className="w-20">Active</TableHead>
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((r) => {
                      const ev = eventLabel(r);
                      return (
                        <TableRow key={r.id} className={r.is_active ? "" : "opacity-70"}>
                          <TableCell>
                            <button className="text-left" onClick={() => openEdit(r)}>
                              <p className="font-medium text-sm hover:underline">{r.name}</p>
                              <p className="text-xs text-muted-foreground line-clamp-1">{r.title_template}</p>
                            </button>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="font-normal mr-1">
                              {ev?.module_label ?? r.source_table}
                            </Badge>
                            <span className="text-sm">{ev?.label ?? r.event_code}</span>
                          </TableCell>
                          <TableCell className="text-sm">
                            {receiverLabel(r, userName(r.receiver_user_id))}
                            {r.include_secondary_manager && (
                              <span className="text-xs text-muted-foreground"> + secondary</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {r.notification_channel === "in_app_push" ? (
                              <Badge variant="secondary" className="font-normal gap-1">
                                <Smartphone className="h-3 w-3" /> In-app + push
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="font-normal">In-app</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <Switch checked={r.is_active} onCheckedChange={(v) => onToggle(r, v)} aria-label="Active" />
                          </TableCell>
                          <TableCell>
                            <RuleActions r={r} />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile cards */}
              <div className="md:hidden space-y-2">
                {filtered.map((r) => {
                  const ev = eventLabel(r);
                  return (
                    <div key={r.id} className={`rounded-lg border p-3 ${r.is_active ? "" : "opacity-70"}`}>
                      <div className="flex items-start justify-between gap-2">
                        <button className="text-left min-w-0" onClick={() => openEdit(r)}>
                          <p className="font-medium text-sm truncate">{r.name}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {ev?.module_label ?? r.source_table} · {ev?.label ?? r.event_code}
                          </p>
                        </button>
                        <div className="flex items-center gap-1 shrink-0">
                          <Switch checked={r.is_active} onCheckedChange={(v) => onToggle(r, v)} aria-label="Active" />
                          <RuleActions r={r} />
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 mt-2">
                        <Badge variant="outline" className="font-normal text-[11px]">
                          {receiverLabel(r, userName(r.receiver_user_id))}
                        </Badge>
                        {r.notification_channel === "in_app_push" && (
                          <Badge variant="secondary" className="font-normal text-[11px] gap-1">
                            <Smartphone className="h-3 w-3" /> Push
                          </Badge>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <RuleEditorDialog open={editorOpen} onOpenChange={setEditorOpen} rule={editing} />

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this rule?</AlertDialogTitle>
            <AlertDialogDescription>
              "{deleting?.name}" will stop sending notifications. Notifications already sent are kept. To pause it
              instead, switch it off.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={onDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
