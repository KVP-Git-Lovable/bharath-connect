import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import type { WeeklyBreakdownRow } from "@/hooks/useMonthlyExpenseSummary";

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

export default function WeeklyBreakdown({ weeks }: { weeks: WeeklyBreakdownRow[] }) {
  if (!weeks.length) return <p className="text-sm text-muted-foreground text-center py-4">No data.</p>;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Week</TableHead>
          <TableHead className="text-right">TA</TableHead>
          <TableHead className="text-right">DA</TableHead>
          <TableHead className="text-right">Additional</TableHead>
          <TableHead className="text-right">Total</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {weeks.map((w) => (
          <TableRow key={w.week_start}>
            <TableCell className="text-xs">Wk of {format(new Date(w.week_start), "dd MMM")}</TableCell>
            <TableCell className="text-right text-xs">{inr(w.ta)}</TableCell>
            <TableCell className="text-right text-xs">{inr(w.da)}</TableCell>
            <TableCell className="text-right text-xs">{inr(w.additional)}</TableCell>
            <TableCell className="text-right text-xs font-semibold">{inr(w.ta + w.da + w.additional)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
