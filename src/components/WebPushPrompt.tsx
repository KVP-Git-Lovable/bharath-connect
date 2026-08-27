import { useEffect, useState } from "react";
import { Bell, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  detectPushSupport,
  subscribeToWebPush,
  getCurrentPermission,
  type PushSupport,
} from "@/utils/webPush";
import { supabase } from "@/integrations/supabase/client";
import IOSInstallPrompt from "./IOSInstallPrompt";

const DISMISS_KEY = "webpush-prompt-dismissed";
const DISMISS_TTL = 3 * 24 * 60 * 60 * 1000; // re-ask after 3 days

interface Props {
  userId: string;
}

/**
 * App-wide banner that surfaces the Web Push opt-in everywhere (not just the
 * Profile page). On iOS the permission request MUST originate from a user
 * gesture, so this renders a tappable "Enable" button rather than auto-prompting.
 */
export default function WebPushPrompt({ userId }: Props) {
  const [show, setShow] = useState(false);
  const [support, setSupport] = useState<PushSupport>("unsupported");
  const [busy, setBusy] = useState(false);
  const [iosSheetOpen, setIosSheetOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!userId) return;

      const s = detectPushSupport();
      // Native handles push via FCM; unsupported has nothing to offer.
      if (s === "native-android" || s === "unsupported") return;

      const perm = await getCurrentPermission();
      if (perm === "granted") {
        // Already granted — only re-prompt if no live subscription exists.
        const { data } = await supabase
          .from("web_push_subscriptions" as any)
          .select("id")
          .eq("user_id", userId)
          .limit(1);
        if ((data?.length ?? 0) > 0) return;
      } else if (perm === "denied") {
        return; // can't re-ask once denied
      }

      const dismissedAt = Number(localStorage.getItem(DISMISS_KEY) || 0);
      if (dismissedAt && Date.now() - dismissedAt < DISMISS_TTL) return;

      if (!cancelled) {
        setSupport(s);
        setShow(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const dismiss = () => {
    setShow(false);
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  };

  const handleEnable = async () => {
    // iOS Safari that hasn't been installed to Home Screen can't subscribe.
    if (support === "ios-needs-install") {
      setIosSheetOpen(true);
      return;
    }
    setBusy(true);
    const result = await subscribeToWebPush(userId);
    setBusy(false);
    if (result.ok) {
      toast.success("Notifications enabled");
      setShow(false);
    } else if (result.reason === "denied") {
      toast.error("Permission denied — enable from device settings");
      setShow(false);
    } else {
      toast.error(`Could not enable notifications: ${result.reason ?? "unknown"}`);
    }
  };

  if (!show) return null;

  const isIOS = support === "ios-needs-install" || support === "ios-standalone";

  return (
    <>
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0, y: 60 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 60 }}
          className="fixed bottom-16 md:bottom-0 left-0 right-0 z-50 bg-background border-t border-border shadow-[0_-4px_20px_rgba(0,0,0,0.1)] p-4"
        >
          <div className="max-w-lg mx-auto">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <Bell className="h-5 w-5 text-primary" />
                <span className="text-sm font-semibold text-foreground">Enable Notifications</span>
              </div>
              <button onClick={dismiss} className="text-muted-foreground hover:text-foreground p-1">
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-xs text-muted-foreground mb-3">
              {support === "ios-needs-install"
                ? "Add this app to your Home Screen first, then enable alerts for attendance, leaves and approvals"
                : "Get instant alerts for attendance, leaves, expenses and approvals"}
            </p>

            <div className="flex items-center gap-2">
              <Button className="flex-1 h-11 text-sm font-semibold" onClick={handleEnable} disabled={busy}>
                <Bell className="h-4 w-4 mr-2" />
                {busy ? "Enabling..." : support === "ios-needs-install" ? "Show install steps" : "Enable"}
              </Button>
              <Button variant="outline" className="h-11 text-sm font-medium shrink-0" onClick={dismiss}>
                Maybe Later
              </Button>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
      {isIOS && <IOSInstallPrompt open={iosSheetOpen} onClose={() => setIosSheetOpen(false)} />}
    </>
  );
}
