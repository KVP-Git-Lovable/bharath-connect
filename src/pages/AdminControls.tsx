import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Users,
  CalendarDays,
  DollarSign,
  Lock,
  Building2,
  ArrowLeft,
  Search,
  ListChecks,
  SlidersHorizontal,
  Database,
} from "lucide-react";
import { useProfilePermissions } from "@/hooks/useProfilePermissions";
import { useUserProfile } from "@/hooks/useUserProfile";

const allAdminModules = [
  {
    title: "User Management",
    description: "Manage user accounts, roles, and permissions",
    icon: Users,
    color: "bg-orange-100 text-orange-600",
    path: "/admin/users",
    permission: "field_admin_user_management",
  },
  {
    title: "Attendance Management",
    description: "Manage user attendance, holidays, and leave approvals",
    icon: CalendarDays,
    color: "bg-purple-100 text-purple-600",
    path: "/admin/attendance",
    permission: "field_admin_attendance_mgmt",
  },
  {
    title: "Security & Access",
    description: "Manage user profiles, permissions, and data access control",
    icon: Lock,
    color: "bg-blue-100 text-blue-600",
    path: "/admin/security",
    permission: "field_admin_security_access",
  },
  {
    title: "Company Profile",
    description: "Manage company details, bank information, and header branding",
    icon: Building2,
    color: "bg-indigo-100 text-indigo-600",
    path: "/admin/company",
    permission: "field_admin_company_profile",
  },
  {
    title: "Configuration & Approval Workflow",
    description: "Control every module's settings, features, and approval workflows",
    icon: SlidersHorizontal,
    color: "bg-emerald-100 text-emerald-600",
    path: "/admin/configuration",
    permission: "field_admin_company_profile",
  },
  {
    title: "Master Data",
    description: "Manage categories, products, UOM, opportunity stages, event types, and more",
    icon: Database,
    color: "bg-amber-100 text-amber-600",
    path: "/master-data",
    module: "module_master_data",
  },
];

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06 } },
};
const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0 },
};

export default function AdminControls() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const { hasModuleAccess, hasFieldPermission } = useProfilePermissions();
  const { isAdmin } = useUserProfile();

  const visibleModules = useMemo(() => {
    // Admin users (isAdmin = true) automatically get full access to all admin modules
    // Non-admins require explicit permission checks
    const hasFullAdmin = isAdmin || hasModuleAccess("module_admin_panel");
    return allAdminModules.filter((m) => {
      if (m.module) return hasFullAdmin || hasModuleAccess(m.module);
      if (!m.permission) return hasFullAdmin;
      return hasFullAdmin || hasFieldPermission(m.permission, "read");
    });
  }, [hasModuleAccess, hasFieldPermission, isAdmin]);

  const filteredModules = visibleModules.filter(
    (m) =>
      (m.title || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (m.description || "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <motion.div
      className="p-4 space-y-6 max-w-6xl mx-auto"
      variants={container}
      initial="hidden"
      animate="show"
    >
      {/* Header */}
      <motion.div variants={item}>
        <h1 className="text-2xl font-bold">Admin Controls</h1>
        <p className="text-sm text-muted-foreground">Manage different aspects of your system</p>
      </motion.div>

      {/* Search */}
      <motion.div variants={item} className="max-w-md">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search admin modules..."
            className="pl-9"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </motion.div>

      {/* Module Grid */}
      <motion.div variants={item} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredModules.map((module) => {
          const Icon = module.icon;
          return (
            <Card
              key={module.path}
              className="cursor-pointer hover:shadow-elevated transition-shadow"
              onClick={() => navigate(module.path)}
            >
              <CardHeader className="text-center pb-2">
                <div className={`mx-auto mb-3 p-4 rounded-full w-16 h-16 flex items-center justify-center ${module.color}`}>
                  <Icon className="h-7 w-7" />
                </div>
                <CardTitle className="text-base">{module.title}</CardTitle>
                <CardDescription className="text-xs">{module.description}</CardDescription>
              </CardHeader>
            </Card>
          );
        })}

        {filteredModules.length === 0 && (
          <div className="col-span-full text-center py-12">
            <p className="text-muted-foreground text-sm">
              No modules found matching "{searchQuery}"
            </p>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
