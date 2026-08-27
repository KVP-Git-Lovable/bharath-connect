import { useState, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Save, FileText, Paperclip, X, Plus, Trash2 } from "lucide-react";
import { fmtAmt } from "@/lib/procurement";
import { uploadInvoiceFile, removeInvoiceFile } from "@/utils/invoiceAttachments";
import type { POItem } from "./GRNForm";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  poId: string;
  poNumber: string;
  vendorNameStr?: string;
  items: POItem[];
  productName: (id: string | null) => string;
  createdBy?: string;
  onSaved: () => void;
}

interface AttachedFile {
  path: string;
  name: string;
  size: number;
}

interface PaymentLine {
  id: string;
  reference_number: string;
  bank_name: string;
  amount: string;
  payment_date: string;
}

function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

const newPayment = (): PaymentLine => ({
  id: Math.random().toString(36).slice(2),
  reference_number: "",
  bank_name: "",
  amount: "",
  payment_date: new Date().toISOString().slice(0, 10),
});

export default function InvoiceForm({
  open, onOpenChange, poId, poNumber, vendorNameStr, items, productName, createdBy, onSaved,
}: Props) {
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10));
  const [files, setFiles] = useState<AttachedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [payments, setPayments] = useState<PaymentLine[]>([newPayment()]);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const amount = useMemo(
    () => items.reduce((s, it) => s + it.rate * it.qty, 0),
    [items]
  );

  const totalPaid = useMemo(
    () => payments.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0),
    [payments]
  );
  const balanceDue = amount - totalPaid;

  const handleFiles = async (list: FileList | null) => {
    if (!list || list.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(list)) {
        const path = await uploadInvoiceFile(file);
        setFiles((p) => [...p, { path, name: file.name, size: file.size }]);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to upload file");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const removeFile = async (idx: number) => {
    const f = files[idx];
    setFiles((p) => p.filter((_, i) => i !== idx));
    if (f) await removeInvoiceFile(f.path);
  };

  const updatePayment = (id: string, patch: Partial<PaymentLine>) =>
    setPayments((p) => p.map((pl) => (pl.id === id ? { ...pl, ...patch } : pl)));
  const removePayment = (id: string) =>
    setPayments((p) => p.filter((pl) => pl.id !== id));

  const handleSave = async () => {
    if (!invoiceNumber.trim()) { toast.error("Invoice number is required"); return; }
    setSaving(true);
    try {
      const { data: inv, error } = await supabase
        .from("procurement_invoices")
        .insert({
          po_id: poId,
          invoice_number: invoiceNumber.trim(),
          invoice_date: invoiceDate,
          invoice_amount: amount,
          created_by: createdBy,
        })
        .select("id")
        .single();
      if (error) throw error;

      const itemRows = items.map((it) => ({
        invoice_id: inv.id,
        procurement_item_id: it.id,
        product_id: it.product_id,
        invoiced_rate: it.rate,
        invoiced_qty: it.qty,
      }));
      const { error: ie } = await supabase.from("procurement_invoice_items").insert(itemRows);
      if (ie) throw ie;

      if (files.length) {
        const { error: ae } = await supabase.from("procurement_invoice_attachments").insert(
          files.map((f) => ({
            invoice_id: inv.id,
            file_name: f.name,
            file_size: f.size,
            file_path: f.path,
            created_by: createdBy,
          }))
        );
        if (ae) throw ae;
      }

      const validPayments = payments.filter(
        (p) => (parseFloat(p.amount) || 0) > 0 || p.reference_number.trim() || p.bank_name.trim()
      );
      if (validPayments.length) {
        const { error: pe } = await supabase.from("procurement_invoice_payments").insert(
          validPayments.map((p) => ({
            invoice_id: inv.id,
            reference_number: p.reference_number.trim() || null,
            bank_name: p.bank_name.trim() || null,
            amount: parseFloat(p.amount) || 0,
            payment_date: p.payment_date || null,
            created_by: createdBy,
          }))
        );
        if (pe) throw pe;
      }

      toast.success("Invoice recorded");
      onOpenChange(false);
      onSaved();
    } catch (err: any) {
      toast.error(err.message || "Failed to save invoice");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-none w-screen h-screen sm:rounded-none p-0 gap-0 flex flex-col">
        <DialogHeader className="px-4 py-3 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-4 w-4" />Record Invoice — {poNumber}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-5 p-4 overflow-y-auto flex-1 max-w-3xl w-full mx-auto pb-8">
          {/* PO / Vendor header (read-only) */}
          <div className="grid grid-cols-2 gap-3 rounded-lg border bg-muted/40 p-3">
            <div>
              <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">PO Number</Label>
              <div className="text-sm font-semibold">{poNumber}</div>
            </div>
            <div>
              <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">Vendor Name</Label>
              <div className="text-sm font-semibold">{vendorNameStr || "—"}</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Invoice Number</Label>
              <Input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} placeholder="INV-0001" className="h-9" />
            </div>
            <div>
              <Label className="text-xs">Invoice Date</Label>
              <Input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} className="h-9" />
            </div>
          </div>

          {/* Line items (read-only) */}
          <div>
            <Label className="text-sm font-semibold">Line Items (from PO)</Label>
            <div className="mt-2 rounded-lg border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[480px]">
                  <thead>
                    <tr className="bg-muted/60 text-xs text-muted-foreground">
                      <th className="text-left font-medium px-3 py-2">Material</th>
                      <th className="text-right font-medium px-3 py-2">PO Rate</th>
                      <th className="text-center font-medium px-3 py-2">Qty</th>
                      <th className="text-right font-medium px-3 py-2">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it) => (
                      <tr key={it.id} className="border-t">
                        <td className="px-3 py-2 font-medium">{productName(it.product_id)}</td>
                        <td className="px-3 py-2 text-right text-muted-foreground">{fmtAmt(it.rate)}</td>
                        <td className="px-3 py-2 text-center">{it.qty}{it.uom ? ` ${it.uom}` : ""}</td>
                        <td className="px-3 py-2 text-right font-medium">{fmtAmt(it.rate * it.qty)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between pt-1 border-t">
            <span className="text-sm font-semibold">Invoice Total</span>
            <span className="text-base font-bold text-primary">{fmtAmt(amount)}</span>
          </div>

          {/* Attachments */}
          <div>
            <Label className="text-sm font-semibold">Attach Invoice Documents</Label>
            <p className="text-[11px] text-muted-foreground mb-2">Vendor invoice scans — PDF, JPG, PNG. Attach as many as needed.</p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,image/png,image/jpeg"
              multiple
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />
            <Button
              type="button"
              variant="outline"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
            >
              <Paperclip className="h-4 w-4 mr-2" />
              {uploading ? "Uploading..." : "Attach Files"}
            </Button>
            {files.length > 0 && (
              <div className="mt-3 space-y-2">
                {files.map((f, idx) => (
                  <div key={f.path} className="flex items-center gap-3 rounded-lg border p-2.5">
                    <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{f.name}</div>
                      <div className="text-[11px] text-muted-foreground">{formatBytes(f.size)}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeFile(idx)}
                      className="rounded-full p-1 hover:bg-muted text-muted-foreground"
                      aria-label="Remove file"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Payment Details */}
          <div>
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold">Payment Details</Label>
              <Button type="button" variant="outline" size="sm" onClick={() => setPayments((p) => [...p, newPayment()])}>
                <Plus className="h-4 w-4 mr-1" />Add Payment
              </Button>
            </div>
            <div className="mt-2 space-y-3">
              {payments.map((p, i) => (
                <div key={p.id} className="rounded-lg border p-3 space-y-2.5 bg-muted/20">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">Payment {i + 1}</span>
                    <button
                      type="button"
                      onClick={() => removePayment(p.id)}
                      className="rounded-full p-1 hover:bg-muted text-muted-foreground"
                      aria-label="Remove payment"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <Label className="text-[10px] text-muted-foreground">Payment Reference No.</Label>
                      <Input value={p.reference_number} onChange={(e) => updatePayment(p.id, { reference_number: e.target.value })} placeholder="UTR / Cheque #" className="h-8 bg-background" />
                    </div>
                    <div>
                      <Label className="text-[10px] text-muted-foreground">Vendor Bank Name</Label>
                      <Input value={p.bank_name} onChange={(e) => updatePayment(p.id, { bank_name: e.target.value })} placeholder="Bank" className="h-8 bg-background" />
                    </div>
                    <div>
                      <Label className="text-[10px] text-muted-foreground">Amount (₹)</Label>
                      <Input type="number" inputMode="decimal" value={p.amount} onChange={(e) => updatePayment(p.id, { amount: e.target.value })} placeholder="0" className="h-8 bg-background" />
                    </div>
                    <div>
                      <Label className="text-[10px] text-muted-foreground">Date of Payment</Label>
                      <Input type="date" value={p.payment_date} onChange={(e) => updatePayment(p.id, { payment_date: e.target.value })} className="h-8 bg-background" />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-3 space-y-1.5 rounded-lg border p-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Total Paid</span>
                <span className="font-semibold">{fmtAmt(totalPaid)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Balance Due</span>
                <span className={`font-bold ${balanceDue > 0.005 ? "text-red-600" : "text-green-600"}`}>
                  {fmtAmt(balanceDue)}
                </span>
              </div>
            </div>
          </div>

          <div className="flex gap-2 pt-2 pb-6">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button className="flex-1" onClick={handleSave} disabled={saving}>
              <Save className="h-4 w-4 mr-2" />{saving ? "Saving..." : "Save Invoice"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
