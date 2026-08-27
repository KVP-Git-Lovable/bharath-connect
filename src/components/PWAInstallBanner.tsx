import { useState, useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import IOSInstallPrompt from "./IOSInstallPrompt";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const getGlobalPrompt = (): BeforeInstallPromptEvent | null =>
  (window as any).__deferredPWAPrompt ?? null;

const setGlobalPrompt = (e: BeforeInstallPromptEvent | undefined) => {
  (window as any).__deferredPWAPrompt = e;
};

export default function PWAInstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [iosSheetOpen, setIosSheetOpen] = useState(false);

  useEffect(() => {
    // Hide banner inside native APK/iOS app
    if (Capacitor.isNativePlatform()) return;
    if (window.matchMedia("(display-mode: standalone)").matches) return;

    const dismissedAt = localStorage.getItem("pwa-banner-dismissed");
    if (dismissedAt && Date.now() - Number(dismissedAt) < 24 * 60 * 60 * 1000) return;

    const ua = navigator.userAgent;
    const ios = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
    setIsIOS(ios);

    if (ios) {
      setShowBanner(true);
      return;
    }

    // Recover prompt captured globally before component mounted
    const globalPrompt = getGlobalPrompt();
    if (globalPrompt) {
      setDeferredPrompt(globalPrompt);
      setShowBanner(true);
    }

    const handler = (e: Event) => {
      e.preventDefault();
      const prompt = e as BeforeInstallPromptEvent;
      setGlobalPrompt(prompt);
      setDeferredPrompt(prompt);
      setShowBanner(true);
    };
    window.addEventListener("beforeinstallprompt", handler);

    const fallbackTimer = setTimeout(() => {
      if (!window.matchMedia("(display-mode: standalone)").matches) {
        setShowBanner(true);
      }
    }, 3000);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      clearTimeout(fallbackTimer);
    };
  }, []);

  const handleInstall = async () => {
    const prompt = deferredPrompt || getGlobalPrompt();
    if (!prompt) return;
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === "accepted") setShowBanner(false);
    setDeferredPrompt(null);
    setGlobalPrompt(undefined);
  };

  const handleDismiss = () => {
    setShowBanner(false);
    localStorage.setItem("pwa-banner-dismissed", String(Date.now()));
  };

  if (!showBanner) return null;

  const hasPrompt = !!(deferredPrompt || getGlobalPrompt());

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
                <Download className="h-5 w-5 text-foreground" />
                <span className="text-sm font-semibold text-foreground">Install App</span>
              </div>
              <button onClick={handleDismiss} className="text-muted-foreground hover:text-foreground p-1">
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-xs text-muted-foreground mb-3">
              {isIOS
                ? "Install on your iPhone to receive notifications and use offline"
                : "Install this app for a better experience"}
            </p>

            <div className="flex items-center gap-2">
              <Button
                className="flex-1 h-11 text-sm font-semibold"
                onClick={isIOS ? () => setIosSheetOpen(true) : hasPrompt ? handleInstall : handleDismiss}
              >
                <Download className="h-4 w-4 mr-2" />
                {isIOS ? "Show install steps" : "Install Now"}
              </Button>
              <Button
                variant="outline"
                className="h-11 text-sm font-medium shrink-0"
                onClick={handleDismiss}
              >
                Maybe Later
              </Button>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
      <IOSInstallPrompt open={iosSheetOpen} onClose={() => setIosSheetOpen(false)} />
    </>
  );
}
