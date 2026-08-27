import { supabase } from "@/integrations/supabase/client";

/**
 * Buckets that are private and therefore need short-lived signed URLs.
 * Legacy rows may still hold full public URLs — we extract the object path
 * from those and re-sign them on demand.
 */
const cache = new Map<string, { url: string; expires: number }>();

function extractPath(bucket: string, pathOrUrl: string): string {
  const marker = `/${bucket}/`;
  const idx = pathOrUrl.indexOf(marker);
  if (idx === -1) return pathOrUrl.split("?")[0];
  return pathOrUrl.slice(idx + marker.length).split("?")[0];
}

/**
 * Resolve a stored value (object path or legacy public URL) into a signed URL.
 * Never throws — returns "" when the file cannot be signed.
 */
export async function resolveSignedUrl(
  bucket: string,
  pathOrUrl: string | null | undefined,
  expiresIn = 3600
): Promise<string> {
  if (!pathOrUrl) return "";
  const path = decodeURIComponent(extractPath(bucket, pathOrUrl));
  const key = `${bucket}:${path}`;
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.url;
  try {
    const { data } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn);
    if (data?.signedUrl) {
      cache.set(key, { url: data.signedUrl, expires: Date.now() + (expiresIn - 300) * 1000 });
      return data.signedUrl;
    }
  } catch {
    /* ignore */
  }
  return "";
}

export const resolveEmployeePhotoUrl = (v?: string | null) => resolveSignedUrl("employee-photos", v);
export const resolveActivityAudioUrl = (v?: string | null) => resolveSignedUrl("activity-audio", v);
