import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Building2, Users, Target, CalendarRange, ArrowRight } from "lucide-react";
import { format } from "date-fns";

export interface SiteCardData {
  id: string;
  site_name: string;
  status: string;
  start_date: string;
  end_date: string | null;
}

const STATUS_STYLES: Record<
  string,
  { label: string; chip: string; bar: string; accent: string; ring: string }
> = {
  planned: {
    label: "Planned",
    chip: "bg-info/15 text-info border-info/30",
    bar: "from-info/70 to-info",
    accent: "from-info/15 to-transparent",
    ring: "bg-info",
  },
  started: {
    label: "Started",
    chip: "bg-warning/15 text-warning border-warning/30",
    bar: "from-warning/70 to-warning",
    accent: "from-warning/15 to-transparent",
    ring: "bg-warning",
  },
  completed: {
    label: "Completed",
    chip: "bg-success/15 text-success border-success/30",
    bar: "from-success/70 to-success",
    accent: "from-success/15 to-transparent",
    ring: "bg-success",
  },
  dropped: {
    label: "Dropped",
    chip: "bg-destructive/15 text-destructive border-destructive/30",
    bar: "from-destructive/70 to-destructive",
    accent: "from-destructive/15 to-transparent",
    ring: "bg-destructive",
  },
};

function initials(name: string) {
  return name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
}

interface Props {
  site: SiteCardData;
  assignedNames: string[];
  progress: number;
  milestoneCount: number;
  onOpen: () => void;
}

export default function SiteCard({ site, assignedNames, progress, milestoneCount, onOpen }: Props) {
  const s = STATUS_STYLES[site.status] || STATUS_STYLES.planned;

  return (
    <motion.button
      type="button"
      onClick={onOpen}
      whileHover={{ y: -4 }}
      transition={{ type: "spring", stiffness: 300, damping: 22 }}
      className="group relative text-left rounded-2xl border bg-card shadow-card hover:shadow-elevated transition-shadow overflow-hidden w-full flex flex-col"
    >
      {/* status accent header */}
      <div className={`absolute inset-x-0 top-0 h-24 bg-gradient-to-b ${s.accent} pointer-events-none`} />
      <div className={`absolute left-0 top-0 h-full w-1 ${s.ring}`} />

      <div className="relative p-4 flex flex-col gap-3.5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shrink-0 shadow-sm">
              <Building2 className="h-5 w-5 text-primary-foreground" />
            </div>
            <div className="min-w-0">
              <span className="font-semibold block truncate leading-tight">{site.site_name}</span>
              <span className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                <CalendarRange className="h-3 w-3 shrink-0" />
                {site.start_date ? format(new Date(site.start_date), "dd MMM yy") : "—"}
                {" – "}
                {site.end_date ? format(new Date(site.end_date), "dd MMM yy") : "Ongoing"}
              </span>
            </div>
          </div>
          <Badge variant="outline" className={`shrink-0 border ${s.chip}`}>{s.label}</Badge>
        </div>

        <div className="space-y-1.5">
          <div className="flex justify-between text-[11px] font-medium">
            <span className="flex items-center gap-1 text-muted-foreground">
              <Target className="h-3 w-3" /> {milestoneCount} milestone{milestoneCount !== 1 ? "s" : ""}
            </span>
            <span className="text-foreground">{progress}%</span>
          </div>
          <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
            <div className={`h-full rounded-full bg-gradient-to-r ${s.bar} transition-all`} style={{ width: `${progress}%` }} />
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 border-t pt-3">
          <div className="flex items-center gap-2 min-w-0">
            <Users className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            {assignedNames.length === 0 ? (
              <span className="text-xs text-muted-foreground">No users assigned</span>
            ) : (
              <div className="flex items-center gap-1.5 min-w-0">
                <Avatar className="h-6 w-6 shrink-0">
                  <AvatarFallback className="text-[9px] bg-primary/10 text-primary">{initials(assignedNames[0])}</AvatarFallback>
                </Avatar>
                <span className="text-xs truncate">
                  {assignedNames[0]}
                  {assignedNames.length > 1 && (
                    <span className="text-muted-foreground"> +{assignedNames.length - 1} more</span>
                  )}
                </span>
              </div>
            )}
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0 group-hover:translate-x-0.5 group-hover:text-primary transition-all" />
        </div>
      </div>
    </motion.button>
  );
}
