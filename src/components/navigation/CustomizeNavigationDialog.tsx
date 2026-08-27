import { useState, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Settings, Plus, RotateCcw, GripVertical, ChevronUp, ChevronDown, X } from "lucide-react";
import type { NavGroup, NavPreferences } from "@/hooks/useNavigationPreferences";
import type { LucideIcon } from "lucide-react";

interface NavItem {
  icon: LucideIcon;
  label: string;
  color: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  allItems: NavItem[];
  preferences: NavPreferences | null;
  onSave: (prefs: NavPreferences) => void;
  onReset: () => void;
}

export default function CustomizeNavigationDialog({ open, onClose, allItems, preferences, onSave, onReset }: Props) {
  const [groups, setGroups] = useState<NavGroup[]>(preferences?.groups || []);
  const [itemOrder, setItemOrder] = useState<string[]>(() => {
    if (preferences?.itemOrder) {
      const grouped = new Set(preferences.groups?.flatMap((g) => g.items) || []);
      const ordered = preferences.itemOrder.filter((l) => !grouped.has(l));
      const known = new Set([...preferences.itemOrder, ...grouped]);
      const newItems = allItems.map((i) => i.label).filter((l) => !known.has(l));
      return [...ordered, ...newItems];
    }
    return allItems.map((i) => i.label);
  });
  const [newGroupName, setNewGroupName] = useState("");

  const moveItem = useCallback((index: number, direction: -1 | 1) => {
    setItemOrder((prev) => {
      const next = [...prev];
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= next.length) return prev;
      [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
      return next;
    });
  }, []);

  const createGroup = () => {
    if (!newGroupName.trim()) return;
    setGroups((prev) => [
      ...prev,
      { id: crypto.randomUUID(), name: newGroupName.trim(), items: [] },
    ]);
    setNewGroupName("");
  };

  const deleteGroup = (groupId: string) => {
    setGroups((prev) => {
      const group = prev.find((g) => g.id === groupId);
      if (group) {
        // Return items to ungrouped
        setItemOrder((order) => [...order, ...group.items]);
      }
      return prev.filter((g) => g.id !== groupId);
    });
  };

  const handleDone = () => {
    onSave({ groups, itemOrder });
    onClose();
  };

  const handleReset = () => {
    onReset();
    setGroups([]);
    setItemOrder(allItems.map((i) => i.label));
    onClose();
  };

  const getItemByLabel = (label: string) => allItems.find((i) => i.label === label);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Customize Navigation
          </DialogTitle>
        </DialogHeader>

        {/* Create New Group */}
        <div>
          <p className="text-sm font-medium mb-2">Create New Group</p>
          <div className="flex gap-2">
            <Input
              placeholder="Group name..."
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createGroup()}
            />
            <Button onClick={createGroup} size="sm" className="gap-1 shrink-0">
              <Plus className="h-4 w-4" />
              Create
            </Button>
          </div>
        </div>

        {/* Custom Groups */}
        {groups.map((group) => (
          <div key={group.id} className="border rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold">{group.name}</p>
              <div className="flex items-center gap-1">
                <span className="text-xs text-muted-foreground">{group.items.length} items</span>
                <button onClick={() => deleteGroup(group.id)} className="p-1 hover:bg-destructive/10 rounded">
                  <X className="h-3.5 w-3.5 text-destructive" />
                </button>
              </div>
            </div>
            {group.items.length === 0 && (
              <p className="text-xs text-muted-foreground italic">Drag items here (coming soon)</p>
            )}
            {group.items.map((label) => {
              const navItem = getItemByLabel(label);
              if (!navItem) return null;
              return (
                <div key={label} className="flex items-center gap-2 py-1.5">
                  <GripVertical className="h-4 w-4 text-muted-foreground" />
                  <div className={`w-7 h-7 rounded-lg bg-gradient-to-r ${navItem.color} flex items-center justify-center`}>
                    <navItem.icon className="h-3.5 w-3.5 text-white" />
                  </div>
                  <span className="text-sm">{label}</span>
                </div>
              );
            })}
          </div>
        ))}

        {/* Ungrouped Items */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold">Ungrouped</p>
            <span className="text-xs text-muted-foreground">{itemOrder.length} items</span>
          </div>
          <div className="space-y-1">
            {itemOrder.map((label, index) => {
              const navItem = getItemByLabel(label);
              if (!navItem) return null;
              return (
                <div
                  key={label}
                  className="flex items-center gap-2 py-2 px-2 rounded-lg border bg-card"
                >
                  <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className={`w-7 h-7 rounded-lg bg-gradient-to-r ${navItem.color} flex items-center justify-center shrink-0`}>
                    <navItem.icon className="h-3.5 w-3.5 text-white" />
                  </div>
                  <span className="text-sm flex-1">{label}</span>
                  <div className="flex items-center gap-0.5">
                    <button
                      onClick={() => moveItem(index, -1)}
                      disabled={index === 0}
                      className="p-1 rounded hover:bg-muted disabled:opacity-30"
                    >
                      <ChevronUp className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => moveItem(index, 1)}
                      disabled={index === itemOrder.length - 1}
                      className="p-1 rounded hover:bg-muted disabled:opacity-30"
                    >
                      <ChevronDown className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 pt-2">
          <Button variant="outline" onClick={handleReset} className="gap-1.5 flex-1">
            <RotateCcw className="h-4 w-4" />
            Reset to Default
          </Button>
          <Button onClick={handleDone} className="flex-1">
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
