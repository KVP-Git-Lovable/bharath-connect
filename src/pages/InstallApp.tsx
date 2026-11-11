import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Download, Smartphone, Share, MoreVertical, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useBranding } from "@/hooks/useBranding";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export default function InstallApp() {
  const { companyName } = useBranding();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    const ua = navigator.userAgent;
    setIsIOS(/iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream);

    if (window.matchMedia("(display-mode: standalone)").matches) {
      setIsInstalled(true);
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);

    window.addEventListener("appinstalled", () => setIsInstalled(true));

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") setIsInstalled(true);
    setDeferredPrompt(null);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md space-y-6"
      >
        <div className="text-center space-y-3">
          <img src="/pwa-icon-512.png" alt="App Icon" className="w-24 h-24 mx-auto rounded-2xl shadow-elevated" />
          <h1 className="text-2xl font-bold text-foreground">Install {companyName || "App"}</h1>
          <p className="text-muted-foreground text-sm">
            Install this app on your device for a faster, native-like experience.
          </p>
        </div>

        {isInstalled ? (
          <Card>
            <CardContent className="p-6 text-center space-y-2">
              <Smartphone className="h-10 w-10 mx-auto text-success" />
              <p className="font-semibold text-foreground">App is installed!</p>
              <p className="text-sm text-muted-foreground">Open it from your home screen.</p>
            </CardContent>
          </Card>
        ) : deferredPrompt ? (
          <Button onClick={handleInstall} className="w-full" size="lg">
            <Download className="h-5 w-5 mr-2" />
            Install App
          </Button>
        ) : isIOS ? (
          <Card>
            <CardContent className="p-6 space-y-4">
              <p className="font-semibold text-foreground text-center">Install on iOS</p>
              <div className="space-y-3 text-sm text-muted-foreground">
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold shrink-0">1</div>
                  <p>Tap the <Share className="inline h-4 w-4 mx-1" /> Share button in Safari</p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold shrink-0">2</div>
                  <p>Scroll down and tap <Plus className="inline h-4 w-4 mx-1" /> <strong>Add to Home Screen</strong></p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold shrink-0">3</div>
                  <p>Tap <strong>Add</strong> to confirm</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-6 space-y-4">
              <p className="font-semibold text-foreground text-center">Install on Android</p>
              <div className="space-y-3 text-sm text-muted-foreground">
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold shrink-0">1</div>
                  <p>Tap the <MoreVertical className="inline h-4 w-4 mx-1" /> menu button in Chrome</p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold shrink-0">2</div>
                  <p>Tap <strong>Add to Home screen</strong></p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold shrink-0">3</div>
                  <p>Tap <strong>Install</strong> to confirm</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </motion.div>
    </div>
  );
}
