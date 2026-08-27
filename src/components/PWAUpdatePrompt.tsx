import { useEffect, useState } from "react";
import { RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";

/**
 * Listens for a waiting service worker and shows a "Update available — Refresh"
 * banner. Uses the "sw-waiting" custom event dispatched from src/main.tsx.
 */
export default function PWAUpdatePrompt() {
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const worker = (e as CustomEvent<ServiceWorker>).detail;
      if (worker) setWaitingWorker(worker);
    };
    window.addEventListener("sw-waiting", handler as EventListener);
    return () => window.removeEventListener("sw-waiting", handler as EventListener);
  }, []);

  if (!waitingWorker) return null;

  const refresh = () => {
    waitingWorker.postMessage({ type: "SKIP_WAITING" });
    // When the new SW takes control, reload once.
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      () => window.location.reload(),
      { once: true }
    );
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        className="fixed top-3 left-1/2 -translate-x-1/2 z-[60] bg-background border border-border shadow-elevated rounded-lg px-3 py-2 flex items-center gap-2 max-w-[92vw]"
      >
        <RefreshCw className="h-4 w-4 text-primary shrink-0" />
        <span className="text-sm text-foreground">Update available</span>
        <Button size="sm" className="h-8" onClick={refresh}>
          Refresh
        </Button>
        <button
          onClick={() => setWaitingWorker(null)}
          className="text-muted-foreground hover:text-foreground p-1"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </motion.div>
    </AnimatePresence>
  );
}
