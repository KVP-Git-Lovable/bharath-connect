import { useState } from "react";
import { motion } from "framer-motion";
import { Navigate, useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  SlidersHorizontal, Activity, Building2, ShoppingCart, PackageCheck,
  Wallet, CalendarDays, Clock, FileBarChart, Users, Store, ArrowLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useUserProfile } from "@/hooks/useUserProfile";
import { useProfilePermissions } from "@/hooks/useProfilePermissions";
import { ModulePanel } from "@/components/config/panels";

// Only modules that also appear in the main navigation are configurable here.
// `permission` mirrors the nav item's module gate; `null` means the nav item
// is always visible (no permission gate), so it should always show.
const MODULES = [
  { id: "activities", label: "Activities", icon: Activity, permission: "module_activities" as string | null },
  { id: "attendance", label: "Attendance", icon: Clock, permission: "module_attendance" },
  { id: "gps_track", label: "GPS Track", icon: Activity, permission: "module_gps_tracking" },
  { id: "leads", label: "Leads", icon: Users, permission: "module_leads" },
  { id: "reports", label: "Reports", icon: FileBarChart, permission: null },
] as const;

export default function ConfigurationWorkflow() {
  const navigate = useNavigate();
  const { isAdmin, loading } = useUserProfile();
  const { hasModuleAccess, isLoading: permsLoading } = useProfilePermissions();
  const visibleModules = MODULES.filter((m) => !m.permission || hasModuleAccess(m.permission));
  const [activeModule, setActiveModule] = useState<string>("activities");
  const [tab, setTab] = useState<"config" | "approval">("config");

  if (loading || permsLoading) {
    return (
      <div className="p-4 space-y-4 max-w-6xl mx-auto">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!isAdmin) return <Navigate to="/admin-controls" replace />;

  const current = visibleModules.find((m) => m.id === activeModule) ?? visibleModules[0];
  if (!current) {
    return (
      <div className="p-6 max-w-6xl mx-auto text-sm text-muted-foreground">
        No modules are currently enabled. Enable modules in Security to configure them here.
      </div>
    );
  }

  return (
    <motion.div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b">
        <div className="max-w-6xl mx-auto px-3 sm:px-6 py-3 sm:py-4 flex items-center gap-3">
          <Button variant="ghost" size="sm" className="p-1.5" onClick={() => navigate("/admin-controls")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="hidden sm:flex items-center justify-center h-10 w-10 rounded-lg bg-primary/10">
            <SlidersHorizontal className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl lg:text-2xl font-bold truncate">Configuration & Approval Workflow</h1>
            <p className="text-xs sm:text-sm text-muted-foreground hidden sm:block">
              Control every module's settings, features and approval flows
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-3 md:px-4 py-4 md:py-5">
        <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-4">
          <Card className="border-border/60 h-fit">
            <CardContent className="p-2">
              <nav className="flex md:flex-col gap-1 overflow-x-auto">
                {visibleModules.map((m) => {
                  const Icon = m.icon;
                  const active = m.id === activeModule;
                  return (
                    <button key={m.id}
                      onClick={() => { setActiveModule(m.id); setTab("config"); }}
                      className={cn(
                        "flex items-center gap-2 rounded-md px-3 py-2 text-sm text-left whitespace-nowrap transition-colors",
                        active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
                      )}>
                      <Icon className="h-4 w-4 shrink-0" />
                      {m.label}
                    </button>
                  );
                })}
              </nav>
            </CardContent>
          </Card>

          <Card className="border-border/60">
            <CardContent className="p-4 md:p-5">
              <div className="flex items-center gap-2 mb-4">
                <current.icon className="h-5 w-5 text-foreground" />
                <h2 className="text-lg font-semibold">{current.label}</h2>
              </div>

              <Tabs value={tab} onValueChange={(v) => setTab(v as "config" | "approval")}>
                <TabsList className="mb-4">
                  <TabsTrigger value="config">Configuration</TabsTrigger>
                  <TabsTrigger value="approval">Approval Workflow</TabsTrigger>
                </TabsList>
                <TabsContent value="config">
                  <ModulePanel module={activeModule} tab="config" />
                </TabsContent>
                <TabsContent value="approval">
                  <ModulePanel module={activeModule} tab="approval" />
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </div>
    </motion.div>
  );
}
