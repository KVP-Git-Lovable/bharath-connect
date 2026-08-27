import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Contact, useContacts, useCreateContact, useUpdateContact } from "@/hooks/useCustomers";

export function ContactForm({
  open, onOpenChange, contact, customerId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  contact?: Contact;
  customerId?: string;
}) {

  const create = useCreateContact();
  const update = useUpdateContact();
  const { data: contacts = [] } = useContacts(customerId);
  const [form, setForm] = useState({
    name: "", title: "", email: "", phone: "", reports_to_id: "",
  });

  useEffect(() => {
    if (contact) setForm({
      name: contact.name, title: contact.title ?? "", email: contact.email ?? "",
      phone: contact.phone ?? "", reports_to_id: contact.reports_to_id ?? "",
    });
    else setForm({ name: "", title: "", email: "", phone: "", reports_to_id: "" });
  }, [contact, open]);

  const submit = async () => {
    if (!form.name.trim()) return;
    const payload: any = {
      name: form.name.trim(),
      title: form.title || null,
      email: form.email || null,
      phone: form.phone || null,
      reports_to_id: form.reports_to_id || null,
      customer_id: customerId ?? contact?.customer_id ?? null,
    };
    if (contact) await update.mutateAsync({ id: contact.id, ...payload });
    else await create.mutateAsync(payload);
    onOpenChange(false);
  };


  const parentOptions = contacts.filter((c) => c.id !== contact?.id);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{contact ? "Edit Contact" : "Add Contact"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div><Label>Title</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          </div>
          <div>
            <Label>Reports To</Label>
            <Select value={form.reports_to_id || "none"} onValueChange={(v) => setForm({ ...form, reports_to_id: v === "none" ? "" : v })}>
              <SelectTrigger><SelectValue placeholder="Top-level" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Top-level (no manager)</SelectItem>
                {parentOptions.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}{c.title ? ` — ${c.title}` : ""}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!form.name.trim()}>{contact ? "Save" : "Add"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
