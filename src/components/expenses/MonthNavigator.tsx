import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { addMonths, format, subMonths } from "date-fns";

interface Props {
  selectedMonth: Date;
  onMonthChange: (d: Date) => void;
}

export default function MonthNavigator({ selectedMonth, onMonthChange }: Props) {
  const next = addMonths(selectedMonth, 1);
  const disableNext = next > new Date();
  return (
    <div className="flex items-center justify-center gap-3">
      <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => onMonthChange(subMonths(selectedMonth, 1))}>
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <span className="text-sm font-semibold min-w-[140px] text-center">
        {format(selectedMonth, "MMMM yyyy")}
      </span>
      <Button variant="outline" size="icon" className="h-8 w-8" disabled={disableNext} onClick={() => onMonthChange(next)}>
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
