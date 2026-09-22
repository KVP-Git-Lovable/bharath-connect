import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "@/lib/router-compat";
import { formatDistanceToNow } from "date-fns";
import { ArrowLeft, Bell, CheckCheck, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { notificationRoute } from "@/utils/notificationRoute";

type Item = {
  id: string;
  title: string;
  message: string;
  type: string | null;
  is_read: boolean | null;
  related_id: string | null;
  metadata: unknown;
  created_at: string;
};

const PAGE = 30;

export default function MyNotifications() {
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null>(null);
  const [tab, setTab] = useState<"all" | "unread">("all");
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  const load = useCallback(
    async (offset: number) => {
      if (!userId) return;
      let q = supabase
        .from("notifications")
        .select("id, title, message, type, is_read, related_id, metadata, created_at")
        .eq("user_id", userId)
        .eq("is_dismissed", false)
        .is("deleted_at", null)
        .neq("type", "device_offline")
        .order("created_at", { ascending: false })
        .range(offset, offset + PAGE - 1);
      if (tab === "unread") q = q.eq("is_read", false);
      const { data, error } = await q;
      if (error) throw error;
      const rows = (data || []) as Item[];
      setItems((prev) => (offset === 0 ? rows : [...prev, ...rows]));
      setHasMore(rows.length === PAGE);
    },
    [userId, tab]
  );

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    load(0)
      .catch((e) => toast.error("Could not load notifications", { description: (e as Error).message }))
      .finally(() => setLoading(false));
  }, [userId, tab, load]);

  const open = async (n: Item) => {
    if (!n.is_read) {
      setItems((prev) =>
        tab === "unread" ? prev.filter((x) => x.id !== n.id) : prev.map((x) => (x.id === n.id ? { ...x, is_read: true } : x))
      );
      await supabase.from("notifications").update({ is_read: true }).eq("id", n.id);
    }
    const route = notificationRoute(n);
    if (route) navigate(route);
  };

  const dismiss = async (n: Item) => {
    setItems((prev) => prev.filter((x) => x.id !== n.id));
    const { error } = await supabase.from("notifications").update({ is_dismissed: true, is_read: true }).eq("id", n.id);
    if (error) toast.error("Could not dismiss", { description: error.message });
  };

  const markAll = async () => {
    if (!userId) return;
    const { error } = await supabase.from("notifications").update({ is_read: true }).eq("user_id", userId).eq("is_read", false);
    if (error) return toast.error("Could not mark all read", { description: error.message });
    setItems((prev) => (tab === "unread" ? [] : prev.map((x) => ({ ...x, is_read: true }))));
  };

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      await load(items.length);
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b">
        <div className="max-w-3xl mx-auto px-3 sm:px-6 py-3 flex items-center gap-3">
          <Button variant="ghost" size="sm" className="p-1.5" onClick={() => navigate(-1)} aria-label="Back">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-lg sm:text-xl font-bold flex-1">Notifications</h1>
          <Button variant="ghost" size="sm" className="text-xs" onClick={markAll}>
            <CheckCheck className="h-4 w-4 mr-1" /> Mark all read
          </Button>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-3 sm:px-6 py-4 space-y-3">
        <Tabs value={tab} onValueChange={(v) => setTab(v as "all" | "unread")}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="unread">Unread</TabsTrigger>
          </TabsList>
        </Tabs>

        {loading ? (
          <div className="space-y-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
        ) : items.length === 0 ? (
          <div className="py-16 text-center space-y-2">
            <Bell className="h-8 w-8 mx-auto text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{tab === "unread" ? "You're all caught up." : "No notifications yet."}</p>
          </div>
        ) : (
          <div className="rounded-lg border divide-y bg-card">
            {items.map((n) => (
              <div key={n.id} className={`flex items-start gap-2 px-3 py-3 ${n.is_read ? "" : "bg-primary/5"}`}>
                <button className="flex-1 min-w-0 text-left" onClick={() => open(n)}>
                  <div className="flex items-start gap-2">
                    {!n.is_read && <span className="mt-1.5 h-2 w-2 rounded-full bg-primary shrink-0" aria-label="Unread" />}
                    <div className="min-w-0">
                      <p className={`text-sm leading-snug ${n.is_read ? "" : "font-semibold"}`}>{n.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-3">{n.message}</p>
                      <p className="text-[10px] text-muted-foreground/70 mt-1">
                        {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                </button>
                <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => dismiss(n)} aria-label="Dismiss">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {hasMore && !loading && (
          <Button variant="outline" className="w-full" onClick={loadMore} disabled={loadingMore}>
            {loadingMore && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />} Load more
          </Button>
        )}
      </div>
    </div>
  );
}
