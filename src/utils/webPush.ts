import { supabase } from "@/integrations/supabase/client";
import { Capacitor } from "@capacitor/core";

// VAPID public key is fetched from the backend so it always matches the
// VAPID_PRIVATE_KEY secret used to sign push messages.
let cachedVapidPublicKey: string | null = null;

async function getVapidPublicKey(): Promise<string> {
  if (cachedVapidPublicKey) return cachedVapidPublicKey;
  const { data, error } = await supabase.functions.invoke("get-vapid-public-key");
  if (error || !data?.publicKey) throw new Error("VAPID public key unavailable");
  cachedVapidPublicKey = data.publicKey as string;
  return cachedVapidPublicKey;
}

export type PushSupport =
  | "supported"        // browser supports Web Push, SW can register
  | "ios-needs-install" // iOS Safari but not added to Home Screen yet
  | "ios-standalone"   // iOS PWA, supported (16.4+)
  | "native-android"   // Capacitor APK – use FCM hook instead
  | "unsupported";     // no Push API at all

export function isIOS(): boolean {
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
}

export function isStandalonePWA(): boolean {
  return (
    (window.navigator as any).standalone === true ||
    window.matchMedia("(display-mode: standalone)").matches
  );
}

export function detectPushSupport(): PushSupport {
  if (Capacitor.isNativePlatform()) return "native-android";
  const hasPush = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  if (isIOS()) {
    if (!isStandalonePWA()) return "ios-needs-install";
    return hasPush ? "ios-standalone" : "unsupported";
  }
  return hasPush ? "supported" : "unsupported";
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const arr = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) arr[i] = rawData.charCodeAt(i);
  return arr;
}

async function getRegistration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration("/");
  if (existing) return existing;
  return navigator.serviceWorker.register("/sw.js", { scope: "/" });
}

export async function subscribeToWebPush(userId: string): Promise<{ ok: boolean; reason?: string }> {
  try {
    const perm = await Notification.requestPermission();
    if (perm !== "granted") return { ok: false, reason: perm };

    const reg = await getRegistration();
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      const vapidKey = await getVapidPublicKey();
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
      });
    }

    const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
      return { ok: false, reason: "invalid_subscription" };
    }

    const { error } = await supabase.from("web_push_subscriptions" as any).upsert(
      {
        user_id: userId,
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
        user_agent: navigator.userAgent,
        last_seen_at: new Date().toISOString(),
      } as any,
      { onConflict: "endpoint" }
    );

    if (error) return { ok: false, reason: error.message };
    return { ok: true };
  } catch (e: any) {
    return { ok: false, reason: e?.message || "unknown" };
  }
}

export async function getCurrentPermission(): Promise<NotificationPermission | "unsupported"> {
  if (!("Notification" in window)) return "unsupported";
  return Notification.permission;
}
