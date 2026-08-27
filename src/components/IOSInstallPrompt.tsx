import { useState } from "react";
import { Share, Plus, X, Smartphone } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { useBranding } from "@/hooks/useBranding";

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function IOSInstallPrompt({ open, onClose }: Props) {
  const { companyName } = useBranding();
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/50"
            onClick={onClose}
          />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30 }}
            className="fixed bottom-0 left-0 right-0 z-[101] bg-background rounded-t-2xl p-6 pb-8 shadow-2xl max-w-lg mx-auto"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Smartphone className="h-5 w-5 text-primary" />
                <h3 className="text-lg font-bold">Install {companyName || "App"}</h3>
              </div>
              <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1">
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-sm text-muted-foreground mb-5">
              Install the app on your iPhone to receive notifications and use it offline.
            </p>

            <ol className="space-y-4 mb-6">
              <li className="flex items-start gap-3">
                <span className="shrink-0 w-7 h-7 rounded-full bg-primary text-primary-foreground text-sm font-bold flex items-center justify-center">
                  1
                </span>
                <div className="flex-1">
                  <p className="text-sm font-medium">
                    Tap the <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted">
                      <Share className="h-3.5 w-3.5" /> Share
                    </span> button in Safari
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">at the bottom of the screen</p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <span className="shrink-0 w-7 h-7 rounded-full bg-primary text-primary-foreground text-sm font-bold flex items-center justify-center">
                  2
                </span>
                <div className="flex-1">
                  <p className="text-sm font-medium">
                    Tap <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted">
                      <Plus className="h-3.5 w-3.5" /> Add to Home Screen
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">scroll down in the share sheet if needed</p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <span className="shrink-0 w-7 h-7 rounded-full bg-primary text-primary-foreground text-sm font-bold flex items-center justify-center">
                  3
                </span>
                <div className="flex-1">
                  <p className="text-sm font-medium">Open the app from your Home Screen</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Then enable notifications from your Profile
                  </p>
                </div>
              </li>
            </ol>

            <Button className="w-full h-11" onClick={onClose}>
              Got it
            </Button>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
