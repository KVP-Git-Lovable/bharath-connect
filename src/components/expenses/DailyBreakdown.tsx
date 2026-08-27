import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import type { DailyBreakdownRow } from "@/hooks/useMonthlyExpenseSummary";

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

export default function DailyBreakdown({ days }: { days: DailyBreakdownRow[] }) {
  const active = days.filter((d) => d.present > 0 || d.ta > 0 || d.da > 0 || d.additional > 0);
  if (!active.length) return <p className="text-sm text-muted-foreground text-center py-4">No activity this month.</p>;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Date</TableHead>
          <TableHead className="text-right">KM</TableHead>
          <TableHead className="text-right">TA</TableHead>
          <TableHead className="text-right">DA</TableHead>
          <TableHead className="text-right">Add.</TableHead>
          <TableHead className="text-right">Total</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {active.map((d) => (
          <TableRow key={d.date}>
            <TableCell className="text-xs">{format(new Date(d.date), "dd MMM")}</TableCell>
            <TableCell className="text-right text-xs">{d.km.toFixed(1)}</TableCell>
            <TableCell className="text-right text-xs">{inr(d.ta)}</TableCell>
            <TableCell className="text-right text-xs">{inr(d.da)}</TableCell>
            <TableCell className="text-right text-xs">{inr(d.additional)}</TableCell>
            <TableCell className="text-right text-xs font-semibold">{inr(d.ta + d.da + d.additional)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
