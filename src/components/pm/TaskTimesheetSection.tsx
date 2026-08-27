import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, startOfYear, endOfYear, isWithinInterval } from "date-fns";
import { cn } from "@/lib/utils";
import { Clock, BarChart3, ChevronDown, ChevronRight, Filter } from "lucide-react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface Props {
  taskId: string;
  projectId: string;
}

type TimeFilter = "all" | "this_week" | "last_week" | "this_month" | "last_month" | "this_quarter" | "this_year";

function getDateRange(filter: TimeFilter): { start: Date; end: Date } | null {
  if (filter === "all") return null;
  const now = new Date();
  switch (filter) {
    case "this_week":
      return { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfWeek(now, { weekStartsOn: 1 }) };
    case "last_week": {
      const lastWeek = new Date(now);
      lastWeek.setDate(now.getDate() - 7);
      return { start: startOfWeek(lastWeek, { weekStartsOn: 1 }), end: endOfWeek(lastWeek, { weekStartsOn: 1 }) };
    }
    case "this_month":
      return { start: startOfMonth(now), end: endOfMonth(now) };
    case "last_month": {
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return { start: startOfMonth(lastMonth), end: endOfMonth(lastMonth) };
    }
    case "this_quarter":
      return { start: startOfQuarter(now), end: endOfQuarter(now) };
    case "this_year":
      return { start: startOfYear(now), end: endOfYear(now) };
    default:
      return null;
  }
}

export function TaskTimesheetSection({ taskId, projectId }: Props) {
  const [chartOpen, setChartOpen] = useState(true);
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("all");
  const [personFilter, setPersonFilter] = useState<string>("all");
  const [allocationFilter, setAllocationFilter] = useState<string>("all");

  const { data: timeLogs = [], isLoading } = useQuery({
    queryKey: ["pm_time_logs_task", taskId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pm_time_logs")
        .select("*, user:profiles!pm_time_logs_user_id_fkey(full_name)")
        .eq("task_id", taskId)
        .order("date", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  // Unique persons for filter
  const persons = useMemo(() => {
    const map = new Map<string, string>();
    timeLogs.forEach((log: any) => {
      const name = log.user?.full_name || "Unknown";
      if (!map.has(name)) map.set(name, name);
    });
    return Array.from(map.values()).sort();
  }, [timeLogs]);

  // Filtered logs
  const filteredLogs = useMemo(() => {
    let logs = [...timeLogs];

    // Time filter
    const range = getDateRange(timeFilter);
    if (range) {
      logs = logs.filter((log: any) => {
        const logDate = new Date(log.date + "T00:00:00");
        return isWithinInterval(logDate, { start: range.start, end: range.end });
      });
    }

    // Person filter
    if (personFilter !== "all") {
      logs = logs.filter((log: any) => (log.user?.full_name || "Unknown") === personFilter);
    }

    // Allocation filter
    if (allocationFilter !== "all") {
      logs = logs.filter((log: any) => log.allocation === allocationFilter);
    }

    return logs;
  }, [timeLogs, timeFilter, personFilter, allocationFilter]);

  // Chart data from filtered logs
  const chartData = useMemo(() => {
    const map: Record<string, { name: string; hours: number }> = {};
    filteredLogs.forEach((log: any) => {
      const name = log.user?.full_name || "Unknown";
      if (!map[name]) map[name] = { name, hours: 0 };
      map[name].hours += Number(log.hours);
    });
    return Object.values(map).sort((a, b) => b.hours - a.hours);
  }, [filteredLogs]);

  const totalHours = chartData.reduce((s, d) => s + d.hours, 0);
  const maxHours = Math.max(...chartData.map(d => d.hours), 1);

  const hasActiveFilters = timeFilter !== "all" || personFilter !== "all" || allocationFilter !== "all";

  if (isLoading) {
    return (
      <div className="space-y-2">
        <div className="h-20 bg-muted animate-pulse rounded" />
      </div>
    );
  }

  if (timeLogs.length === 0) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Clock className="w-3.5 h-3.5" />
          <p className="text-xs italic">No time entries recorded yet.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Summary */}
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5" /> Timesheet ({totalHours.toFixed(1)}h{hasActiveFilters ? " filtered" : " total"})
        </h3>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Filter className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
        <Select value={timeFilter} onValueChange={(v) => setTimeFilter(v as TimeFilter)}>
          <SelectTrigger className="h-7 w-[120px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Time</SelectItem>
            <SelectItem value="this_week">This Week</SelectItem>
            <SelectItem value="last_week">Last Week</SelectItem>
            <SelectItem value="this_month">This Month</SelectItem>
            <SelectItem value="last_month">Last Month</SelectItem>
            <SelectItem value="this_quarter">This Quarter</SelectItem>
            <SelectItem value="this_year">This Year</SelectItem>
          </SelectContent>
        </Select>

        <Select value={personFilter} onValueChange={setPersonFilter}>
          <SelectTrigger className="h-7 w-[120px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All People</SelectItem>
            {persons.map(p => (
              <SelectItem key={p} value={p}>{p}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={allocationFilter} onValueChange={setAllocationFilter}>
          <SelectTrigger className="h-7 w-[110px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="billable">Billable</SelectItem>
            <SelectItem value="non-billable">Non-Billable</SelectItem>
          </SelectContent>
        </Select>

        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-muted-foreground"
            onClick={() => { setTimeFilter("all"); setPersonFilter("all"); setAllocationFilter("all"); }}
          >
            Clear
          </Button>
        )}
      </div>

      {/* Collapsible chart */}
      {chartData.length > 0 && (
        <Collapsible open={chartOpen} onOpenChange={setChartOpen}>
          <CollapsibleTrigger asChild>
            <button className="flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors w-full">
              {chartOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              <BarChart3 className="w-3 h-3" /> Effort by Person
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="space-y-1.5 bg-muted/20 rounded-lg p-3 border border-border/50 mt-1.5">
              {chartData.map((d) => (
                <div key={d.name} className="flex items-center gap-2">
                  <span className="text-xs text-foreground w-24 truncate flex-shrink-0" title={d.name}>
                    {d.name}
                  </span>
                  <div className="flex-1 h-4 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary/70 rounded-full transition-all"
                      style={{ width: `${(d.hours / maxHours) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground tabular-nums w-10 text-right">
                    {d.hours.toFixed(1)}h
                  </span>
                </div>
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* List view */}
      {filteredLogs.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">No entries match the current filters.</p>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-[10px] uppercase h-8 px-3">Person</TableHead>
                <TableHead className="text-[10px] uppercase h-8 px-3">Date</TableHead>
                <TableHead className="text-[10px] uppercase h-8 px-3 text-center">Hours</TableHead>
                <TableHead className="text-[10px] uppercase h-8 px-3">Description</TableHead>
                <TableHead className="text-[10px] uppercase h-8 px-3">Allocation</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredLogs.map((log: any) => (
                <TableRow key={log.id}>
                  <TableCell className="py-1.5 px-3 text-xs">
                    <div className="flex items-center gap-1.5">
                      <div className="w-5 h-5 rounded-full bg-primary/15 flex items-center justify-center text-primary text-[9px] font-semibold flex-shrink-0">
                        {log.user?.full_name?.charAt(0) ?? "?"}
                      </div>
                      <span className="truncate max-w-[100px]">{log.user?.full_name || "Unknown"}</span>
                    </div>
                  </TableCell>
                  <TableCell className="py-1.5 px-3 text-xs text-muted-foreground tabular-nums">
                    {format(new Date(log.date + "T00:00:00"), "MMM d, yyyy")}
                  </TableCell>
                  <TableCell className="py-1.5 px-3 text-xs text-center font-medium tabular-nums">
                    {log.hours}h
                  </TableCell>
                  <TableCell className="py-1.5 px-3 text-xs text-muted-foreground max-w-[150px] truncate">
                    {log.description || "—"}
                  </TableCell>
                  <TableCell className="py-1.5 px-3">
                    <span className={cn(
                      "text-[10px] px-1.5 py-0.5 rounded-full font-medium",
                      log.allocation === "non-billable"
                        ? "bg-muted text-muted-foreground"
                        : "bg-green-500/10 text-green-700 dark:text-green-400"
                    )}>
                      {log.allocation === "non-billable" ? "Non-Billable" : "Billable"}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
