import { useRef, useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, Share2, Trash2, Upload, FileText, LayoutGrid, List, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

export const LEAD_DOC_TYPES = [
  "Estimation sheet",
  "Document shared by customer",
  "Quote",
  "Purchase order",
  "Other documents",
];

interface DocRow {
  id: string;
  file_name: string;
  file_url: string;
  file_size: number | null;
  file_type: string | null;
  doc_type: string | null;
  uploaded_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  owner_name?: string;
  modified_name?: string;
}

function useLeadDocuments(leadId?: string) {
  return useQuery({
    queryKey: ["lead-documents", leadId],
    enabled: !!leadId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customer_documents")
        .select("*")
        .eq("lead_id", leadId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const rows = (data ?? []) as any as DocRow[];
      const ids = Array.from(
        new Set(rows.flatMap((r) => [r.uploaded_by, r.updated_by]).filter(Boolean) as string[])
      );
      let names: Record<string, string> = {};
      if (ids.length) {
        const { data: usrs } = await supabase.from("users").select("id, full_name, username, email").in("id", ids);
        names = Object.fromEntries((usrs ?? []).map((u: any) => [u.id, u.full_name || u.username || u.email || ""]));
      }
      return rows.map((r) => ({
        ...r,
        owner_name: r.uploaded_by ? names[r.uploaded_by] || "Unknown" : "—",
        modified_name: r.updated_by ? names[r.updated_by] || "Unknown" : r.uploaded_by ? names[r.uploaded_by] || "Unknown" : "—",
      }));
    },
  });
}

async function logAudit(leadId: string, action: string, value: string) {
  const { data: auth } = await supabase.auth.getUser();
  await supabase.from("lead_audit_log" as any).insert({
    lead_id: leadId,
    actor_id: auth.user?.id ?? null,
    action,
    to_value: value,
  } as any);
}

export function LeadAttachments({ leadId }: { leadId: string }) {
  const qc = useQueryClient();
  const { data: docs = [], isLoading } = useLeadDocuments(leadId);
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [docType, setDocType] = useState<string>(LEAD_DOC_TYPES[0]);
  const [uploading, setUploading] = useState(false);
  const [view, setView] = useState<"list" | "grid">("list");
  const [filter, setFilter] = useState<string>("all");

  const filtered = useMemo(
    () => (filter === "all" ? docs : docs.filter((d) => d.doc_type === filter)),
    [docs, filter]
  );

  const upload = async () => {
    if (!files.length) return;
    setUploading(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id ?? null;
      for (const file of files) {
        const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `leads/${leadId}/${Date.now()}_${safe}`;
        const { error: upErr } = await supabase.storage.from("customer-documents").upload(path, file);
        if (upErr) throw upErr;
        const { error } = await supabase.from("customer_documents").insert({
          lead_id: leadId,
          file_name: file.name,
          file_url: path,
          file_size: file.size,
          file_type: file.type,
          doc_type: docType,
          uploaded_by: uid,
          updated_by: uid,
        } as any);
        if (error) throw error;
      }
      await logAudit(leadId, "document_uploaded", `${files.length} file(s) · ${docType}`);
      qc.invalidateQueries({ queryKey: ["lead-documents", leadId] });
      qc.invalidateQueries({ queryKey: ["lead-audit", leadId] });
      toast.success("Attachment(s) uploaded");
      setFiles([]);
      if (inputRef.current) inputRef.current.value = "";
    } catch (e: any) {
      toast.error(e.message ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const signedUrl = async (path: string) => {
    const { data, error } = await supabase.storage.from("customer-documents").createSignedUrl(path, 300);
    if (error || !data?.signedUrl) throw error ?? new Error("Could not create link");
    return data.signedUrl;
  };

  const download = async (d: DocRow) => {
    try {
      const url = await signedUrl(d.file_url);
      window.open(url, "_blank");
      await logAudit(leadId, "document_downloaded", d.file_name);
      qc.invalidateQueries({ queryKey: ["lead-audit", leadId] });
    } catch (e: any) {
      toast.error(e.message ?? "Download failed");
    }
  };

  const share = async (d: DocRow) => {
    try {
      const url = await signedUrl(d.file_url);
      if (navigator.share) {
        await navigator.share({ title: d.file_name, url });
      } else {
        await navigator.clipboard.writeText(url);
        toast.success("Link copied to clipboard");
      }
      await logAudit(leadId, "document_shared", d.file_name);
      qc.invalidateQueries({ queryKey: ["lead-audit", leadId] });
    } catch (e: any) {
      if (e?.name !== "AbortError") toast.error(e.message ?? "Share failed");
    }
  };

  const remove = useMutation({
    mutationFn: async (d: DocRow) => {
      await supabase.storage.from("customer-documents").remove([d.file_url]);
      const { error } = await supabase.from("customer_documents").delete().eq("id", d.id);
      if (error) throw error;
      await logAudit(leadId, "document_deleted", d.file_name);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lead-documents", leadId] });
      qc.invalidateQueries({ queryKey: ["lead-audit", leadId] });
      toast.success("Attachment deleted");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const meta = (d: DocRow) => (
    <>
      <div className="text-xs text-muted-foreground">
        {format(new Date(d.created_at), "dd MMM yyyy, HH:mm")}
        {d.file_size ? ` · ${(d.file_size / 1024).toFixed(1)} KB` : ""}
      </div>
      <div className="text-xs text-muted-foreground">
        Owner: {d.owner_name} · Last modified by: {d.modified_name}
      </div>
    </>
  );

  const actions = (d: DocRow) => (
    <div className="flex gap-1">
      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => download(d)} title="Download">
        <Download className="h-4 w-4" />
      </Button>
      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => share(d)} title="Share">
        <Share2 className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost" size="icon" className="h-8 w-8 text-destructive"
        onClick={() => remove.mutate(d)} title="Delete"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
        <CardTitle className="text-base">Attachments</CardTitle>
        <div className="flex items-center gap-2">
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="h-8 w-[200px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All document types</SelectItem>
              {LEAD_DOC_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setView(view === "list" ? "grid" : "list")}>
            {view === "list" ? <LayoutGrid className="h-4 w-4" /> : <List className="h-4 w-4" />}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Uploader */}
        <div className="rounded-md border border-dashed p-3 space-y-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <Select value={docType} onValueChange={setDocType}>
              <SelectTrigger className="sm:w-[260px]"><SelectValue placeholder="Document type" /></SelectTrigger>
              <SelectContent>
                {LEAD_DOC_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
            <input
              ref={inputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
            />
            <Button variant="outline" onClick={() => inputRef.current?.click()}>
              <Upload className="h-4 w-4 mr-2" />Choose files
            </Button>
            <Button onClick={upload} disabled={!files.length || uploading}>
              {uploading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {uploading ? "Uploading…" : `Upload${files.length ? ` (${files.length})` : ""}`}
            </Button>
          </div>
          {files.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {files.map((f, i) => (
                <Badge key={i} variant="secondary" className="gap-1">
                  {f.name}
                  <button onClick={() => setFiles(files.filter((_, x) => x !== i))}><X className="h-3 w-3" /></button>
                </Badge>
              ))}
            </div>
          )}
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">No attachments yet</p>
        ) : view === "list" ? (
          <div className="space-y-2">
            {filtered.map((d) => (
              <div key={d.id} className="flex items-start gap-3 p-3 rounded-md border">
                <FileText className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium truncate">{d.file_name}</span>
                    {d.doc_type && <Badge variant="outline" className="text-[10px]">{d.doc_type}</Badge>}
                  </div>
                  {meta(d)}
                </div>
                {actions(d)}
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {filtered.map((d) => (
              <div key={d.id} className="rounded-md border p-3 space-y-2">
                <div className="h-20 rounded bg-muted flex items-center justify-center">
                  <FileText className="h-8 w-8 text-muted-foreground" />
                </div>
                <div className="text-sm font-medium truncate">{d.file_name}</div>
                {d.doc_type && <Badge variant="outline" className="text-[10px]">{d.doc_type}</Badge>}
                {meta(d)}
                {actions(d)}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
