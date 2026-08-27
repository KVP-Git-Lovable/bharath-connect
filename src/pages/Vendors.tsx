import { useState, useMemo, useCallback, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useUserProfile } from "@/hooks/useUserProfile";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Plus, Search, Phone, Mail, Edit, Trash2, Filter, User, X,
} from "lucide-react";
import { StarRating, getVendorRatingFlag } from "@/components/procurement/VendorRating";

const CATEGORIES = [
  "Civil", "Electrical", "Plumbing", "Painting", "Carpentry",
  "Fabrication", "Transport", "Labour Supply", "Material Supply", "Other",
];

const STATUSES = ["active", "inactive", "blacklisted"] as const;
type VendorStatus = (typeof STATUSES)[number];

interface Vendor {
  id: string;
  name: string;
  phone: string[];
  contact_person: string[];
  email: string[];
  address: string | null;
  category: string | null;
  services: string | null;
  notes: string | null;
  status: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface VendorForm {
  name: string;
  phones: string[];
  contact_persons: string[];
  emails: string[];
  address: string;
  category: string;
  services: string;
  notes: string;
  status: VendorStatus;
}

const emptyForm: VendorForm = {
  name: "",
  phones: [""],
  contact_persons: [""],
  emails: [""],
  address: "",
  category: "",
  services: "",
  notes: "",
  status: "active",
};

function statusColor(status: string) {
  switch (status) {
    case "active": return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400";
    case "inactive": return "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400";
    case "blacklisted": return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
    default: return "";
  }
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Helper to parse JSONB array from DB (could be string[] or Json)
function toStringArray(val: any): string[] {
  if (Array.isArray(val)) return val.map(String).filter(Boolean);
  if (typeof val === "string") {
    try { const parsed = JSON.parse(val); if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean); } catch {}
    return val ? [val] : [];
  }
  return [];
}

/* ─── Multi-entry field component ─── */
function MultiEntryField({
  label, icon: Icon, entries, onChange, placeholder, type = "text", required = false,
}: {
  label: string; icon: any; entries: string[]; onChange: (entries: string[]) => void;
  placeholder: string; type?: string; required?: boolean;
}) {
  const update = (i: number, val: string) => {
    const next = [...entries];
    next[i] = val;
    onChange(next);
  };
  const add = () => onChange([...entries, ""]);
  const remove = (i: number) => {
    if (entries.length <= 1) { onChange([""]); return; }
    onChange(entries.filter((_, idx) => idx !== i));
  };

  return (
    <div>
      <Label className="text-xs flex items-center gap-1">
        <Icon className="h-3 w-3" /> {label} {required && "*"}
      </Label>
      <div className="space-y-1.5 mt-1">
        {entries.map((val, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <Input
              value={val}
              onChange={(e) => update(i, e.target.value)}
              placeholder={placeholder}
              type={type}
              className="h-9 flex-1"
            />
            <Button
              type="button" variant="ghost" size="icon"
              className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
              onClick={() => remove(i)}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
      </div>
      <Button type="button" variant="ghost" size="sm" className="mt-1 h-7 text-xs gap-1 text-primary" onClick={add}>
        <Plus className="h-3 w-3" /> Add {label}
      </Button>
    </div>
  );
}

export default function Vendors() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { profile, isAdmin } = useUserProfile();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);
  const [deleteVendor, setDeleteVendor] = useState<Vendor | null>(null);
  const [form, setForm] = useState<VendorForm>(emptyForm);

  const { data: vendors = [], isLoading } = useQuery({
    queryKey: ["vendors"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vendors")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []).map((v: any) => ({
        ...v,
        phone: toStringArray(v.phone),
        contact_person: toStringArray(v.contact_person),
        email: toStringArray(v.email),
      })) as Vendor[];
    },
  });

  const { data: feedback = [] } = useQuery({
    queryKey: ["vendor-feedback"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("procurement_vendor_feedback")
        .select("*, po:procurement_orders(po_number)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const ratingsByVendor = useMemo(() => {
    const map: Record<string, {
      avg: number;
      count: number;
      delivery: number;
      quality: number;
      quantity: number;
      overall: number;
      history: any[];
    }> = {};
    const grouped: Record<string, any[]> = {};
    for (const f of feedback as any[]) {
      (grouped[f.vendor_id] ||= []).push(f);
    }
    for (const [vid, list] of Object.entries(grouped)) {
      const n = list.length;
      const sum = (k: string) => list.reduce((a, f) => a + (f[k] || 0), 0);
      const delivery = sum("delivery_timeliness") / n;
      const quality = sum("material_quality") / n;
      const quantity = sum("quantity_accuracy") / n;
      const overall = sum("overall_experience") / n;
      const avg = (delivery + quality + quantity + overall) / 4;
      map[vid] = { avg, count: n, delivery, quality, quantity, overall, history: list };
    }
    return map;
  }, [feedback]);



  const filtered = useMemo(() => {
    let list = vendors;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (v) =>
          (v.name || "").toLowerCase().includes(q) ||
          v.phone.some((p) => (p || "").includes(q)) ||
          v.contact_person.some((c) => (c || "").toLowerCase().includes(q))
      );
    }
    if (filterCategory !== "all") list = list.filter((v) => v.category === filterCategory);
    if (filterStatus !== "all") list = list.filter((v) => v.status === filterStatus);
    return list;
  }, [vendors, search, filterCategory, filterStatus]);

  const upsertMutation = useMutation({
    mutationFn: async (payload: { form: VendorForm; id?: string }) => {
      const phones = payload.form.phones.map((p) => p.trim()).filter(Boolean);
      const contacts = payload.form.contact_persons.map((c) => c.trim()).filter(Boolean);
      const emails = payload.form.emails.map((e) => e.trim()).filter(Boolean);

      const row: any = {
        name: payload.form.name.trim(),
        phone: phones,
        contact_person: contacts,
        email: emails,
        address: payload.form.address.trim() || null,
        category: payload.form.category || null,
        services: payload.form.services.trim() || null,
        notes: payload.form.notes.trim() || null,
        status: payload.form.status,
      };
      if (payload.id) {
        const { error } = await supabase.from("vendors").update(row).eq("id", payload.id);
        if (error) throw error;
      } else {
        row.created_by = profile?.id;
        const { error } = await supabase.from("vendors").insert(row);
        if (error) throw error;
      }
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["vendors"] });
      toast({ title: vars.id ? "Vendor updated" : "Vendor added" });
      closeForm();
    },
    onError: (err: any) => {
      const msg = err?.message || "";
      if (msg.includes("already exists for another vendor") || msg.includes("duplicate")) {
        toast({ title: "Duplicate phone", description: msg, variant: "destructive" });
      } else {
        toast({ title: "Error", description: msg, variant: "destructive" });
      }
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("vendors").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vendors"] });
      toast({ title: "Vendor deleted" });
      setDeleteVendor(null);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err?.message, variant: "destructive" });
    },
  });

  const openAdd = useCallback(() => {
    setEditingVendor(null);
    setForm(emptyForm);
    setIsFormOpen(true);
  }, []);

  const openEdit = useCallback((v: Vendor) => {
    setEditingVendor(v);
    setForm({
      name: v.name,
      phones: v.phone.length > 0 ? [...v.phone] : [""],
      contact_persons: v.contact_person.length > 0 ? [...v.contact_person] : [""],
      emails: v.email.length > 0 ? [...v.email] : [""],
      address: v.address || "",
      category: v.category || "",
      services: v.services || "",
      notes: v.notes || "",
      status: (v.status as VendorStatus) || "active",
    });
    setIsFormOpen(true);
  }, []);

  const closeForm = useCallback(() => {
    setIsFormOpen(false);
    setEditingVendor(null);
    setForm(emptyForm);
  }, []);

  // Open edit form when navigated from the vendor detail page (?edit=<id>)
  useEffect(() => {
    const editId = searchParams.get("edit");
    if (editId && vendors.length > 0) {
      const v = vendors.find((x) => x.id === editId);
      if (v) openEdit(v);
      searchParams.delete("edit");
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, vendors, openEdit, setSearchParams]);


  const handleSubmit = () => {
    if (!form.name.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    const phones = form.phones.map((p) => p.trim()).filter(Boolean);
    if (phones.length === 0) {
      toast({ title: "At least one phone number is required", variant: "destructive" });
      return;
    }
    // Check for duplicate phones within form
    const uniquePhones = new Set(phones);
    if (uniquePhones.size !== phones.length) {
      toast({ title: "Duplicate phone numbers in form", variant: "destructive" });
      return;
    }
    // Validate emails
    const emails = form.emails.map((e) => e.trim()).filter(Boolean);
    for (const email of emails) {
      if (!isValidEmail(email)) {
        toast({ title: "Invalid email", description: `"${email}" is not a valid email address.`, variant: "destructive" });
        return;
      }
    }
    upsertMutation.mutate({ form, id: editingVendor?.id });
  };

  return (
    <motion.div className="space-y-4 p-4 pb-24" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Vendor Management</h1>
          <p className="text-xs text-muted-foreground">{vendors.length} vendors</p>
        </div>
        {isAdmin && (
          <Button size="sm" onClick={openAdd} className="gap-1.5">
            <Plus className="h-4 w-4" /> Add Vendor
          </Button>
        )}
      </div>

      {/* Search & Filters */}
      <div className="space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search name, phone, contact..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9" />
        </div>
        <div className="flex gap-2">
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="h-8 text-xs flex-1">
              <Filter className="h-3 w-3 mr-1" />
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {CATEGORIES.map((c) => (<SelectItem key={c} value={c}>{c}</SelectItem>))}
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="h-8 text-xs flex-1">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
              <SelectItem value="blacklisted">Blacklisted</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Vendor List */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground text-sm">
            {vendors.length === 0 ? "No vendors yet. Add your first vendor." : "No vendors match your search/filter."}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((v) => (
            <Card key={v.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate(`/vendors/${v.id}`)}>
              <CardContent className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h3 className="font-semibold text-sm truncate">{v.name}</h3>
                      <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${statusColor(v.status)}`}>{v.status}</Badge>
                      {(() => {
                        const r = ratingsByVendor[v.id];
                        const flag = getVendorRatingFlag(r ? r.avg : null);
                        return (
                          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${flag.className}`}>
                            {flag.emoji} {flag.label}{r ? ` ${r.avg.toFixed(1)}` : ""}
                          </Badge>
                        );
                      })()}
                    </div>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Phone className="h-3 w-3" /> {v.phone[0] || "—"}
                      {v.phone.length > 1 && <span className="text-[10px] text-primary">+{v.phone.length - 1} more</span>}
                    </p>
                    {v.contact_person.length > 0 && v.contact_person[0] && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                        <User className="h-3 w-3" /> {v.contact_person[0]}
                      </p>
                    )}
                  </div>
                  {v.category && <Badge variant="secondary" className="text-[10px] shrink-0">{v.category}</Badge>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={isFormOpen} onOpenChange={(open) => !open && closeForm()}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingVendor ? "Edit Vendor" : "Add Vendor"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-xs">Name *</Label>
              <Input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="Vendor name" />
            </div>

            <MultiEntryField
              label="Phone" icon={Phone} entries={form.phones} placeholder="Phone number"
              type="tel" required
              onChange={(phones) => setForm((p) => ({ ...p, phones }))}
            />

            <MultiEntryField
              label="Contact Person" icon={User} entries={form.contact_persons} placeholder="Contact person name"
              onChange={(contact_persons) => setForm((p) => ({ ...p, contact_persons }))}
            />

            <MultiEntryField
              label="Email" icon={Mail} entries={form.emails} placeholder="Email address"
              type="email"
              onChange={(emails) => setForm((p) => ({ ...p, emails }))}
            />

            <div>
              <Label className="text-xs">Address</Label>
              <Textarea value={form.address} onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))} placeholder="Address" rows={2} />
            </div>
            <div>
              <Label className="text-xs">Category</Label>
              <Select value={form.category} onValueChange={(val) => setForm((p) => ({ ...p, category: val }))}>
                <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (<SelectItem key={c} value={c}>{c}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Services</Label>
              <Input value={form.services} onChange={(e) => setForm((p) => ({ ...p, services: e.target.value }))} placeholder="Services offered" />
            </div>
            <div>
              <Label className="text-xs">Notes</Label>
              <Textarea value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} placeholder="Notes" rows={2} />
            </div>
            <div>
              <Label className="text-xs">Status</Label>
              <Select value={form.status} onValueChange={(val) => setForm((p) => ({ ...p, status: val as VendorStatus }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="blacklisted">Blacklisted</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeForm}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={upsertMutation.isPending}>
              {upsertMutation.isPending ? "Saving..." : editingVendor ? "Update" : "Add Vendor"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>



      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteVendor} onOpenChange={(open) => !open && setDeleteVendor(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Vendor</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{deleteVendor?.name}</strong>? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteVendor && deleteMutation.mutate(deleteVendor.id)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  );
}

