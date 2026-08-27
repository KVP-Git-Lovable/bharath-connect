import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Star } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  PRESET_OPTIONS,
  PresetKey,
  DateFieldOption,
  DateScopeState,
  presetLabel,
  loadFavouritePreset,
  saveFavouritePreset,
} from "./dateScope";
import { useMemo, useState } from "react";

export function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <Input type="date" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

export function SelectField({
  label,
  value,
  onChange,
  options,
  allLabel = "All",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  allLabel?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{allLabel}</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/**
 * Date field + range preset selector shared by every report module.
 * The chosen preset can be starred, which makes it the default next time.
 */
export function DateScopeFilter({
  module,
  fields,
  state,
  onChange,
  from,
  to,
}: {
  module: string;
  fields: DateFieldOption[];
  state: DateScopeState;
  onChange: (patch: Partial<DateScopeState>) => void;
  from: string;
  to: string;
}) {
  const [favourite, setFavourite] = useState<PresetKey | null>(() => loadFavouritePreset(module));

  const toggleFavourite = () => {
    const next = favourite === state.preset ? null : state.preset;
    setFavourite(next);
    saveFavouritePreset(next, module);
    toast.success(next ? `${presetLabel(next)} saved as favourite` : "Favourite cleared");
  };

  const sortedPresets = useMemo(() => {
    if (!favourite) return PRESET_OPTIONS;
    return [
      ...PRESET_OPTIONS.filter((o) => o.value === favourite),
      ...PRESET_OPTIONS.filter((o) => o.value !== favourite),
    ];
  }, [favourite]);

  return (
    <>
      <div className="space-y-1.5">
        <Label className="text-xs">Date Field</Label>
        <Select value={state.field} onValueChange={(v) => onChange({ field: v })}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {fields.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Date Range</Label>
        <div className="flex items-center gap-1.5">
          <Select value={state.preset} onValueChange={(v) => onChange({ preset: v as PresetKey })}>
            <SelectTrigger className="flex-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {sortedPresets.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {favourite === o.value ? `★ ${o.label}` : o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={toggleFavourite}
            aria-label={favourite === state.preset ? "Remove favourite" : "Set as favourite"}
            title={favourite === state.preset ? "Remove favourite" : "Set as favourite"}
          >
            <Star className={`h-4 w-4 ${favourite === state.preset ? "fill-current text-primary" : ""}`} />
          </Button>
        </div>
        {state.preset !== "custom" && (
          <p className="text-[11px] text-muted-foreground">
            {format(new Date(from), "dd MMM yyyy")} – {format(new Date(to), "dd MMM yyyy")}
          </p>
        )}
      </div>

      {state.preset === "custom" && (
        <>
          <DateField
            label="From Date"
            value={state.customFrom}
            onChange={(v) => onChange({ customFrom: v })}
          />
          <DateField label="To Date" value={state.customTo} onChange={(v) => onChange({ customTo: v })} />
        </>
      )}
    </>
  );
}
