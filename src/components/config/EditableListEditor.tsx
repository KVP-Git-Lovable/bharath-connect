import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { X, Plus } from "lucide-react";

export function EditableListEditor({
  title, items, onChange, placeholder = "New item",
}: { title?: string; items: string[]; onChange: (items: string[]) => void; placeholder?: string }) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const v = draft.trim();
    if (!v) return;
    if (items.some((i) => i.toLowerCase() === v.toLowerCase())) return;
    onChange([...items, v]);
    setDraft("");
  };
  return (
    <div className="space-y-2">
      {title && <p className="text-sm font-semibold">{title}</p>}
      <div className="space-y-2">
        {items.map((item, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <Input value={item} onChange={(e) => {
              const next = [...items]; next[idx] = e.target.value; onChange(next);
            }} />
            <Button type="button" variant="ghost" size="icon"
              className="shrink-0 text-muted-foreground hover:text-destructive"
              onClick={() => onChange(items.filter((_, i) => i !== idx))}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <Input value={draft} placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
        <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={add}>
          <Plus className="h-4 w-4 mr-1" /> Add
        </Button>
      </div>
    </div>
  );
}

export interface LeaveTypeItem { name: string; maxDays: number; }

export function LeaveTypeEditor({
  items, onChange,
}: { items: LeaveTypeItem[]; onChange: (items: LeaveTypeItem[]) => void }) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const v = draft.trim();
    if (!v) return;
    if (items.some((i) => i.name.toLowerCase() === v.toLowerCase())) return;
    onChange([...items, { name: v, maxDays: 0 }]);
    setDraft("");
  };
  return (
    <div className="space-y-2">
      <div className="space-y-2">
        {items.map((item, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <Input value={item.name} onChange={(e) => {
              const next = [...items]; next[idx] = { ...next[idx], name: e.target.value }; onChange(next);
            }} />
            <Input type="number" min={0} value={item.maxDays} className="w-28 shrink-0" title="Max days"
              onChange={(e) => {
                const next = [...items]; next[idx] = { ...next[idx], maxDays: Number(e.target.value) }; onChange(next);
              }} />
            <Button type="button" variant="ghost" size="icon"
              className="shrink-0 text-muted-foreground hover:text-destructive"
              onClick={() => onChange(items.filter((_, i) => i !== idx))}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <Input value={draft} placeholder="New leave type"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
        <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={add}>
          <Plus className="h-4 w-4 mr-1" /> Add
        </Button>
      </div>
    </div>
  );
}
