declare const __APP_BUILD_ID__: string;

const BUILD_KEY = "app_build_id";
const RELOAD_GUARD = "app_reload_guard";
const CHECK_INTERVAL = 90_000;

let intervalId: ReturnType<typeof setInterval> | null = null;

function getCurrentBuildId(): string {
  return typeof __APP_BUILD_ID__ !== "undefined" ? __APP_BUILD_ID__ : "";
}

function isDevMode(): boolean {
  try {
    return import.meta.env.DEV === true;
  } catch {
    return false;
  }
}

async function fetchServerBuildId(): Promise<string | null> {
  try {
    const resp = await fetch(`/build-meta.json?t=${Date.now()}`, {
      cache: "no-store",
      headers: { "Cache-Control": "no-cache, no-store, must-revalidate", Pragma: "no-cache" },
    });
    if (!resp.ok) return null;
    const text = await resp.text();
    try {
      const data = JSON.parse(text);
      const id = data?.buildId ?? null;
      if (id === "dev") return null; // ignore dev placeholder
      return id;
    } catch {
      console.warn("[App] build-meta.json parse error");
      return null;
    }
  } catch {
    return null;
  }
}

function purgeAllCaches(): void {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.getRegistrations().then((regs) => {
      regs.forEach((r) => r.unregister());
    });
  }

  if ("caches" in window) {
    caches.keys().then((keys) => {
      keys.forEach((k) => caches.delete(k));
    });
  }

  // Remove app-specific localStorage caches
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && (key.startsWith("dashboard_") || key.startsWith("REACT_QUERY"))) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach((k) => localStorage.removeItem(k));
}

function forceReload(targetBuild: string, reason: string): void {
  console.info(`[App] ${reason} — purging caches and hard-reloading…`);

  // Set guard BEFORE purge so if we reload into same stale bundle it won't loop
  localStorage.setItem(RELOAD_GUARD, targetBuild);

  purgeAllCaches();

  // Use URL token to bust any intermediate HTTP cache layer
  const url = new URL(window.location.href);
  url.searchParams.set("__v", targetBuild);
  window.location.replace(url.toString());
}

/**
 * Startup check: compares compiled build ID vs localStorage.
 * Returns true if a reload was triggered (caller should stop rendering).
 */
export function checkAndBustCache(): boolean {
  const currentBuild = getCurrentBuildId();
  if (!currentBuild) return false;

  // Clean up __v token from URL if present (we already loaded with it)
  const url = new URL(window.location.href);
  if (url.searchParams.has("__v")) {
    url.searchParams.delete("__v");
    history.replaceState(null, "", url.toString());
  }

  console.info(`[App] Build: ${currentBuild}`);

  const lastBuild = localStorage.getItem(BUILD_KEY);
  const guard = localStorage.getItem(RELOAD_GUARD);

  // If guard matches current build, we just completed a forced reload — accept this build
  if (guard === currentBuild) {
    localStorage.setItem(BUILD_KEY, currentBuild);
    localStorage.removeItem(RELOAD_GUARD);
    console.info("[App] Post-reload convergence confirmed");
    return false;
  }

  // If we already know this build, nothing to do
  if (lastBuild === currentBuild) {
    return false;
  }

  // First-ever launch on this device: there's no prior build to be stale
  // against, so just adopt the current build silently — no reload needed.
  if (lastBuild === null) {
    localStorage.setItem(BUILD_KEY, currentBuild);
    return false;
  }

  // New build detected at startup (this device HAS run an older build
  // before) — but DON'T immediately trust it. If there's no guard yet,
  // trigger a reload to force fresh assets.
  if (!guard) {
    forceReload(currentBuild, "New build detected at startup");
    return true;
  }

  // Guard is set but doesn't match current build — we're in a reload loop guard.
  // Accept current build to break the loop.
  console.warn("[App] Guard mismatch — accepting current build to break loop");
  localStorage.setItem(BUILD_KEY, currentBuild);
  localStorage.removeItem(RELOAD_GUARD);
  return false;
}

/**
 * Async check: fetches server build-meta.json and compares against
 * the currently running build. If server has a newer build, purge & reload.
 */
async function syncWithServer(): Promise<void> {
  const currentBuild = getCurrentBuildId();
  if (!currentBuild) return;

  const serverBuild = await fetchServerBuildId();
  if (!serverBuild) return; // network error, file missing, or dev placeholder

  if (serverBuild === currentBuild) {
    // Confirmed in sync — stamp as trusted
    localStorage.setItem(BUILD_KEY, currentBuild);
    localStorage.removeItem(RELOAD_GUARD);
    console.debug(`[App] Build in sync: ${currentBuild}`);
    return;
  }

  // Server has a different build than what's running
  const guard = localStorage.getItem(RELOAD_GUARD);

  // If we already tried reloading for this server build, don't loop
  if (guard === serverBuild) {
    console.warn(`[App] Already attempted reload for ${serverBuild}, accepting current`);
    localStorage.setItem(BUILD_KEY, currentBuild);
    localStorage.removeItem(RELOAD_GUARD);
    return;
  }

  forceReload(serverBuild, `Server build ${serverBuild} differs from running ${currentBuild}`);
}

/**
 * Start periodic + visibility-based server version checks.
 * Only runs in production. Call once after initial render.
 */
export function startVersionSync(): void {
  if (isDevMode()) {
    console.debug("[App] Dev mode — skipping version sync");
    return;
  }

  // Initial async server check (non-blocking)
  void syncWithServer();

  // Periodic check
  if (!intervalId) {
    intervalId = setInterval(() => void syncWithServer(), CHECK_INTERVAL);
  }

  // Check when tab becomes visible again
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      void syncWithServer();
    }
  });
}
