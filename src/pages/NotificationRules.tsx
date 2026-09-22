import { motion } from "framer-motion";
import { Navigate, useNavigate, useSearchParams } from "@/lib/router-compat";
import { ArrowLeft, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useUserProfile } from "@/hooks/useUserProfile";
import { useProfilePermissions } from "@/hooks/useProfilePermissions";
import NotificationCenterTab from "@/components/notification-admin/NotificationCenterTab";
import ReportSubscriptionsTab from "@/components/notification-admin/ReportSubscriptionsTab";
import NotificationHistoryTab from "@/components/notification-admin/NotificationHistoryTab";

const TABS = [
  { value: "center", label: "Notification Center" },
  { value: "subscriptions", label: "Report Subscriptions" },
  { value: "history", label: "Notification History" },
] as const;

type TabValue = (typeof TABS)[number]["value"];

export default function NotificationRules() {
  const navigate = useNavigate();
  const { isAdmin, loading } = useUserProfile();
  const { hasModuleAccess, isLoading: permsLoading } = useProfilePermissions();
  const [params, setParams] = useSearchParams();

  const requested = params.get("tab");
  const tab: TabValue = TABS.some((t) => t.value === requested) ? (requested as TabValue) : "center";

  if (loading || permsLoading) {
    return (
      <div className="p-4 space-y-4 max-w-6xl mx-auto">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-10 w-full max-w-lg" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  // Same audience as the Admin Controls tile: full admins only.
  if (!isAdmin && !hasModuleAccess("module_admin_panel")) return <Navigate to="/admin-controls" replace />;

  return (
    <motion.div
      className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b">
        <div className="max-w-6xl mx-auto px-3 sm:px-6 py-3 sm:py-4 flex items-center gap-3">
          <Button variant="ghost" size="sm" className="p-1.5" onClick={() => navigate("/admin-controls")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="hidden sm:flex items-center justify-center h-10 w-10 rounded-lg bg-primary/10">
            <Bell className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl lg:text-2xl font-bold truncate">Notifications &amp; Reports</h1>
            <p className="text-xs sm:text-sm text-muted-foreground hidden sm:block">
              Manage automated notification rules and scheduled report subscriptions
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-3 md:px-4 py-4 md:py-5">
        <Tabs
          value={tab}
          onValueChange={(v) => {
            const next = new URLSearchParams(params);
            next.set("tab", v);
            setParams(next, { replace: true });
          }}
          className="space-y-4"
        >
          <div className="overflow-x-auto -mx-3 px-3 md:mx-0 md:px-0">
            <TabsList className="w-max">
              {TABS.map((t) => (
                <TabsTrigger key={t.value} value={t.value} className="text-xs sm:text-sm">
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <TabsContent value="center" className="mt-0">
            <NotificationCenterTab />
          </TabsContent>
          <TabsContent value="subscriptions" className="mt-0">
            <ReportSubscriptionsTab />
          </TabsContent>
          <TabsContent value="history" className="mt-0">
            <NotificationHistoryTab />
          </TabsContent>
        </Tabs>
      </div>
    </motion.div>
  );
}
