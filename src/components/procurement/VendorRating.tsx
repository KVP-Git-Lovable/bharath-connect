import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

interface StarRatingProps {
  value: number;
  onChange?: (val: number) => void;
  readOnly?: boolean;
  size?: number;
}

export function StarRating({ value, onChange, readOnly = false, size = 22 }: StarRatingProps) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={readOnly}
          onClick={() => onChange?.(n)}
          className={cn(
            "transition-transform",
            !readOnly && "hover:scale-110 cursor-pointer",
            readOnly && "cursor-default",
          )}
          aria-label={`${n} star${n > 1 ? "s" : ""}`}
        >
          <Star
            style={{ width: size, height: size }}
            className={cn(
              n <= value ? "fill-amber-400 text-amber-400" : "fill-none text-muted-foreground/40",
            )}
          />
        </button>
      ))}
    </div>
  );
}

export interface VendorRatingFlag {
  label: string;
  emoji: string;
  className: string;
}

export function getVendorRatingFlag(avg: number | null): VendorRatingFlag {
  if (avg === null) {
    return { label: "Not Rated", emoji: "⚪", className: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400" };
  }
  if (avg >= 4.5) {
    return { label: "Preferred Vendor", emoji: "🟢", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" };
  }
  if (avg >= 3.0) {
    return { label: "Reliable", emoji: "🟡", className: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" };
  }
  if (avg >= 2.0) {
    return { label: "Needs Improvement", emoji: "🟠", className: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" };
  }
  return { label: "Poor", emoji: "🔴", className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" };
}
