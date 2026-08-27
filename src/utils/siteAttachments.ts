import { supabase } from "@/integrations/supabase/client";

const BUCKET = "site-attachments";

export async function uploadSiteAttachment(file: File): Promise<string> {
  const ext = file.name.split(".").pop() || "bin";
  const path = `${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
  });
  if (error) throw error;
  // store as "path|originalName"
  return `${path}|${file.name}`;
}

export function attachmentName(stored: string): string {
  const [, name] = stored.split("|");
  return name || stored.split("/").pop() || stored;
}

export function attachmentPath(stored: string): string {
  return stored.split("|")[0];
}

export async function getSiteAttachmentUrl(stored: string): Promise<string | null> {
  const path = attachmentPath(stored);
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
  if (error) return null;
  return data.signedUrl;
}

export async function removeSiteAttachment(stored: string): Promise<void> {
  const path = attachmentPath(stored);
  await supabase.storage.from(BUCKET).remove([path]);
}
