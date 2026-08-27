import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { useUserProfile } from "@/hooks/useUserProfile";
import { useProfilePermissions } from "@/hooks/useProfilePermissions";
import { Plus, Search, Trash2, X, ShoppingCart, Save, CalendarDays, ChevronDown } from "lucide-react";
import {
  PROC_STATUSES, USER_FORM_STATUSES,
  statusColor, fmtAmt, type ProcStatus,
} from "@/lib/procurement";
import { useUomOptions } from "@/hooks/useUomOptions";
import ProcurementDetail, { type DetailOrder } from "@/components/procurement/ProcurementDetail";

interface Vendor { id: string; name: string }
interface Site { id: string; site_name: string }
interface Product { id: string; product_name: string; default_uom: string | null }
interface LineItem { id?: string; product_id: string; rate: string; qty: string; uom: string }

const emptyForm = {
  order_date: new Date().toISOString().slice(0, 10),
  vendor_ids: [] as string[],
  site_id: "",
  status: "Requisition" as ProcStatus,
  estimated_budget: "",
  requisition_notes: "",
};

export default function Procurement() {
  const { profile, isAdmin } = useUserProfile();
  const { hasPermission } = useProfilePermissions();
  const { data: uoms = [] } = useUomOptions(true);
  const canApprove = isAdmin || hasPermission("module_procurement", "edit");

  const [orders, setOrders] = useState<DetailOrder[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editing, setEditing] = useState<DetailOrder | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [lines, setLines] = useState<LineItem[]>([{ product_id: "", rate: "", qty: "", uom: "" }]);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DetailOrder | null>(null);

  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => { fetchAll(); }, []);

  // Open detail when navigated with ?po=<id>
  useEffect(() => {
    const poId = searchParams.get("po");
    if (poId && orders.length) {
      const found = orders.find((o) => o.id === poId);
      if (found) {
        setDetail(found);
        setSearchParams((prev) => { prev.delete("po"); return prev; }, { replace: true });
      }
    }
  }, [searchParams, orders]);

  const fetchAll = async () => {
    setIsLoading(true);
    const [ord, ven, sit, prod] = await Promise.all([
      supabase.from("procurement_orders").select("*, procurement_items(*)").order("order_date", { ascending: false }),
      supabase.from("vendors").select("id, name").order("name"),
      supabase.from("project_sites").select("id, site_name").is("deleted_at", null).order("site_name"),
      supabase.from("master_products").select("id, product_name, default_uom").eq("is_active", true).order("product_name"),
    ]);
    setOrders((ord.data || []) as DetailOrder[]);
    setVendors((ven.data || []) as Vendor[]);
    setSites((sit.data || []) as Site[]);
    setProducts((prod.data || []) as Product[]);
    setIsLoading(false);
    // keep open detail fresh
    setDetail((d) => (d ? ((ord.data || []) as DetailOrder[]).find((o) => o.id === d.id) || null : null));
  };

  const vName = (id: string | null) => vendors.find((v) => v.id === id)?.name || "—";
  const sName = (id: string | null) => sites.find((s) => s.id === id)?.site_name || "—";
  const pName = (id: string | null) => products.find((p) => p.id === id)?.product_name || "—";

  const lineTotal = useMemo(
    () => lines.reduce((sum, l) => sum + (parseFloat(l.rate) || 0) * (parseFloat(l.qty) || 0), 0),
    [lines]
  );

  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm);
    setLines([{ product_id: "", rate: "", qty: "", uom: "" }]);
    setIsFormOpen(true);
  };

  const openEdit = (o: DetailOrder) => {
    setDetail(null);
    setEditing(o);
    setForm({
      order_date: o.order_date,
      vendor_ids: o.vendor_ids && o.vendor_ids.length ? o.vendor_ids : (o.vendor_id ? [o.vendor_id] : []),
      site_id: o.site_id || "",
      status: (USER_FORM_STATUSES.includes(o.status as ProcStatus) ? o.status : "Requisition") as ProcStatus,
      estimated_budget: o.estimated_budget != null ? String(o.estimated_budget) : "",
      requisition_notes: o.requisition_notes || "",
    });
    const items = (o.procurement_items || []).map((it) => ({
      id: it.id, product_id: it.product_id || "", rate: String(it.rate ?? ""), qty: String(it.qty ?? ""), uom: it.uom || "",
    }));
    setLines(items.length ? items : [{ product_id: "", rate: "", qty: "", uom: "" }]);
    setIsFormOpen(true);
  };

  const updateLine = (i: number, patch: Partial<LineItem>) =>
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const onProductChange = (i: number, productId: string) => {
    const def = products.find((p) => p.id === productId)?.default_uom || "";
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, product_id: productId, uom: l.uom || def } : l)));
  };
  const addLine = () => setLines((prev) => [...prev, { product_id: "", rate: "", qty: "", uom: "" }]);
  const removeLine = (i: number) =>
    setLines((prev) => (prev.length <= 1 ? [{ product_id: "", rate: "", qty: "", uom: "" }] : prev.filter((_, idx) => idx !== i)));

  const handleSave = async () => {
    const validLines = lines.filter((l) => l.product_id && (parseFloat(l.qty) || 0) > 0);
    if (validLines.length === 0) { toast.error("Add at least one product line item"); return; }
    setIsSaving(true);
    try {
      const orderPayload = {
        order_date: form.order_date,
        vendor_id: form.vendor_ids[0] || null,
        vendor_ids: form.vendor_ids.length ? form.vendor_ids : null,
        site_id: form.site_id || null,
        status: form.status,
        estimated_budget: form.estimated_budget ? parseFloat(form.estimated_budget) : null,
        requisition_notes: form.requisition_notes.trim() || null,
        total_amount: lineTotal,
      };

      let orderId = editing?.id;
      if (editing) {
        const { error } = await supabase.from("procurement_orders").update(orderPayload).eq("id", editing.id);
        if (error) throw error;
        const { error: delErr } = await supabase.from("procurement_items").delete().eq("procurement_id", editing.id);
        if (delErr) throw delErr;
      } else {
        const { data, error } = await supabase
          .from("procurement_orders")
          .insert({ ...orderPayload, created_by: profile?.id })
          .select("id")
          .single();
        if (error) throw error;
        orderId = data.id;
      }

      const itemRows = validLines.map((l) => {
        const rate = parseFloat(l.rate) || 0;
        const qty = parseFloat(l.qty) || 0;
        return { procurement_id: orderId, product_id: l.product_id, rate, qty, amount: rate * qty, uom: l.uom || null };
      });
      const { error: itemErr } = await supabase.from("procurement_items").insert(itemRows);
      if (itemErr) throw itemErr;

      toast.success(editing ? "Procurement updated" : "Procurement created");
      setIsFormOpen(false);
      fetchAll();
    } catch (err: any) {
      toast.error(err.message || "Failed to save procurement");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("procurement_orders").delete().eq("id", id);
    if (error) toast.error(error.message || "Failed to delete");
    else { toast.success("Procurement deleted"); fetchAll(); }
    setDeleteId(null);
  };

  const filtered = useMemo(() => {
    let list = orders;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (o) =>
          (o.po_number || "").toLowerCase().includes(q) ||
          (vName(o.vendor_id) || "").toLowerCase().includes(q) ||
          (sName(o.site_id) || "").toLowerCase().includes(q)
      );
    }
    if (filterStatus !== "all") list = list.filter((o) => o.status === filterStatus);
    return list;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, search, filterStatus, vendors, sites]);

  return (
    <motion.div className="space-y-4 p-4 pb-24 max-w-5xl mx-auto" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2"><ShoppingCart className="h-5 w-5" />Procurement</h1>
          <p className="text-xs text-muted-foreground">{orders.length} purchase orders</p>
        </div>
        <Button size="sm" onClick={openAdd} className="gap-1.5"><Plus className="h-4 w-4" />New PO</Button>
      </div>

      <div className="space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search PO number, vendor, site..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9" />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {PROC_STATUSES.map((s) => (<SelectItem key={s} value={s}>{s}</SelectItem>))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground text-sm">
          {orders.length === 0 ? "No procurement orders yet." : "No orders match your search/filter."}
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((o) => (
            <Card key={o.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setDetail(o)}>
              <CardContent className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h3 className="font-semibold text-sm truncate">{o.po_number || "(No PO #)"}</h3>
                      <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${statusColor(o.status)}`}>{o.status}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground flex items-center gap-1"><CalendarDays className="h-3 w-3" />{o.order_date} · {vName(o.vendor_id)}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">Site: {sName(o.site_id)}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-semibold text-sm">{fmtAmt(o.total_amount || 0)}</div>
                    <div className="text-[10px] text-muted-foreground">{o.procurement_items?.length || 0} items</div>
                    {canApprove && (
                      <Button variant="ghost" size="icon" className="h-7 w-7 mt-1 text-muted-foreground hover:text-destructive" onClick={(e) => { e.stopPropagation(); setDeleteId(o.id); }}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Form */}
      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="max-w-none w-screen h-screen sm:rounded-none p-0 gap-0 flex flex-col">
          <DialogHeader className="px-4 py-3 border-b shrink-0">
            <DialogTitle>{editing ? "Edit Procurement" : "New Procurement"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 p-4 overflow-y-auto flex-1 w-full">
            <div className="rounded-md bg-muted/40 border px-3 py-2 text-[11px] text-muted-foreground">
              This is a <strong>Requisition</strong>. Once approved by an admin, PO Number, Bill/Ship To, delivery date, payment terms and rates become available on the PO detail screen.
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Date</Label>
                <Input type="date" value={form.order_date} onChange={(e) => setForm((p) => ({ ...p, order_date: e.target.value }))} className="h-9" />
              </div>
              <div>
                <Label className="text-xs">Requested By</Label>
                <Input value={profile?.full_name || profile?.username || ""} readOnly disabled className="h-9 bg-muted/50" />
              </div>
            </div>

            <div>
              <Label className="text-xs">Site</Label>
              <Select value={form.site_id} onValueChange={(v) => setForm((p) => ({ ...p, site_id: v }))}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Select site" /></SelectTrigger>
                <SelectContent>{sites.map((s) => (<SelectItem key={s.id} value={s.id}>{s.site_name}</SelectItem>))}</SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs">Vendor(s)</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button type="button" variant="outline" className="h-9 w-full justify-between font-normal">
                    <span className="truncate text-left">
                      {form.vendor_ids.length === 0
                        ? <span className="text-muted-foreground">Select vendors</span>
                        : form.vendor_ids.map((id) => vName(id)).join(", ")}
                    </span>
                    <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-2 max-h-64 overflow-y-auto" align="start">
                  {vendors.length === 0 ? (
                    <p className="text-xs text-muted-foreground p-2">No vendors found.</p>
                  ) : vendors.map((v) => {
                    const checked = form.vendor_ids.includes(v.id);
                    return (
                      <label key={v.id} className="flex items-center gap-2 py-1.5 px-1 rounded hover:bg-muted cursor-pointer text-sm">
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(c) =>
                            setForm((p) => ({
                              ...p,
                              vendor_ids: c ? [...p.vendor_ids, v.id] : p.vendor_ids.filter((id) => id !== v.id),
                            }))
                          }
                        />
                        <span>{v.name}</span>
                      </label>
                    );
                  })}
                </PopoverContent>
              </Popover>
            </div>

            <div>
              <Label className="text-xs">Estimated Budget (₹)</Label>
              <Input type="number" inputMode="decimal" value={form.estimated_budget} onChange={(e) => setForm((p) => ({ ...p, estimated_budget: e.target.value }))} placeholder="0" className="h-9" />
            </div>

            <div>
              <Label className="text-xs">Notes / Reason for Requisition</Label>
              <Textarea value={form.requisition_notes} onChange={(e) => setForm((p) => ({ ...p, requisition_notes: e.target.value }))} placeholder="Why is this material needed?" className="min-h-[70px]" />
            </div>



            {/* Line items */}
            <div className="border-t pt-3">
              <div className="flex items-center justify-between mb-2">
                <Label className="text-sm font-semibold">Product Line Items</Label>
                <Button type="button" variant="ghost" size="sm" className="h-7 text-xs gap-1 text-primary" onClick={addLine}><Plus className="h-3 w-3" />Add Item</Button>
              </div>
              <p className="text-[11px] text-muted-foreground mb-2">Enter material, unit and quantity. Rates are added after the requisition is approved.</p>
              <div className="space-y-3">
                {lines.map((l, i) => (
                  <div key={i} className="rounded-lg border p-2.5 space-y-2 bg-muted/30">
                    <div className="flex items-center gap-2">
                      <div className="flex-1">
                        <Select value={l.product_id} onValueChange={(v) => onProductChange(i, v)}>
                          <SelectTrigger className="h-9"><SelectValue placeholder="Select material" /></SelectTrigger>
                          <SelectContent>{products.map((p) => (<SelectItem key={p.id} value={p.id}>{p.product_name}</SelectItem>))}</SelectContent>
                        </Select>
                      </div>
                      <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive" onClick={() => removeLine(i)}><X className="h-3.5 w-3.5" /></Button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-[10px] text-muted-foreground">UOM</Label>
                        <Select value={l.uom} onValueChange={(v) => updateLine(i, { uom: v })}>
                          <SelectTrigger className="h-8"><SelectValue placeholder="UOM" /></SelectTrigger>
                          <SelectContent>
                            {uoms.map((u) => (<SelectItem key={u.id} value={u.short_code}>{u.short_code}</SelectItem>))}
                            {l.uom && !uoms.some((u) => u.short_code === l.uom) && (
                              <SelectItem value={l.uom}>{l.uom}</SelectItem>
                            )}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-[10px] text-muted-foreground">Qty</Label>
                        <Input type="number" inputMode="decimal" value={l.qty} onChange={(e) => updateLine(i, { qty: e.target.value })} placeholder="0" className="h-8" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>


            <div className="flex gap-2 pt-2 pb-6">
              <Button variant="outline" className="flex-1" onClick={() => setIsFormOpen(false)}>Cancel</Button>
              <Button className="flex-1" onClick={handleSave} disabled={isSaving}><Save className="h-4 w-4 mr-2" />{isSaving ? "Saving..." : "Save"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Detail */}
      {detail && (
        <ProcurementDetail
          open={!!detail}
          onOpenChange={(o) => !o && setDetail(null)}
          order={detail}
          canApprove={canApprove}
          currentUserId={profile?.id}
          vendorName={vName}
          siteName={sName}
          productName={pName}
          onEdit={openEdit}
          onChanged={fetchAll}
        />
      )}

      {/* Delete confirm */}
      <Sheet open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <SheetHeader><SheetTitle>Delete Procurement Order?</SheetTitle></SheetHeader>
          <p className="text-sm text-muted-foreground mt-2">This will permanently remove the order and its line items.</p>
          <div className="flex gap-2 mt-4">
            <Button variant="outline" className="flex-1" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="destructive" className="flex-1" onClick={() => deleteId && handleDelete(deleteId)}>Delete</Button>
          </div>
        </SheetContent>
      </Sheet>
    </motion.div>
  );
}
