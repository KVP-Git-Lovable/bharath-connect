import { useEffect, useState } from "react";
import { format, formatDistanceToNow } from "date-fns";
import { AlertTriangle, BellRing, ChevronLeft, ChevronRight, Eye, History, Search, Smartphone, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  DEFAULT_FILTERS,
  DELIVERY_INFO,
  SOURCE_LABELS,
  useNotificationHistory,
  useNotificationHistoryStats,
  type HistoryFilters,
  type HistoryRow,
} from "@/hooks/useNotificationHistory";
import { usePeopleOptions } from "@/hooks/useNotificationRules";
import { moduleLabel } from "@/utils/notificationRoute";
import NotificationDetailSheet from "./NotificationDetailSheet";

const PAGE_SIZE = 25;

function Stat({ icon: Icon, label, value, tone }: { icon: typeof BellRing; label: string; value: string | number; tone: string }) {
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

function DeliveryBadge({ status }: { status: string }) {
  const d = DELIVERY_INFO[status] ?? DELIVERY_INFO['delivered'];
  return <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] whitespace-nowrap ${d!.tone}`}>{d!.label}</span>;
}

export default function NotificationHistoryTab() {
  const [filters, setFilters] = useState<HistoryFilters>(DEFAULT_FILTERS);
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<HistoryRow | null>(null);

  // Debounce search typing.
  useEffect(() => {
    const t = setTimeout(() => setFilters((f) => (f.search === searchInput ? f : { ...f, search: searchInput })), 350);
    return () => clearTimeout(t);
  }, [searchInput]);
  useEffect(() => setPage(0), [filters]);

  const { data, isLoading, isFetching, error } = useNotificationHistory(filters, page, PAGE_SIZE);
  const { data: stats } = useNotificationHistoryStats(filters.range);
  const { data: people } = usePeopleOptions();

  const set = <K extends keyof HistoryFilters>(k: K, v: HistoryFilters[K]) => setFilters((f) => ({ ...f, [k]: v }));
  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const first = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const last = Math.min(total, (page + 1) * PAGE_SIZE);
  const readRate = stats && stats.total ? Math.round((stats.read / stats.total) * 100) : 0;
  const pushProblems = (stats?.no_device ?? 0) + (stats?.push_failed ?? 0);
  const filtered = JSON.stringify({ ...filters, range: "7d" }) !== JSON.stringify({ ...DEFAULT_FILTERS });

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Notification History</h2>
          <p className="text-sm text-muted-foreground">Every notification sent, who got it, and whether it arrived.</p>
        </div>
        <Select value={filters.range} onValueChange={(v) => set("range", v as HistoryFilters["range"])}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="7d">Last 7 days</SelectItem>
            <SelectItem value="30d">Last 30 days</SelectItem>
            <SelectItem value="90d">Last 90 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat icon={BellRing} label="Sent" value={stats?.total ?? "–"} tone="bg-violet-100 text-violet-600" />
        <Stat icon={Eye} label="Read rate" value={stats ? `${readRate}%` : "–"} tone="bg-emerald-100 text-emerald-600" />
        <Stat icon={Smartphone} label="Pushed to phone" value={stats?.pushed ?? "–"} tone="bg-sky-100 text-sky-600" />
        <Stat icon={AlertTriangle} label="Push problems" value={stats ? pushProblems : "–"} tone="bg-amber-100 text-amber-600" />
      </div>

      <Card>
        <CardContent className="p-3 sm:p-4 space-y-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search title, message or recipient…"
              className="pl-8"
            />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            <Select value={filters.source} onValueChange={(v) => set("source", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sources</SelectItem>
                <SelectItem value="rules_engine">Rules</SelectItem>
                <SelectItem value="report">Reports</SelectItem>
                <SelectItem value="app">App</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filters.module} onValueChange={(v) => set("module", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All modules</SelectItem>
                {(stats?.modules || []).map((m) => (
                  <SelectItem key={m} value={m}>{moduleLabel(m)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filters.user} onValueChange={(v) => set("user", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All recipients</SelectItem>
                {(people?.users || []).map((u) => (
                  <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filters.read} onValueChange={(v) => set("read", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Read & unread</SelectItem>
                <SelectItem value="unread">Unread</SelectItem>
                <SelectItem value="read">Read</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filters.delivery} onValueChange={(v) => set("delivery", v)}>
              <SelectTrigger className="col-span-2 md:col-span-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any delivery</SelectItem>
                <SelectItem value="pushed">Pushed</SelectItem>
                <SelectItem value="in_app">In-app only</SelectItem>
                <SelectItem value="no_device">No device</SelectItem>
                <SelectItem value="push_failed">Push failed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {filtered && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => {
                setSearchInput("");
                setFilters((f) => ({ ...DEFAULT_FILTERS, range: f.range }));
              }}
            >
              <X className="h-3.5 w-3.5 mr-1" /> Clear filters
            </Button>
          )}

          {error ? (
            <p className="py-8 text-center text-sm text-destructive">Could not load history: {(error as Error).message}</p>
          ) : isLoading ? (
            <div className="space-y-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
          ) : rows.length === 0 ? (
            <div className="py-10 text-center space-y-2">
              <History className="h-8 w-8 mx-auto text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No notifications for these filters.</p>
            </div>
          ) : (
            <div className={isFetching ? "opacity-60 transition-opacity" : ""}>
              {/* Desktop */}
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-36">Sent</TableHead>
                      <TableHead className="w-40">Recipient</TableHead>
                      <TableHead>Notification</TableHead>
                      <TableHead className="w-24">Source</TableHead>
                      <TableHead className="w-28">Delivery</TableHead>
                      <TableHead className="w-16">Read</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r) => (
                      <TableRow key={r.id} className="cursor-pointer" onClick={() => setSelected(r)}>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {format(new Date(r.created_at), "dd MMM, hh:mm a")}
                        </TableCell>
                        <TableCell className="text-sm">{r.recipient_name || "—"}</TableCell>
                        <TableCell>
                          <p className="text-sm font-medium line-clamp-1">{r.title}</p>
                          <p className="text-xs text-muted-foreground line-clamp-1">{r.message}</p>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="font-normal">{SOURCE_LABELS[r.source] ?? r.source}</Badge>
                        </TableCell>
                        <TableCell><DeliveryBadge status={r.delivery_status} /></TableCell>
                        <TableCell className="text-xs">
                          {r.is_read ? <span className="text-emerald-700">Read</span> : <span className="text-muted-foreground">Unread</span>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile */}
              <div className="md:hidden space-y-2">
                {rows.map((r) => (
                  <button key={r.id} onClick={() => setSelected(r)} className="w-full text-left rounded-lg border p-3 active:bg-muted/50">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium line-clamp-2">{r.title}</p>
                      {!r.is_read && <span className="mt-1 h-2 w-2 rounded-full bg-primary shrink-0" aria-label="Unread" />}
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{r.message}</p>
                    <div className="flex flex-wrap items-center gap-1.5 mt-2 text-[11px] text-muted-foreground">
                      <span>{r.recipient_name || "—"}</span>
                      <span>·</span>
                      <span>{formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}</span>
                      <DeliveryBadge status={r.delivery_status} />
                    </div>
                  </button>
                ))}
              </div>

              <div className="flex items-center justify-between pt-3">
                <p className="text-xs text-muted-foreground">{first}–{last} of {total}</p>
                <div className="flex gap-1">
                  <Button variant="outline" size="icon" className="h-8 w-8" disabled={page === 0} onClick={() => setPage((p) => p - 1)} aria-label="Previous page">
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="icon" className="h-8 w-8" disabled={last >= total} onClick={() => setPage((p) => p + 1)} aria-label="Next page">
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <NotificationDetailSheet row={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
