import { useState } from "react";
import { format } from "date-fns";
import { Filter, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { WorkforceUser } from "@/hooks/useWorkforceOverview";

export type DatePreset = "this_week" | "last_week" | "this_month" | "custom";

interface WorkforceFiltersProps {
  users: WorkforceUser[];
  preset: DatePreset;
  onPresetChange: (preset: DatePreset) => void;
  customStart: string;
  customEnd: string;
  onCustomStartChange: (v: string) => void;
  onCustomEndChange: (v: string) => void;
  selectedUsers: string[];
  onSelectedUsersChange: (ids: string[]) => void;
  rangeLabel: string;
}

const presetLabels: Record<DatePreset, string> = {
  this_week: "This Week",
  last_week: "Last Week",
  this_month: "This Month",
  custom: "Custom Date Range",
};

export default function WorkforceFilters({
  users,
  preset,
  onPresetChange,
  customStart,
  customEnd,
  onCustomStartChange,
  onCustomEndChange,
  selectedUsers,
  onSelectedUsersChange,
  rangeLabel,
}: WorkforceFiltersProps) {
  const [search, setSearch] = useState("");

  const toggleUser = (id: string) => {
    if (selectedUsers.includes(id)) {
      onSelectedUsersChange(selectedUsers.filter((u) => u !== id));
    } else {
      onSelectedUsersChange([...selectedUsers, id]);
    }
  };

  const filteredUsers = users.filter(
    (u) =>
      (u.full_name || "").toLowerCase().includes(search.toLowerCase()) ||
      (u.username || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2">
            <Filter className="h-4 w-4" />
            Filters
            {selectedUsers.length > 0 && (
              <Badge variant="secondary" className="ml-1">
                {selectedUsers.length}
              </Badge>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80" align="start">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Date Range</Label>
              <Select value={preset} onValueChange={(v) => onPresetChange(v as DatePreset)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="this_week">This Week</SelectItem>
                  <SelectItem value="last_week">Last Week</SelectItem>
                  <SelectItem value="this_month">This Month</SelectItem>
                  <SelectItem value="custom">Custom Date Range</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {preset === "custom" && (
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">From</Label>
                  <Input
                    type="date"
                    value={customStart}
                    onChange={(e) => onCustomStartChange(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">To</Label>
                  <Input
                    type="date"
                    value={customEnd}
                    onChange={(e) => onCustomEndChange(e.target.value)}
                  />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Users</Label>
                {selectedUsers.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-auto p-0 text-xs"
                    onClick={() => onSelectedUsersChange([])}
                  >
                    Clear
                  </Button>
                )}
              </div>
              <Input
                placeholder="Search users..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8"
              />
              <ScrollArea className="h-44 rounded-md border">
                <div className="p-1">
                  {filteredUsers.map((u) => {
                    const selected = selectedUsers.includes(u.id);
                    return (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => toggleUser(u.id)}
                        className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm hover:bg-muted"
                      >
                        <span className="truncate">{u.full_name}</span>
                        {selected && <Check className="h-4 w-4 text-primary" />}
                      </button>
                    );
                  })}
                  {filteredUsers.length === 0 && (
                    <p className="px-2 py-4 text-center text-xs text-muted-foreground">
                      No users found
                    </p>
                  )}
                </div>
              </ScrollArea>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      <Badge className="bg-primary/10 text-primary border border-primary/20 font-normal">
        {presetLabels[preset]}: {rangeLabel}
      </Badge>

      {selectedUsers.length > 0 &&
        selectedUsers.map((id) => {
          const u = users.find((x) => x.id === id);
          if (!u) return null;
          return (
            <Badge key={id} variant="secondary" className="gap-1 font-normal">
              {u.full_name}
              <button onClick={() => toggleUser(id)}>
                <X className="h-3 w-3" />
              </button>
            </Badge>
          );
        })}
    </div>
  );
}
