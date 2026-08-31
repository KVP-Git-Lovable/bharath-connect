import { Check, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface StageItem {
  id: string;
  name: string;
}

/** Salesforce-style clickable path showing the lead's current stage. */
export function LeadStagePath({
  stages,
  currentId,
  onSelect,
  disabled,
}: {
  stages: StageItem[];
  currentId?: string | null;
  onSelect: (id: string) => void;
  disabled?: boolean;
}) {
  if (!stages.length) return null;
  const currentIdx = stages.findIndex((s) => s.id === currentId);

  return (
    <div className="-mx-1 overflow-x-auto pb-1">
      <div className="flex min-w-max items-center gap-1 px-1">
        {stages.map((s, i) => {
          const done = currentIdx > -1 && i < currentIdx;
          const active = i === currentIdx;
          return (
            <button
              key={s.id}
              type="button"
              disabled={disabled}
              onClick={() => onSelect(s.id)}
              aria-current={active ? "step" : undefined}
              className={cn(
                "relative flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                "disabled:cursor-not-allowed disabled:opacity-60",
                active
                  ? "border-primary bg-primary text-primary-foreground shadow-sm"
                  : done
                    ? "border-emerald-300 bg-emerald-100 text-emerald-800 line-through decoration-emerald-500/70 hover:bg-emerald-200 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-300"
                    : "border-dashed border-border bg-muted/30 text-muted-foreground/70 hover:bg-muted",
              )}
            >
              {done && <Check className="h-3 w-3" />}
              {s.name}
              {i < stages.length - 1 && (
                <ChevronRight className="h-3 w-3 opacity-50 -mr-1" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
