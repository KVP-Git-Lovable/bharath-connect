import { supabase } from "@/integrations/supabase/client";

const BUCKET = "invoice-attachments";

/** Upload a single invoice document to the invoice-attachments bucket. Returns the storage path. */
export async function uploadInvoiceFile(file: File): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const ext = file.name.includes(".") ? file.name.split(".").pop() : "bin";
  const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
  if (error) throw error;
  return path;
}

/** Resolve a stored invoice file path to a signed URL. */
export async function resolveInvoiceFileUrl(path: string): Promise<string> {
  if (!path) return "";
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
  return data?.signedUrl || "";
}

/** Best-effort removal of a stored invoice file. */
export async function removeInvoiceFile(path: string): Promise<void> {
  try {
    await supabase.storage.from(BUCKET).remove([path]);
  } catch {
    /* ignore */
  }
}
