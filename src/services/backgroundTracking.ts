import { supabase } from "@/integrations/supabase/client";

interface LocationData {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  speed: number | null;
  timestamp: string;
}

const SUPABASE_FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL
  ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`
  : "/.netlify/functions";

/**
 * @deprecated Legacy auto-start tracker. GPS capture is now owned exclusively
 * by `useGPSTracker` (gated on attendance check-in/check-out). This function
 * is intentionally a no-op so stale callers cannot start untracked intervals.
 */
export async function startBackgroundTracking(): Promise<void> {
  console.warn(
    "[BackgroundTracking] startBackgroundTracking() is deprecated and disabled. " +
    "GPS tracking starts on attendance check-in via useGPSTracker."
  );
}

/**
 * Store auth token in IndexedDB for service worker access
 */
async function storeAuthForServiceWorker(token: string): Promise<void> {
  try {
    const db = await openIndexedDB();
    const tx = db.transaction(["auth"], "readwrite");
    const store = tx.objectStore("auth");
    store.put({ key: "token", value: token });
  } catch (error) {
    console.error("Error storing auth for service worker:", error);
  }
}

/**
 * Capture location every 1 minute (when app is open)
 */
function startForegroundTracking(): void {
  // Capture immediately
  captureLocation().catch(console.error);

  // Then every 60 seconds
  setInterval(() => {
    captureLocation().catch(console.error);
  }, 60000); // 60 seconds
}

/**
 * Capture current location and save to database
 */
export async function captureLocation(): Promise<LocationData | null> {
  try {
    // Get current user
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    // Store auth for service worker if we have session
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session) {
      await storeAuthForServiceWorker(session.access_token);
    }


    // Get current position with high accuracy
    const position = await new Promise<GeolocationPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      });
    });

    const locationData: LocationData = {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy,
      speed: position.coords.speed,
      timestamp: new Date().toISOString(),
    };

    // Save to database
    await saveLocationToDatabase(user.id, locationData);
    console.log("Location captured:", {
      lat: locationData.latitude.toFixed(6),
      lng: locationData.longitude.toFixed(6),
      accuracy: locationData.accuracy?.toFixed(0) + "m",
    });

    return locationData;
  } catch (error) {
    console.error("Error capturing location:", error);
    return null;
  }
}

/**
 * Save location to gps_tracking table
 */
async function saveLocationToDatabase(userId: string, location: LocationData): Promise<void> {
  const today = new Date().toISOString().split("T")[0];

  try {
    await supabase.from("gps_tracking").insert({
      user_id: userId,
      date: today,
      latitude: location.latitude,
      longitude: location.longitude,
      accuracy: location.accuracy,
      speed: location.speed,
      timestamp: location.timestamp,
    });
  } catch (error) {
    console.error("Error saving location to database:", error);
    throw error;
  }
}

/**
 * Stop background tracking
 */
export function stopBackgroundTracking(): void {
  // Note: In production, you'd store the interval ID and clear it
  console.log("Background tracking requested to stop (periodic capture will continue until app restart)");
}

/**
 * For APK: Provide method to capture location from native code
 * Called from Flutter/React Native side via bridge
 */
export async function captureLocationFromAPK(
  latitude: number,
  longitude: number,
  accuracy: number | null,
  speed: number | null
): Promise<void> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const locationData: LocationData = {
      latitude,
      longitude,
      accuracy,
      speed,
      timestamp: new Date().toISOString(),
    };

    await saveLocationToDatabase(user.id, locationData);
    console.log("Location captured from APK");
  } catch (error) {
    console.error("Error capturing APK location:", error);
  }
}

/**
 * Request background sync from service worker (PWA)
 */
export async function requestBackgroundSync(): Promise<void> {
  if ("serviceWorker" in navigator && "sync" in ServiceWorkerRegistration.prototype) {
    try {
      const registration = await navigator.serviceWorker.ready;
      await (registration as any).sync.register("sync-location");
      console.log("Background sync requested");
    } catch (error) {
      console.error("Background sync request failed:", error);
    }
  }
}

/**
 * Open IndexedDB for auth storage
 */
function openIndexedDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("sbee-cables");
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains("auth")) {
        db.createObjectStore("auth", { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
