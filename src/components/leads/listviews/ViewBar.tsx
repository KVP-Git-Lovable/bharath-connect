import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  BarChart3, ChevronDown, Columns3, Copy, Filter, Kanban, LayoutGrid, ListFilter, Lock, Pencil, Pin, Plus,
  PinOff, RefreshCw, Search, Settings2, SplitSquareHorizontal, Table2, Trash2,
} from "lucide-react";
import type { ListDisplayMode, ListView } from "@/lib/leadFields";

interface Props {
  views: ListView[];
  activeView: ListView | null;
  currentUserId?: string;
  onSelect: (id: string | null) => void;
  onNew: () => void;
  onEdit: (v: ListView) => void;
  onDelete: (v: ListView) => void;
  onPin: (v: ListView | null) => void;
  onClone: (v: ListView) => void;
  onFields: () => void;
  onRefresh: () => void;
  display: ListDisplayMode;
  onDisplayChange: (d: ListDisplayMode) => void;
  onKanbanSettings: () => void;
  count: number;
  search: string;
  onSearchChange: (v: string) => void;
  chartsOpen?: boolean;
  onToggleCharts?: () => void;
  filtersOpen?: boolean;
  onToggleFilters?: () => void;
}

const DISPLAY_OPTIONS: { value: ListDisplayMode; label: string; icon: typeof Table2 }[] = [
  { value: "table", label: "Table", icon: Table2 },
  { value: "cards", label: "Cards", icon: LayoutGrid },
  { value: "kanban", label: "Kanban", icon: Kanban },
  { value: "split", label: "Split View", icon: SplitSquareHorizontal },
];

export default function ViewBar({
  views,
  activeView,
  currentUserId,
  onSelect,
  onNew,
  onEdit,
  onDelete,
  onPin,
  onClone,
  onFields,
  onRefresh,
  display,
  onDisplayChange,
  onKanbanSettings,
  count,
  search,
  onSearchChange,
  chartsOpen,
  onToggleCharts,
  filtersOpen,
  onToggleFilters,
}: Props) {
  const isStandard = !!activeView?.is_standard;
  const canManage = !!activeView && !isStandard && activeView.owner_id === currentUserId;
  const standardViews = views.filter((v) => v.is_standard);
  const savedViews = views.filter((v) => !v.is_standard);
  const CurrentIcon = DISPLAY_OPTIONS.find((d) => d.value === display)?.icon ?? Table2;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card px-3 py-2 shadow-sm lg:flex-row lg:items-center lg:justify-between">
      <div className="flex min-w-0 items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="max-w-[60vw] gap-1.5 px-2 text-base font-semibold">
              <ListFilter className="h-4 w-4 shrink-0 text-primary" />
              <span className="truncate">{activeView?.name ?? "All Leads"}</span>
              <ChevronDown className="h-4 w-4 shrink-0 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="z-50 w-64 bg-popover">
            <DropdownMenuLabel className="text-xs">Standard Views</DropdownMenuLabel>
            {standardViews.map((v) => (
              <DropdownMenuItem key={v.id} onClick={() => onSelect(v.id)} className="flex items-center gap-2">
                <span className="flex-1 truncate">{v.name}</span>
                <Lock className="h-3 w-3 opacity-50" />
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs">My Views</DropdownMenuLabel>
            {savedViews.length === 0 && (
              <div className="px-2 py-1.5 text-xs text-muted-foreground">No saved views yet.</div>
            )}
            {savedViews.map((v) => (
              <DropdownMenuItem key={v.id} onClick={() => onSelect(v.id)} className="flex items-center gap-2">
                <span className="flex-1 truncate">{v.name}</span>
                <button
                  type="button"
                  title={v.is_default ? "Unpin this view" : "Pin as default view"}
                  aria-label={v.is_default ? "Unpin this view" : "Pin as default view"}
                  className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-primary"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onPin(v.is_default ? null : v);
                  }}
                >
                  {v.is_default ? <PinOff className="h-3.5 w-3.5 text-primary" /> : <Pin className="h-3.5 w-3.5" />}
                </button>
                {v.visibility !== "private" && (
                  <Badge variant="secondary" className="px-1 py-0 text-[9px]">
                    {v.visibility === "everyone" ? "All" : "Shared"}
                  </Badge>
                )}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onNew} className="gap-2">
              <Plus className="h-3.5 w-3.5" />
              New View
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <span className="shrink-0 text-xs text-muted-foreground">{count} items</span>
        {isStandard && (
          <Badge variant="secondary" className="shrink-0 gap-1 text-[10px]">
            <Lock className="h-3 w-3" /> Filters locked
          </Badge>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1 lg:max-w-xs">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search this list..."
            className="h-9 bg-background pl-8"
          />
        </div>

        {/* List view controls */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" className="h-9 w-9" title="List view controls">
              <Settings2 className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="z-50 w-56 bg-popover">
            <DropdownMenuItem onClick={onNew} className="gap-2"><Plus className="h-3.5 w-3.5" /> New</DropdownMenuItem>
            {activeView && (
              <DropdownMenuItem onClick={() => onClone(activeView)} className="gap-2">
                <Copy className="h-3.5 w-3.5" /> Clone
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={onFields} className="gap-2">
              <Columns3 className="h-3.5 w-3.5" /> Select Fields to Display
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onPin(activeView?.is_default ? null : activeView)}
              className="gap-2"
            >
              {activeView?.is_default ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
              {activeView?.is_default ? "Unpin default view" : "Pin as default"}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onKanbanSettings} className="gap-2">
              <Kanban className="h-3.5 w-3.5" /> Kanban Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={!canManage} onClick={() => canManage && onEdit(activeView!)} className="gap-2">
              <Pencil className="h-3.5 w-3.5" /> Edit filters &amp; sharing
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!canManage}
              onClick={() => canManage && onDelete(activeView!)}
              className="gap-2 text-destructive focus:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Display mode */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-9 gap-1.5 px-2.5" title="Display as">
              <CurrentIcon className="h-4 w-4" />
              <ChevronDown className="h-3.5 w-3.5 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="z-50 w-44 bg-popover">
            <DropdownMenuLabel className="text-xs">Display As</DropdownMenuLabel>
            {DISPLAY_OPTIONS.map((o) => (
              <DropdownMenuItem key={o.value} onClick={() => onDisplayChange(o.value)} className="gap-2">
                <o.icon className="h-3.5 w-3.5" />
                <span className="flex-1">{o.label}</span>
                {display === o.value && <span className="text-xs text-primary">✓</span>}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {display === "kanban" && (
          <Button variant="outline" size="icon" className="h-9 w-9" title="Kanban settings" onClick={onKanbanSettings}>
            <Kanban className="h-4 w-4" />
          </Button>
        )}

        <Button variant="outline" size="icon" className="h-9 w-9" title="Refresh" onClick={onRefresh}>
          <RefreshCw className="h-4 w-4" />
        </Button>

        {onToggleCharts && (
          <Button
            variant={chartsOpen ? "default" : "outline"}
            size="icon"
            className="h-9 w-9"
            title="Charts"
            onClick={onToggleCharts}
          >
            <BarChart3 className="h-4 w-4" />
          </Button>
        )}

        <Button
          variant={filtersOpen ? "default" : "outline"}
          size="icon"
          className="h-9 w-9"
          title="Filters"
          onClick={() => (onToggleFilters ? onToggleFilters() : canManage && onEdit(activeView!))}
        >
          <Filter className="h-4 w-4" />
        </Button>

      </div>
    </div>
  );
}
