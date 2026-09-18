/**
 * Platform string for telemetry rows.
 *
 * This is a deliberate copy of the private detectPlatform() in
 * src/hooks/useDeviceStatusReporter.ts rather than an import. That hook is the
 * live battery reporter and is explicitly out of scope for change, so it keeps
 * its own copy untouched. If the two ever need to diverge, they can.
 */

interface CapacitorGlobal {
  Capacitor?: { isNativePlatform?: () => boolean };
}

function capacitor(): CapacitorGlobal["Capacitor"] {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as CapacitorGlobal).Capacitor;
}

export function detectPlatform(): string {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent || "" : "";
  if (isNativePlatform()) {
    return /Android/i.test(ua) ? "android-native" : /iPhone|iPad|iPod/i.test(ua) ? "ios-native" : "native";
  }
  if (/iPhone|iPad|iPod/i.test(ua)) return "web-ios";
  if (/Android/i.test(ua)) return "web-android";
  return "web-desktop";
}

export function isNativePlatform(): boolean {
  return !!capacitor()?.isNativePlatform?.();
}
