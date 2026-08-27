import { lazy, type ComponentType } from "react";

const RELOAD_KEY = "lazy_chunk_reload_at";

function isChunkError(err: unknown) {
  const msg = (err as Error)?.message || String(err);
  return /Failed to fetch dynamically imported module|Importing a module script failed|ChunkLoadError/i.test(msg);
}

/**
 * React.lazy with recovery for stale chunk hashes after a new deploy:
 * retries once (cache-busted), then reloads the page once.
 */
export function lazyWithRetry<T extends ComponentType<unknown>>(
  factory: () => Promise<{ default: T }>,
) {
  return lazy(async () => {
    try {
      return await factory();
    } catch (err) {
      if (!isChunkError(err)) throw err;
      try {
        return await factory();
      } catch (err2) {
        const last = Number(sessionStorage.getItem(RELOAD_KEY) || "0");
        if (Date.now() - last > 10_000) {
          sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
          try {
            const keys = await caches.keys();
            await Promise.all(keys.map((k) => caches.delete(k)));
          } catch { /* ignore */ }
          window.location.reload();
          // Keep the promise pending while the page reloads
          return await new Promise<{ default: T }>(() => {});
        }
        throw err2;
      }
    }
  });
}
