import { useEffect, useRef, useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { AppHeader } from "./AppHeader";
import { BottomNav } from "./BottomNav";
import { supabase } from "@/integrations/supabase/client";
import ProfileSetupModal from "@/components/ProfileSetupModal";
import ChangePasswordModal from "@/components/ChangePasswordModal";
import PWAInstallBanner from "@/components/PWAInstallBanner";
import OfflineActivityBanner from "@/components/OfflineActivityBanner";
import WebPushPrompt from "@/components/WebPushPrompt";

import { usePushNotifications } from "@/hooks/usePushNotifications";
import { useDeviceStatusReporter } from "@/hooks/useDeviceStatusReporter";
import { useGPSTracker } from "@/hooks/useGPSTracker";
import { useAutoAssignRoles } from "@/hooks/useAutoAssignRoles";

// Keys of caches scoped to the signed-in user. Must be cleared on user change.
const USER_SCOPED_CACHE_KEYS = [
  "user_profile_cache_v1",
  "dashboard_cache_v1",
];

function clearUserScopedCaches() {
  try {
    USER_SCOPED_CACHE_KEYS.forEach((k) => localStorage.removeItem(k));
    // Sweep any other per-user caches we may add later
    Object.keys(localStorage)
      .filter((k) => k.endsWith("_cache_v1") || k.startsWith("nav_prefs_"))
      .forEach((k) => localStorage.removeItem(k));
  } catch { /* ignore */ }
}

export function AppLayout() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const lastUserIdRef = useRef<string | null>(null);
  // Native permissions are requested at the app root (see App.tsx) so they
  // never race the background-geolocation watcher started below.

  useAutoAssignRoles(); // Auto-assign roles on app load
  const [ready, setReady] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [profilePictureUrl, setProfilePictureUrl] = useState<string | null | undefined>(undefined);
  const [onboardingCompleted, setOnboardingCompleted] = useState<boolean | null>(null);
  const [mustChangePassword, setMustChangePassword] = useState<boolean>(false);
  usePushNotifications(userId ?? undefined);
  useDeviceStatusReporter(userId);
  useGPSTracker(userId);

  useEffect(() => {
    const handleSession = (session: Awaited<ReturnType<typeof supabase.auth.getSession>>["data"]["session"]) => {
      if (!session) {
        if (lastUserIdRef.current) {
          clearUserScopedCaches();
          queryClient.clear();
          lastUserIdRef.current = null;
        }
        navigate("/auth", { replace: true });
        return;
      }

      const expiresAt = localStorage.getItem("remember_me_expires");
      if (expiresAt && Date.now() > Number(expiresAt)) {
        localStorage.removeItem("remember_me_expires");
        clearUserScopedCaches();
        queryClient.clear();
        supabase.auth.signOut().then(() => navigate("/auth", { replace: true }));
        return;
      }

      const newUserId = session.user.id;
      if (lastUserIdRef.current && lastUserIdRef.current !== newUserId) {
        // User switched — wipe per-user caches and react-query data
        clearUserScopedCaches();
        queryClient.clear();
      }
      lastUserIdRef.current = newUserId;

      setReady(true);
      setUserId(newUserId);
      supabase.from("profiles").select("profile_picture_url, onboarding_completed, must_change_password").eq("id", newUserId).single()
        .then(({ data }) => {
          setProfilePictureUrl(data?.profile_picture_url ?? null);
          setOnboardingCompleted(data?.onboarding_completed ?? false);
          setMustChangePassword((data as any)?.must_change_password ?? false);
        });
    };

    supabase.auth.getSession().then(({ data: { session } }) => handleSession(session));

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      handleSession(session);
    });

    return () => subscription.unsubscribe();
  }, [navigate, queryClient]);

  if (!ready) return null;

  const showPasswordChange = userId && mustChangePassword;
  const showProfileSetup = userId && !mustChangePassword && onboardingCompleted === false && profilePictureUrl === null;

  return (
    <div className="min-h-screen flex flex-col w-full max-w-full bg-background overflow-x-hidden">
      <AppHeader />
      <OfflineActivityBanner />
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
      {showPasswordChange && (
        <ChangePasswordModal
          userId={userId}
          onComplete={() => setMustChangePassword(false)}
        />
      )}
      {showProfileSetup && (
        <ProfileSetupModal
          userId={userId}
          profilePictureUrl={profilePictureUrl}
          onComplete={() => {
            setOnboardingCompleted(true);
            supabase.from("profiles").select("profile_picture_url").eq("id", userId).single()
              .then(({ data }) => setProfilePictureUrl(data?.profile_picture_url ?? null));
          }}
        />
      )}
      <PWAInstallBanner />
      {userId && <WebPushPrompt userId={userId} />}
    </div>
  );
}
