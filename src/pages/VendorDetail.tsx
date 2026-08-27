import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useUserProfile } from "@/hooks/useUserProfile";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  ArrowLeft, Phone, Mail, MapPin, Edit, Trash2, Filter, User, Briefcase, StickyNote,
} from "lucide-react";
import { StarRating, getVendorRatingFlag } from "@/components/procurement/VendorRating";

function toStringArray(val: any): string[] {
  if (Array.isArray(val)) return val.map(String).filter(Boolean);
  if (typeof val === "string") {
    try { const parsed = JSON.parse(val); if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean); } catch {}
    return val ? [val] : [];
  }
  return [];
}

function statusColor(status: string) {
  switch (status) {
    case "active": return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400";
    case "inactive": return "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400";
    case "blacklisted": return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
    default: return "";
  }
}

function DetailRow({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0 mt-0.5">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div>
        <p className="text-[11px] text-muted-foreground">{label}</p>
        <p className="text-sm">{value}</p>
      </div>
    </div>
  );
}

export default function VendorDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isAdmin } = useUserProfile();

  const { data: vendor, isLoading } = useQuery({
    queryKey: ["vendor", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from("vendors").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        ...data,
        phone: toStringArray((data as any).phone),
        contact_person: toStringArray((data as any).contact_person),
        email: toStringArray((data as any).email),
      } as any;
    },
  });

  const { data: feedback = [] } = useQuery({
    queryKey: ["vendor-feedback", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("procurement_vendor_feedback")
        .select("*, po:procurement_orders(po_number)")
        .eq("vendor_id", id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const rating = useMemo(() => {
    const list = feedback as any[];
    if (list.length === 0) return null;
    const n = list.length;
    const sum = (k: string) => list.reduce((a, f) => a + (f[k] || 0), 0);
    const delivery = sum("delivery_timeliness") / n;
    const quality = sum("material_quality") / n;
    const quantity = sum("quantity_accuracy") / n;
    const overall = sum("overall_experience") / n;
    const avg = (delivery + quality + quantity + overall) / 4;
    return { avg, count: n, delivery, quality, quantity, overall, history: list };
  }, [feedback]);

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("vendors").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vendors"] });
      toast({ title: "Vendor deleted" });
      navigate("/vendors");
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err?.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!vendor) {
    return (
      <div className="p-4 space-y-4">
        <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => navigate("/vendors")}>
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <Card><CardContent className="py-12 text-center text-muted-foreground text-sm">Vendor not found.</CardContent></Card>
      </div>
    );
  }

  const flag = getVendorRatingFlag(rating ? rating.avg : null);

  return (
    <motion.div className="space-y-4 p-4 pb-24 max-w-2xl mx-auto" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      {/* Back */}
      <Button variant="ghost" size="sm" className="gap-1.5 -ml-2" onClick={() => navigate("/vendors")}>
        <ArrowLeft className="h-4 w-4" /> Back to Vendor Management
      </Button>

      {/* Title */}
      <div className="flex items-center gap-2 flex-wrap">
        <h1 className="text-xl font-bold">{vendor.name}</h1>
        <Badge variant="outline" className={`text-xs ${statusColor(vendor.status)}`}>{vendor.status}</Badge>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2">
        {vendor.phone[0] && (
          <a href={`tel:${vendor.phone[0]}`} className="flex-1">
            <Button variant="outline" className="w-full gap-2 text-emerald-600">
              <Phone className="h-4 w-4" /> Call
            </Button>
          </a>
        )}
        {vendor.email[0] && (
          <a href={`mailto:${vendor.email[0]}`} className="flex-1">
            <Button variant="outline" className="w-full gap-2 text-blue-600">
              <Mail className="h-4 w-4" /> Email
            </Button>
          </a>
        )}
      </div>

      {/* Details */}
      <div className="space-y-3">
        {vendor.phone.length > 0 && (
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0 mt-0.5">
              <Phone className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground">Phone</p>
              {vendor.phone.map((p: string, i: number) => (
                <a key={i} href={`tel:${p}`} className="text-sm block text-primary hover:underline">{p}</a>
              ))}
            </div>
          </div>
        )}

        {vendor.contact_person.filter(Boolean).length > 0 && (
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0 mt-0.5">
              <User className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground">Contact Person</p>
              {vendor.contact_person.filter(Boolean).map((c: string, i: number) => (
                <p key={i} className="text-sm">{c}</p>
              ))}
            </div>
          </div>
        )}

        {vendor.email.filter(Boolean).length > 0 && (
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0 mt-0.5">
              <Mail className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground">Email</p>
              {vendor.email.filter(Boolean).map((e: string, i: number) => (
                <a key={i} href={`mailto:${e}`} className="text-sm block text-primary hover:underline">{e}</a>
              ))}
            </div>
          </div>
        )}

        {vendor.address && <DetailRow icon={MapPin} label="Address" value={vendor.address} />}
        {vendor.category && <DetailRow icon={Filter} label="Category" value={vendor.category} />}
        {vendor.services && <DetailRow icon={Briefcase} label="Services" value={vendor.services} />}
        {vendor.notes && <DetailRow icon={StickyNote} label="Notes" value={vendor.notes} />}
      </div>

      {/* Ratings */}
      <div className="space-y-3 pt-4 border-t">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">Vendor Rating</p>
          <Badge variant="outline" className={`text-[10px] ${flag.className}`}>{flag.emoji} {flag.label}</Badge>
        </div>
        {rating ? (
          <>
            <div className="flex items-center gap-2">
              <StarRating value={Math.round(rating.avg)} readOnly size={18} />
              <span className="text-sm font-medium">{rating.avg.toFixed(1)}</span>
              <span className="text-[11px] text-muted-foreground">({rating.count} review{rating.count > 1 ? "s" : ""})</span>
            </div>
            <div className="space-y-1.5">
              {[
                { label: "Delivery Timeliness", v: rating.delivery },
                { label: "Material Quality", v: rating.quality },
                { label: "Quantity Accuracy", v: rating.quantity },
                { label: "Overall Experience", v: rating.overall },
              ].map((c) => (
                <div key={c.label} className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{c.label}</span>
                  <div className="flex items-center gap-1.5">
                    <StarRating value={Math.round(c.v)} readOnly size={14} />
                    <span className="text-xs w-7 text-right">{c.v.toFixed(1)}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="space-y-2">
              <p className="text-xs font-medium">Feedback History</p>
              {rating.history.map((f: any) => {
                const fb = (f.delivery_timeliness + f.material_quality + f.quantity_accuracy + f.overall_experience) / 4;
                return (
                  <div key={f.id} className="rounded-lg border p-2 text-xs space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{f.po?.po_number || "—"}</span>
                      <span className="text-muted-foreground">{new Date(f.created_at).toLocaleDateString()}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <StarRating value={Math.round(fb)} readOnly size={12} />
                      <span>{fb.toFixed(1)}</span>
                    </div>
                    {f.comments && <p className="text-muted-foreground">{f.comments}</p>}
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">No ratings yet.</p>
        )}
      </div>

      {isAdmin && (
        <div className="flex gap-2 pt-4 border-t">
          <Button
            variant="outline" size="sm" className="flex-1 gap-1.5"
            onClick={() => navigate(`/vendors?edit=${vendor.id}`)}
          >
            <Edit className="h-3.5 w-3.5" /> Edit
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm" className="flex-1 gap-1.5">
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Vendor</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to delete <strong>{vendor.name}</strong>? This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={() => deleteMutation.mutate()}
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </motion.div>
  );
}
