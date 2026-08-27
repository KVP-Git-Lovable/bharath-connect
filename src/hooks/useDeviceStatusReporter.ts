import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Reports this device's battery %, charging state and network type to the
 * backend once per minute while the app tab/window is visible.
 * No-ops when the browser doesn't expose the underlying APIs (e.g. iOS Safari
 * has no Battery API).
 */

type BatteryManager = {
  level: number;
  charging: boolean;
  addEventListener: (evt: string, cb: () => void) => void;
  removeEventListener: (evt: string, cb: () => void) => void;
};

function detectPlatform(): string {
  const ua = navigator.userAgent || "";
  const isCap = !!(window as any).Capacitor?.isNativePlatform?.();
  if (isCap) {
    return /Android/i.test(ua) ? "android-native" : /iPhone|iPad|iPod/i.test(ua) ? "ios-native" : "native";
  }
  if (/iPhone|iPad|iPod/i.test(ua)) return "web-ios";
  if (/Android/i.test(ua)) return "web-android";
  return "web-desktop";
}

function readNetwork(): string {
  if (typeof navigator === "undefined") return "unknown";
  if (navigator.onLine === false) return "offline";
  const conn = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
  if (!conn) return "unknown";
  // effectiveType is one of 'slow-2g' | '2g' | '3g' | '4g'
  const eff = conn.effectiveType as string | undefined;
  const type = conn.type as string | undefined; // 'wifi' | 'cellular' | ...
  if (type === "wifi") return "wifi";
  if (eff) return eff;
  return "unknown";
}

export function useDeviceStatusReporter(userId: string | null | undefined) {
  const batteryRef = useRef<BatteryManager | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    const platform = detectPlatform();
    const isNative = !!(window as any).Capacitor?.isNativePlatform?.();

    const readNativeBattery = async (): Promise<{ level: number | null; charging: boolean | null }> => {
      try {
        const { Device } = await import("@capacitor/device");
        const info = await Device.getBatteryInfo();
        return {
          level: typeof info.batteryLevel === "number" ? Math.round(info.batteryLevel * 100) : null,
          charging: typeof info.isCharging === "boolean" ? info.isCharging : null,
        };
      } catch {
        return { level: null, charging: null };
      }
    };

    const send = async () => {
      if (cancelled || document.visibilityState !== "visible") return;
      let batteryLevel: number | null = null;
      let charging: boolean | null = null;
      if (isNative) {
        const nat = await readNativeBattery();
        batteryLevel = nat.level;
        charging = nat.charging;
      }
      const bat = batteryRef.current;
      if (batteryLevel == null && bat) {
        batteryLevel = Math.round((bat.level ?? 0) * 100);
        charging = !!bat.charging;
      }
      const network = readNetwork();
      try {
        await supabase.rpc("report_device_status", {
          _battery: batteryLevel,
          _charging: charging,
          _network: network,
          _platform: platform,
        });
      } catch {
        /* ignore transient failures */
      }
    };


    const start = async () => {
      try {
        const getBattery = (navigator as any).getBattery;
        if (typeof getBattery === "function") {
          const bat: BatteryManager = await getBattery.call(navigator);
          if (!cancelled) {
            batteryRef.current = bat;
            const onChange = () => { void send(); };
            bat.addEventListener("levelchange", onChange);
            bat.addEventListener("chargingchange", onChange);
          }
        }
      } catch { /* battery API unavailable */ }

      // Initial + interval reporting (every 60s)
      void send();
      timerRef.current = window.setInterval(() => { void send(); }, 60_000);
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") void send();
    };
    document.addEventListener("visibilitychange", onVisibility);

    void start();

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      if (timerRef.current) window.clearInterval(timerRef.current);
      timerRef.current = null;
      batteryRef.current = null;
    };
  }, [userId]);
}
