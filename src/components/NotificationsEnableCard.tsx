import { useEffect, useState } from "react";
import { Bell, BellOff, Check, AlertCircle, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import {
  detectPushSupport,
  subscribeToWebPush,
  getCurrentPermission,
  type PushSupport,
} from "@/utils/webPush";
import IOSInstallPrompt from "./IOSInstallPrompt";
import { supabase } from "@/integrations/supabase/client";
import { useBranding } from "@/hooks/useBranding";

interface Props {
  userId: string;
}

export default function NotificationsEnableCard({ userId }: Props) {
  const { companyName } = useBranding();
  const [support, setSupport] = useState<PushSupport>("unsupported");
  const [perm, setPerm] = useState<NotificationPermission | "unsupported">("default");
  const [hasSubscription, setHasSubscription] = useState(false);
  const [showInstall, setShowInstall] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setSupport(detectPushSupport());
    getCurrentPermission().then(setPerm);

    // Check existing subscription
    (async () => {
      if (!userId) return;
      const { data } = await supabase
        .from("web_push_subscriptions" as any)
        .select("id")
        .eq("user_id", userId)
        .limit(1);
      setHasSubscription((data?.length ?? 0) > 0);
    })();
  }, [userId]);

  const handleEnable = async () => {
    if (support === "ios-needs-install") {
      setShowInstall(true);
      return;
    }
    setBusy(true);
    const result = await subscribeToWebPush(userId);
    setBusy(false);
    setPerm(await getCurrentPermission());
    if (result.ok) {
      setHasSubscription(true);
      toast.success("Notifications enabled");
    } else if (result.reason === "denied") {
      toast.error("Permission denied — enable from device settings");
    } else {
      toast.error(`Could not enable notifications: ${result.reason ?? "unknown"}`);
    }
  };

  // Native Android APK — push handled by Capacitor hook, just show status
  if (support === "native-android") {
    return (
      <Card>
        <CardContent className="p-4 flex items-center gap-3">
          <Check className="h-5 w-5 text-green-600 shrink-0" />
          <div>
            <p className="text-sm font-medium">Push notifications active</p>
            <p className="text-xs text-muted-foreground">
              Managed by your Android system settings
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (support === "unsupported") {
    return (
      <Card>
        <CardContent className="p-4 flex items-center gap-3">
          <BellOff className="h-5 w-5 text-muted-foreground shrink-0" />
          <div>
            <p className="text-sm font-medium">Notifications not supported</p>
            <p className="text-xs text-muted-foreground">
              Your browser does not support push notifications
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const isEnabled = perm === "granted" && hasSubscription;
  const isDenied = perm === "denied";
  const isIOSNotInstalled = support === "ios-needs-install";

  return (
    <>
      <Card>
        <CardContent className="p-4">
          <div className="flex items-start gap-3 mb-3">
            {isEnabled ? (
              <Check className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
            ) : isDenied ? (
              <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            ) : isIOSNotInstalled ? (
              <Smartphone className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            ) : (
              <Bell className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">
                {isEnabled
                  ? "Notifications enabled"
                  : isIOSNotInstalled
                  ? "Install app to enable notifications"
                  : isDenied
                  ? "Notifications blocked"
                  : "Enable notifications"}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {isEnabled
                  ? "You'll receive attendance, leave, expense and activity updates"
                  : isIOSNotInstalled
                  ? "iPhone requires adding the app to Home Screen first"
                  : isDenied
                  ? "Enable from your device settings to receive updates"
                  : "Get instant alerts for attendance, leaves, expenses and approvals"}
              </p>
            </div>
          </div>

          {isDenied && (
            <div className="rounded-md bg-muted p-3 mb-3 text-xs space-y-1">
              <p className="font-medium">To enable notifications:</p>
              {support === "ios-standalone" ? (
                <p className="text-muted-foreground">
                  iPhone Settings → Notifications → {companyName || "App"} → Allow Notifications
                </p>
              ) : (
                <p className="text-muted-foreground">
                  Browser site settings → Permissions → Notifications → Allow, then reload
                </p>
              )}
            </div>
          )}

          {!isEnabled && !isDenied && (
            <Button className="w-full" onClick={handleEnable} disabled={busy}>
              {busy
                ? "Enabling..."
                : isIOSNotInstalled
                ? "Show install steps"
                : "Enable Notifications"}
            </Button>
          )}
        </CardContent>
      </Card>

      <IOSInstallPrompt open={showInstall} onClose={() => setShowInstall(false)} />
    </>
  );
}
