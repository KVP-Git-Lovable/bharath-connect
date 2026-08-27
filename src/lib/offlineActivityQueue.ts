// IndexedDB-backed queue for offline activity creation.
// Each item carries a client-generated UUID used as an idempotency key
// on the server (activity_events.client_uuid unique index).

const DB_NAME = "jovo_offline_v1";
const DB_VERSION = 1;
const STORE = "activity_queue";

export interface QueuedActivity {
  client_uuid: string;
  payload: Record<string, any>;
  target_user_id?: string | null;
  audio?: {
    blob: Blob;
    mimeType: string;
    fileExtension: string;
  } | null;
  created_at: number;
  attempts: number;
  status: "pending" | "syncing" | "failed";
  error?: string | null;
  optimistic_user_id: string;
}

type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribeQueue(l: Listener) {
  listeners.add(l);
  return () => listeners.delete(l);
}
function emit() {
  listeners.forEach((l) => { try { l(); } catch { /* ignore */ } });
}

let dbPromise: Promise<IDBDatabase> | null = null;
function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("IndexedDB unavailable"));
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "client_uuid" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | Promise<T>): Promise<T> {
  const db = await openDB();
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const store = t.objectStore(STORE);
    let result: any;
    Promise.resolve(fn(store)).then((r: any) => {
      if (r && typeof r === "object" && "onsuccess" in r) {
        (r as IDBRequest).onsuccess = () => { result = (r as IDBRequest).result; };
        (r as IDBRequest).onerror = () => reject((r as IDBRequest).error);
      } else {
        result = r;
      }
    });
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export async function enqueueActivity(item: QueuedActivity): Promise<void> {
  await tx("readwrite", (s) => s.put(item));
  emit();
}

export async function listQueue(): Promise<QueuedActivity[]> {
  const items = await tx<QueuedActivity[]>("readonly", (s) => s.getAll() as IDBRequest<QueuedActivity[]>);
  return (items || []).sort((a, b) => a.created_at - b.created_at);
}

export async function removeFromQueue(client_uuid: string): Promise<void> {
  await tx("readwrite", (s) => s.delete(client_uuid));
  emit();
}

export async function updateQueueItem(client_uuid: string, patch: Partial<QueuedActivity>): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction(STORE, "readwrite");
    const s = t.objectStore(STORE);
    const g = s.get(client_uuid);
    g.onsuccess = () => {
      const cur = g.result as QueuedActivity | undefined;
      if (!cur) return resolve();
      s.put({ ...cur, ...patch });
    };
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
  emit();
}

export function generateClientUUID(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  // Fallback
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ---- Reference data cache (dropdowns available offline) ----
const REF_PREFIX = "offline_ref_v1:";
export function cacheReference<T>(key: string, data: T) {
  try { localStorage.setItem(REF_PREFIX + key, JSON.stringify({ at: Date.now(), data })); } catch { /* ignore */ }
}
export function readReference<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(REF_PREFIX + key);
    if (!raw) return null;
    return JSON.parse(raw).data as T;
  } catch { return null; }
}
