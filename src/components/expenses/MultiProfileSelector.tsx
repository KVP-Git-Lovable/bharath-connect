import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface Props {
  excludeIds: string[];
  onAdd: (selections: { id: string; name: string }[]) => void;
  label: string;
  managersOnly?: boolean;
}

const MultiProfileSelector = React.memo<Props>(({ excludeIds, onAdd, label, managersOnly }) => {
  const [profiles, setProfiles] = useState<{ id: string; full_name: string }[]>([]);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    (async () => {
      if (managersOnly) {
        const { data: subs } = await supabase.from("users").select("reporting_manager_id").not("reporting_manager_id", "is", null);
        const ids = Array.from(new Set((subs || []).map((u: any) => u.reporting_manager_id).filter(Boolean)));
        if (!ids.length) { setProfiles([]); return; }
        const { data } = await supabase.from("users").select("id, full_name").in("id", ids).order("full_name");
        setProfiles((data || []).filter((p: any) => !excludeIds.includes(p.id)) as any);
      } else {
        const { data } = await supabase.from("users").select("id, full_name").eq("is_active", true).order("full_name");
        setProfiles((data || []).filter((p: any) => !excludeIds.includes(p.id)) as any);
      }
      setSelected(new Set());
      setSearch("");
    })();
  }, [open, excludeIds, managersOnly]);

  const filtered = search.trim()
    ? profiles.filter((p) => (p.full_name || "").toLowerCase().includes(search.toLowerCase()))
    : profiles;

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const confirm = () => {
    const sel = profiles.filter((p) => selected.has(p.id)).map((p) => ({ id: p.id, name: p.full_name || "Unnamed" }));
    if (sel.length) onAdd(sel);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
          <Plus className="h-3.5 w-3.5" />
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0" align="start">
        <div className="p-2 border-b">
          <div className="relative">
            <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
            <Input placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} className="h-7 text-xs pl-7" />
          </div>
        </div>
        <ScrollArea className="h-[220px]">
          <div className="p-1.5 space-y-0.5">
            {filtered.map((p) => (
              <div key={p.id}
                className={cn("flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer text-xs transition-colors",
                  selected.has(p.id) ? "bg-primary/10" : "hover:bg-muted/50")}
                onClick={() => toggle(p.id)}>
                <Checkbox checked={selected.has(p.id)} onCheckedChange={() => toggle(p.id)} className="h-3.5 w-3.5" />
                <span className="truncate">{p.full_name || "Unnamed"}</span>
              </div>
            ))}
            {!filtered.length && <div className="text-center py-4 text-xs text-muted-foreground">No users available</div>}
          </div>
        </ScrollArea>
        {selected.size > 0 && (
          <div className="p-2 border-t">
            <Button size="sm" className="w-full h-7 text-xs" onClick={confirm}>Add {selected.size} Selected</Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
});
MultiProfileSelector.displayName = "MultiProfileSelector";
export default MultiProfileSelector;
