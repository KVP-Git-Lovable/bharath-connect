import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./styles/mobile.css";
import { requestNativePermissions } from "./utils/nativePermissions";
import { checkAndBustCache, startVersionSync } from "./utils/cacheVersion";

// Recover from stale lazy-loaded chunks after a new deploy by reloading once.
const CHUNK_RELOAD_KEY = "chunk_reload_attempt";
function isChunkLoadError(msg: unknown): boolean {
  const s = typeof msg === "string" ? msg : (msg as Error)?.message || "";
  return /Failed to fetch dynamically imported module|Importing a module script failed|ChunkLoadError/i.test(s);
}
function handleChunkError(err: unknown) {
  if (!isChunkLoadError(err)) return;
  const last = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY) || "0");
  if (Date.now() - last < 10_000) return; // avoid reload loop
  sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()));
  console.warn("[App] Stale chunk detected, reloading…");
  window.location.reload();
}
window.addEventListener("error", (e) => handleChunkError(e.error || e.message));
window.addEventListener("unhandledrejection", (e) => handleChunkError(e.reason));

// Check for new build and bust cache if needed (triggers reload once)
const reloading = checkAndBustCache();

if (!reloading) {
  requestNativePermissions();

  // Register service worker for Web Push (iPhone PWA + desktop).
  // Skipped inside Lovable editor iframes / preview hosts to avoid stale-shell issues.
  if ("serviceWorker" in navigator) {
    const isInIframe = (() => {
      try { return window.self !== window.top; } catch { return true; }
    })();
    const host = window.location.hostname;
    const isPreviewHost =
      host.includes("lovableproject.com") || host.includes("id-preview--");
    if (!isInIframe && !isPreviewHost) {
      window.addEventListener("load", () => {
        navigator.serviceWorker
          .register("/sw.js", { scope: "/" })
          .then((registration) => {
            const notifyWaiting = (worker: ServiceWorker | null) => {
              if (!worker) return;
              window.dispatchEvent(new CustomEvent("sw-waiting", { detail: worker }));
            };
            if (registration.waiting && navigator.serviceWorker.controller) {
              notifyWaiting(registration.waiting);
            }
            registration.addEventListener("updatefound", () => {
              const installing = registration.installing;
              if (!installing) return;
              installing.addEventListener("statechange", () => {
                if (installing.state === "installed" && navigator.serviceWorker.controller) {
                  notifyWaiting(registration.waiting || installing);
                }
              });
            });
            // Periodic update check (every 30 min)
            setInterval(() => registration.update().catch(() => {}), 30 * 60 * 1000);
          })
          .catch((e) => console.warn("[SW] register failed:", e));
      });
    } else {
      navigator.serviceWorker.getRegistrations().then((regs) =>
        regs.forEach((r) => r.unregister().catch(() => {}))
      );
    }
  }


  createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );

  // Start periodic server-version sync (production only, non-blocking)
  startVersionSync();

  // NOTE: GPS tracking is NOT auto-started here. It is gated on attendance
  // check-in/check-out via useGPSTracker (mounted in AppLayout).
}
