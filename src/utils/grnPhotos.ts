import { supabase } from "@/integrations/supabase/client";
import { compressImage } from "@/utils/imageCompressor";

const BUCKET = "grn-photos";

// Cache signed URLs by storage path to avoid re-signing on every render
const signedUrlCache = new Map<string, { url: string; expires: number }>();

/**
 * Compress + upload a single image blob to the grn-photos bucket.
 * Returns the stored storage path.
 */
export async function uploadGrnPhoto(blob: Blob): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  let toUpload: Blob = blob;
  try {
    toUpload = await compressImage(blob, 1280, 0.7);
  } catch {
    /* fall back to original */
  }

  const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, toUpload, { contentType: "image/jpeg", upsert: false });
  if (error) throw error;
  return path;
}

/**
 * Resolve a stored photo path (or legacy full URL) to a usable signed URL.
 */
export async function resolveGrnPhotoUrl(pathOrUrl: string): Promise<string> {
  if (!pathOrUrl) return "";
  if (/^https?:\/\//i.test(pathOrUrl) && !pathOrUrl.includes("/object/sign/")) {
    return pathOrUrl;
  }
  let path = pathOrUrl;
  const m = pathOrUrl.match(/grn-photos\/(.+?)(\?|$)/);
  if (m) path = m[1];

  const cached = signedUrlCache.get(path);
  if (cached && cached.expires > Date.now()) return cached.url;

  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
  if (data?.signedUrl) {
    signedUrlCache.set(path, { url: data.signedUrl, expires: Date.now() + 50 * 60 * 1000 });
    return data.signedUrl;
  }
  return "";
}

/** Best-effort removal of a stored photo from the bucket. */
export async function removeGrnPhoto(pathOrUrl: string): Promise<void> {
  let path = pathOrUrl;
  const m = pathOrUrl.match(/grn-photos\/(.+?)(\?|$)/);
  if (m) path = m[1];
  try {
    await supabase.storage.from(BUCKET).remove([path]);
  } catch {
    /* ignore */
  }
}
