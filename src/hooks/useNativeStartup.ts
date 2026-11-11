import { useEffect } from "react";

/**
 * Kept for API compatibility. Startup no longer opens a real microphone
 * stream — permission is requested through the recorder plugin instead — so
 * there is never a priming stream for callers to wait on.
 */
export function isMicPrimingActive() {
  return false;
}

/**
 * On native (Capacitor) platforms, request all hardware permissions
 * as soon as the app starts. This triggers Android system dialogs
 * so the WebView has access to camera, location, etc.
 */
/**
 * Some Capacitor permission calls never settle on certain Android versions —
 * Filesystem.requestPermissions() in particular hangs on API 33+, where
 * publicStorage is no longer a runtime permission. Awaiting it directly stalls
 * every request queued behind it, so each step is raced against a timeout.
 */
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ]);
}

/**
 * The startup chain must run exactly once per app session.
 *
 * AppLayout can mount more than once (route changes, StrictMode double-invoke),
 * and firing the chain concurrently makes Capacitor issue duplicate
 * requestPermissions calls for the same plugin. The native bridge resolves only
 * one of the callbacks and silently abandons the other, so the second chain
 * hangs on Camera and never reaches Filesystem or the microphone.
 */
let _startupRan = false;

export function useNativeStartup() {
  useEffect(() => {
    if (_startupRan) return;
    _startupRan = true;

    let cancelled = false;

    async function requestAllPermissions() {
      // Check if we're in a Capacitor native shell
      let isNativePlatform = false;
      try {
        const { Capacitor } = await import("@capacitor/core");
        isNativePlatform = Capacitor.isNativePlatform();
      } catch {
        return; // Not native, nothing to do
      }

      if (!isNativePlatform || cancelled) return;

      console.log("[NativeStartup] Requesting native permissions…");

      // Android shows one system dialog at a time and queues the rest, so these
      // are requested sequentially. Each is isolated: a plugin that is missing
      // or denied must not stop the ones after it.

      // 1. Location — GPS tracking, visit check-in, beat routing
      try {
        const { Geolocation } = await import("@capacitor/geolocation");
        const perm = await withTimeout(Geolocation.requestPermissions(), 60000, 'Location');
        console.log(
          "[NativeStartup] Location:", perm.location,
          "| coarse:", perm.coarseLocation
        );
      } catch (e) {
        console.warn("[NativeStartup] Location request failed:", e);
      }
      if (cancelled) return;

      // Let the location dialog finish dismissing before opening the next one.
      // Android delivers the result to whichever activity is resumed; firing a
      // second plugin's request while the first dialog is still tearing down
      // loses the callback and the promise never settles.
      await new Promise((r) => setTimeout(r, 1500));
      if (cancelled) return;

      // 2. Camera AND photo library — attendance photo, profile photo,
      //    board/bill scanning, picking an existing image.
      //    Both aliases are named explicitly so neither is skipped.
      try {
        const { Camera } = await import("@capacitor/camera");
        const perm = await withTimeout(
          Camera.requestPermissions({ permissions: ["camera", "photos"] }),
          60000,
          "Camera"
        );
        console.log(
          "[NativeStartup] Camera:", perm.camera,
          "| Photos/storage:", perm.photos
        );
      } catch (e) {
        console.warn("[NativeStartup] Camera/photos request failed:", e);
      }
      // Storage/photos needs no separate step: the Camera request above returns
      // and grants the whole group — camera, photos, readExternalStorage and
      // saveGallery. Filesystem.requestPermissions() is deliberately NOT called
      // here; publicStorage is not a runtime permission on Android 13+ and the
      // call never settles there, stalling everything queued behind it.
      //
      // The microphone is also deliberately left out. It is requested in
      // context by useAudioRecorder when the user first taps record, which is
      // both the Play Store's preferred pattern and, more practically, the only
      // safe one: Capacitor's Android bridge abandons one of the callbacks when
      // two requestPermissions calls for the same plugin overlap, and
      // nativePermissions.ts / CameraCapture.tsx / useAudioRecorder all issue
      // their own requests as the app boots.

      console.log("[NativeStartup] Permission requests complete.");
    }

    requestAllPermissions();

    return () => {
      cancelled = true;
    };
  }, []);
}
