import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Search, Truck, Check } from "lucide-react";
import { statusColor, fmtAmt } from "@/lib/procurement";

// Statuses that represent an "open" PO still awaiting goods receipt
const OPEN_STATUSES = ["PO Issued", "PO Finalised", "Goods Received"];

interface OpenPO {
  id: string;
  po_number: string | null;
  status: string;
  order_date: string;
  total_amount: number;
  vendor_id: string | null;
  vendor_name: string;
}

interface Props {
  siteId: string;
  value: string;
  onChange: (poId: string) => void;
}

export default function OpenGRNPicker({ siteId, value, onChange }: Props) {
  const [pos, setPos] = useState<OpenPO[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!siteId) {
      setPos([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data } = await supabase
        .from("procurement_orders")
        .select("id, po_number, status, order_date, total_amount, vendor_id")
        .eq("site_id", siteId)
        .in("status", OPEN_STATUSES)
        .order("order_date", { ascending: false });
      const rows = (data || []) as any[];
      const vendorIds = [...new Set(rows.filter((r) => r.vendor_id).map((r) => r.vendor_id))];
      let vmap: Record<string, string> = {};
      if (vendorIds.length) {
        const { data: vendors } = await supabase.from("vendors").select("id, name").in("id", vendorIds);
        (vendors || []).forEach((v: any) => { vmap[v.id] = v.name; });
      }
      if (cancelled) return;
      setPos(rows.map((r) => ({
        id: r.id,
        po_number: r.po_number,
        status: r.status,
        order_date: r.order_date,
        total_amount: Number(r.total_amount || 0),
        vendor_id: r.vendor_id,
        vendor_name: r.vendor_id ? vmap[r.vendor_id] || "" : "",
      })));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [siteId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return pos;
    return pos.filter((p) =>
      (p.po_number || "").toLowerCase().includes(q) ||
      (p.vendor_name || "").toLowerCase().includes(q) ||
      (p.status || "").toLowerCase().includes(q)
    );
  }, [pos, search]);

  if (!siteId) {
    return (
      <div className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
        Select a Site above to see open purchase orders awaiting goods receipt.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Label className="text-xs flex items-center gap-1.5"><Truck className="h-3.5 w-3.5" />Open GRN — Purchase Orders to Receive *</Label>
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search PO number, vendor, status..."
          className="h-9 pl-8"
        />
      </div>
      <div className="max-h-60 overflow-y-auto rounded-lg border divide-y">
        {loading ? (
          <p className="p-3 text-xs text-muted-foreground">Loading open POs...</p>
        ) : filtered.length === 0 ? (
          <p className="p-3 text-xs text-muted-foreground">No open purchase orders for this site.</p>
        ) : filtered.map((p) => {
          const selected = value === p.id;
          return (
            <button
              type="button"
              key={p.id}
              onClick={() => onChange(selected ? "" : p.id)}
              className={`w-full text-left p-2.5 flex items-center gap-2 transition-colors ${selected ? "bg-primary/10" : "hover:bg-muted/50"}`}
            >
              <div className={`h-4 w-4 rounded-full border flex items-center justify-center shrink-0 ${selected ? "bg-primary border-primary" : "border-muted-foreground/40"}`}>
                {selected && <Check className="h-3 w-3 text-primary-foreground" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-sm font-medium">{p.po_number || "(No PO #)"}</span>
                  <Badge variant="outline" className={`text-[10px] ${statusColor(p.status)}`}>{p.status}</Badge>
                </div>
                <div className="text-[11px] text-muted-foreground truncate">
                  {p.order_date}{p.vendor_name ? ` · ${p.vendor_name}` : ""} · {fmtAmt(p.total_amount)}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
