import { useState, useEffect, useRef } from "react";
import { Search, X, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface UserInfo {
  id: string;
  full_name: string;
  profile_picture_url?: string;
}

interface Props {
  label: string;
  selectedUsers: UserInfo[];
  onAdd: (user: UserInfo) => void;
  onRemove: (userId: string) => void;
  /** Compact mode for inline usage in forms */
  compact?: boolean;
}

export function MultiUserPicker({ label, selectedUsers, onAdd, onRemove, compact }: Props) {
  const [showSearch, setShowSearch] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserInfo[]>([]);
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    const timeout = setTimeout(async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, profile_picture_url")
        .ilike("full_name", `%${query}%`)
        .limit(8);
      setResults((data || []).filter(u => !selectedUsers.some(s => s.id === u.id)));
    }, 250);
    return () => clearTimeout(timeout);
  }, [query, selectedUsers]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowSearch(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  if (compact) {
    return (
      <div className="space-y-1.5">
        <label className="text-sm font-medium leading-none">{label}</label>
        <div className="flex flex-wrap gap-1.5 min-h-[36px] p-2 border rounded-md bg-background">
          {selectedUsers.map(u => (
            <span key={u.id} className="inline-flex items-center gap-1 text-xs px-2 py-1 bg-secondary text-secondary-foreground rounded-full">
              <span className="w-4 h-4 rounded-full bg-primary/15 flex items-center justify-center text-primary text-[10px] font-semibold flex-shrink-0">
                {u.full_name?.charAt(0) ?? "?"}
              </span>
              {u.full_name}
              <button type="button" onClick={() => onRemove(u.id)} className="hover:text-destructive">
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
          <div className="relative" ref={searchRef}>
            <button
              type="button"
              onClick={() => setShowSearch(true)}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-1 py-1 rounded transition-colors"
            >
              <Plus className="w-3 h-3" /> Add
            </button>
            {showSearch && (
              <div className="absolute top-full left-0 mt-1 w-56 bg-popover border rounded-lg shadow-lg z-50 p-2">
                <div className="flex items-center gap-2 border-b pb-2 mb-1">
                  <Search className="w-3.5 h-3.5 text-muted-foreground" />
                  <input
                    autoFocus
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder="Search users..."
                    className="flex-1 text-sm bg-transparent border-none outline-none text-foreground placeholder:text-muted-foreground/50"
                  />
                </div>
                {results.map(u => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => { onAdd(u); setQuery(""); }}
                    className="w-full text-left flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted transition-colors"
                  >
                    <div className="w-5 h-5 rounded-full bg-primary/15 flex items-center justify-center text-primary text-[10px] font-semibold">
                      {u.full_name?.charAt(0) ?? "?"}
                    </div>
                    <span className="text-sm">{u.full_name}</span>
                  </button>
                ))}
                {query && results.length === 0 && (
                  <p className="text-xs text-muted-foreground px-2 py-1.5">No users found</p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Side panel style (non-compact)
  return (
    <div className="flex items-start gap-3">
      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider w-24 flex-shrink-0 mt-1.5">{label}</span>
      <div className="flex-1" ref={searchRef}>
        <div className="flex flex-wrap gap-1.5 min-h-[32px]">
          {selectedUsers.map(u => (
            <span key={u.id} className="inline-flex items-center gap-1.5 text-sm px-2 py-1 bg-muted/50 rounded-md group">
              <div className="w-5 h-5 rounded-full bg-primary/15 flex items-center justify-center text-primary text-[10px] font-semibold">
                {u.full_name?.charAt(0) ?? "?"}
              </div>
              {u.full_name}
              <button onClick={() => onRemove(u.id)} className="opacity-0 group-hover:opacity-100 hover:text-destructive transition-opacity">
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
          <button
            onClick={() => setShowSearch(!showSearch)}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-2 py-1.5 rounded-md hover:bg-muted/50 transition-colors"
          >
            <Plus className="w-3 h-3" /> Add
          </button>
        </div>
        {showSearch && (
          <div className="mt-1 w-64 bg-popover border rounded-lg shadow-lg z-50 p-2">
            <div className="flex items-center gap-2 border-b pb-2 mb-1">
              <Search className="w-3.5 h-3.5 text-muted-foreground" />
              <input
                autoFocus
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search users..."
                className="flex-1 text-sm bg-transparent border-none outline-none text-foreground placeholder:text-muted-foreground/50"
              />
            </div>
            {results.map(u => (
              <button
                key={u.id}
                onClick={() => { onAdd(u); setQuery(""); }}
                className="w-full text-left flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted transition-colors"
              >
                <div className="w-5 h-5 rounded-full bg-primary/15 flex items-center justify-center text-primary text-[10px] font-semibold">
                  {u.full_name?.charAt(0) ?? "?"}
                </div>
                <span className="text-sm">{u.full_name}</span>
              </button>
            ))}
            {query && results.length === 0 && (
              <p className="text-xs text-muted-foreground px-2 py-1.5">No users found</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
