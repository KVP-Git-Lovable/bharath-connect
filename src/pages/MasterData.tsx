import { useMemo } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ListChecks, Flag, Compass, Gauge, Briefcase, CheckCircle } from "lucide-react";
import { useProfilePermissions } from "@/hooks/useProfilePermissions";

const allMasterModules = [
  {
    title: "Activity Type Master",
    description: "Configure activity types and their settings",
    icon: ListChecks,
    color: "bg-green-100 text-green-600",
    path: "/activity-types",
    module: "module_activities" as string | null,
  },
  {
    title: "Activity Outcomes",
    description: "Manage activity outcomes (Productive, Not started…)",
    icon: CheckCircle,
    color: "bg-teal-100 text-teal-600",
    path: "/master-data/activity-outcomes",
    module: "module_activities" as string | null,
  },
  {
    title: "Lead Statuses",
    description: "Lifecycle statuses (New, Qualified, Converted…)",
    icon: Flag,
    color: "bg-blue-100 text-blue-600",
    path: "/master-data/lead-statuses",
    module: "module_leads" as string | null,
  },
  {
    title: "Lead Sources",
    description: "Where leads come from (Event, Referral, Website…)",
    icon: Compass,
    color: "bg-emerald-100 text-emerald-600",
    path: "/master-data/lead-sources",
    module: "module_leads" as string | null,
  },
  {
    title: "Industries",
    description: "Lead industry classifications (IT, Manufacturing, Retail…)",
    icon: Briefcase,
    color: "bg-slate-100 text-slate-600",
    path: "/master-data/industries",
    module: "module_leads" as string | null,
  },
  {
    title: "Lead Scoring Rules",
    description: "BANT scoring thresholds & qualification tiers",
    icon: Gauge,
    color: "bg-indigo-100 text-indigo-600",
    path: "/master-data/lead-scoring",
    module: "module_leads" as string | null,
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

export default function MasterData() {
  const navigate = useNavigate();
  const { hasModuleAccess } = useProfilePermissions();

  const visibleModules = useMemo(
    () => allMasterModules.filter((m) => !m.module || hasModuleAccess(m.module)),
    [hasModuleAccess]
  );

  return (
    <motion.div
      className="p-4 space-y-6 max-w-6xl mx-auto"
      variants={container}
      initial="hidden"
      animate="show"
    >
      <motion.div variants={item}>
        <h1 className="text-2xl font-bold">Master Data</h1>
        <p className="text-sm text-muted-foreground">
          Manage master and configuration data in one place
        </p>
      </motion.div>

      <motion.div variants={item} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {visibleModules.map((module) => {
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

        {visibleModules.length === 0 && (
          <div className="col-span-full text-center py-12">
            <p className="text-muted-foreground text-sm">No master data modules available</p>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
