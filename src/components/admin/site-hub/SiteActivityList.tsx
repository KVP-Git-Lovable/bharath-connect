import { Badge } from "@/components/ui/badge";
import { Activity as ActivityIcon, User, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import type { Activity } from "@/hooks/useActivities";

const STATUS_LABELS: Record<string, string> = {
  planned: "Planned",
  in_progress: "Work In Progress",
  completed: "Completed",
};

const STATUS_COLORS: Record<string, string> = {
  planned: "bg-muted text-muted-foreground",
  in_progress: "bg-info/10 text-info border-info/20",
  completed: "bg-success/10 text-success border-success/20",
};

interface Props {
  activities: Activity[];
  onOpen: (activity: Activity) => void;
}

export default function SiteActivityList({ activities, onOpen }: Props) {
  if (activities.length === 0) {
    return <p className="text-sm text-muted-foreground py-8 text-center">No activities logged for this site yet.</p>;
  }
  return (
    <div className="space-y-2">
      {activities.map((a) => (
        <button
          key={a.id}
          type="button"
          onClick={() => onOpen(a)}
          className="w-full text-left rounded-lg border p-3 hover:bg-muted/50 transition-colors flex items-center gap-3"
        >
          <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <ActivityIcon className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              {a.activity_code && (
                <Badge variant="secondary" className="text-[10px] font-mono shrink-0">{a.activity_code}</Badge>
              )}
              <span className="font-medium text-sm truncate">{a.activity_name}</span>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5">
              <span className="flex items-center gap-1"><User className="h-3 w-3" />{a.user_full_name}</span>
              <span>·</span>
              <span>{a.activity_date ? format(new Date(a.activity_date), "dd MMM yy") : ""}</span>
            </div>
          </div>
          <Badge variant="outline" className={`shrink-0 ${STATUS_COLORS[a.status] || ""}`}>
            {STATUS_LABELS[a.status] || a.status}
          </Badge>
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
        </button>
      ))}
    </div>
  );
}
