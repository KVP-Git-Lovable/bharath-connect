import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Browser } from '@capacitor/browser';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

/**
 * Upload blob to temp-downloads storage bucket and return a public HTTPS URL.
 * This is the reliable method for Android WebView where blob URLs don't work.
 */
async function uploadToStorageAndOpen(blob: Blob, filename: string): Promise<boolean> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.warn('No authenticated user for storage upload');
      return false;
    }

    // Create a unique path: userId/timestamp-filename
    const timestamp = Date.now();
    const storagePath = `${user.id}/${timestamp}-${filename}`;

    // Upload the blob to temp-downloads bucket
    const { error: uploadError } = await supabase.storage
      .from('temp-downloads')
      .upload(storagePath, blob, {
        contentType: blob.type || 'application/octet-stream',
        upsert: true,
      });

    if (uploadError) {
      console.error('Storage upload error:', uploadError);
      return false;
    }

    // Get a short-lived signed URL (bucket is private)
    const { data: urlData, error: signError } = await supabase.storage
      .from('temp-downloads')
      .createSignedUrl(storagePath, 300, {
        download: filename, // Forces Content-Disposition: attachment
      });

    if (signError || !urlData?.signedUrl) {
      console.error('Failed to create signed URL', signError);
      return false;
    }

    // Open the HTTPS URL in system browser — triggers real download on Android
    await Browser.open({ url: urlData.signedUrl });

    toast.success(`Downloaded: ${filename}`);

    // Clean up old temp files asynchronously (don't await)
    cleanupOldTempFiles(user.id).catch(() => {});

    return true;
  } catch (err) {
    console.error('Upload to storage failed:', err);
    return false;
  }
}

/**
 * Clean up temp download files older than 1 hour
 */
async function cleanupOldTempFiles(userId: string) {
  try {
    const { data: files } = await supabase.storage
      .from('temp-downloads')
      .list(userId, { limit: 50 });

    if (!files || files.length === 0) return;

    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    const toDelete: string[] = [];

    for (const file of files) {
      // Extract timestamp from filename: timestamp-originalname
      const match = file.name.match(/^(\d+)-/);
      if (match) {
        const fileTimestamp = parseInt(match[1], 10);
        if (fileTimestamp < oneHourAgo) {
          toDelete.push(`${userId}/${file.name}`);
        }
      }
    }

    if (toDelete.length > 0) {
      await supabase.storage.from('temp-downloads').remove(toDelete);
    }
  } catch {
    // Silently ignore cleanup errors
  }
}

/**
 * Universal file download that works in both web browsers and Android APK WebView.
 * On native (Android): uploads to storage and opens HTTPS URL (blob URLs don't work in WebView).
 * On web: uses the standard blob/anchor download approach.
 */
export async function downloadFile(blob: Blob, filename: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    // Primary method: upload to storage and open HTTPS URL
    const success = await uploadToStorageAndOpen(blob, filename);
    if (success) return;

    // Fallback 1: try Capacitor Filesystem
    try {
      const base64 = await blobToBase64(blob);
      try {
        await Filesystem.requestPermissions();
      } catch { /* Android 11+ may not need this */ }

      const result = await Filesystem.writeFile({
        path: filename,
        data: base64,
        directory: Directory.Documents,
        recursive: true,
      });

      console.log('File saved to:', result.uri);
      toast.success(`Downloaded: ${filename}`);
      return;
    } catch (fsErr) {
      console.error('Filesystem fallback error:', fsErr);
    }

    // Fallback 2: try Cache directory
    try {
      const base64 = await blobToBase64(blob);
      await Filesystem.writeFile({
        path: filename,
        data: base64,
        directory: Directory.Cache,
        recursive: true,
      });
      toast.success(`Downloaded: ${filename}`);
      return;
    } catch (cacheErr) {
      console.error('Cache fallback error:', cacheErr);
    }

    // Fallback 3: web download (unlikely to work in WebView but try)
    try {
      webDownload(blob, filename);
    } catch {
      toast.error('Download failed. Please try again.');
    }
  } else {
    webDownload(blob, filename);
  }
}

function webDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Helper to download XLSX workbook on both web and native.
 */
export async function downloadXLSX(wb: any, filename: string): Promise<void> {
  const XLSX = await import('xlsx');
  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  await downloadFile(blob, filename);
}

/**
 * Helper to download jsPDF document on both web and native.
 */
export async function downloadPDF(doc: any, filename: string): Promise<void> {
  try {
    const blob = doc.output('blob');
    await downloadFile(blob, filename);
  } catch (err: any) {
    console.error('downloadPDF error:', err);
    try {
      doc.save(filename);
    } catch (saveErr) {
      console.error('doc.save fallback also failed:', saveErr);
      throw err;
    }
  }
}

/**
 * Helper to download CSV data on both web and native.
 */
export async function downloadCSVNative(data: Record<string, any>[], filename: string): Promise<void> {
  if (!data.length) return;
  const headers = Object.keys(data[0]);
  const csvRows = [
    headers.join(','),
    ...data.map(row =>
      headers.map(h => {
        const val = row[h] ?? '';
        const str = String(val).replace(/"/g, '""');
        return `"${str}"`;
      }).join(',')
    ),
  ];
  const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
  await downloadFile(blob, filename);
}

/**
 * Download raw CSV string on both web and native.
 */
export async function downloadCSVString(csvContent: string, filename: string): Promise<void> {
  const blob = new Blob([csvContent], { type: 'text/csv' });
  await downloadFile(blob, filename);
}
