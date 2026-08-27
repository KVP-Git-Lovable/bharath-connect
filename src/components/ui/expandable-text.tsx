import { useState } from "react";
import { Eye } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ExpandableTextProps {
  text?: string | null;
  /** Title shown in the modal header */
  title?: string;
  /** Max width class for the truncated preview */
  className?: string;
}

/**
 * Compact text cell that truncates long content while keeping it fully accessible.
 * - Desktop: full text in a tooltip on hover.
 * - Mobile/tap: opens a modal with the complete text via the view icon.
 */
export function ExpandableText({
  text,
  title = "Full Details",
  className = "max-w-xs",
}: ExpandableTextProps) {
  const [open, setOpen] = useState(false);
  const value = (text ?? "").trim();

  if (!value) {
    return <span className="text-muted-foreground">--</span>;
  }

  return (
    <>
      <div className="flex items-center gap-1.5">
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className={`truncate ${className}`}>{value}</div>
            </TooltipTrigger>
            <TooltipContent className="max-w-sm whitespace-pre-wrap break-words">
              {value}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="View full text"
          className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
        >
          <Eye className="h-4 w-4" />
        </button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
            {value}
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default ExpandableText;
