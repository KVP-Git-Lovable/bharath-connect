import { ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function ConfigSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <div className="rounded-lg border border-border/60 divide-y divide-border/60">{children}</div>
    </div>
  );
}

export function ConfigToggleRow({
  label, description, checked, onChange, disabled,
}: { label: string; description?: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 p-3">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </div>
  );
}

export function ConfigSelectRow({
  label, description, value, onChange, options,
}: { label: string; description?: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <div className="flex items-center justify-between gap-4 p-3">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-48 shrink-0"><SelectValue /></SelectTrigger>
        <SelectContent>
          {options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

export function ConfigNumberRow({
  label, description, value, onChange, prefix, min = 0,
}: { label: string; description?: string; value: number; onChange: (v: number) => void; prefix?: string; min?: number }) {
  return (
    <div className="flex items-center justify-between gap-4 p-3">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {prefix && <span className="text-sm text-muted-foreground">{prefix}</span>}
        <Input type="number" min={min} value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          onBlur={(e) => onChange(Number(e.target.value))}
          className="w-28" />
      </div>
    </div>
  );
}

export function ConfigTimeRow({
  label, description, value, onChange,
}: { label: string; description?: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center justify-between gap-4 p-3">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      <Input type="time" value={value} onChange={(e) => onChange(e.target.value)} className="w-32 shrink-0" />
    </div>
  );
}

export function ConfigInfoMessage({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-border/60 p-6 text-center">
      <p className="text-sm text-muted-foreground">{children}</p>
    </div>
  );
}

export { Label };
