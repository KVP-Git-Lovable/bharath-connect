import { useState, useRef } from "react";
import { useTaskAttachments, useCreateTaskAttachment, useDeleteTaskAttachment } from "@/hooks/useProjects";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Paperclip, Trash2, Download, Plus, X, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props {
  taskId: string;
}

export function TaskAttachments({ taskId }: Props) {
  const { data: attachments = [] } = useTaskAttachments(taskId);
  const createAttachment = useCreateTaskAttachment();
  const deleteAttachment = useDeleteTaskAttachment();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPendingFile(file);
      setNote("");
    }
  };

  const handleUpload = async () => {
    if (!pendingFile) return;
    setUploading(true);
    try {
      // Sanitize filename to remove special characters that may cause storage issues
      const safeName = pendingFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const filePath = `${taskId}/${Date.now()}_${safeName}`;
      const { error: uploadError } = await supabase.storage
        .from("pm-attachments")
        .upload(filePath, pendingFile, {
          cacheControl: '3600',
          upsert: false,
        });
      if (uploadError) throw uploadError;

      await createAttachment.mutateAsync({
        task_id: taskId,
        file_name: pendingFile.name,
        file_url: filePath,
        file_size: pendingFile.size,
        file_type: pendingFile.type,
        note: note.trim() || null,
      });
      setPendingFile(null);
      setNote("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err: any) {
      console.error("Upload failed:", err);
      toast.error(err.message || "Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (fileUrl: string, fileName: string) => {
    const { data } = await supabase.storage.from("pm-attachments").createSignedUrl(fileUrl, 60);
    if (data?.signedUrl) {
      window.open(data.signedUrl, "_blank");
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Attachments</h3>
        <span className="text-xs text-muted-foreground">{attachments.length}</span>
      </div>

      {/* Existing attachments */}
      <div className="space-y-1.5">
        {attachments.map((att: any) => (
          <div key={att.id} className="flex items-start gap-2 p-2 rounded-md border bg-muted/20 group">
            <Paperclip className="w-3.5 h-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm truncate">{att.file_name}</p>
              {att.note && <p className="text-xs text-muted-foreground mt-0.5">{att.note}</p>}
              {att.file_size && (
                <p className="text-xs text-muted-foreground">{(att.file_size / 1024).toFixed(1)} KB</p>
              )}
            </div>
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button
                variant="ghost" size="icon" className="h-6 w-6"
                onClick={() => handleDownload(att.file_url, att.file_name)}
              >
                <Download className="w-3.5 h-3.5" />
              </Button>
              <Button
                variant="ghost" size="icon" className="h-6 w-6 text-destructive"
                onClick={() => deleteAttachment.mutate({ id: att.id, taskId, fileUrl: att.file_url })}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      {/* Pending file with note */}
      {pendingFile ? (
        <div className="p-2 border rounded-md space-y-2 bg-muted/10">
          <div className="flex items-center gap-2">
            <Paperclip className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-sm flex-1 truncate">{pendingFile.name}</span>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setPendingFile(null)}>
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>
          <Input
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="Add a note about this file..."
            className="h-8 text-sm"
          />
          <Button size="sm" onClick={handleUpload} disabled={uploading} className="w-full gap-2">
            {uploading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {uploading ? "Uploading..." : "Upload"}
          </Button>
        </div>
      ) : (
        <>
          <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileSelect} />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full text-left text-sm text-muted-foreground hover:text-foreground flex items-center gap-2 px-3 py-2 border border-dashed rounded-md transition-colors hover:bg-muted/20"
          >
            <Plus className="w-3.5 h-3.5" /> Add attachment...
          </button>
        </>
      )}
    </div>
  );
}
