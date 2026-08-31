import { useBranding } from "@/hooks/useBranding";
import { useState, useCallback, useRef, useEffect, useMemo, lazy, Suspense } from "react";
import { useUserProfile } from "@/hooks/useUserProfile";
import { useProfilePermissions } from "@/hooks/useProfilePermissions";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { NotificationBell } from "@/components/NotificationBell";
import { useQuery } from "@tanstack/react-query";
import { useNavigationPreferences } from "@/hooks/useNavigationPreferences";
import {
  Menu,
  ArrowLeft,
  Building2,
  LogOut,
  UserCheck,
  Navigation2,
  FolderKanban,
  Users2,
  Shield,
  Handshake,
  AlertTriangle,
  Receipt,
  ClipboardList,
  ListChecks,
  ShoppingCart,
  Truck,
  X,
  Search,
  Settings,
  FileBarChart,
  Target,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { NavLink } from "@/components/NavLink";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { motion, AnimatePresence } from "framer-motion";
import bbLogo from "@/assets/bb_logo.png";
import { SignedAvatarImage, SignedImage } from "@/components/ui/signed-image";

const CustomizeNavigationDialog = lazy(() => import("@/components/navigation/CustomizeNavigationDialog"));
const DraggableNavGrid = lazy(() => import("@/components/navigation/DraggableNavGrid"));

const allNavigationItems = [
  { icon: UserCheck, label: "Attendance", href: "/attendance", color: "from-blue-500 to-blue-600", module: "module_attendance" },
  { icon: Navigation2, label: "GPS Track", href: "/gps-tracking", color: "from-purple-500 to-purple-600", module: "module_gps_tracking" },
  { icon: ClipboardList, label: "Activities", href: "/activities", color: "from-teal-500 to-teal-600", module: "module_activities" },
  { icon: Building2, label: "Projects/Sites", href: "/sites", color: "from-cyan-500 to-cyan-600", module: "module_sites" as string | null },
  { icon: Users2, label: "My Team", href: "/my-team", color: "from-indigo-500 to-indigo-600", module: "module_my_team" as string | null },
  { icon: ShoppingCart, label: "Procurement", href: "/procurement", color: "from-rose-500 to-rose-600", module: "module_procurement" },
  { icon: Truck, label: "Goods Receipt", href: "/grn", color: "from-pink-500 to-pink-600", module: "module_procurement" },
  { icon: Receipt, label: "Expenses", href: "/expenses", color: "from-amber-500 to-amber-600", module: "module_expenses" },
  { icon: Handshake, label: "Customers", href: "/customers", color: "from-sky-500 to-sky-600", module: "module_customers" },
  { icon: Target, label: "Opportunities", href: "/opportunities", color: "from-violet-500 to-violet-600", module: "module_opportunities" },
  { icon: Users2, label: "Leads", href: "/leads", color: "from-fuchsia-500 to-fuchsia-600", module: "module_leads" },
  { icon: Users2, label: "Events", href: "/events", color: "from-pink-500 to-pink-600", module: "module_events" },
  { icon: FileBarChart, label: "Reports", href: "/reports", color: "from-teal-500 to-teal-600", module: "module_reports" as string | null },
];

const adminItems = [
  { icon: Shield, label: "Admin Controls", href: "/admin-controls", color: "from-emerald-500 to-emerald-600", module: "module_admin_panel" },
];

export function AppHeader() {
  const navigate = useNavigate();
  const location = useLocation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isLogoutDialogOpen, setIsLogoutDialogOpen] = useState(false);
  const [isCustomizeOpen, setIsCustomizeOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const { profile, isAdmin, initials } = useUserProfile();
  const { hasModuleAccess } = useProfilePermissions();
  const displayName = profile?.full_name || profile?.username || "";
  const menuRef = useRef<HTMLDivElement>(null);

  const { companyName: brandName, logoUrl: companyLogo, loading: brandingLoading } = useBranding();
  const companyName = brandName || (brandingLoading ? "" : "Company");

  const showBackButton = location.pathname !== "/dashboard" && location.pathname !== "/";

  const navigationItems = useMemo(
    () => allNavigationItems.filter((item) => !item.module || hasModuleAccess(item.module)),
    [hasModuleAccess]
  );

  const visibleAdminItems = useMemo(
    () => isAdmin ? adminItems : adminItems.filter((item) => hasModuleAccess(item.module)),
    [hasModuleAccess, isAdmin]
  );

  const allLabels = useMemo(() => navigationItems.map((i) => i.label), [navigationItems]);
  const { preferences, save, reset, getOrderedItems } = useNavigationPreferences(allLabels);

  // Apply ordering
  const orderedNavItems = useMemo(() => {
    const ordered = getOrderedItems();
    return ordered
      .map((label) => navigationItems.find((i) => i.label === label))
      .filter(Boolean) as typeof navigationItems;
  }, [getOrderedItems, navigationItems]);

  // Apply search filter
  const filteredNavItems = useMemo(() => {
    if (!searchQuery.trim()) return orderedNavItems;
    const q = searchQuery.toLowerCase();
    return orderedNavItems.filter((item) => item.label.toLowerCase().includes(q));
  }, [orderedNavItems, searchQuery]);

  // Close menu on outside click
  useEffect(() => {
    if (!isMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isMenuOpen]);

  // Close menu on route change
  useEffect(() => {
    setIsMenuOpen(false);
    setSearchQuery("");
    setIsSearchOpen(false);
  }, [location.pathname]);

  const handleMenuItemClick = useCallback(() => {
    setIsMenuOpen(false);
  }, []);

  const handleBackClick = useCallback(() => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate("/dashboard");
    }
  }, [navigate]);

  return (
    <>
      {/* Top Navbar */}
      <nav className="sticky top-0 z-50 gradient-hero text-primary-foreground shadow-lg safe-top">
        <div className="px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {showBackButton && (
                <button
                  onClick={handleBackClick}
                  className="p-1 rounded-lg hover:bg-white/10 transition-colors"
                >
                  <ArrowLeft size={16} />
                </button>
              )}
              <NavLink to="/dashboard" className="flex items-center gap-2 hover:opacity-80 transition-opacity text-primary-foreground">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center overflow-hidden bg-white/90 p-0.5">
                  {companyLogo ? (
                    <img src={companyLogo} alt={companyName || "Logo"} className="w-full h-full object-contain" />
                  ) : brandingLoading ? null : (
                    <Building2 className="w-5 h-5 text-primary" />
                  )}
                </div>
                <div>
                  <h1 className="text-base font-semibold">{companyName}</h1>
                </div>
              </NavLink>
            </div>

            <div className="flex items-center gap-1">
              <NotificationBell />
              <button
                onClick={() => setIsMenuOpen((prev) => !prev)}
                className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
              >
                <Menu size={20} />
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Side Drawer Overlay + Panel */}
      <AnimatePresence>
        {isMenuOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 bg-black/40 z-50"
              onClick={() => setIsMenuOpen(false)}
            />
            {/* Drawer */}
            <motion.div
              ref={menuRef}
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="fixed top-0 right-0 bottom-0 w-[75vw] max-w-[320px] sm:w-[320px] bg-card shadow-elevated overflow-y-auto z-50"
            >
              {/* User Profile Section */}
              <div className="gradient-hero text-primary-foreground px-4 py-4 safe-top">
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => {
                      navigate("/more");
                      handleMenuItemClick();
                    }}
                    className="flex items-center gap-3 hover:opacity-80 transition-opacity"
                  >
                    <Avatar className="h-12 w-12 border-2 border-primary-foreground/30">
                      {profile?.profile_picture_url ? (
                        <SignedAvatarImage src={profile.profile_picture_url} alt={displayName} />
                      ) : null}
                      <AvatarFallback className="bg-primary-foreground/20 text-primary-foreground">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col items-start">
                      <span className="text-lg font-bold">{displayName}</span>
                      <div className="flex items-center gap-1.5 text-xs opacity-90 mt-0.5">
                        <Shield className="h-3.5 w-3.5" />
                        <span className="font-medium">{isAdmin ? "Admin" : "User"}</span>
                      </div>
                    </div>
                  </button>
                  <button
                    onClick={() => setIsMenuOpen(false)}
                    className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>

              <div className="p-4 space-y-5">
                {/* Admin Controls */}
                {visibleAdminItems.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-muted-foreground mb-3 px-1">Admin Controls</h3>
                    <div className="grid grid-cols-3 gap-3">
                      {visibleAdminItems.map((item) => (
                        <NavLink
                          key={item.href}
                          to={item.href}
                          onClick={handleMenuItemClick}
                          className="flex flex-col items-center gap-2 p-3 rounded-xl hover:bg-muted/50 transition-colors"
                        >
                          <div className={`inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-r ${item.color} shadow-md`}>
                            <item.icon className="h-5 w-5 text-white" />
                          </div>
                          <span className="text-xs font-medium text-center leading-tight">{item.label}</span>
                        </NavLink>
                      ))}
                    </div>
                  </div>
                )}

                {/* Navigation Grid */}
                {filteredNavItems.length > 0 || navigationItems.length > 0 ? (
                  <div>
                    <div className="flex items-center justify-between mb-3 px-1">
                      <h3 className="text-sm font-semibold text-muted-foreground">Navigation</h3>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setIsSearchOpen((prev) => !prev)}
                          className="p-1.5 rounded-lg hover:bg-muted transition-colors"
                        >
                          <Search className="h-4 w-4 text-muted-foreground" />
                        </button>
                        <button
                          onClick={() => setIsCustomizeOpen(true)}
                          className="p-1.5 rounded-lg hover:bg-muted transition-colors"
                        >
                          <Settings className="h-4 w-4 text-muted-foreground" />
                        </button>
                      </div>
                    </div>

                    {/* Search Input */}
                    <AnimatePresence>
                      {isSearchOpen && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.15 }}
                          className="overflow-hidden mb-3"
                        >
                          <Input
                            placeholder="Search modules..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="h-9 text-sm"
                            autoFocus
                          />
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <Suspense fallback={<div className="grid grid-cols-3 gap-3">{filteredNavItems.map((item) => (
                      <div key={item.label} className="flex flex-col items-center gap-2 p-3 rounded-xl">
                        <div className={`inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-r ${item.color} shadow-md`}>
                          <item.icon className="h-5 w-5 text-white" />
                        </div>
                        <span className="text-xs font-medium text-center leading-tight">{item.label}</span>
                      </div>
                    ))}</div>}>
                      <DraggableNavGrid
                        items={filteredNavItems}
                        onReorder={(newOrder) => save({ groups: preferences?.groups || [], itemOrder: newOrder })}
                        onItemClick={handleMenuItemClick}
                      />
                    </Suspense>

                    {filteredNavItems.length === 0 && searchQuery && (
                      <p className="text-xs text-muted-foreground text-center py-4">No modules found</p>
                    )}
                  </div>
                ) : null}

                {/* Logout */}
                <div className="pt-2 border-t">
                  <button
                    onClick={() => setIsLogoutDialogOpen(true)}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-destructive hover:bg-destructive/10 transition-colors group"
                  >
                    <div className="w-9 h-9 rounded-lg bg-destructive/10 flex items-center justify-center group-hover:bg-destructive/20 transition-colors">
                      <LogOut className="h-4 w-4 text-destructive" />
                    </div>
                    <span className="text-sm font-medium">Logout</span>
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Customize Navigation Dialog */}
      {isCustomizeOpen && (
        <Suspense fallback={null}>
          <CustomizeNavigationDialog
            open={isCustomizeOpen}
            onClose={() => setIsCustomizeOpen(false)}
            allItems={navigationItems.map((i) => ({ icon: i.icon, label: i.label, color: i.color }))}
            preferences={preferences}
            onSave={save}
            onReset={reset}
          />
        </Suspense>
      )}

      {/* Logout Confirmation */}
      <AlertDialog open={isLogoutDialogOpen} onOpenChange={setIsLogoutDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Confirm Logout
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to log out? You will need to sign in again to access the app.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                setIsLogoutDialogOpen(false);
                await supabase.auth.signOut();
                navigate("/auth");
              }}
            >
              Logout
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
