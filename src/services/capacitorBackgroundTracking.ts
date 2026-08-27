import { registerPlugin } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";

// The community plugin ships native code only; register it dynamically.
const BackgroundGeolocation = registerPlugin<any>("BackgroundGeolocation");

interface TrackingSession {
  userId: string;
  startTime: string;
  isTracking: boolean;
}

let currentSession: TrackingSession | null = null;

/**
 * Initialize and start background GPS tracking for APK
 * Runs continuously even when app is closed
 */
export async function startCapacitorBackgroundTracking(userId: string): Promise<void> {
  try {
    // Check if running on native platform
    if (!isNativeApp()) {
      console.log("Background tracking: Not on native app, skipping Capacitor setup");
      return;
    }

    currentSession = {
      userId,
      startTime: new Date().toISOString(),
      isTracking: true,
    };

    // Request location permission
    const permission = await BackgroundGeolocation.requestPermissions();
    if (permission !== "granted") {
      console.error("Location permission denied");
      return;
    }

    // Configure background geolocation
    await BackgroundGeolocation.startWatching({
      // Capture location every 5 seconds for better accuracy
      interval: 5000,
      // Minimum distance in meters before reporting (2m to catch all movements)
      minDisplacement: 2,
      // High accuracy
      enableHighAccuracy: true,
      notificationTitle: "QuickLocate",
      notificationText: "Tracking your location",
      notificationIconColor: "#FFA500",
    });

    console.log("Background geolocation started for user:", userId);

    // Listen for location changes
    BackgroundGeolocation.addListener("location", async (location: any) => {
      if (!currentSession?.isTracking) return;

      try {
        await saveLocationToDatabase(userId, {
          latitude: location.latitude,
          longitude: location.longitude,
          accuracy: location.accuracy,
          speed: location.speed,
          timestamp: new Date().toISOString(),
        });

        console.log("✅ Background location captured:", {
          lat: location.latitude.toFixed(6),
          lng: location.longitude.toFixed(6),
          accuracy: location.accuracy,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        console.error("❌ Error saving background location:", error);
        // Don't alert - silent failure prevents popup spam (network drop, etc)
        // Tracking will continue and retry automatically
      }
    });

    // Handle errors
    BackgroundGeolocation.addListener("error", (error: any) => {
      console.error("Background geolocation error:", error);
    });

  } catch (error) {
    console.error("Error starting background tracking:", error);
    throw error;
  }
}

/**
 * Stop background GPS tracking
 */
export async function stopCapacitorBackgroundTracking(): Promise<void> {
  try {
    if (!isNativeApp()) return;

    await BackgroundGeolocation.stopWatching();

    if (currentSession) {
      currentSession.isTracking = false;
    }

    console.log("Background geolocation stopped");
  } catch (error) {
    console.error("Error stopping background tracking:", error);
  }
}

/**
 * Save location to gps_tracking table
 */
async function saveLocationToDatabase(
  userId: string,
  location: {
    latitude: number;
    longitude: number;
    accuracy: number | null;
    speed: number | null;
    timestamp: string;
  }
): Promise<void> {
  const today = new Date().toISOString().split("T")[0];

  try {
    // Validate that GPS point falls within an active check-in session
    const validationResult = await supabase.functions.invoke(
      "validate-gps-session",
      {
        body: {
          userId,
          timestamp: location.timestamp,
        },
      }
    );

    if (!validationResult.data?.valid) {
      console.warn("GPS point rejected: outside active session window");
      return; // Silently skip this point
    }

    // Save validated GPS point
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
    // Silent failure: continue tracking even if save fails (network drop, brief outage)
    // Next batch will retry automatically
  }
}

/**
 * Check if running on native platform (APK/iOS)
 */
function isNativeApp(): boolean {
  return (window as any).Capacitor?.isNative ?? false;
}

/**
 * Get current tracking session status
 */
export function getTrackingStatus(): TrackingSession | null {
  return currentSession;
}

/**
 * Check if background tracking is active
 */
export function isBackgroundTrackingActive(): boolean {
  return currentSession?.isTracking ?? false;
}
