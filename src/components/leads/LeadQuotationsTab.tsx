import { useEffect, useState } from "react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Plus, Pencil, Trash2, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useLeadQuotations, type LeadQuotation } from "@/hooks/useLeadQuotations";
import { useLeadStatuses } from "@/hooks/useLeadsEvents";

const fmtDate = (d: string | null) => (d ? format(new Date(`${d}T00:00:00`), "dd MMM yyyy") : "—");
const fmtMoney = (n: number | null) => (n != null ? `₹${Number(n).toLocaleString("en-IN")}` : "—");

const emptyForm = {
  enquiry_number: "", enquiry_received_date: "", quotation_number: "", quotation_date: "",
  value_without_gst: "", followed_by_user_id: "", status_id: "",
  po_date: "", po_number: "", po_amount: "", remarks: "",
};

export default function LeadQuotationsTab({ leadId }: { leadId: string }) {
  const { quotations, loading, upsert, remove } = useLeadQuotations(leadId);
  const { data: statuses = [] } = useLeadStatuses(false);
  const [users, setUsers] = useState<{ id: string; full_name: string }[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<LeadQuotation | null>(null);
  const [f, setF] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.from("users").select("id, full_name").order("full_name").then(({ data }) => setUsers((data || []) as any));
  }, []);

  const openNew = () => { setEditing(null); setF(emptyForm); setDialogOpen(true); };
  const openEdit = (q: LeadQuotation) => {
    setEditing(q);
    setF({
      enquiry_number: q.enquiry_number || "", enquiry_received_date: q.enquiry_received_date || "",
      quotation_number: q.quotation_number || "", quotation_date: q.quotation_date || "",
      value_without_gst: q.value_without_gst != null ? String(q.value_without_gst) : "",
      followed_by_user_id: q.followed_by_user_id || "", status_id: q.status_id || "",
      po_date: q.po_date || "", po_number: q.po_number || "", po_amount: q.po_amount != null ? String(q.po_amount) : "",
      remarks: q.remarks || "",
    });
    setDialogOpen(true);
  };

  const save = async () => {
    setSaving(true);
    const ok = await upsert({
      id: editing?.id,
      enquiry_number: f.enquiry_number.trim() || null,
      enquiry_received_date: f.enquiry_received_date || null,
      quotation_number: f.quotation_number.trim() || null,
      quotation_date: f.quotation_date || null,
      value_without_gst: f.value_without_gst === "" ? null : Number(f.value_without_gst),
      followed_by_user_id: f.followed_by_user_id || null,
      followed_by_name: f.followed_by_user_id ? (users.find((u) => u.id === f.followed_by_user_id)?.full_name ?? null) : null,
      status_id: f.status_id || null,
      status_name: f.status_id ? ((statuses as any[]).find((s) => s.id === f.status_id)?.name ?? null) : null,
      po_date: f.po_date || null,
      po_number: f.po_number.trim() || null,
      po_amount: f.po_amount === "" ? null : Number(f.po_amount),
      remarks: f.remarks.trim() || null,
    });
    setSaving(false);
    if (ok) setDialogOpen(false);
  };

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={openNew}><Plus className="h-4 w-4 mr-1" />New Quotation</Button>
      </div>

      {quotations.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">
          <FileText className="h-6 w-6 mx-auto mb-2 opacity-50" />No quotations recorded yet.
        </CardContent></Card>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Qtn No</TableHead>
                <TableHead className="text-xs">Qtn Date</TableHead>
                <TableHead className="text-xs">Enq Rcd Dt</TableHead>
                <TableHead className="text-xs">Value w/o GST</TableHead>
                <TableHead className="text-xs">Followed By</TableHead>
                <TableHead className="text-xs">Status</TableHead>
                <TableHead className="text-xs">PO No</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {quotations.map((q) => (
                <TableRow key={q.id}>
                  <TableCell className="text-sm font-medium">{q.quotation_number || "—"}</TableCell>
                  <TableCell className="text-sm">{fmtDate(q.quotation_date)}</TableCell>
                  <TableCell className="text-sm">{fmtDate(q.enquiry_received_date)}</TableCell>
                  <TableCell className="text-sm">{fmtMoney(q.value_without_gst)}</TableCell>
                  <TableCell className="text-sm">{q.followed_by_name || "—"}</TableCell>
                  <TableCell className="text-sm">{q.status_name || "—"}</TableCell>
                  <TableCell className="text-sm">{q.po_number || "—"}</TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(q)}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => remove(q.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Edit Quotation" : "New Quotation"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">Enq No</Label><Input value={f.enquiry_number} onChange={(e) => setF({ ...f, enquiry_number: e.target.value })} /></div>
            <div><Label className="text-xs">Enq Rcd Dt</Label><Input type="date" value={f.enquiry_received_date} onChange={(e) => setF({ ...f, enquiry_received_date: e.target.value })} /></div>
            <div><Label className="text-xs">Qtn No</Label><Input value={f.quotation_number} onChange={(e) => setF({ ...f, quotation_number: e.target.value })} /></div>
            <div><Label className="text-xs">Qtn Date</Label><Input type="date" value={f.quotation_date} onChange={(e) => setF({ ...f, quotation_date: e.target.value })} /></div>
            <div className="col-span-2"><Label className="text-xs">Value without GST (₹)</Label><Input inputMode="decimal" value={f.value_without_gst} onChange={(e) => setF({ ...f, value_without_gst: e.target.value.replace(/[^0-9.]/g, "") })} /></div>
            <div>
              <Label className="text-xs">Followed By</Label>
              <Select value={f.followed_by_user_id || "none"} onValueChange={(v) => setF({ ...f, followed_by_user_id: v === "none" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Status</Label>
              <Select value={f.status_id || "none"} onValueChange={(v) => setF({ ...f, status_id: v === "none" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {(statuses as any[]).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs">PO Dtd</Label><Input type="date" value={f.po_date} onChange={(e) => setF({ ...f, po_date: e.target.value })} /></div>
            <div><Label className="text-xs">PO No</Label><Input value={f.po_number} onChange={(e) => setF({ ...f, po_number: e.target.value })} /></div>
            <div className="col-span-2"><Label className="text-xs">PO Amount (₹)</Label><Input inputMode="decimal" value={f.po_amount} onChange={(e) => setF({ ...f, po_amount: e.target.value.replace(/[^0-9.]/g, "") })} /></div>
            <div className="col-span-2"><Label className="text-xs">Remarks</Label><Textarea rows={2} value={f.remarks} onChange={(e) => setF({ ...f, remarks: e.target.value })} /></div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
