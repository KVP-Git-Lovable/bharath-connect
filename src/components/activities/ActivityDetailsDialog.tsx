import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Activity, MapPin, Clock, CheckCircle2, PlayCircle, CircleDot, Pencil, Trash2 } from "lucide-react";
import { format, parseISO } from "date-fns";
import ActivityPhotoManager from "@/components/activities/ActivityPhotoManager";
import ActivityEffortSection from "@/components/activities/ActivityEffortSection";
import ActivityGeoStamp from "@/components/activities/ActivityGeoStamp";
import type { Activity as ActivityType, ActivityPhotoEntry } from "@/hooks/useActivities";

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

const STATUS_ICON: Record<string, React.ReactNode> = {
  planned: <CircleDot className="h-3.5 w-3.5 text-muted-foreground" />,
  in_progress: <PlayCircle className="h-3.5 w-3.5 text-info" />,
  completed: <CheckCircle2 className="h-3.5 w-3.5 text-success" />,
};

interface ActivityDetailsDialogProps {
  activity: ActivityType | null;
  open: boolean;
  onClose: () => void;
  onSavePhotos?: (photos: ActivityPhotoEntry[]) => Promise<void> | void;
  attendance?: { check_in_time: string | null; check_out_time: string | null } | null;
  onEdit?: (activity: ActivityType) => void;
  onDelete?: (id: string) => void;
  onSavedEffort?: () => void;
}

export default function ActivityDetailsDialog({ activity, open, onClose, onSavePhotos, attendance, onEdit, onDelete, onSavedEffort }: ActivityDetailsDialogProps) {
  if (!activity) return null;

  const history = [...(activity.status_history || [])].sort(
    (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime()
  );

  const canAddPhotos = !!onSavePhotos && activity.status !== "completed";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[480px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 pr-6">
            <Activity className="h-4 w-4 shrink-0" />
            <span className="truncate">{activity.activity_name}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-1">
          {/* Status + type */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              {activity.activity_code && (
                <Badge variant="secondary" className="font-mono text-[10px] shrink-0">{activity.activity_code}</Badge>
              )}
              <p className="text-xs text-muted-foreground truncate">{activity.activity_type}</p>
            </div>
            <Badge variant="outline" className={STATUS_COLORS[activity.status] || ""}>
              {STATUS_LABELS[activity.status] || activity.status}
            </Badge>
          </div>

          {/* Owner */}
          {activity.user_full_name && (
            <p className="text-xs text-muted-foreground">By {activity.user_full_name}</p>
          )}

          {/* Check-in / out */}
          {attendance && (attendance.check_in_time || attendance.check_out_time) && (
            <div className="rounded-lg border p-3 space-y-1">
              <p className="text-xs font-semibold flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" /> Check-in / Check-out
              </p>
              {attendance.check_in_time && (
                <p className="text-xs text-muted-foreground">Check-in: {format(parseISO(attendance.check_in_time), "MMM d, yyyy h:mm a")}</p>
              )}
              {attendance.check_out_time && (
                <p className="text-xs text-muted-foreground">Check-out: {format(parseISO(attendance.check_out_time), "MMM d, yyyy h:mm a")}</p>
              )}
            </div>
          )}

          {/* Description */}
          {activity.description && (
            <div>
              <p className="text-xs font-semibold mb-1">Description</p>
              <p className="text-xs text-muted-foreground whitespace-pre-wrap">{activity.description}</p>
            </div>
          )}

          {/* Linked milestone */}
          {activity.milestone_name && (
            <div className="rounded-lg border p-3">
              <p className="text-xs font-semibold flex items-center gap-1.5 mb-0.5">
                <CircleDot className="h-3.5 w-3.5" /> Linked Milestone
              </p>
              <p className="text-xs text-muted-foreground">{activity.milestone_name}</p>
            </div>
          )}

          {/* Times */}
          {(activity.start_time || activity.end_time) && (
            <div className="rounded-lg border p-3 space-y-1">
              <p className="text-xs font-semibold flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" /> Timing
              </p>
              {activity.start_time && (
                <p className="text-xs text-muted-foreground">
                  Check-in: {format(parseISO(activity.start_time), "MMM d, yyyy h:mm a")}
                </p>
              )}
              {activity.end_time && (
                <p className="text-xs text-muted-foreground">
                  Check-out: {format(parseISO(activity.end_time), "MMM d, yyyy h:mm a")}
                  {activity.start_time && (
                    <span className="ml-1.5 font-medium text-foreground">
                      ({Math.max(0, Math.round((new Date(activity.end_time).getTime() - new Date(activity.start_time).getTime()) / 60000))} min spent)
                    </span>
                  )}
                </p>
              )}
              {activity.total_hours ? (
                <p className="text-xs text-muted-foreground">Duration: {activity.total_hours}h</p>
              ) : null}
            </div>
          )}

          {/* Geo stamp */}
          <ActivityGeoStamp activity={activity} />

          {/* Next follow-up */}
          {(activity as any).next_follow_up_date && (
            <div className="rounded-lg border p-3">
              <p className="text-xs font-semibold flex items-center gap-1.5 mb-0.5">
                <Clock className="h-3.5 w-3.5" /> Next Follow-up
              </p>
              <p className="text-xs text-muted-foreground">
                {format(parseISO(String((activity as any).next_follow_up_date).slice(0, 10)), "MMM d, yyyy")}
              </p>
            </div>
          )}

          {/* Effort */}
          <ActivityEffortSection activity={activity} onSaved={onSavedEffort} />


          {/* Status history */}
          <div>
            <p className="text-xs font-semibold mb-2">Status History</p>
            {history.length === 0 ? (
              <p className="text-xs text-muted-foreground">No status changes recorded yet</p>
            ) : (
              <div className="relative pl-1">
                <div className="absolute left-[10px] top-1 bottom-1 w-px bg-border" />
                <div className="space-y-3">
                  {history.map((h, idx) => (
                    <div key={idx} className="flex gap-2.5 relative">
                      <div className="z-10 h-5 w-5 rounded-full bg-card border flex items-center justify-center shrink-0">
                        {STATUS_ICON[h.status] || <CircleDot className="h-3.5 w-3.5" />}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-medium">{STATUS_LABELS[h.status] || h.status}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {format(parseISO(h.at), "MMM d, yyyy h:mm a")}
                        </p>
                        {h.address ? (
                          <p className="text-[11px] text-muted-foreground line-clamp-2">
                            <MapPin className="h-2.5 w-2.5 inline mr-0.5" />
                            {h.address}
                          </p>
                        ) : h.lat && h.lng ? (
                          <p className="text-[11px] text-muted-foreground font-mono">
                            {Number(h.lat).toFixed(4)}, {Number(h.lng).toFixed(4)}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <Separator />

          {/* Photos */}
          <div>
            <p className="text-xs font-semibold mb-2">Photos ({activity.photo_urls?.length || 0})</p>
            <ActivityPhotoManager
              photos={activity.photo_urls || []}
              editable={canAddPhotos}
              onChange={canAddPhotos ? (photos) => onSavePhotos?.(photos) : undefined}
            />
          </div>

          {(onEdit || onDelete) && (
            <>
              <Separator />
              <div className="flex items-center gap-2">
                {onEdit && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => { onEdit(activity); onClose(); }}
                  >
                    <Pencil className="h-3.5 w-3.5 mr-1.5" /> Edit
                  </Button>
                )}
                {onDelete && (
                  <Button
                    variant="destructive"
                    size="sm"
                    className="flex-1"
                    onClick={() => { onDelete(activity.id); onClose(); }}
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Delete
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
