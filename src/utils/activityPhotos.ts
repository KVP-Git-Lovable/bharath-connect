import { supabase } from "@/integrations/supabase/client";
import { compressImage } from "@/utils/imageCompressor";
import { getCurrentPosition } from "@/utils/nativePermissions";
import type { ActivityPhotoEntry } from "@/hooks/useActivities";

const BUCKET = "activity-photos";

// Cache signed URLs by storage path to avoid re-signing on every render
const signedUrlCache = new Map<string, { url: string; expires: number }>();

/**
 * Capture GPS + reverse-geocoded address for a photo. Never throws.
 */
async function captureGeo(): Promise<{ lat: number | null; lng: number | null; address: string | null }> {
  try {
    const pos = await getCurrentPosition();
    let address: string | null = null;
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${pos.latitude}&lon=${pos.longitude}&format=json`
      );
      const geo = await res.json();
      if (geo?.display_name) address = geo.display_name;
    } catch {
      /* ignore reverse geocode failure */
    }
    return { lat: pos.latitude, lng: pos.longitude, address };
  } catch {
    return { lat: null, lng: null, address: null };
  }
}

/**
 * Compress + upload a single image blob to the activity-photos bucket,
 * tagging it with the current GPS location and timestamp.
 * Returns the stored entry (url holds the storage path).
 */
export async function uploadActivityPhoto(blob: Blob): Promise<ActivityPhotoEntry> {
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

  const geo = await captureGeo();
  return {
    url: path,
    at: new Date().toISOString(),
    lat: geo.lat,
    lng: geo.lng,
    address: geo.address,
  };
}

/**
 * Upload any attachment (image from camera/gallery, or a document) with
 * a date/time stamp and the uploader's name.
 */
export async function uploadActivityFile(
  file: File | Blob,
  uploadedBy?: string | null
): Promise<ActivityPhotoEntry> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const name = (file as File).name || `capture-${Date.now()}.jpg`;
  const mime = file.type || "application/octet-stream";
  const isImage = mime.startsWith("image/");

  let toUpload: Blob = file;
  if (isImage) {
    try {
      toUpload = await compressImage(file, 1280, 0.7);
    } catch {
      /* fall back to original */
    }
  }

  const ext = isImage ? "jpg" : (name.includes(".") ? name.split(".").pop()!.toLowerCase() : "bin");
  const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, toUpload, { contentType: isImage ? "image/jpeg" : mime, upsert: false });
  if (error) throw error;

  const geo = isImage ? await captureGeo() : { lat: null, lng: null, address: null };
  return {
    url: path,
    at: new Date().toISOString(),
    lat: geo.lat,
    lng: geo.lng,
    address: geo.address,
    name,
    type: isImage ? "image" : "file",
    by: uploadedBy || null,
  };
}

/**
 * Resolve a stored photo path (or legacy full URL) to a usable signed URL.
 */
export async function resolveActivityPhotoUrl(pathOrUrl: string): Promise<string> {
  if (!pathOrUrl) return "";
  // Legacy/public full URLs - return as-is
  if (/^https?:\/\//i.test(pathOrUrl) && !pathOrUrl.includes("/object/sign/")) {
    return pathOrUrl;
  }
  // Extract path from a previously signed URL if needed
  let path = pathOrUrl;
  const m = pathOrUrl.match(/activity-photos\/(.+?)(\?|$)/);
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
