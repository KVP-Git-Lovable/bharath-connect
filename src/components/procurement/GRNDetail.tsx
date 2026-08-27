import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Truck, Download, X, Pencil, Camera, ImageIcon, Save, Star } from "lucide-react";
import { grnStatusColor } from "@/lib/procurement";
import { resolveGrnPhotoUrl, uploadGrnPhoto, removeGrnPhoto } from "@/utils/grnPhotos";
import { StarRating } from "./VendorRating";

const MAX_PHOTOS = 20;

interface GrnItemRow {
  id: string;
  product_id: string | null;
  ordered_qty: number;
  received_qty: number;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  grn: {
    id: string;
    grn_number: string | null;
    receipt_date: string;
    status: string;
    received_by: string | null;
    remarks: string | null;
    po_id: string;
    photos?: string[] | null;
    po?: { po_number: string | null; vendor_id: string | null; site_id?: string | null } | null;
  } | null;
  vendorName: string;
  onSaved?: () => void;
}

export default function GRNDetail({ open, onOpenChange, grn, vendorName, onSaved }: Props) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [items, setItems] = useState<GrnItemRow[]>([]);
  const [products, setProducts] = useState<Record<string, string>>({});
  const [uoms, setUoms] = useState<Record<string, string>>({});
  const [siteName, setSiteName] = useState<string>("—");
  const [loading, setLoading] = useState(false);
  // photoPaths stays in sync with stored paths; photoUrls are resolved signed URLs
  const [photoPaths, setPhotoPaths] = useState<string[]>([]);
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [viewerIdx, setViewerIdx] = useState<number | null>(null);

  // edit mode
  const [editing, setEditing] = useState(false);
  const [editRemarks, setEditRemarks] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  // vendor feedback
  const [fbDelivery, setFbDelivery] = useState(0);
  const [fbQuality, setFbQuality] = useState(0);
  const [fbQuantity, setFbQuantity] = useState(0);
  const [fbOverall, setFbOverall] = useState(0);
  const [fbComments, setFbComments] = useState("");
  const [fbExistingId, setFbExistingId] = useState<string | null>(null);
  const [fbSaving, setFbSaving] = useState(false);

  useEffect(() => {
    if (!open || !grn) return;
    let active = true;
    setEditing(false);
    setEditRemarks(grn.remarks || "");
    (async () => {
      setLoading(true);
      const [gi, pr, items, site] = await Promise.all([
        supabase
          .from("procurement_grn_items")
          .select("id, product_id, ordered_qty, received_qty")
          .eq("grn_id", grn.id),
        supabase.from("master_products").select("id, product_name"),
        supabase.from("procurement_items").select("product_id, uom").eq("procurement_id", grn.po_id),
        grn.po?.site_id
          ? supabase.from("project_sites").select("site_name").eq("id", grn.po.site_id).maybeSingle()
          : Promise.resolve({ data: null } as any),
      ]);
      if (!active) return;
      setItems((gi.data || []) as GrnItemRow[]);
      const pmap: Record<string, string> = {};
      (pr.data || []).forEach((p: any) => { pmap[p.id] = p.product_name; });
      setProducts(pmap);
      const umap: Record<string, string> = {};
      (items.data || []).forEach((i: any) => { if (i.product_id) umap[i.product_id] = i.uom; });
      setUoms(umap);
      setSiteName((site.data as any)?.site_name || "—");
      setLoading(false);

      const paths = (grn.photos || []) as string[];
      setPhotoPaths(paths);
      if (paths.length) {
        const urls = await Promise.all(paths.map((p) => resolveGrnPhotoUrl(p)));
        if (active) setPhotoUrls(urls);
      } else {
        setPhotoUrls([]);
      }

      // load existing feedback
      const { data: fb } = await supabase
        .from("procurement_vendor_feedback")
        .select("*")
        .eq("grn_id", grn.id)
        .maybeSingle();
      if (active) {
        if (fb) {
          setFbExistingId(fb.id);
          setFbDelivery(fb.delivery_timeliness);
          setFbQuality(fb.material_quality);
          setFbQuantity(fb.quantity_accuracy);
          setFbOverall(fb.overall_experience);
          setFbComments(fb.comments || "");
        } else {
          setFbExistingId(null);
          setFbDelivery(0);
          setFbQuality(0);
          setFbQuantity(0);
          setFbOverall(0);
          setFbComments("");
        }
      }
    })();
    return () => { active = false; };
  }, [open, grn]);

  const downloadPhoto = async (url: string, idx: number) => {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objUrl;
      a.download = `${grn?.grn_number || "grn"}-photo-${idx + 1}.jpg`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objUrl);
    } catch {
      window.open(url, "_blank");
    }
  };

  const handleAddPhotos = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const remaining = MAX_PHOTOS - photoPaths.length;
    if (remaining <= 0) {
      toast.error(`Maximum ${MAX_PHOTOS} photos allowed`);
      return;
    }
    const list = Array.from(files).slice(0, remaining);
    setUploading(true);
    try {
      for (const file of list) {
        const path = await uploadGrnPhoto(file);
        const url = await resolveGrnPhotoUrl(path);
        setPhotoPaths((p) => [...p, path]);
        setPhotoUrls((u) => [...u, url]);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to upload photo");
    } finally {
      setUploading(false);
      if (cameraInputRef.current) cameraInputRef.current.value = "";
      if (galleryInputRef.current) galleryInputRef.current.value = "";
    }
  };

  const handleRemovePhoto = async (idx: number) => {
    const path = photoPaths[idx];
    setPhotoPaths((p) => p.filter((_, i) => i !== idx));
    setPhotoUrls((u) => u.filter((_, i) => i !== idx));
    if (path) await removeGrnPhoto(path);
  };

  const handleSaveEdit = async () => {
    if (!grn) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("procurement_grns")
        .update({ remarks: editRemarks.trim() || null, photos: photoPaths })
        .eq("id", grn.id);
      if (error) throw error;
      toast.success("Goods Receipt updated");
      setEditing(false);
      onSaved?.();
    } catch (err: any) {
      toast.error(err.message || "Failed to update GRN");
    } finally {
      setSaving(false);
    }
  };

  const handleSubmitFeedback = async () => {
    if (!grn) return;
    if (!grn.po?.vendor_id) {
      toast.error("No vendor linked to this receipt");
      return;
    }
    if (!fbDelivery || !fbQuality || !fbQuantity || !fbOverall) {
      toast.error("Please rate all four categories");
      return;
    }
    setFbSaving(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const payload = {
        grn_id: grn.id,
        vendor_id: grn.po.vendor_id,
        po_id: grn.po_id,
        delivery_timeliness: fbDelivery,
        material_quality: fbQuality,
        quantity_accuracy: fbQuantity,
        overall_experience: fbOverall,
        comments: fbComments.trim() || null,
        created_by: auth.user?.id ?? null,
      };
      const { error } = await supabase
        .from("procurement_vendor_feedback")
        .upsert(payload, { onConflict: "grn_id" });
      if (error) throw error;
      toast.success("Feedback submitted");
      queryClient.invalidateQueries({ queryKey: ["vendor-feedback"] });
      setFbExistingId((prev) => prev || "saved");
    } catch (err: any) {
      toast.error(err.message || "Failed to submit feedback");
    } finally {
      setFbSaving(false);
    }
  };



  if (!grn) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-none w-screen h-screen sm:rounded-none p-0 gap-0 flex flex-col [&>button]:hidden">
        <DialogHeader className="px-4 py-3 border-b shrink-0">
          <div className="flex items-center justify-between gap-3">
            <DialogTitle className="flex items-center gap-2">
              <Truck className="h-4 w-4" />{grn.grn_number || "Goods Receipt"}
              <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${grnStatusColor(grn.status)}`}>{grn.status}</Badge>
            </DialogTitle>
            <div className="flex items-center gap-2">
              {!editing ? (
                <Button variant="outline" size="sm" className="h-8" onClick={() => setEditing(true)}>
                  <Pencil className="h-3.5 w-3.5 mr-1.5" />Edit
                </Button>
              ) : (
                <>
                  <Button variant="ghost" size="sm" className="h-8" onClick={() => { setEditing(false); setEditRemarks(grn.remarks || ""); }}>
                    Cancel
                  </Button>
                  <Button size="sm" className="h-8" onClick={handleSaveEdit} disabled={saving}>
                    <Save className="h-3.5 w-3.5 mr-1.5" />{saving ? "Saving..." : "Save"}
                  </Button>
                </>
              )}
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onOpenChange(false)} aria-label="Close">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 p-4 overflow-y-auto flex-1 max-w-3xl w-full mx-auto">
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-lg border p-3 bg-muted/30 text-sm">
            <div>
              <div className="text-[10px] text-muted-foreground">PO Number</div>
              {grn.po?.po_number ? (
                <button
                  type="button"
                  className="text-primary font-medium underline underline-offset-2 hover:opacity-80"
                  onClick={() => { onOpenChange(false); navigate(`/procurement?po=${grn.po_id}`); }}
                >
                  {grn.po.po_number}
                </button>
              ) : "—"}
            </div>
            <div><div className="text-[10px] text-muted-foreground">Receipt Date</div>{grn.receipt_date}</div>
            <div><div className="text-[10px] text-muted-foreground">Vendor</div>{vendorName || "—"}</div>
            <div><div className="text-[10px] text-muted-foreground">Site</div>{siteName}</div>
            <div><div className="text-[10px] text-muted-foreground">Received By</div>{grn.received_by || "—"}</div>
            <div><div className="text-[10px] text-muted-foreground">Status</div>{grn.status}</div>
          </div>

          <div>
            <div className="text-sm font-semibold mb-2">Items — Ordered vs Received</div>
            {loading ? (
              <div className="flex justify-center py-8"><div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
            ) : items.length === 0 ? (
              <div className="text-sm text-muted-foreground py-4 text-center">No line items recorded.</div>
            ) : (
              <div className="space-y-2">
                {items.map((it) => {
                  const uom = it.product_id ? uoms[it.product_id] : "";
                  const bal = Math.max(0, it.ordered_qty - it.received_qty);
                  const short = bal > 0;
                  return (
                    <div key={it.id} className="rounded-lg border p-2.5">
                      <div className="text-sm font-medium mb-1.5">{it.product_id ? (products[it.product_id] || "—") : "—"}</div>
                      <div className="grid grid-cols-3 gap-2 text-sm">
                        <div><div className="text-[10px] text-muted-foreground">Ordered ({uom || "—"})</div>{it.ordered_qty}</div>
                        <div><div className="text-[10px] text-muted-foreground">Received</div>{it.received_qty}</div>
                        <div>
                          <div className="text-[10px] text-muted-foreground">Balance</div>
                          <span className={short ? "text-amber-600 font-medium" : ""}>{bal}</span>
                        </div>
                      </div>
                      {short && (
                        <p className="text-[11px] text-amber-600 mt-1.5">⚠️ {bal} {uom || "units"} still pending delivery</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div>
            <Label className="text-[10px] text-muted-foreground">Remarks</Label>
            {editing ? (
              <Textarea
                value={editRemarks}
                onChange={(e) => setEditRemarks(e.target.value)}
                placeholder="Notes about this receipt..."
                rows={2}
                className="mt-1"
              />
            ) : (
              <p className="text-sm">{grn.remarks || "—"}</p>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-semibold">Goods Photos — Proof of Delivery</div>
            </div>
            {editing && (
              <>
                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => handleAddPhotos(e.target.files)}
                />
                <input
                  ref={galleryInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => handleAddPhotos(e.target.files)}
                />
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={uploading || photoPaths.length >= MAX_PHOTOS}
                    onClick={() => cameraInputRef.current?.click()}
                  >
                    <Camera className="h-4 w-4 mr-2" />{uploading ? "Uploading..." : "Take Photo"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={uploading || photoPaths.length >= MAX_PHOTOS}
                    onClick={() => galleryInputRef.current?.click()}
                  >
                    <ImageIcon className="h-4 w-4 mr-2" />Upload from Gallery
                  </Button>
                </div>
              </>
            )}
            {photoUrls.length > 0 ? (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {photoUrls.map((url, idx) => (
                  <div key={idx} className="relative aspect-square rounded-lg overflow-hidden border">
                    <button
                      type="button"
                      onClick={() => setViewerIdx(idx)}
                      className="block w-full h-full"
                    >
                      <img src={url} alt={`Goods photo ${idx + 1}`} className="w-full h-full object-cover" />
                    </button>
                    {editing && (
                      <button
                        type="button"
                        onClick={() => handleRemovePhoto(idx)}
                        className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-0.5"
                        aria-label="Remove photo"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No photos.</p>
            )}
          </div>

          {/* Vendor Feedback */}
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
            <Button onClick={handleSubmitFeedback} disabled={fbSaving} className="w-full">
              {fbSaving ? "Submitting..." : fbExistingId ? "Update Feedback" : "Submit Feedback"}
            </Button>
          </div>
        </div>

        {/* Full-screen photo viewer */}
        {viewerIdx !== null && photoUrls[viewerIdx] && (
          <div className="fixed inset-0 z-50 bg-black/90 flex flex-col">
            <div className="flex items-center justify-end gap-2 p-3" style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => downloadPhoto(photoUrls[viewerIdx], viewerIdx)}
              >
                <Download className="h-4 w-4 mr-1.5" />Download
              </Button>
              <Button variant="secondary" size="icon" className="h-9 w-9" onClick={() => setViewerIdx(null)} aria-label="Close">
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex-1 flex items-center justify-center p-4 overflow-hidden">
              <img src={photoUrls[viewerIdx]} alt={`Goods photo ${viewerIdx + 1}`} className="max-w-full max-h-full object-contain" />
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
