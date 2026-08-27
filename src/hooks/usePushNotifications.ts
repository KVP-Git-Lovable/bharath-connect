import { useEffect, useRef } from "react";
import { Capacitor } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";

const FCM_FLAG = "fcm_needs_register";
const LAST_TOKEN_KEY = "fcm_last_token";

/**
 * Registers FCM push token on native Android devices and keeps it fresh.
 *
 * Refresh strategy:
 *  - Re-registers on every mount (covers app launches & updates).
 *  - Re-registers on App `resume` event (covers warm starts after long idle).
 *  - Every received token upserts the row (touches last_seen_at) AND deletes
 *    any older tokens this same user previously registered from this device
 *    (tracked via localStorage).
 *
 * On web this is a no-op.
 */
export function usePushNotifications(userId: string | undefined) {
  const isUnmounted = useRef(false);

  useEffect(() => {
    isUnmounted.current = false;

    if (!userId || !Capacitor.isNativePlatform()) return;

    let regListener: { remove: () => void } | undefined;
    let errListener: { remove: () => void } | undefined;
    let notifListener: { remove: () => void } | undefined;
    let actionListener: { remove: () => void } | undefined;
    let resumeListener: { remove: () => void } | undefined;
    let PushNotificationsRef: any;

    const saveToken = async (tokenValue: string) => {
      if (!tokenValue || !userId) return;
      try {
        const previousToken = localStorage.getItem(LAST_TOKEN_KEY);

        // Upsert current token (refreshes last_seen_at via the trigger/default).
        const { error } = await supabase
          .from("push_tokens" as any)
          .upsert(
            {
              user_id: userId,
              token: tokenValue,
              platform: "android",
              last_seen_at: new Date().toISOString(),
            } as any,
            { onConflict: "token" }
          );

        if (error) {
          console.error("Failed to save push token:", error);
          return;
        }

        // If this device previously registered a different token for this
        // user, remove the old row so we don't accumulate dead tokens.
        if (previousToken && previousToken !== tokenValue) {
          const { error: delErr } = await supabase
            .from("push_tokens" as any)
            .delete()
            .eq("user_id", userId)
            .eq("token", previousToken);
          if (delErr) console.warn("Failed to remove old push token:", delErr);
        }

        localStorage.setItem(LAST_TOKEN_KEY, tokenValue);
        console.log("Push token saved & refreshed");
      } catch (upsertErr) {
        console.error("Push token upsert threw:", upsertErr);
      }
    };

    const tryRegister = async () => {
      if (!PushNotificationsRef) return;
      try {
        const perm = await PushNotificationsRef.checkPermissions();
        if (perm?.receive === "granted") {
          await PushNotificationsRef.register();
        }
      } catch (e) {
        console.warn("Re-register failed:", e);
      }
    };

    const init = async () => {
      try {
        const mod = await import("@capacitor/push-notifications");
        PushNotificationsRef = mod.PushNotifications;
      } catch (e) {
        console.warn("Push notifications plugin not available:", e);
        return;
      }

      if (isUnmounted.current) return;

      // Android notification channel (required Android 8+)
      try {
        await PushNotificationsRef.createChannel({
          id: "default",
          name: "Default Notifications",
          description: "General app notifications",
          importance: 5,
          visibility: 1,
          sound: "default",
          vibration: true,
        });
      } catch (e) {
        console.warn("createChannel not available:", e);
      }

      // Registration listener — fires on every successful register() and on
      // background FCM-driven token rotations.
      try {
        regListener = await PushNotificationsRef.addListener(
          "registration",
          async (token: any) => {
            if (isUnmounted.current) return;
            console.log("FCM token received:", token?.value?.substring(0, 20) + "...");
            await saveToken(token?.value);
          }
        );
      } catch (e) {
        console.warn("Failed to add registration listener:", e);
      }

      try {
        errListener = await PushNotificationsRef.addListener(
          "registrationError",
          (err: any) => console.error("Push registration error:", err)
        );
      } catch (_) {}

      try {
        notifListener = await PushNotificationsRef.addListener(
          "pushNotificationReceived",
          (notification: any) => {
            console.log("Push received in foreground:", notification);
          }
        );
      } catch (_) {}

      try {
        actionListener = await PushNotificationsRef.addListener(
          "pushNotificationActionPerformed",
          (action: any) => {
            console.log("Push notification tapped:", action);
          }
        );
      } catch (_) {}

      // Re-register on app resume so a fresh token is requested whenever the
      // user comes back to the app (covers FCM rotations, reinstalls, app
      // data clears).
      try {
        const { App } = await import("@capacitor/app");
        resumeListener = await App.addListener("resume", () => {
          console.log("App resumed — re-registering FCM token");
          tryRegister();
        });
      } catch (e) {
        console.warn("App resume listener unavailable:", e);
      }

      if (isUnmounted.current) return;

      // Deferred registration from previous lifecycle (Android 13+ Activity recreation)
      const needsDeferredRegister = localStorage.getItem(FCM_FLAG) === "true";
      if (needsDeferredRegister) {
        localStorage.removeItem(FCM_FLAG);
        console.log("Deferred FCM registration, registering now...");
        try {
          await PushNotificationsRef.register();
        } catch (e) {
          console.warn("Deferred register() failed:", e);
        }
        return;
      }

      // Standard path: check permission, register if granted, else request.
      let currentStatus: string | undefined;
      try {
        const result = await PushNotificationsRef.checkPermissions();
        currentStatus = result?.receive;
      } catch (e) {
        console.warn("checkPermissions failed:", e);
        return;
      }

      if (isUnmounted.current) return;

      if (currentStatus === "granted") {
        try {
          // Always register on every mount — this re-triggers the
          // 'registration' listener with the current token, refreshing
          // last_seen_at and validating the token is still issued by FCM.
          await PushNotificationsRef.register();
        } catch (e) {
          console.warn("register() failed:", e);
        }
        return;
      }

      try {
        const permResult = await PushNotificationsRef.requestPermissions();
        if (permResult?.receive === "granted") {
          // Register immediately so the 'registration' listener fires and the
          // current FCM token is saved right away. Also set the deferred flag
          // as a fallback for Android 13+ Activity recreation.
          localStorage.setItem(FCM_FLAG, "true");
          console.log("Permission granted — registering FCM token now");
          try {
            await PushNotificationsRef.register();
          } catch (e) {
            console.warn("Immediate register() after grant failed:", e);
          }
        } else {
          console.log("Push notification permission not granted");
        }
      } catch (e) {
        console.warn("Push permission request failed:", e);
      }
    };

    init();

    return () => {
      isUnmounted.current = true;
      try { regListener?.remove(); } catch (_) {}
      try { errListener?.remove(); } catch (_) {}
      try { notifListener?.remove(); } catch (_) {}
      try { actionListener?.remove(); } catch (_) {}
      try { resumeListener?.remove(); } catch (_) {}
    };
  }, [userId]);
}
