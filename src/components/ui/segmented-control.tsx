import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

interface SegmentedControlProps<T extends string> {
  value: T;
  onValueChange: (value: T) => void;
  options: readonly SegmentedOption<T>[];
  /** Accessible name for the group, e.g. "TA calculation method". */
  label: string;
  /** Prefix for the generated option ids — must be unique on the page. */
  idPrefix: string;
  className?: string;
}

/**
 * A single-choice mode switch. Built on RadioGroup so arrow-key navigation,
 * focus handling and screen-reader semantics come for free — the segmented
 * look is styling only. Segments share equal width.
 */
export function SegmentedControl<T extends string>({
  value,
  onValueChange,
  options,
  label,
  idPrefix,
  className,
}: SegmentedControlProps<T>) {
  return (
    <RadioGroup
      value={value}
      onValueChange={(v) => onValueChange(v as T)}
      aria-label={label}
      className={cn("inline-grid gap-0 overflow-hidden rounded-md border bg-background", className)}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((o) => {
        const id = `${idPrefix}-${o.value}`;
        return (
          <div key={o.value} className="flex">
            <RadioGroupItem id={id} value={o.value} className="peer sr-only" />
            <label
              htmlFor={id}
              className={cn(
                "flex-1 cursor-pointer select-none px-5 py-2 text-center text-sm font-medium transition-colors",
                "peer-focus-visible:outline peer-focus-visible:-outline-offset-2 peer-focus-visible:outline-2 peer-focus-visible:outline-ring",
                value === o.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted/50",
              )}
            >
              {o.label}
            </label>
          </div>
        );
      })}
    </RadioGroup>
  );
}
