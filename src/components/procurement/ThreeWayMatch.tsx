import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, CheckCircle2, Scale } from "lucide-react";
import { fmtAmt } from "@/lib/procurement";
import type { POItem } from "./GRNForm";

interface Props {
  items: POItem[];
  /** received qty keyed by procurement_item_id */
  received: Record<string, number>;
  /** invoiced rate keyed by procurement_item_id (latest) */
  invoicedRate: Record<string, number>;
  poTotal: number;
  invoiceTotal: number;
  productName: (id: string | null) => string;
}

export default function ThreeWayMatch({
  items, received, invoicedRate, poTotal, invoiceTotal, productName,
}: Props) {
  const orderedQty = items.reduce((s, it) => s + it.qty, 0);
  const receivedQty = items.reduce((s, it) => s + (received[it.id] || 0), 0);
  const qtyMatch = receivedQty >= orderedQty;
  const amtMatch = Math.abs(poTotal - invoiceTotal) < 0.01;
  const anyRateMismatch = items.some(
    (it) => invoicedRate[it.id] != null && invoicedRate[it.id] !== it.rate
  );

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Scale className="h-4 w-4" />3-Way Match
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg border p-2">
            <div className="text-[10px] text-muted-foreground">Ordered Qty</div>
            <div className="text-sm font-semibold">{orderedQty}</div>
          </div>
          <div className={`rounded-lg border p-2 ${qtyMatch ? "" : "border-amber-500"}`}>
            <div className="text-[10px] text-muted-foreground">Received Qty</div>
            <div className="text-sm font-semibold">{receivedQty}</div>
          </div>
          <div className={`rounded-lg border p-2 ${amtMatch ? "" : "border-amber-500"}`}>
            <div className="text-[10px] text-muted-foreground">Invoice Amt</div>
            <div className="text-sm font-semibold">{fmtAmt(invoiceTotal)}</div>
          </div>
        </div>

        <div className="text-xs text-muted-foreground flex items-center justify-between">
          <span>PO Total</span><span className="font-medium text-foreground">{fmtAmt(poTotal)}</span>
        </div>

        {/* Per-item rate comparison */}
        <div className="space-y-1">
          {items.map((it) => {
            const ir = invoicedRate[it.id];
            const mismatch = ir != null && ir !== it.rate;
            return (
              <div key={it.id} className="flex items-center justify-between text-xs py-1 border-b last:border-b-0">
                <span className="truncate flex-1">{productName(it.product_id)}</span>
                <span className="text-muted-foreground mr-2">PO {fmtAmt(it.rate)}</span>
                <span className={mismatch ? "text-amber-600 font-medium" : "text-muted-foreground"}>
                  Inv {ir != null ? fmtAmt(ir) : "—"}
                </span>
              </div>
            );
          })}
        </div>

        <div className="space-y-1.5 pt-1">
          <MatchRow ok={qtyMatch} okText="Quantities reconciled" badText="Received qty less than ordered" />
          <MatchRow ok={amtMatch} okText="PO and invoice totals match" badText="PO total and invoice amount differ" />
          <MatchRow ok={!anyRateMismatch} okText="All rates match PO" badText="Invoice rate differs from PO rate" />
        </div>
      </CardContent>
    </Card>
  );
}

function MatchRow({ ok, okText, badText }: { ok: boolean; okText: string; badText: string }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      {ok ? (
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
      ) : (
        <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
      )}
      <span className={ok ? "text-muted-foreground" : "text-amber-700 dark:text-amber-400"}>
        {ok ? okText : badText}
      </span>
    </div>
  );
}
