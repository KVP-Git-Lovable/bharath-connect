import { useOfflineActivitySync } from "@/hooks/useOfflineActivitySync";
import { CloudOff, RefreshCw, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function OfflineActivityBanner() {
  const { online, queue, syncing, progress, retry } = useOfflineActivitySync();
  const failed = queue.filter((q) => q.status === "failed").length;
  const pending = queue.length;

  if (online && pending === 0 && !syncing) return null;

  let content: React.ReactNode = null;
  let bg = "bg-amber-500/95";

  if (!online) {
    bg = "bg-slate-800/95";
    content = (
      <>
        <CloudOff className="h-4 w-4" />
        <span>Offline — activities will sync when back online{pending ? ` (${pending} queued)` : ""}.</span>
      </>
    );
  } else if (syncing && progress) {
    bg = "bg-blue-600/95";
    content = (
      <>
        <RefreshCw className="h-4 w-4 animate-spin" />
        <span>Syncing {progress.current} of {progress.total} activities…</span>
      </>
    );
  } else if (failed > 0) {
    bg = "bg-red-600/95";
    content = (
      <>
        <AlertTriangle className="h-4 w-4" />
        <span>{failed} activit{failed === 1 ? "y" : "ies"} failed to sync.</span>
        <Button size="sm" variant="secondary" className="h-6 px-2 ml-2" onClick={retry}>Retry</Button>
      </>
    );
  } else if (pending > 0) {
    bg = "bg-amber-500/95";
    content = (
      <>
        <RefreshCw className="h-4 w-4" />
        <span>{pending} activit{pending === 1 ? "y" : "ies"} pending sync…</span>
      </>
    );
  }

  return (
    <div className={`${bg} text-white text-xs px-3 py-1.5 flex items-center justify-center gap-2 shadow-sm`}>
      {content}
    </div>
  );
}
