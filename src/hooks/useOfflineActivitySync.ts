import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  listQueue,
  removeFromQueue,
  updateQueueItem,
  subscribeQueue,
  type QueuedActivity,
} from "@/lib/offlineActivityQueue";

interface SyncState {
  online: boolean;
  queue: QueuedActivity[];
  syncing: boolean;
  progress: { current: number; total: number } | null;
}

const stateListeners = new Set<() => void>();
let currentState: SyncState = {
  online: typeof navigator !== "undefined" ? navigator.onLine : true,
  queue: [],
  syncing: false,
  progress: null,
};
let flushInFlight = false;

function setState(patch: Partial<SyncState>) {
  currentState = { ...currentState, ...patch };
  stateListeners.forEach((l) => { try { l(); } catch { /* ignore */ } });
}

async function refreshQueue() {
  const q = await listQueue();
  setState({ queue: q });
}

export async function flushActivityQueue(force = false): Promise<void> {
  if (flushInFlight && !force) return;
  if (typeof navigator !== "undefined" && !navigator.onLine) return;
  flushInFlight = true;
  try {
    const queue = await listQueue();
    const pending = queue.filter((i) => i.status !== "syncing");
    if (pending.length === 0) return;
    setState({ syncing: true, progress: { current: 0, total: pending.length } });

    for (let i = 0; i < pending.length; i++) {
      const item = pending[i];
      setState({ progress: { current: i + 1, total: pending.length } });
      await updateQueueItem(item.client_uuid, { status: "syncing", error: null });
      try {
        // Upload audio if present
        const payload = { ...item.payload };
        if (item.audio) {
          const fileName = `${item.optimistic_user_id}/${item.created_at}.${item.audio.fileExtension}`;
          const { error: upErr } = await supabase.storage
            .from("activity-audio")
            .upload(fileName, item.audio.blob, { contentType: item.audio.mimeType });
          if (upErr && !`${upErr.message}`.toLowerCase().includes("exists")) throw upErr;
          const { data: urlData } = supabase.storage.from("activity-audio").getPublicUrl(fileName);
          payload.attachment_urls = [...(payload.attachment_urls || []), urlData.publicUrl];
        }

        // Idempotent insert via upsert on client_uuid.
        const insertRow: any = {
          user_id: item.target_user_id || item.optimistic_user_id,
          client_uuid: item.client_uuid,
          ...payload,
        };

        const { error } = await supabase
          .from("activity_events")
          .upsert(insertRow, { onConflict: "client_uuid", ignoreDuplicates: false });

        if (error) throw error;

        await removeFromQueue(item.client_uuid);
      } catch (err: any) {
        const message = err?.message || "Sync failed";
        await updateQueueItem(item.client_uuid, {
          status: "failed",
          error: message,
          attempts: (item.attempts || 0) + 1,
        });
        // Continue with next item; don't abort the batch on validation errors.
      }
    }
  } finally {
    flushInFlight = false;
    setState({ syncing: false, progress: null });
    await refreshQueue();
    // Signal listeners (e.g. useActivities) to refetch server data.
    try { window.dispatchEvent(new CustomEvent("activities:synced")); } catch { /* ignore */ }
  }
}

// Boot: watch online status + subscribe to queue changes.
if (typeof window !== "undefined") {
  const onOnline = () => {
    setState({ online: true });
    flushActivityQueue().catch(() => {});
  };
  const onOffline = () => setState({ online: false });
  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOffline);
  subscribeQueue(() => { refreshQueue(); });
  // Initial load
  refreshQueue();
  // Try initial flush if online
  if (navigator.onLine) flushActivityQueue().catch(() => {});
}

export function useOfflineActivitySync(): SyncState & { retry: () => Promise<void> } {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    stateListeners.add(l);
    return () => { stateListeners.delete(l); };
  }, []);

  const retry = useCallback(async () => {
    // Reset failed → pending, then flush.
    const q = await listQueue();
    await Promise.all(q.filter((i) => i.status === "failed").map((i) =>
      updateQueueItem(i.client_uuid, { status: "pending", error: null })
    ));
    await flushActivityQueue(true);
  }, []);

  return { ...currentState, retry };
}
