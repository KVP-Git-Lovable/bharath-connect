import { Card, CardContent } from "@/components/ui/card";
import { Car, Utensils, Receipt, IndianRupee, ShoppingCart, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  ta: number;
  da: number;
  additional: number;
  total: number;
  presentDays: number;
  totalKm?: number;
  orderValue?: number;
  loading?: boolean;
  onTotalClick?: () => void;
  taType?: "from_gps" | "fixed";
  taPerKmRate?: number;
  fixedTaAmount?: number;
  daBasis?: "per_day" | "per_half_day";
  daAmount?: number;
  daApplicable?: boolean;
}

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

export default function ExpenseSummaryCards({
  ta, da, additional, total, presentDays, totalKm = 0, orderValue = 0, loading, onTotalClick,
  taType, taPerKmRate, fixedTaAmount, daBasis, daAmount, daApplicable = true,
}: Props) {
  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  const taSub = taType === "from_gps"
    ? `${totalKm.toFixed(1)} km${taPerKmRate ? ` × ₹${taPerKmRate}/km` : ""}`
    : taType === "fixed"
      ? `Fixed ₹${fixedTaAmount || 0}/day × ${presentDays}d`
      : (totalKm > 0 ? `${totalKm.toFixed(1)} km` : undefined);
  const daSub = daAmount
    ? `₹${daAmount}${daBasis === "per_half_day" ? "/half-day" : "/day"} × ${presentDays}${daBasis === "per_half_day" ? "" : "d"}`
    : (presentDays ? `${presentDays} present days` : undefined);
  const items = [
    { label: "Travel (TA)", value: inr(ta), sub: taSub, icon: Car, bg: "bg-blue-50 dark:bg-blue-950/30", fg: "text-blue-600 dark:text-blue-400" },
    ...(daApplicable ? [{ label: `Daily (DA)`, value: inr(da), sub: daSub, icon: Utensils, bg: "bg-emerald-50 dark:bg-emerald-950/30", fg: "text-emerald-600 dark:text-emerald-400" }] : []),
    { label: "Additional", value: inr(additional), icon: Receipt, bg: "bg-fuchsia-50 dark:bg-fuchsia-950/30", fg: "text-fuchsia-600 dark:text-fuchsia-400" },
    { label: "Total Expenses", value: inr(total), icon: IndianRupee, bg: "bg-slate-100 dark:bg-slate-900/40", fg: "text-slate-700 dark:text-slate-300", clickable: !!onTotalClick },
    { label: "Order Value", value: inr(orderValue), icon: ShoppingCart, bg: "bg-amber-50 dark:bg-amber-950/30", fg: "text-amber-600 dark:text-amber-400" },
  ];
  return (
    <div className={cn("grid grid-cols-2 sm:grid-cols-3 gap-3", daApplicable ? "lg:grid-cols-5" : "lg:grid-cols-4")}>
      {items.map((it) => {
        const Icon = it.icon;
        return (
          <Card
            key={it.label}
            className={cn("shadow-card transition-transform", it.clickable && "cursor-pointer hover:-translate-y-0.5")}
            onClick={it.clickable ? onTotalClick : undefined}
          >
            <CardContent className={cn("p-3 flex items-center gap-3 rounded-lg", it.bg)}>
              <div className={cn("h-9 w-9 rounded-md flex items-center justify-center bg-background/60", it.fg)}>
                <Icon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] text-muted-foreground truncate">{it.label}</p>
                <p className={cn("text-base font-bold leading-tight", it.fg)}>{it.value}</p>
                {it.sub && <p className="text-[10px] text-muted-foreground">{it.sub}</p>}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
