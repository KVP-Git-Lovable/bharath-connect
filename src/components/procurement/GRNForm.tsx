import { useState, useMemo, useRef, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUserProfile } from "@/hooks/useUserProfile";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { Save, Camera, ImageIcon, X, ArrowLeft, Star } from "lucide-react";
import { receiptDrivenStatus, GRN_STATUSES, GrnStatus } from "@/lib/procurement";
import { uploadGrnPhoto, removeGrnPhoto } from "@/utils/grnPhotos";
import { StarRating } from "./VendorRating";
import { cn } from "@/lib/utils";

const MAX_PHOTOS = 20;

export interface POItem {
  id: string;
  product_id: string | null;
  rate: number;
  qty: number;
  uom: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  poId: string;
  poNumber: string;
  vendorId?: string | null;
  items: POItem[];
  /** already-received qty keyed by procurement_item_id */
  alreadyReceived: Record<string, number>;
  productName: (id: string | null) => string;
  createdBy?: string;
  onSaved: () => void;
}

export default function GRNForm({
  open, onOpenChange, poId, poNumber, vendorId, items, alreadyReceived, productName, createdBy, onSaved,
}: Props) {
  const queryClient = useQueryClient();
  const { profile } = useUserProfile();
  const [receiptDate, setReceiptDate] = useState(new Date().toISOString().slice(0, 10));
  const [receivedBy, setReceivedBy] = useState("");
  const [remarks, setRemarks] = useState("");
  const [status, setStatus] = useState<GrnStatus>("Pending");
  const [statusManuallySet, setStatusManuallySet] = useState(false);
  const [recv, setRecv] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [photos, setPhotos] = useState<{ path: string; preview: string }[]>([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  // vendor feedback (optional)
  const [fbDelivery, setFbDelivery] = useState(0);
  const [fbQuality, setFbQuality] = useState(0);
  const [fbQuantity, setFbQuantity] = useState(0);
  const [fbOverall, setFbOverall] = useState(0);
  const [fbComments, setFbComments] = useState("");
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (profile?.full_name) {
      setReceivedBy(profile.full_name);
    }
  }, [profile?.full_name]);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const remaining = MAX_PHOTOS - photos.length;
    if (remaining <= 0) {
      toast.error(`Maximum ${MAX_PHOTOS} photos allowed`);
      return;
    }
    const list = Array.from(files).slice(0, remaining);
    setUploadingPhoto(true);
    try {
      for (const file of list) {
        const path = await uploadGrnPhoto(file);
        setPhotos((p) => [...p, { path, preview: URL.createObjectURL(file) }]);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to upload photo");
    } finally {
      setUploadingPhoto(false);
      if (cameraInputRef.current) cameraInputRef.current.value = "";
      if (galleryInputRef.current) galleryInputRef.current.value = "";
    }
  };

  const removePhoto = async (idx: number) => {
    const photo = photos[idx];
    setPhotos((p) => p.filter((_, i) => i !== idx));
    if (photo) await removeGrnPhoto(photo.path);
  };

  const balance = (it: POItem) => Math.max(0, it.qty - (alreadyReceived[it.id] || 0));

  const totals = useMemo(() => {
    const ordered = items.reduce((s, it) => s + it.qty, 0);
    const priorReceived = items.reduce((s, it) => s + (alreadyReceived[it.id] || 0), 0);
    const thisReceipt = items.reduce((s, it) => s + (parseFloat(recv[it.id]) || 0), 0);
    return { ordered, priorReceived, thisReceipt, cumulative: priorReceived + thisReceipt };
  }, [items, alreadyReceived, recv]);

  const progressPct = totals.ordered > 0
    ? Math.min(100, Math.round((totals.cumulative / totals.ordered) * 100))
    : 0;

  useEffect(() => {
    if (statusManuallySet) return;
    const { thisReceipt, ordered, cumulative } = totals;
    if (thisReceipt === 0) {
      setStatus("Pending");
    } else if (cumulative >= ordered && ordered > 0) {
      setStatus("Fully Received");
    } else {
      setStatus("Partially Received");
    }
  }, [totals, statusManuallySet]);

  const handleStatusSelect = (s: GrnStatus) => {
    setStatusManuallySet(true);
    setStatus(s);
  };

  const handleSave = async () => {
    const rows = items
      .map((it) => ({ it, received: parseFloat(recv[it.id]) || 0 }))
      .filter((r) => r.received > 0);
    if (status !== "Rejected" && rows.length === 0) {
      toast.error("Enter received quantity for at least one item");
      return;
    }
    setSaving(true);
    try {
      const { data: grn, error } = await supabase
        .from("procurement_grns")
        .insert({
          po_id: poId,
          receipt_date: receiptDate,
          received_by: receivedBy.trim() || null,
          remarks: remarks.trim() || null,
          status,
          photos: photos.map((p) => p.path),
          created_by: createdBy,
        })
        .select("id")
        .single();
      if (error) throw error;

      if (rows.length) {
        const itemRows = rows.map((r) => ({
          grn_id: grn.id,
          procurement_item_id: r.it.id,
          product_id: r.it.product_id,
          ordered_qty: r.it.qty,
          received_qty: r.received,
        }));
        const { error: ie } = await supabase.from("procurement_grn_items").insert(itemRows);
        if (ie) throw ie;
      }

      // Drive PO status from cumulative received
      if (status !== "Rejected") {
        const next = receiptDrivenStatus(totals.ordered, totals.cumulative, "");
        if (next) {
          await supabase.from("procurement_orders").update({ status: next }).eq("id", poId);
        }
      }

      // Optional vendor feedback — save together with the GRN
      const anyRating = fbDelivery || fbQuality || fbQuantity || fbOverall;
      if (anyRating && vendorId) {
        if (!fbDelivery || !fbQuality || !fbQuantity || !fbOverall) {
          toast.warning("Skipped rating — please rate all four categories");
        } else {
          const { error: fe } = await supabase.from("procurement_vendor_feedback").insert({
            grn_id: grn.id,
            vendor_id: vendorId,
            po_id: poId,
            delivery_timeliness: fbDelivery,
            material_quality: fbQuality,
            quantity_accuracy: fbQuantity,
            overall_experience: fbOverall,
            comments: fbComments.trim() || null,
            created_by: createdBy ?? null,
          });
          if (fe) toast.error("GRN saved, but feedback failed: " + fe.message);
          else queryClient.invalidateQueries({ queryKey: ["vendor-feedback"] });
        }
      }

      toast.success("Goods Receipt recorded");
      onOpenChange(false);
      onSaved();
    } catch (err: any) {
      toast.error(err.message || "Failed to save GRN");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-none w-screen h-screen sm:rounded-none p-0 gap-0 flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b shrink-0">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-md p-1.5 hover:bg-muted transition-colors"
            aria-label="Back"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-semibold text-base">Goods Receipt</span>
            <span className="text-muted-foreground">—</span>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="inline-flex items-center rounded-full bg-primary/10 text-primary px-2.5 py-0.5 text-sm font-semibold hover:bg-primary/20 transition-colors"
            >
              {poNumber}
            </button>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="overflow-y-auto flex-1">
          <div className="space-y-5 p-4 pb-8 max-w-[800px] w-full mx-auto">
            {/* Top card: Date / Received By */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 rounded-lg border bg-muted/40 p-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Date of Receipt</Label>
                <Input type="date" value={receiptDate} onChange={(e) => setReceiptDate(e.target.value)} className="h-9 bg-background" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Received By</Label>
                <Input value={receivedBy} onChange={(e) => setReceivedBy(e.target.value)} placeholder="Name" className="h-9 bg-background" />
              </div>
            </div>

            {/* Items table */}
            <div>
              <Label className="text-sm font-semibold">Items — Ordered vs Received</Label>
              <div className="mt-2 rounded-lg border overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[640px]">
                    <thead>
                      <tr className="bg-muted/60 text-xs text-muted-foreground">
                        <th className="text-left font-medium px-3 py-2">Material</th>
                        <th className="text-center font-medium px-3 py-2">UOM</th>
                        <th className="text-center font-medium px-3 py-2">Ordered</th>
                        <th className="text-center font-medium px-3 py-2">Prev. Received</th>
                        <th className="text-center font-medium px-3 py-2">Balance</th>
                        <th className="text-center font-medium px-3 py-2 bg-primary/10 text-primary">Receiving Now</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((it) => {
                        const bal = balance(it);
                        const prev = alreadyReceived[it.id] || 0;
                        return (
                          <tr key={it.id} className="border-t">
                            <td className="px-3 py-2 font-medium">{productName(it.product_id)}</td>
                            <td className="px-3 py-2 text-center text-muted-foreground">{it.uom || "—"}</td>
                            <td className="px-3 py-2 text-center">{it.qty}</td>
                            <td className="px-3 py-2 text-center">{prev}</td>
                            <td className="px-3 py-2 text-center font-medium">{bal}</td>
                            <td className="px-3 py-2 bg-primary/5">
                              <Input
                                type="number" inputMode="decimal"
                                className="h-9 w-24 mx-auto text-center bg-background border-primary/40 focus-visible:ring-primary"
                                value={recv[it.id] || ""}
                                onChange={(e) => setRecv((p) => ({ ...p, [it.id]: e.target.value }))}
                                placeholder="0"
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Progress */}
              <div className="mt-3 space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Cumulative received</span>
                  <span className="font-semibold">{totals.cumulative} / {totals.ordered}</span>
                </div>
                <Progress value={progressPct} className="h-2.5" />
              </div>
            </div>

            {/* Status chips */}
            <div>
              <Label className="text-sm font-semibold">GRN Status</Label>
              <div className="mt-2 flex flex-wrap gap-2">
                {GRN_STATUSES.map((s) => {
                  const active = status === s;
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => handleStatusSelect(s)}
                      className={cn(
                        "rounded-full px-4 py-1.5 text-sm font-medium border transition-colors",
                        active
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background text-foreground border-input hover:bg-muted"
                      )}
                    >
                      {s}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Remarks */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Remarks</Label>
              <Textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Notes about this receipt..." rows={2} />
            </div>

            {/* Photos */}
            <div>
              <Label className="text-sm font-semibold">Goods Photos</Label>
              <p className="text-[11px] text-muted-foreground mb-2">Proof of delivery — up to {MAX_PHOTOS} photos.</p>
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => handleFiles(e.target.files)}
              />
              <input
                ref={galleryInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => handleFiles(e.target.files)}
              />
              <div className="grid grid-cols-2 gap-3">
                <Button
                  type="button"
                  variant="outline"
                  disabled={uploadingPhoto || photos.length >= MAX_PHOTOS}
                  onClick={() => cameraInputRef.current?.click()}
                >
                  <Camera className="h-4 w-4 mr-2" />
                  {uploadingPhoto ? "Uploading..." : "Take Photo"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={uploadingPhoto || photos.length >= MAX_PHOTOS}
                  onClick={() => galleryInputRef.current?.click()}
                >
                  <ImageIcon className="h-4 w-4 mr-2" />
                  Upload from Gallery
                </Button>
              </div>
              {photos.length > 0 && (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mt-3">
                  {photos.map((p, idx) => (
                    <div key={p.path} className="relative aspect-square rounded-lg overflow-hidden border">
                      <img src={p.preview} alt={`Goods photo ${idx + 1}`} className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => removePhoto(idx)}
                        className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-0.5"
                        aria-label="Remove photo"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Vendor Feedback (optional) */}
            {vendorId && (
              <div className="rounded-lg border p-3 space-y-3">
                <div className="flex items-center gap-2">
                  <Star className="h-4 w-4 text-amber-400" />
                  <div className="text-sm font-semibold">Rate this Delivery</div>
                  <span className="text-[11px] text-muted-foreground">(optional)</span>
                </div>
                {[
                  { label: "Delivery Timeliness", value: fbDelivery, set: setFbDelivery },
                  { label: "Material Quality", value: fbQuality, set: setFbQuality },
                  { label: "Quantity Accuracy", value: fbQuantity, set: setFbQuantity },
                  { label: "Overall Experience", value: fbOverall, set: setFbOverall },
                ].map((row) => (
                  <div key={row.label} className="flex items-center justify-between gap-2">
                    <span className="text-sm">{row.label}</span>
                    <StarRating value={row.value} onChange={row.set} />
                  </div>
                ))}
                <Textarea
                  value={fbComments}
                  onChange={(e) => setFbComments(e.target.value)}
                  placeholder="Additional comments (optional)..."
                  rows={2}
                />
                <p className="text-[11px] text-muted-foreground">
                  You can skip this now and rate later from the receipt's detail screen.
                </p>
              </div>
            )}
          </div>
        </div>


        {/* Fixed footer */}
        <div className="shrink-0 border-t bg-background p-3" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
          <div className="flex gap-3 max-w-[800px] mx-auto">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button className="flex-1 bg-foreground text-background hover:bg-foreground/90" onClick={handleSave} disabled={saving}>
              <Save className="h-4 w-4 mr-2" />{saving ? "Saving..." : "Save GRN"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
