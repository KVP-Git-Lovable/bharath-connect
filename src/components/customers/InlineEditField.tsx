import { useState, useEffect, useRef } from "react";
import { Pencil, Check, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type InlineOption = { value: string; label: string };

export type InlineEditFieldProps = {
  label: string;
  value: any;
  display?: React.ReactNode;
  type?: "text" | "textarea" | "number" | "date" | "select";
  options?: InlineOption[];
  placeholder?: string;
  onSave: (value: any) => Promise<any> | any;
  className?: string;
  fullWidth?: boolean;
  disabled?: boolean;
};

export function InlineEditField({
  label,
  value,
  display,
  type = "text",
  options = [],
  placeholder,
  onSave,
  className,
  fullWidth,
  disabled,
}: InlineEditFieldProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<any>(value ?? "");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!editing) setDraft(value ?? "");
  }, [value, editing]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      if ("select" in inputRef.current) {
        try { (inputRef.current as HTMLInputElement).select(); } catch { /* noop */ }
      }
    }
  }, [editing]);

  const start = () => { if (!disabled) { setDraft(value ?? ""); setEditing(true); } };
  const cancel = () => { setDraft(value ?? ""); setEditing(false); };
  const save = async () => {
    let out: any = draft;
    if (type === "number") out = draft === "" || draft === null ? null : Number(draft);
    if (typeof out === "string") out = out.trim() === "" ? null : out;
    if (out === (value ?? null)) { setEditing(false); return; }
    try {
      setSaving(true);
      await onSave(out);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && type !== "textarea") { e.preventDefault(); save(); }
    if (e.key === "Escape") { e.preventDefault(); cancel(); }
  };

  return (
    <div className={cn("group", fullWidth && "col-span-full", className)}>
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs text-muted-foreground">{label}</div>
        {!editing && !disabled && (
          <button
            type="button"
            onClick={start}
            className="opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity text-muted-foreground hover:text-primary"
            aria-label={`Edit ${label}`}
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {!editing ? (
        <div
          className={cn(
            "text-sm font-medium mt-0.5 min-h-[1.5rem]",
            !disabled && "cursor-pointer rounded hover:bg-muted/40 px-1 -mx-1"
          )}
          onClick={start}
        >
          {display ?? (value ? String(value) : <span className="text-muted-foreground font-normal">—</span>)}
        </div>
      ) : (
        <div className="mt-1 flex items-start gap-1.5">
          <div className="flex-1 min-w-0">
            {type === "textarea" ? (
              <Textarea
                ref={inputRef as any}
                value={draft ?? ""}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder={placeholder}
                rows={3}
                className="text-sm"
              />
            ) : type === "select" ? (
              <Select value={draft ?? ""} onValueChange={(v) => setDraft(v)}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder={placeholder} /></SelectTrigger>
                <SelectContent>
                  {options.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                ref={inputRef as any}
                type={type === "number" ? "number" : type === "date" ? "date" : "text"}
                value={draft ?? ""}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder={placeholder}
                className="h-9 text-sm"
              />
            )}
          </div>
          <Button size="icon" variant="default" className="h-9 w-9 shrink-0" onClick={save} disabled={saving} aria-label="Save">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          </Button>
          <Button size="icon" variant="outline" className="h-9 w-9 shrink-0" onClick={cancel} disabled={saving} aria-label="Cancel">
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
