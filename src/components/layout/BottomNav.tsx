import { useMemo } from "react";
import {
  Home,
  Clock,
  ClipboardList,
  Building2,
  MoreHorizontal,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useProfilePermissions } from "@/hooks/useProfilePermissions";

const allTabs = [
  { label: "Home", icon: Home, to: "/dashboard", module: null },
  { label: "Attendance", icon: Clock, to: "/attendance", module: "module_attendance" },
  { label: "Activities", icon: ClipboardList, to: "/activities", module: "module_activities" },
  { label: "Sites", icon: Building2, to: "/sites", module: "module_sites" },
  { label: "More", icon: MoreHorizontal, to: "/more", module: null },
];

export function BottomNav() {
  const { hasModuleAccess } = useProfilePermissions();

  const tabs = useMemo(
    () => allTabs.filter((tab) => !tab.module || hasModuleAccess(tab.module)),
    [hasModuleAccess]
  );

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card shadow-bottom-nav border-t border-border safe-bottom md:hidden">
      <div className="flex items-center justify-around h-16">
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className="flex flex-col items-center justify-center gap-0.5 px-2 py-1 text-muted-foreground transition-colors min-w-[56px]"
            activeClassName="text-primary"
          >
            <tab.icon className="h-5 w-5" />
            <span className="text-[10px] font-medium">{tab.label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
