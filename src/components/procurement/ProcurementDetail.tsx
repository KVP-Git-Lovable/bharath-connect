import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { CalendarDays, Truck, FileText, Pencil, ChevronRight, Save } from "lucide-react";
import {
  STATUS_FLOW, allowedTransitions, statusColor, fmtAmt, PAYMENT_TERMS, type ProcStatus,
} from "@/lib/procurement";
import GRNForm, { type POItem } from "./GRNForm";
import InvoiceForm from "./InvoiceForm";
import ThreeWayMatch from "./ThreeWayMatch";
import { fetchAddressOptions, formatAddressSnapshot, type AddressOption } from "@/lib/addresses";

export interface DetailOrder {
  id: string;
  order_date: string;
  vendor_id: string | null;
  vendor_ids: string[] | null;
  po_number: string | null;
  site_id: string | null;
  status: string;
  payment_terms: string | null;
  expected_delivery_date: string | null;
  total_amount: number;
  estimated_budget: number | null;
  bill_to: string | null;
  ship_to: string | null;
  bill_to_address_id?: string | null;
  ship_to_address_id?: string | null;
  bill_to_gst?: string | null;
  ship_to_gst?: string | null;
  requisition_notes: string | null;
  created_by: string | null;
  procurement_items?: { id: string; product_id: string | null; rate: number; qty: number; uom: string | null }[];
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  order: DetailOrder;
  canApprove: boolean;
  currentUserId?: string;
  vendorName: (id: string | null) => string;
  siteName: (id: string | null) => string;
  productName: (id: string | null) => string;
  onEdit: (o: DetailOrder) => void;
  onChanged: () => void;
}

interface GrnRow { id: string; grn_number: string | null; receipt_date: string; status: string; received_by: string | null; remarks: string | null; }
interface GrnItemRow { grn_id: string; procurement_item_id: string | null; received_qty: number; }
interface InvRow { id: string; invoice_number: string | null; invoice_date: string; invoice_amount: number; }
interface InvItemRow { invoice_id: string; procurement_item_id: string | null; invoiced_rate: number; }

export default function ProcurementDetail({
  open, onOpenChange, order, canApprove, currentUserId,
  vendorName, siteName, productName, onEdit, onChanged,
}: Props) {
  const [grns, setGrns] = useState<GrnRow[]>([]);
  const [grnItems, setGrnItems] = useState<GrnItemRow[]>([]);
  const [invoices, setInvoices] = useState<InvRow[]>([]);
  const [invItems, setInvItems] = useState<InvItemRow[]>([]);
  const [grnOpen, setGrnOpen] = useState(false);
  const [invOpen, setInvOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  // Post-approval PO details editing
  const [poEditOpen, setPoEditOpen] = useState(false);
  const [poForm, setPoForm] = useState({ bill_to_id: "", ship_to_id: "", expected_delivery_date: "", payment_terms: "" });
  const [rateLines, setRateLines] = useState<{ id: string; product_id: string | null; uom: string | null; qty: number; rate: string }[]>([]);
  const [poSaving, setPoSaving] = useState(false);
  const [addressOptions, setAddressOptions] = useState<AddressOption[]>([]);

  useEffect(() => {
    fetchAddressOptions().then(setAddressOptions).catch(() => {});
  }, []);

  const findAddr = (id: string) => addressOptions.find((a) => a.id === id) || null;

  const openPoEdit = () => {
    setPoForm({
      bill_to_id: order.bill_to_address_id || "",
      ship_to_id: order.ship_to_address_id || "",
      expected_delivery_date: order.expected_delivery_date || "",
      payment_terms: order.payment_terms || "",
    });
    setRateLines((order.procurement_items || []).map((it) => ({
      id: it.id, product_id: it.product_id, uom: it.uom, qty: it.qty, rate: String(it.rate ?? ""),
    })));
    setPoEditOpen(true);
  };

  const poEditTotal = useMemo(
    () => rateLines.reduce((s, l) => s + (parseFloat(l.rate) || 0) * (l.qty || 0), 0),
    [rateLines]
  );

  const savePoDetails = async () => {
    setPoSaving(true);
    try {
      const billAddr = poForm.bill_to_id ? findAddr(poForm.bill_to_id) : null;
      const shipAddr = poForm.ship_to_id ? findAddr(poForm.ship_to_id) : null;
      const { error: oErr } = await supabase.from("procurement_orders").update({
        bill_to: billAddr ? formatAddressSnapshot(billAddr) : null,
        ship_to: shipAddr ? formatAddressSnapshot(shipAddr) : null,
        bill_to_address_id: poForm.bill_to_id || null,
        ship_to_address_id: poForm.ship_to_id || null,
        bill_to_gst: billAddr?.gst_number || null,
        ship_to_gst: shipAddr?.gst_number || null,
        expected_delivery_date: poForm.expected_delivery_date || null,
        payment_terms: poForm.payment_terms || null,
        total_amount: poEditTotal,
      }).eq("id", order.id);
      if (oErr) throw oErr;
      for (const l of rateLines) {
        const rate = parseFloat(l.rate) || 0;
        const { error: iErr } = await supabase.from("procurement_items")
          .update({ rate, amount: rate * (l.qty || 0) }).eq("id", l.id);
        if (iErr) throw iErr;
      }
      toast.success("PO details updated");
      setPoEditOpen(false);
      onChanged();
    } catch (err: any) {
      toast.error(err.message || "Failed to update PO details");
    } finally {
      setPoSaving(false);
    }
  };



  const items: POItem[] = useMemo(
    () => (order.procurement_items || []).map((it) => ({
      id: it.id, product_id: it.product_id, rate: it.rate, qty: it.qty, uom: it.uom,
    })),
    [order.procurement_items]
  );

  const fetchSub = useCallback(async () => {
    const [g, inv] = await Promise.all([
      supabase.from("procurement_grns").select("*, procurement_grn_items(*)").eq("po_id", order.id).order("created_at"),
      supabase.from("procurement_invoices").select("*, procurement_invoice_items(*)").eq("po_id", order.id).order("created_at"),
    ]);
    const gRows = (g.data || []) as any[];
    setGrns(gRows.map((r) => ({ id: r.id, grn_number: r.grn_number, receipt_date: r.receipt_date, status: r.status, received_by: r.received_by, remarks: r.remarks })));
    setGrnItems(gRows.flatMap((r) => (r.procurement_grn_items || []) as GrnItemRow[]));
    const iRows = (inv.data || []) as any[];
    setInvoices(iRows.map((r) => ({ id: r.id, invoice_number: r.invoice_number, invoice_date: r.invoice_date, invoice_amount: r.invoice_amount })));
    setInvItems(iRows.flatMap((r) => (r.procurement_invoice_items || []) as InvItemRow[]));
  }, [order.id]);

  useEffect(() => { if (open) fetchSub(); }, [open, fetchSub]);

  const receivedByItem = useMemo(() => {
    const m: Record<string, number> = {};
    grnItems.forEach((gi) => {
      if (gi.procurement_item_id) m[gi.procurement_item_id] = (m[gi.procurement_item_id] || 0) + Number(gi.received_qty || 0);
    });
    return m;
  }, [grnItems]);

  const invoicedRate = useMemo(() => {
    const m: Record<string, number> = {};
    invItems.forEach((ii) => { if (ii.procurement_item_id) m[ii.procurement_item_id] = Number(ii.invoiced_rate || 0); });
    return m;
  }, [invItems]);

  const invoiceTotal = useMemo(() => invoices.reduce((s, i) => s + Number(i.invoice_amount || 0), 0), [invoices]);

  const transitions = allowedTransitions(order.status).filter((t) => !t.approver || canApprove);
  const editable = order.status === "Requisition";
  // After approval, admins can fill the remaining PO details (until goods are received)
  const poUnlocked = canApprove && ["Requisition Approved", "Quote Awaited", "Quote Received", "PO Issued", "PO Finalised"].includes(order.status);
  const canReceive =
    canApprove && ["PO Issued", "PO Finalised", "Goods Received"].includes(order.status);
  const canInvoice =
    canApprove && ["Goods Received", "Invoice Received"].includes(order.status);

  const estBudget = order.estimated_budget;
  const poValue = order.total_amount || 0;
  const variance = estBudget != null ? estBudget - poValue : null;
  const overBudget = estBudget != null && poValue > estBudget;

  const applyTransition = async (to: ProcStatus) => {
    setBusy(true);
    const { error } = await supabase.from("procurement_orders").update({ status: to }).eq("id", order.id);
    setBusy(false);
    if (error) { toast.error(error.message || "Failed to update status"); return; }
    toast.success(`Status changed to ${to}`);
    onChanged();
    onOpenChange(false);
  };

  const stepIndex = STATUS_FLOW.indexOf(order.status as ProcStatus);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-none w-screen h-screen sm:rounded-none p-0 gap-0 flex flex-col">
        <DialogHeader className="px-4 py-3 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            {order.po_number || "(No PO #)"}
            <Badge variant="outline" className={`text-[10px] ${statusColor(order.status)}`}>{order.status}</Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 p-4 overflow-y-auto flex-1 max-w-3xl w-full mx-auto">
          {/* Stepper */}
          {order.status !== "Rejected" && (
            <div className="flex items-center gap-1 overflow-x-auto pb-1">
              {STATUS_FLOW.map((s, i) => (
                <div key={s} className="flex items-center shrink-0">
                  <span className={`text-[10px] px-2 py-1 rounded-full whitespace-nowrap ${i <= stepIndex ? statusColor(s) : "bg-muted text-muted-foreground"}`}>{s}</span>
                  {i < STATUS_FLOW.length - 1 && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
                </div>
              ))}
            </div>
          )}

          {/* Header info */}
          <Card>
            <CardContent className="p-3 space-y-1.5 text-sm">
              <div className="flex items-center gap-2 text-muted-foreground"><CalendarDays className="h-3.5 w-3.5" />{order.order_date}</div>
              <div className="text-muted-foreground">
                Vendor: {(order.vendor_ids && order.vendor_ids.length
                  ? order.vendor_ids.map((id) => vendorName(id)).join(", ")
                  : vendorName(order.vendor_id))}
              </div>
              <div className="text-muted-foreground">Site: {siteName(order.site_id)}</div>
              {order.po_number && <div className="text-muted-foreground">PO Number: <span className="font-medium text-foreground">{order.po_number}</span></div>}
              {order.expected_delivery_date && <div className="text-muted-foreground">Expected Delivery: {order.expected_delivery_date}</div>}
              {order.payment_terms && <div className="text-muted-foreground">Payment Terms: {order.payment_terms}</div>}
              {order.bill_to && <div className="text-muted-foreground">Bill To: <span className="whitespace-pre-wrap">{order.bill_to}</span>{order.bill_to_gst && <span className="block">GST: {order.bill_to_gst}</span>}</div>}
              {order.ship_to && <div className="text-muted-foreground">Ship To: <span className="whitespace-pre-wrap">{order.ship_to}</span>{order.ship_to_gst && <span className="block">GST: {order.ship_to_gst}</span>}</div>}
              {order.requisition_notes && <div className="text-muted-foreground">Reason: <span className="whitespace-pre-wrap">{order.requisition_notes}</span></div>}
              {poUnlocked && (
                <div className="pt-1">
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={openPoEdit}>
                    <Pencil className="h-3.5 w-3.5" />Edit PO Details &amp; Rates
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>


          {/* Budget vs Actual */}
          {estBudget != null && (
            <Card className={overBudget ? "border-destructive/50" : "border-emerald-500/50"}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  Budget vs Actual {overBudget ? "⚠️" : "✅"}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5 text-sm">
                <div className="flex items-center justify-between"><span className="text-muted-foreground">Estimated Budget</span><span className="font-medium">{fmtAmt(estBudget)}</span></div>
                <div className="flex items-center justify-between"><span className="text-muted-foreground">PO Value</span><span className="font-medium">{fmtAmt(poValue)}</span></div>
                <div className="flex items-center justify-between border-t pt-1.5">
                  <span className="text-muted-foreground">Variance</span>
                  <span className={`font-semibold ${overBudget ? "text-destructive" : "text-emerald-600 dark:text-emerald-400"}`}>
                    {fmtAmt(variance ?? 0)}
                  </span>
                </div>
                <p className={`text-xs ${overBudget ? "text-destructive" : "text-emerald-600 dark:text-emerald-400"}`}>
                  {overBudget ? "⚠️ PO exceeds the estimated budget." : "✅ Within estimated budget."}
                </p>
              </CardContent>
            </Card>
          )}


          {/* Line items */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Line Items</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {items.map((it) => (
                <div key={it.id} className="flex items-center justify-between text-sm border-b last:border-b-0 py-1.5">
                  <div className="flex-1 min-w-0">
                    <div className="truncate font-medium">{productName(it.product_id)}</div>
                    <div className="text-[11px] text-muted-foreground">{it.qty} {it.uom || ""} × {fmtAmt(it.rate)}</div>
                  </div>
                  <div className="font-medium">{fmtAmt(it.rate * it.qty)}</div>
                </div>
              ))}
              <div className="flex items-center justify-between pt-2 font-semibold">
                <span>Grand Total</span><span className="text-primary">{fmtAmt(order.total_amount)}</span>
              </div>
            </CardContent>
          </Card>

          {/* GRN list */}
          <Card>
            <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base flex items-center gap-2"><Truck className="h-4 w-4" />Goods Receipts</CardTitle>
              {canReceive && <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setGrnOpen(true)}>Receive Goods</Button>}
            </CardHeader>
            <CardContent className="space-y-2">
              {grns.length === 0 ? (
                <p className="text-xs text-muted-foreground">No receipts yet.</p>
              ) : grns.map((g) => (
                <div key={g.id} className="flex items-center justify-between text-sm border-b last:border-b-0 py-1.5">
                  <div>
                    <div className="font-medium">{g.grn_number}</div>
                    <div className="text-[11px] text-muted-foreground">{g.receipt_date}{g.received_by ? ` · ${g.received_by}` : ""}</div>
                  </div>
                  <Badge variant="outline" className={`text-[10px] ${statusColor(g.status)}`}>{g.status}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Invoice list */}
          <Card>
            <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base flex items-center gap-2"><FileText className="h-4 w-4" />Invoices</CardTitle>
              {canInvoice && <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setInvOpen(true)}>Add Invoice</Button>}
            </CardHeader>
            <CardContent className="space-y-2">
              {invoices.length === 0 ? (
                <p className="text-xs text-muted-foreground">No invoices yet.</p>
              ) : invoices.map((i) => (
                <div key={i.id} className="flex items-center justify-between text-sm border-b last:border-b-0 py-1.5">
                  <div>
                    <div className="font-medium">{i.invoice_number}</div>
                    <div className="text-[11px] text-muted-foreground">{i.invoice_date}</div>
                  </div>
                  <div className="font-medium">{fmtAmt(i.invoice_amount)}</div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* 3-way match */}
          {(grns.length > 0 || invoices.length > 0) && (
            <ThreeWayMatch
              items={items}
              received={receivedByItem}
              invoicedRate={invoicedRate}
              poTotal={order.total_amount}
              invoiceTotal={invoiceTotal}
              productName={productName}
            />
          )}

          {/* Actions */}
          <div className="flex flex-wrap gap-2 pt-2 pb-6">
            {editable && (
              <Button variant="outline" className="gap-1.5" onClick={() => onEdit(order)}><Pencil className="h-4 w-4" />Edit</Button>
            )}
            {transitions.map((t) => (
              <Button
                key={t.to}
                variant={t.variant || "default"}
                disabled={busy}
                onClick={() => applyTransition(t.to)}
              >
                {t.label}
              </Button>
            ))}
          </div>
        </div>

        {grnOpen && (
          <GRNForm
            open={grnOpen} onOpenChange={setGrnOpen}
            poId={order.id} poNumber={order.po_number || "(No PO #)"}
            items={items} alreadyReceived={receivedByItem}
            productName={productName} createdBy={currentUserId}
            onSaved={() => { fetchSub(); onChanged(); }}
          />
        )}
        {invOpen && (
          <InvoiceForm
            open={invOpen} onOpenChange={setInvOpen}
            poId={order.id} poNumber={order.po_number || "(No PO #)"}
            vendorNameStr={vendorName(order.vendor_id)}
            items={items} productName={productName} createdBy={currentUserId}
            onSaved={() => { fetchSub(); onChanged(); }}
          />
        )}

        {/* Post-approval PO details + rates */}
        <Dialog open={poEditOpen} onOpenChange={setPoEditOpen}>
          <DialogContent className="max-w-lg w-[95vw] max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Edit PO Details</DialogTitle></DialogHeader>
            <div className="space-y-3">
              {order.po_number && (
                <div className="text-xs text-muted-foreground">PO Number: <span className="font-medium text-foreground">{order.po_number}</span></div>
              )}
              <div>
                <Label className="text-xs">Bill To</Label>
                <Select value={poForm.bill_to_id} onValueChange={(v) => setPoForm((p) => ({ ...p, bill_to_id: v }))}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Select billing address" /></SelectTrigger>
                  <SelectContent>
                    {addressOptions.map((a) => (
                      <SelectItem key={a.id} value={a.id}>{a.name}{a.source === "site" ? " (Site)" : ""}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {(() => {
                  const a = poForm.bill_to_id ? findAddr(poForm.bill_to_id) : null;
                  return a ? (
                    <div className="mt-1.5 rounded-md border bg-muted/40 p-2 text-xs whitespace-pre-wrap text-muted-foreground">
                      {formatAddressSnapshot(a)}
                      {a.gst_number && <div className="mt-1 font-medium text-foreground">GST: {a.gst_number}</div>}
                    </div>
                  ) : null;
                })()}
              </div>
              <div>
                <Label className="text-xs">Ship To</Label>
                <Select value={poForm.ship_to_id} onValueChange={(v) => setPoForm((p) => ({ ...p, ship_to_id: v }))}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Select delivery address" /></SelectTrigger>
                  <SelectContent>
                    {addressOptions.map((a) => (
                      <SelectItem key={a.id} value={a.id}>{a.name}{a.source === "site" ? " (Site)" : ""}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {(() => {
                  const a = poForm.ship_to_id ? findAddr(poForm.ship_to_id) : null;
                  return a ? (
                    <div className="mt-1.5 rounded-md border bg-muted/40 p-2 text-xs whitespace-pre-wrap text-muted-foreground">
                      {formatAddressSnapshot(a)}
                      {a.gst_number && <div className="mt-1 font-medium text-foreground">GST: {a.gst_number}</div>}
                    </div>
                  ) : null;
                })()}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Expected Delivery Date</Label>
                  <Input type="date" value={poForm.expected_delivery_date} onChange={(e) => setPoForm((p) => ({ ...p, expected_delivery_date: e.target.value }))} className="h-9" />
                </div>
                <div>
                  <Label className="text-xs">Payment Terms</Label>
                  <Select value={poForm.payment_terms} onValueChange={(v) => setPoForm((p) => ({ ...p, payment_terms: v }))}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="Select terms" /></SelectTrigger>
                    <SelectContent>{PAYMENT_TERMS.map((t) => (<SelectItem key={t} value={t}>{t}</SelectItem>))}</SelectContent>
                  </Select>
                </div>
              </div>

              <div className="border-t pt-3">
                <Label className="text-sm font-semibold">Rates</Label>
                <div className="space-y-2 mt-2">
                  {rateLines.map((l, i) => {
                    const amt = (parseFloat(l.rate) || 0) * (l.qty || 0);
                    return (
                      <div key={l.id} className="rounded-lg border p-2.5 bg-muted/30">
                        <div className="text-sm font-medium mb-1">{productName(l.product_id)}</div>
                        <div className="grid grid-cols-3 gap-2 items-end">
                          <div>
                            <Label className="text-[10px] text-muted-foreground">Qty</Label>
                            <div className="h-8 flex items-center text-sm">{l.qty} {l.uom || ""}</div>
                          </div>
                          <div>
                            <Label className="text-[10px] text-muted-foreground">Rate</Label>
                            <Input
                              type="number" inputMode="decimal" value={l.rate} placeholder="0" className="h-8"
                              onChange={(e) => setRateLines((prev) => prev.map((x, idx) => idx === i ? { ...x, rate: e.target.value } : x))}
                            />
                          </div>
                          <div>
                            <Label className="text-[10px] text-muted-foreground">Amount</Label>
                            <div className="h-8 flex items-center text-sm font-medium">{fmtAmt(amt)}</div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="flex items-center justify-between mt-3 pt-2 border-t">
                  <span className="text-sm font-semibold">Grand Total</span>
                  <span className="text-base font-bold text-primary">{fmtAmt(poEditTotal)}</span>
                </div>
              </div>

              <div className="flex gap-2 pt-1">
                <Button variant="outline" className="flex-1" onClick={() => setPoEditOpen(false)}>Cancel</Button>
                <Button className="flex-1" onClick={savePoDetails} disabled={poSaving}><Save className="h-4 w-4 mr-2" />{poSaving ? "Saving..." : "Save"}</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}
