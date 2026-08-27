import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Truck, CalendarDays, ChevronRight } from "lucide-react";
import { GRN_STATUSES, grnStatusColor } from "@/lib/procurement";
import GRNDetail from "@/components/procurement/GRNDetail";

interface GrnRow {
  id: string;
  grn_number: string | null;
  receipt_date: string;
  status: string;
  received_by: string | null;
  remarks: string | null;
  po_id: string;
  photos?: string[] | null;
  po?: { po_number: string | null; vendor_id: string | null; site_id: string | null } | null;
}

export default function GRN() {
  const [rows, setRows] = useState<GrnRow[]>([]);
  const [vendors, setVendors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [selected, setSelected] = useState<GrnRow | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    setIsLoading(true);
    const [g, v] = await Promise.all([
      supabase
        .from("procurement_grns")
        .select("id, grn_number, receipt_date, status, received_by, remarks, po_id, photos, po:procurement_orders(po_number, vendor_id, site_id)")
        .order("created_at", { ascending: false }),
      supabase.from("vendors").select("id, name"),
    ]);
    setRows((g.data || []) as GrnRow[]);
    const vmap: Record<string, string> = {};
    (v.data || []).forEach((x: any) => { vmap[x.id] = x.name; });
    setVendors(vmap);
    setIsLoading(false);
  };

  const filtered = useMemo(() => {
    let list = rows;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (r) =>
          (r.grn_number || "").toLowerCase().includes(q) ||
          (r.po?.po_number || "").toLowerCase().includes(q) ||
          (r.received_by || "").toLowerCase().includes(q)
      );
    }
    if (filterStatus !== "all") list = list.filter((r) => r.status === filterStatus);
    return list;
  }, [rows, search, filterStatus]);

  return (
    <motion.div className="space-y-4 p-4 pb-24 max-w-5xl mx-auto" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2"><Truck className="h-5 w-5" />Goods Receipts</h1>
        <p className="text-xs text-muted-foreground">{rows.length} receipts · create from a PO's detail screen</p>
      </div>

      <div className="space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search GRN, PO, received by..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9" />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {GRN_STATUSES.map((s) => (<SelectItem key={s} value={s}>{s}</SelectItem>))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground text-sm">
          {rows.length === 0 ? "No goods receipts yet." : "No receipts match your search/filter."}
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((r) => (
            <Card key={r.id} role="button" tabIndex={0} onClick={() => { setSelected(r); setDetailOpen(true); }} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelected(r); setDetailOpen(true); } }} className="cursor-pointer hover:border-primary/50 transition-colors">
              <CardContent className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h3 className="font-semibold text-sm">{r.grn_number}</h3>
                      <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${grnStatusColor(r.status)}`}>{r.status}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground flex items-center gap-1"><CalendarDays className="h-3 w-3" />{r.receipt_date} · PO {r.po?.po_number || "—"}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">Vendor: {r.po?.vendor_id ? (vendors[r.po.vendor_id] || "—") : "—"}{r.received_by ? ` · By ${r.received_by}` : ""}</p>
                    {r.remarks && <p className="text-xs text-muted-foreground mt-0.5 truncate">{r.remarks}</p>}
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0 self-center" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <GRNDetail
        open={detailOpen}
        onOpenChange={setDetailOpen}
        grn={selected}
        vendorName={selected?.po?.vendor_id ? (vendors[selected.po.vendor_id] || "") : ""}
        onSaved={fetchAll}
      />
    </motion.div>
  );
}
