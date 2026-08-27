// QuickLocate service worker: web push + background location sync ONLY.
// This app is fully online — no offline support, no asset/shell caching.
// NOTE: registration is guarded in src/main.tsx (skipped in Lovable preview/dev).

self.addEventListener("install", () => {
  // Nothing to pre-cache. Don't skipWaiting automatically — wait for the
  // user to accept the update prompt so we don't hot-swap mid-session.
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Purge any caches left behind by earlier versions of this SW
      // (e.g. installs that still have the old offline runtime cache).
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// No fetch handler: every request goes straight to the network, uncached,
// with no offline fallback. This app requires connectivity by design.

// ---------- Web Push (unchanged behavior) ----------
self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (_) {
    payload = { title: "QuickLocate", body: event.data ? event.data.text() : "" };
  }

  const title = payload.title || "QuickLocate";
  const options = {
    body: payload.message || payload.body || "",
    icon: "/pwa-icon-192.png",
    badge: "/pwa-icon-192.png",
    tag: payload.tag || undefined,
    data: payload.data || { url: "/" },
    vibrate: [200, 100, 200],
    requireInteraction: false,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientsArr) => {
      for (const client of clientsArr) {
        if ("focus" in client) {
          client.navigate(targetUrl).catch(() => {});
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});

// ---------- Background Location Tracking ----------
// Capture location periodically even when app is closed via Background Sync API
self.addEventListener("sync", (event) => {
  if (event.tag === "sync-location") {
    event.waitUntil(captureLocationInBackground());
  }
});

async function captureLocationInBackground() {
  try {
    // Get auth token from IndexedDB (set by main app during foreground activity)
    const token = await getAuthTokenFromStorage();
    if (!token) {
      console.log("No auth token in background, skipping location capture");
      return;
    }

    // Get current position with geolocation API
    let position;
    try {
      position = await new Promise((resolve, reject) => {
        // Note: geolocation in background is limited on some browsers
        if ("geolocation" in navigator) {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0,
          });
        } else {
          reject(new Error("Geolocation not available"));
        }
      });
    } catch (geoError) {
      console.warn("Geolocation unavailable in background:", geoError.message);
      // Still need to retry or handle gracefully
      throw geoError;
    }

    const today = new Date().toISOString().split("T")[0];
    const locationData = {
      date: today,
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy,
      speed: position.coords.speed,
      timestamp: new Date().toISOString(),
    };

    // Call Supabase edge function to save location
    const supabaseUrl = self.location.origin; // Will be used to construct edge function URL
    const response = await fetch(`${supabaseUrl}/functions/v1/capture-gps-location`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(locationData),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to save location: ${response.statusText} - ${error}`);
    }

    console.log("Location captured in background");
  } catch (error) {
    console.error("Error capturing location in background:", error);
    throw error; // Retry by browser
  }
}

async function getAuthTokenFromStorage() {
  try {
    const db = await openIndexedDB();
    return new Promise((resolve) => {
      const tx = db.transaction(["auth"], "readonly");
      const store = tx.objectStore("auth");
      const req = store.get("token");
      req.onsuccess = () => resolve(req.result?.value);
      req.onerror = () => resolve(null);
    });
  } catch (error) {
    console.warn("Error reading auth from IndexedDB:", error);
    return null;
  }
}

function openIndexedDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("sbee-cables");
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains("auth")) {
        db.createObjectStore("auth", { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
