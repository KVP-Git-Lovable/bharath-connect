/**
 * Platform-aware permission & hardware helpers.
 * Works in three contexts:
 *   1. Pure web browser
 *   2. Capacitor local (plugins available)
 *   3. Capacitor remote-URL WebView (plugins may NOT be bridged)
 *
 * Strategy: always try native plugin first, catch errors, fall back to web API.
 */

let _isNativeCached: boolean | null = null;

/** Check if running inside a Capacitor native shell */
export function isNative(): boolean {
  if (_isNativeCached !== null) return _isNativeCached;
  try {
    // Dynamic check — avoids import errors if @capacitor/core isn't resolved
    const { Capacitor } = require('@capacitor/core');
    _isNativeCached = Capacitor.isNativePlatform();
  } catch {
    _isNativeCached = false;
  }
  return _isNativeCached;
}

/** Try to use Capacitor Geolocation plugin */
async function nativeGetPosition(opts: { enableHighAccuracy: boolean; timeout: number }) {
  const { Geolocation } = await import('@capacitor/geolocation');
  // Request permission first (required on Android)
  const permResult = await Geolocation.requestPermissions();
  if (permResult.location === 'denied') {
    throw new Error('Location permission denied by user');
  }
  const pos = await Geolocation.getCurrentPosition({
    enableHighAccuracy: opts.enableHighAccuracy,
    timeout: opts.timeout,
    maximumAge: 0, // never accept an OS-cached fix — matches webGetPosition's
                    // explicit anti-cache behavior below
  });
  return {
    latitude: pos.coords.latitude,
    longitude: pos.coords.longitude,
    accuracy: pos.coords.accuracy,
  };
}

type NativeLocationPowerStatus = {
  foregroundLocation?: 'granted' | 'denied' | string;
  backgroundLocation?: 'granted' | 'denied' | string;
  ignoringBatteryOptimizations?: boolean;
  sdkInt?: number;
  opened?: boolean;
};

async function getDeviceSettingsPlugin() {
  const { registerPlugin } = await import('@capacitor/core');
  return registerPlugin<any>('DeviceSettings');
}

export async function getNativeLocationPowerStatus(): Promise<NativeLocationPowerStatus | null> {
  if (!isNative()) return null;
  try {
    const DeviceSettings = await getDeviceSettingsPlugin();
    return await DeviceSettings.getLocationPowerStatus();
  } catch (e) {
    console.warn('Could not read native location/power status:', e);
    return null;
  }
}

export async function requestBatteryOptimizationExemption(): Promise<NativeLocationPowerStatus | null> {
  if (!isNative()) return null;
  try {
    const DeviceSettings = await getDeviceSettingsPlugin();
    return await DeviceSettings.requestIgnoreBatteryOptimizations();
  } catch (e) {
    console.warn('Could not request battery optimisation exemption:', e);
    return null;
  }
}

export async function requestBackgroundLocationAccess(): Promise<NativeLocationPowerStatus | null> {
  if (!isNative()) return null;
  try {
    const DeviceSettings = await getDeviceSettingsPlugin();
    return await DeviceSettings.requestBackgroundLocation();
  } catch (e) {
    console.warn('Could not request background location access:', e);
    return null;
  }
}

/**
 * Android does not allow apps to silently set "Allow all the time" location
 * or disable Battery Optimization. This helper requests what Android permits
 * directly and opens the exact system screen for the user-controlled settings.
 */
export async function prepareNativeLocationSettings(): Promise<NativeLocationPowerStatus | null> {
  if (!isNative()) return null;

  try {
    const { Geolocation } = await import('@capacitor/geolocation');
    await Geolocation.requestPermissions({ permissions: ['location', 'coarseLocation'] });
  } catch (e) {
    console.warn('Foreground location permission request failed:', e);
  }

  const status = await getNativeLocationPowerStatus();
  if (status?.ignoringBatteryOptimizations === false) {
    await requestBatteryOptimizationExemption();
  }
  if (status?.backgroundLocation !== 'granted') {
    return requestBackgroundLocationAccess();
  }
  return getNativeLocationPowerStatus();
}

/**
 * Web fallback for geolocation.
 * Uses watchPosition to iterate a few readings and pick the most accurate one,
 * since a single getCurrentPosition call often returns a cached/low-accuracy fix
 * (especially on desktop where Wi-Fi/IP geolocation can be off by kilometers).
 */
function webGetPosition(opts: { enableHighAccuracy: boolean; timeout: number }): Promise<{ latitude: number; longitude: number; accuracy: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      return reject(new Error('Geolocation not supported'));
    }

    let best: { latitude: number; longitude: number; accuracy: number } | null = null;
    let settled = false;
    const ACCEPT_ACCURACY_M = 50; // return early if we get a reading this good
    const SAMPLE_MS = Math.min(8000, Math.max(3000, opts.timeout / 2));

    const finish = (err?: any) => {
      if (settled) return;
      settled = true;
      try { navigator.geolocation.clearWatch(watchId); } catch { /* ignore */ }
      clearTimeout(sampleTimer);
      clearTimeout(hardTimer);
      if (best) return resolve(best);
      reject(err || new Error('Unable to get location'));
    };

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const reading = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        };
        if (!best || reading.accuracy < best.accuracy) best = reading;
        if (reading.accuracy <= ACCEPT_ACCURACY_M) finish();
      },
      (err) => {
        // Only reject hard if we never got a reading
        if (!best) finish(err);
      },
      {
        enableHighAccuracy: opts.enableHighAccuracy,
        timeout: opts.timeout,
        maximumAge: 0, // never accept a stale cached fix
      }
    );

    const sampleTimer = setTimeout(() => finish(), SAMPLE_MS);
    const hardTimer = setTimeout(() => finish(new Error('Location timeout')), opts.timeout);
  });
}

/** Get current position — tries native plugin, falls back to web API */
export async function getCurrentPosition(options?: { enableHighAccuracy?: boolean; timeout?: number }) {
  const opts = { enableHighAccuracy: true, timeout: 15000, ...options };

  // Try native plugin first
  if (isNative()) {
    try {
      return await nativeGetPosition(opts);
    } catch (nativeErr) {
      console.warn('Native geolocation failed, falling back to web API:', nativeErr);
    }
  }

  // Web fallback (also used when native plugin fails)
  return webGetPosition(opts);
}

/** Take a photo — uses Capacitor Camera on native, returns null on web (web uses CameraCapture component) */
export async function takeNativePhoto(): Promise<Blob | null> {
  if (!isNative()) return null;

  try {
    const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera');
    
    // Request permission first
    const permResult = await Camera.requestPermissions();
    if (permResult.camera === 'denied') {
      console.warn('Camera permission denied');
      return null;
    }

    const image = await Camera.getPhoto({
      quality: 85,
      resultType: CameraResultType.Uri,
      source: CameraSource.Camera,
      width: 640,
      height: 480,
    });

    if (image.webPath) {
      const response = await fetch(image.webPath);
      return await response.blob();
    }
  } catch (err) {
    console.warn('Native camera failed:', err);
  }
  return null;
}

/** Request microphone permission — tries web Permissions API, falls back gracefully */
export async function requestMicrophonePermission(): Promise<'granted' | 'denied' | 'prompt'> {
  // On Android WebView (Capacitor), navigator.permissions.query for 'microphone'
  // often throws or returns incorrect results. Skip it and go straight to getUserMedia.
  
  // Check via Permissions API only on non-native platforms
  if (!isNative()) {
    try {
      const status = await navigator.permissions.query({ name: 'microphone' as PermissionName });
      if (status.state === 'denied') return 'denied';
      if (status.state === 'granted') return 'granted';
    } catch {
      // Permissions API not supported for microphone in some browsers — continue
    }
  }

  // Actually request by getting a stream briefly — this is the reliable method on Android WebView
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
    return 'granted';
  } catch (err: any) {
    if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
      return 'denied';
    }
    // On Android WebView, other errors like NotFoundError or AbortError
    // can occur even when permission is granted (e.g. no audio device found in emulator).
    // Don't treat these as "denied" — return 'prompt' so the caller can still try.
    console.warn('Microphone permission check encountered non-permission error:', err.name, err.message);
    return 'prompt';
  }
}

/** Request all needed permissions — tries native, silently skips on failure */
export async function requestNativePermissions() {
  // Try native geolocation permission
  try {
    const { Geolocation } = await import('@capacitor/geolocation');
    await Geolocation.requestPermissions({ permissions: ['location', 'coarseLocation'] });
  } catch (e) {
    console.warn('Native geolocation permission request skipped:', e);
  }

  // Try native camera permission
  try {
    const { Camera } = await import('@capacitor/camera');
    await Camera.requestPermissions();
  } catch (e) {
    console.warn('Native camera permission request skipped:', e);
  }
}

/**
 * Open the device's app-info settings screen (Android: the same page reached
 * via Settings > Apps > [App]). Android does not let an app silently disable
 * its own battery optimisation or upgrade its location permission to "Allow
 * all the time" — both require the user's explicit tap in Settings. This is
 * the closest one-tap improvement available: it drops the user directly on
 * the right screen instead of leaving them to find it themselves.
 * No-ops on web (returns false).
 */
export async function openAppSettings(): Promise<boolean> {
  if (!isNative()) return false;
  try {
    const DeviceSettings = await getDeviceSettingsPlugin();
    if (DeviceSettings?.openAppSettings) {
      await DeviceSettings.openAppSettings();
      return true;
    }

    const { registerPlugin } = await import('@capacitor/core');
    const BackgroundGeolocation: any = registerPlugin('BackgroundGeolocation');
    if (!BackgroundGeolocation?.openSettings) return false;
    await BackgroundGeolocation.openSettings();
    return true;
  } catch (e) {
    console.warn('Could not open app settings:', e);
    return false;
  }
}
