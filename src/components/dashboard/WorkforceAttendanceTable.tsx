import { format } from "date-fns";
import { Clock } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { WorkforceAttendanceRow } from "@/hooks/useWorkforceOverview";

interface Props {
  rows: WorkforceAttendanceRow[];
  isLoading: boolean;
}

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

const avatarColors = [
  "bg-primary/15 text-primary",
  "bg-info/15 text-info",
  "bg-success/15 text-success",
  "bg-warning/15 text-warning",
  "bg-destructive/15 text-destructive",
];

function colorFor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return avatarColors[h % avatarColors.length];
}

export default function WorkforceAttendanceTable({ rows, isLoading }: Props) {
  return (
    <div className="overflow-hidden rounded-xl border">
      <div className="max-h-[420px] overflow-auto">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-muted/60 backdrop-blur">
            <TableRow className="hover:bg-transparent">
              <TableHead className="text-[11px] font-semibold uppercase tracking-wide">
                Employee
              </TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-wide">
                Date
              </TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-wide">
                Check-In
              </TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-wide">
                Check-Out
              </TableHead>
              <TableHead className="text-right text-[11px] font-semibold uppercase tracking-wide">
                Active Hours
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                  Loading...
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-12 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Clock className="h-8 w-8 opacity-40" />
                    <p className="text-sm">No attendance records for this selection</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => {
                const active = r.check_in_time && !r.check_out_time;
                return (
                  <TableRow key={r.id} className="group">
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <div
                          className={cn(
                            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
                            colorFor(r.user_id)
                          )}
                        >
                          {initials(r.full_name)}
                        </div>
                        <span className="truncate font-medium">{r.full_name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {format(new Date(r.date), "MMM d, yyyy")}
                    </TableCell>
                    <TableCell>
                      {r.check_in_time
                        ? format(new Date(r.check_in_time), "h:mm a")
                        : "--"}
                    </TableCell>
                    <TableCell>
                      {r.check_out_time ? (
                        format(new Date(r.check_out_time), "h:mm a")
                      ) : active ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-success">
                          <span className="relative flex h-2 w-2">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
                            <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
                          </span>
                          Active
                        </span>
                      ) : (
                        "--"
                      )}
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      {r.active_hours != null ? `${r.active_hours.toFixed(1)}h` : "--"}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
