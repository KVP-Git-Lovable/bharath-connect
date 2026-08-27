import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Plus, Edit, Trash2, Save, Search, MapPin, X } from "lucide-react";

interface AddressRow {
  id: string;
  address_name: string;
  full_address: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  gst_number: string | null;
  contact_persons: string[];
  contact_phones: string[];
  is_active: boolean;
  source?: "manual" | "site";
}

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.06 } } };
const item = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } };

const emptyForm = {
  address_name: "",
  full_address: "",
  city: "",
  state: "",
  pincode: "",
  gst_number: "",
  contact_persons: [""] as string[],
  contact_phones: [""] as string[],
  is_active: true,
};

export default function AddressBook() {
  const [rows, setRows] = useState<AddressRow[]>([]);
  
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AddressRow | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ ...emptyForm });

  useEffect(() => { fetchRows(); }, []);

  const fetchRows = async () => {
    setIsLoading(true);
    const { data: addrs } = await supabase
      .from("master_addresses")
      .select("id, address_name, full_address, city, state, pincode, gst_number, contact_persons, contact_phones, is_active")
      .order("address_name");
    setRows(
      ((addrs || []) as any[]).map((r) => ({
        ...r,
        contact_persons: Array.isArray(r.contact_persons) ? r.contact_persons : [],
        contact_phones: Array.isArray(r.contact_phones) ? r.contact_phones : [],
        source: "manual" as const,
      }))
    );
    setIsLoading(false);
  };

  const openAdd = () => {
    setEditing(null);
    setFormData({ ...emptyForm, contact_persons: [""], contact_phones: [""] });
    setIsDialogOpen(true);
  };

  const openEdit = (r: AddressRow) => {
    setEditing(r);
    setFormData({
      address_name: r.address_name,
      full_address: r.full_address || "",
      city: r.city || "",
      state: r.state || "",
      pincode: r.pincode || "",
      gst_number: r.gst_number || "",
      contact_persons: r.contact_persons.length ? [...r.contact_persons] : [""],
      contact_phones: r.contact_phones.length ? [...r.contact_phones] : [""],
      is_active: r.is_active,
    });
    setIsDialogOpen(true);
  };

  const setListItem = (key: "contact_persons" | "contact_phones", idx: number, value: string) => {
    setFormData((p) => ({ ...p, [key]: p[key].map((v, i) => (i === idx ? value : v)) }));
  };
  const addListItem = (key: "contact_persons" | "contact_phones") => {
    setFormData((p) => ({ ...p, [key]: [...p[key], ""] }));
  };
  const removeListItem = (key: "contact_persons" | "contact_phones", idx: number) => {
    setFormData((p) => ({ ...p, [key]: p[key].filter((_, i) => i !== idx) }));
  };

  const handleSave = async () => {
    const name = formData.address_name.trim();
    if (!name) { toast.error("Address name is required"); return; }
    setIsSaving(true);
    try {
      const payload = {
        address_name: name,
        full_address: formData.full_address.trim() || null,
        city: formData.city.trim() || null,
        state: formData.state.trim() || null,
        pincode: formData.pincode.trim() || null,
        gst_number: formData.gst_number.trim() || null,
        contact_persons: formData.contact_persons.map((v) => v.trim()).filter(Boolean),
        contact_phones: formData.contact_phones.map((v) => v.trim()).filter(Boolean),
        is_active: formData.is_active,
      };
      if (editing) {
        const { error } = await supabase.from("master_addresses").update(payload).eq("id", editing.id);
        if (error) throw error;
        toast.success("Address updated");
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        const { error } = await supabase.from("master_addresses").insert({ ...payload, created_by: user?.id });
        if (error) throw error;
        toast.success("Address created");
      }
      setIsDialogOpen(false);
      fetchRows();
    } catch (err: any) {
      toast.error(err.message || "Failed to save address");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("master_addresses").delete().eq("id", id);
    if (error) toast.error(error.message || "Failed to delete");
    else { toast.success("Address deleted"); fetchRows(); }
    setDeleteConfirmId(null);
  };

  const toggleActive = async (r: AddressRow) => {
    const { error } = await supabase.from("master_addresses").update({ is_active: !r.is_active }).eq("id", r.id);
    if (!error) { toast.success(`Address ${r.is_active ? "disabled" : "enabled"}`); fetchRows(); }
    else toast.error(error.message || "Failed to update");
  };

  const filtered = rows.filter((r) => {
    const q = search.toLowerCase();
    return (
      r.address_name.toLowerCase().includes(q) ||
      (r.full_address || "").toLowerCase().includes(q) ||
      (r.city || "").toLowerCase().includes(q) ||
      (r.gst_number || "").toLowerCase().includes(q)
    );
  });

  const locationLine = (r: AddressRow) =>
    [r.city, r.state, r.pincode].filter(Boolean).join(", ") || "—";

  return (
    <motion.div className="p-4 space-y-6 max-w-6xl mx-auto" variants={container} initial="hidden" animate="show">
      <motion.div variants={item}>
        <h1 className="text-2xl font-bold">Address Book</h1>
        <p className="text-sm text-muted-foreground">Manage billing & delivery addresses used across purchase orders</p>
      </motion.div>

      <motion.div variants={item}>
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2"><MapPin className="h-5 w-5" />Addresses</CardTitle>
                <CardDescription>Billing & delivery addresses for purchase orders</CardDescription>
              </div>
              <Button onClick={openAdd}><Plus className="h-4 w-4 mr-2" />Add Address</Button>
            </div>
            <div className="relative mt-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search addresses..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9" />
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground"><MapPin className="h-12 w-12 mx-auto mb-4 opacity-50" /><p>No addresses found</p></div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>GST Number</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.address_name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[260px]">
                        <div className="truncate">{r.full_address || "—"}</div>
                        <div className="text-xs">{locationLine(r)}</div>
                      </TableCell>
                      <TableCell className="text-sm">{r.gst_number || "—"}</TableCell>
                      <TableCell className="text-center">
                        <Badge
                          className={r.is_active ? "bg-[hsl(var(--success))]/20 text-[hsl(var(--success))] cursor-pointer" : "bg-destructive/20 text-destructive cursor-pointer"}
                          onClick={() => toggleActive(r)}
                        >
                          {r.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Button variant="outline" size="sm" onClick={() => openEdit(r)}><Edit className="h-4 w-4" /></Button>
                          <Button variant="outline" size="sm" onClick={() => setDeleteConfirmId(r.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </motion.div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-lg w-[95vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Address" : "Add Address"}</DialogTitle>
            <DialogDescription>Configure the address details</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Address Name / Label *</Label>
              <Input value={formData.address_name} onChange={(e) => setFormData({ ...formData, address_name: e.target.value })} placeholder="e.g., Bharath Builders HQ" autoFocus />
            </div>
            <div>
              <Label>Full Address</Label>
              <Textarea value={formData.full_address} onChange={(e) => setFormData({ ...formData, full_address: e.target.value })} placeholder="Street, building, area..." className="min-h-[70px]" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>City</Label>
                <Input value={formData.city} onChange={(e) => setFormData({ ...formData, city: e.target.value })} />
              </div>
              <div>
                <Label>State</Label>
                <Input value={formData.state} onChange={(e) => setFormData({ ...formData, state: e.target.value })} />
              </div>
              <div>
                <Label>Pincode</Label>
                <Input value={formData.pincode} onChange={(e) => setFormData({ ...formData, pincode: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>GST Number</Label>
              <Input value={formData.gst_number} onChange={(e) => setFormData({ ...formData, gst_number: e.target.value })} placeholder="e.g., 29ABCDE1234F1Z5" />
            </div>

            <div className="space-y-2">
              <Label>Contact Persons</Label>
              {formData.contact_persons.map((v, i) => (
                <div key={i} className="flex gap-2">
                  <Input value={v} onChange={(e) => setListItem("contact_persons", i, e.target.value)} placeholder="Name" />
                  <Button variant="outline" size="icon" onClick={() => removeListItem("contact_persons", i)} disabled={formData.contact_persons.length === 1}><X className="h-4 w-4" /></Button>
                </div>
              ))}
              <Button variant="ghost" size="sm" onClick={() => addListItem("contact_persons")}><Plus className="h-4 w-4 mr-1" />Add contact person</Button>
            </div>

            <div className="space-y-2">
              <Label>Contact Phones</Label>
              {formData.contact_phones.map((v, i) => (
                <div key={i} className="flex gap-2">
                  <Input value={v} onChange={(e) => setListItem("contact_phones", i, e.target.value)} placeholder="Phone" inputMode="tel" />
                  <Button variant="outline" size="icon" onClick={() => removeListItem("contact_phones", i)} disabled={formData.contact_phones.length === 1}><X className="h-4 w-4" /></Button>
                </div>
              ))}
              <Button variant="ghost" size="sm" onClick={() => addListItem("contact_phones")}><Plus className="h-4 w-4 mr-1" />Add phone</Button>
            </div>

            <div className="flex items-center justify-between">
              <div><Label>Active</Label><p className="text-xs text-muted-foreground">Inactive addresses are hidden from selection</p></div>
              <Switch checked={formData.is_active} onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={isSaving}><Save className="h-4 w-4 mr-2" />{isSaving ? "Saving..." : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteConfirmId} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete address?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently remove the address. This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => deleteConfirmId && handleDelete(deleteConfirmId)}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>

  );
}
