import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Target,
  Activity as ActivityIcon,
  Loader2,
  AlertTriangle,
  MessageSquare,
  Send,
  Trash2,
  Plus,
  CornerDownRight,
  Pencil,
  User,
  ChevronDown,
  ChevronRight,
  LayoutGrid,
  Rows3,
} from "lucide-react";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { format, formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { MILESTONE_STATUSES, milestoneStatusLabel } from "@/components/admin/SiteMilestonesDialog";
import { statusFromProgress } from "@/utils/milestoneProgress";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import type { HubMilestone } from "@/hooks/useSiteHub";
import type { Activity } from "@/hooks/useActivities";
import { cn } from "@/lib/utils";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  not_started: "secondary",
  in_progress: "default",
  completed: "default",
  delayed: "destructive",
  on_hold: "outline",
};

function fmt(d?: string | null) {
  return d ? format(new Date(d), "dd MMM yy") : "—";
}

interface Comment {
  id: string;
  milestone_id: string;
  user_id: string;
  content: string;
  created_at: string;
  author_name?: string;
}

interface Props {
  siteId: string;
  milestones: HubMilestone[];
  activities?: Activity[];
  onChanged?: () => void;
  onAddSubMilestone?: (parentId: string, parentName: string) => void;
  onEditMilestone?: (m: HubMilestone) => void;
  onOpenActivity?: (a: Activity) => void;
}

async function saveMilestoneProgress(id: string, pct: number, currentStatus?: string | null) {
  const clamped = Math.min(100, Math.max(0, Math.round(pct)));
  const status = statusFromProgress(clamped, currentStatus);
  const { error } = await supabase
    .from("site_milestones")
    .update({ percent_complete: clamped, status })
    .eq("id", id);
  if (error) throw error;
}

async function rollUpParent(parentId: string, parentStatus: string | null | undefined) {
  const { data, error } = await supabase
    .from("site_milestones")
    .select("percent_complete")
    .eq("parent_id", parentId);
  if (error) throw error;
  const rows = data || [];
  if (rows.length === 0) return;
  const avg = Math.round(rows.reduce((s, r: any) => s + (r.percent_complete || 0), 0) / rows.length);
  await saveMilestoneProgress(parentId, avg, parentStatus);
}

const DEPTH_ACCENTS = [
  "text-primary border-primary/40 hover:bg-primary/10",
  "text-emerald-600 border-emerald-500/40 hover:bg-emerald-500/10 dark:text-emerald-400",
  "text-purple-600 border-purple-500/40 hover:bg-purple-500/10 dark:text-purple-400",
  "text-orange-600 border-orange-500/40 hover:bg-orange-500/10 dark:text-orange-400",
];

interface MilestoneCardProps {
  siteId: string;
  m: HubMilestone;
  childrenList: HubMilestone[];
  childrenByParent: Record<string, HubMilestone[]>;
  activityCount: Record<string, number>;
  activitiesById: Record<string, Activity[]>;
  comments: Comment[];
  onCommentAdded: () => void;
  onChanged?: () => void;
  currentUserId?: string;
  onAddSubMilestone?: (parentId: string, parentName: string) => void;
  onEditMilestone?: (m: HubMilestone) => void;
  onOpenActivity?: (a: Activity) => void;
  depth: number;
  ancestorPath: string[];
}

function MilestoneCard({
  siteId,
  m,
  childrenList,
  childrenByParent,
  activityCount,
  activitiesById,
  comments,
  onCommentAdded,
  onChanged,
  currentUserId,
  onAddSubMilestone,
  onEditMilestone,
  onOpenActivity,
  depth,
  ancestorPath,
}: MilestoneCardProps) {
  const hasChildren = childrenList.length > 0;
  const linked = activityCount[m.id] || 0;
  const linkedActivities = activitiesById[m.id] || [];
  const [draft, setDraft] = useState<number>(m.percent_complete ?? 0);
  const [saving, setSaving] = useState(false);
  const [togglingRisk, setTogglingRisk] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [showActivities, setShowActivities] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [newComment, setNewComment] = useState("");
  const [postingComment, setPostingComment] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [riskReason, setRiskReason] = useState("");
  const [showRiskDialog, setShowRiskDialog] = useState(false);
  const [inlineDraft, setInlineDraft] = useState<null | {
    name: string;
    start_date: string;
    end_date: string;
    status: string;
  }>(null);
  const [savingInline, setSavingInline] = useState(false);

  const openInlineAdd = () => {
    setExpanded(true);
    setInlineDraft({
      name: "",
      start_date: m.start_date || new Date().toISOString().split("T")[0],
      end_date: m.end_date || "",
      status: "not_started",
    });
  };

  const saveInline = async () => {
    if (!inlineDraft) return;
    const name = inlineDraft.name.trim();
    if (!name) { toast.error("Name is required"); return; }
    if (!inlineDraft.start_date) { toast.error("Start date is required"); return; }
    if (!inlineDraft.end_date) { toast.error("End date is required"); return; }
    if (inlineDraft.end_date < inlineDraft.start_date) { toast.error("End cannot be before Start"); return; }
    setSavingInline(true);
    try {
      const { error } = await supabase.from("site_milestones").insert({
        site_id: siteId,
        parent_id: m.id,
        name,
        start_date: inlineDraft.start_date,
        end_date: inlineDraft.end_date,
        status: inlineDraft.status,
        percent_complete: 0,
        is_active: true,
      });
      if (error) throw error;
      toast.success("Sub-task added");
      setInlineDraft(null);
      onChanged?.();
    } catch (err: any) {
      toast.error(err.message || "Could not add sub-task");
    } finally {
      setSavingInline(false);
    }
  };

  const collectDescendantIds = (id: string): string[] => {
    const kids = childrenByParent[id] || [];
    return kids.flatMap((k) => [k.id, ...collectDescendantIds(k.id)]);
  };

  const descendantCount = useMemo(() => collectDescendantIds(m.id).length, [m.id, childrenByParent]);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const ids = collectDescendantIds(m.id);
      if (ids.length) {
        const { error: cErr } = await supabase.from("site_milestones").delete().in("id", ids);
        if (cErr) throw cErr;
      }
      const { error } = await supabase.from("site_milestones").delete().eq("id", m.id);
      if (error) throw error;
      toast.success(ids.length ? "Milestone and sub-tasks deleted" : "Milestone deleted");
      setConfirmDelete(false);
      onChanged?.();
    } catch (err: any) {
      toast.error(err.message || "Could not delete milestone");
    } finally {
      setDeleting(false);
    }
  };

  useEffect(() => {
    if (hasChildren) {
      const avg = childrenList.length
        ? Math.round(childrenList.reduce((s, c) => s + (c.percent_complete || 0), 0) / childrenList.length)
        : 0;
      setDraft(avg);
    } else {
      setDraft(m.percent_complete ?? 0);
    }
  }, [m.percent_complete, hasChildren, childrenList]);

  const commitProgress = async (val: number) => {
    if (hasChildren) return;
    if (val === (m.percent_complete ?? 0)) return;
    setSaving(true);
    try {
      await saveMilestoneProgress(m.id, val, m.status);
      if (m.parent_id) await rollUpParent(m.parent_id, null);
      toast.success("Progress updated");
      onChanged?.();
    } catch (err: any) {
      toast.error(err.message || "Could not update progress");
      setDraft(m.percent_complete ?? 0);
    } finally {
      setSaving(false);
    }
  };

  const clearAtRisk = async () => {
    setTogglingRisk(true);
    try {
      const { error } = await supabase.from("site_milestones").update({ at_risk: false }).eq("id", m.id);
      if (error) throw error;
      toast.success("At Risk flag cleared");
      onChanged?.();
    } catch (err: any) {
      toast.error(err.message || "Could not update flag");
    } finally {
      setTogglingRisk(false);
    }
  };

  const confirmFlagAtRisk = async () => {
    const reason = riskReason.trim();
    if (!reason) {
      toast.error("Please enter a reason for flagging At Risk");
      return;
    }
    if (!currentUserId) {
      toast.error("You must be signed in");
      return;
    }
    setTogglingRisk(true);
    try {
      const { error: flagErr } = await supabase
        .from("site_milestones")
        .update({ at_risk: true })
        .eq("id", m.id);
      if (flagErr) throw flagErr;
      const { error: commentErr } = await supabase
        .from("site_milestone_comments")
        .insert({
          milestone_id: m.id,
          user_id: currentUserId,
          content: `⚠️ Flagged At Risk: ${reason}`,
        });
      if (commentErr) throw commentErr;
      toast.success("Flagged as At Risk");
      setRiskReason("");
      setShowRiskDialog(false);
      onCommentAdded();
      onChanged?.();
    } catch (err: any) {
      toast.error(err.message || "Could not flag At Risk");
    } finally {
      setTogglingRisk(false);
    }
  };

  const onAtRiskClick = () => {
    if (m.at_risk) clearAtRisk();
    else setShowRiskDialog(true);
  };

  const changeStatus = async (newStatus: string) => {
    if (newStatus === m.status) return;
    setSavingStatus(true);
    try {
      const { error } = await supabase.from("site_milestones").update({ status: newStatus }).eq("id", m.id);
      if (error) throw error;
      toast.success("Status updated");
      onChanged?.();
    } catch (err: any) {
      toast.error(err.message || "Could not update status");
    } finally {
      setSavingStatus(false);
    }
  };

  const postComment = async () => {
    const content = newComment.trim();
    if (!content || !currentUserId) return;
    setPostingComment(true);
    try {
      const { error } = await supabase
        .from("site_milestone_comments")
        .insert({ milestone_id: m.id, user_id: currentUserId, content });
      if (error) throw error;
      setNewComment("");
      onCommentAdded();
    } catch (err: any) {
      toast.error(err.message || "Could not post comment");
    } finally {
      setPostingComment(false);
    }
  };

  const deleteComment = async (commentId: string) => {
    try {
      const { error } = await supabase.from("site_milestone_comments").delete().eq("id", commentId);
      if (error) throw error;
      onCommentAdded();
    } catch (err: any) {
      toast.error(err.message || "Could not delete comment");
    }
  };

  const addChildAccent = DEPTH_ACCENTS[depth % DEPTH_ACCENTS.length];
  const AddChildIcon = depth === 0 ? Plus : CornerDownRight;
  const cardComments = comments.filter((c) => c.milestone_id === m.id);

  return (
    <div
      className={cn(
        "rounded-lg border p-3 space-y-2.5",
        m.at_risk && "border-amber-400 bg-amber-50/60 dark:bg-amber-950/20"
      )}
    >
      {depth > 0 && ancestorPath.length > 0 && (
        <p className="text-[10px] text-muted-foreground -mb-1 truncate">
          {ancestorPath.join(" → ")} →
        </p>
      )}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {hasChildren && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="text-muted-foreground hover:text-foreground shrink-0"
              aria-label={expanded ? "Collapse" : "Expand"}
            >
              {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
          )}
          <Target className="h-4 w-4 text-primary shrink-0" />
          <span className="font-medium text-sm truncate flex-1 min-w-0">{m.name}</span>
          {m.at_risk && (
            <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border-amber-300 gap-1 shrink-0">
              <AlertTriangle className="h-3 w-3" /> At Risk
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-wrap sm:flex-nowrap sm:shrink-0">
          <Select value={m.status} onValueChange={changeStatus} disabled={savingStatus}>
            <SelectTrigger className="h-7 flex-1 sm:flex-none sm:w-[130px] text-xs px-2 min-w-[110px]">
              <SelectValue>
                <Badge variant={STATUS_VARIANT[m.status] || "secondary"} className="text-[10px] px-1.5 py-0">
                  {milestoneStatusLabel(m.status)}
                </Badge>
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {MILESTONE_STATUSES.map((s) => (
                <SelectItem key={s.value} value={s.value} className="text-xs">
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="icon"
            variant={m.at_risk ? "default" : "outline"}
            className={cn("h-7 w-7 shrink-0", m.at_risk && "bg-amber-500 hover:bg-amber-600 text-white border-amber-500")}
            title={m.at_risk ? "Clear At Risk flag" : "Flag as At Risk"}
            onClick={onAtRiskClick}
            disabled={togglingRisk}
          >
            <AlertTriangle className="h-3.5 w-3.5" />
          </Button>
          {onEditMilestone && (
            <Button
              size="icon"
              variant="outline"
              className="h-7 w-7 shrink-0"
              title="Edit milestone"
              onClick={() => onEditMilestone(m)}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button
            size="icon"
            variant="outline"
            className={cn("h-7 w-7 shrink-0", addChildAccent)}
            title={depth === 0 ? "Add sub-task" : "Add nested sub-task"}
            onClick={openInlineAdd}
          >
            <AddChildIcon className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="icon"
            variant="outline"
            className="h-7 w-7 shrink-0 text-destructive hover:text-destructive"
            title="Delete milestone"
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-3 pt-0.5">
        <Slider
          value={[draft]}
          min={0}
          max={100}
          step={1}
          onValueChange={(v) => !hasChildren && setDraft(v[0])}
          onValueCommit={(v) => commitProgress(v[0])}
          disabled={saving || hasChildren}
          className="flex-1"
        />
        <span className="text-xs font-semibold w-10 text-right tabular-nums">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin inline" /> : `${draft}%`}
        </span>
      </div>
      {hasChildren && (
        <p className="text-[10px] text-muted-foreground -mt-1">Auto-calculated from sub-tasks</p>
      )}

      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px]">
        <div>
          <span className="text-muted-foreground">Planned: </span>
          {fmt(m.start_date)} – {fmt(m.end_date)}
        </div>
        <div>
          <span className="text-muted-foreground">Actual: </span>
          {fmt(m.actual_start_date)} – {fmt(m.actual_end_date)}
        </div>
        {linked > 0 ? (
          <button
            type="button"
            onClick={() => setShowActivities((v) => !v)}
            className="flex items-center gap-1 text-primary hover:underline text-left"
          >
            <ActivityIcon className="h-3 w-3" />
            {linked} linked {linked === 1 ? "activity" : "activities"}
          </button>
        ) : (
          <div className="flex items-center gap-1 text-muted-foreground">
            <ActivityIcon className="h-3 w-3" />
            0 linked activities
          </div>
        )}
        <button
          type="button"
          onClick={() => setShowComments((v) => !v)}
          className="flex items-center gap-1 text-muted-foreground hover:text-foreground justify-end"
        >
          <MessageSquare className="h-3 w-3" />
          {cardComments.length} {cardComments.length === 1 ? "comment" : "comments"}
        </button>
      </div>

      {showActivities && linkedActivities.length > 0 && (
        <div className="border-t pt-2 space-y-1.5">
          {linkedActivities.map((a) => {
            const clickable = !!onOpenActivity;
            return (
              <button
                key={a.id}
                type="button"
                disabled={!clickable}
                onClick={() => onOpenActivity?.(a)}
                className={cn(
                  "w-full text-left text-[11px] rounded bg-muted/40 px-2 py-1.5 transition-colors",
                  clickable && "cursor-pointer hover:bg-muted focus:outline-none focus:ring-1 focus:ring-primary/40"
                )}
              >
                <div className="font-medium truncate">{a.activity_name}</div>
                <div className="flex items-center gap-2 text-muted-foreground mt-0.5">
                  <span className="flex items-center gap-1"><User className="h-3 w-3" />{a.user_full_name}</span>
                  <span>·</span>
                  <span>{a.activity_date ? format(new Date(a.activity_date), "dd MMM yy") : ""}</span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {m.notes && <p className="text-[11px] text-muted-foreground border-t pt-1.5">{m.notes}</p>}

      {(hasChildren || inlineDraft) && expanded && (
        <div
          className={cn(
            "mt-3 space-y-2 pl-4 border-l-2",
            depth === 0 && "border-primary/30",
            depth === 1 && "border-emerald-500/40 border-dashed",
            depth === 2 && "border-purple-500/40 border-dotted",
            depth >= 3 && "border-orange-500/40"
          )}
        >
          {childrenList.map((c) => (
            <MilestoneCard
              key={c.id}
              siteId={siteId}
              m={c}
              childrenList={childrenByParent[c.id] || []}
              childrenByParent={childrenByParent}
              activityCount={activityCount}
              activitiesById={activitiesById}
              comments={comments}
              onCommentAdded={onCommentAdded}
              onChanged={onChanged}
              currentUserId={currentUserId}
              onAddSubMilestone={onAddSubMilestone}
              onEditMilestone={onEditMilestone}
              onOpenActivity={onOpenActivity}
              depth={depth + 1}
              ancestorPath={[...ancestorPath, m.name]}
            />
          ))}
          {inlineDraft && (
            <div className="rounded-lg border border-dashed bg-muted/30 p-2.5">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  autoFocus
                  className="flex-1 min-w-0 h-8 rounded-md border bg-background px-2 text-sm"
                  placeholder="Sub-task name"
                  value={inlineDraft.name}
                  onChange={(e) => setInlineDraft({ ...inlineDraft, name: e.target.value })}
                />
                <input
                  type="date"
                  className="h-8 rounded-md border bg-background px-2 text-xs"
                  value={inlineDraft.start_date}
                  onChange={(e) => setInlineDraft({ ...inlineDraft, start_date: e.target.value })}
                />
                <input
                  type="date"
                  className="h-8 rounded-md border bg-background px-2 text-xs"
                  value={inlineDraft.end_date}
                  min={inlineDraft.start_date || undefined}
                  onChange={(e) => setInlineDraft({ ...inlineDraft, end_date: e.target.value })}
                />
                <Select
                  value={inlineDraft.status}
                  onValueChange={(v) => setInlineDraft({ ...inlineDraft, status: v })}
                >
                  <SelectTrigger className="h-8 w-full sm:w-[130px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MILESTONE_STATUSES.map((s) => (
                      <SelectItem key={s.value} value={s.value} className="text-xs">{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex gap-1.5 sm:shrink-0">
                  <Button size="sm" className="h-8 px-3" onClick={saveInline} disabled={savingInline}>
                    {savingInline ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => setInlineDraft(null)} disabled={savingInline}>
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {showComments && (
        <div className="border-t pt-2.5 space-y-2">
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {cardComments.length === 0 ? (
              <p className="text-[11px] text-muted-foreground italic">No comments yet.</p>
            ) : (
              cardComments.map((c) => (
                <div key={c.id} className="text-[11px] bg-muted/40 rounded px-2 py-1.5 group">
                  <div className="flex justify-between items-start gap-2">
                    <span className="font-medium">{c.author_name || "User"}</span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-muted-foreground">
                        {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
                      </span>
                      {c.user_id === currentUserId && (
                        <button
                          type="button"
                          onClick={() => deleteComment(c.id)}
                          className="opacity-0 group-hover:opacity-100 text-destructive"
                          aria-label="Delete comment"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="whitespace-pre-wrap mt-0.5">{c.content}</p>
                </div>
              ))
            )}
          </div>
          <div className="flex gap-1.5">
            <Textarea
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Add a comment..."
              rows={1}
              className="text-xs min-h-[32px] resize-none"
            />
            <Button
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={postComment}
              disabled={postingComment || !newComment.trim()}
            >
              {postingComment ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </div>
      )}

      <AlertDialog open={confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{m.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              {descendantCount > 0
                ? `This will also permanently delete ${descendantCount} nested sub-task${descendantCount === 1 ? "" : "s"}. Activities linked to any of these milestones will lose the milestone link. This action cannot be undone.`
                : "This will permanently delete the milestone. Activities linked to it will lose the milestone link. This action cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleDelete(); }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={showRiskDialog} onOpenChange={(o) => { setShowRiskDialog(o); if (!o) setRiskReason(""); }}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Flag "{m.name}" as At Risk
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label className="text-xs">Reason (required)</Label>
            <Textarea
              autoFocus
              value={riskReason}
              onChange={(e) => setRiskReason(e.target.value)}
              placeholder="Explain why this milestone is at risk..."
              rows={4}
            />
            <p className="text-[11px] text-muted-foreground">
              This reason will be posted to the milestone's comment thread.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRiskDialog(false)} disabled={togglingRisk}>
              Cancel
            </Button>
            <Button
              onClick={confirmFlagAtRisk}
              disabled={togglingRisk || !riskReason.trim()}
              className="bg-amber-500 hover:bg-amber-600 text-white"
            >
              {togglingRisk ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Flag At Risk
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface TableRowsProps {
  parents: HubMilestone[];
  childrenByParent: Record<string, HubMilestone[]>;
  activityCount: Record<string, number>;
  commentsCount: Record<string, number>;
  onEditMilestone?: (m: HubMilestone) => void;
  onAddSubMilestone?: (parentId: string, parentName: string) => void;
}

function TableView({
  parents,
  childrenByParent,
  activityCount,
  commentsCount,
  onEditMilestone,
  onAddSubMilestone,
}: TableRowsProps) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const toggle = (id: string) => setCollapsed((c) => ({ ...c, [id]: !c[id] }));

  const renderRow = (m: HubMilestone, depth: number): JSX.Element[] => {
    const kids = childrenByParent[m.id] || [];
    const hasKids = kids.length > 0;
    const isCollapsed = collapsed[m.id];
    const AddChildIcon = depth === 0 ? Plus : CornerDownRight;
    const accent = DEPTH_ACCENTS[depth % DEPTH_ACCENTS.length];
    const rows: JSX.Element[] = [
      <tr key={m.id} className={cn("border-b hover:bg-muted/40", m.at_risk && "bg-amber-50/40 dark:bg-amber-950/10")}>
        <td className="py-2 px-2 text-xs">
          <div className="flex items-center gap-1" style={{ paddingLeft: depth * 16 }}>
            {hasKids ? (
              <button type="button" onClick={() => toggle(m.id)} className="text-muted-foreground hover:text-foreground">
                {isCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </button>
            ) : (
              <span className="w-3.5" />
            )}
            <Target className="h-3.5 w-3.5 text-primary shrink-0" />
            <span className="font-medium truncate">{m.name}</span>
          </div>
        </td>
        <td className="py-2 px-2 text-xs">
          <Badge variant={STATUS_VARIANT[m.status] || "secondary"} className="text-[10px] px-1.5 py-0">
            {milestoneStatusLabel(m.status)}
          </Badge>
        </td>
        <td className="py-2 px-2 text-xs text-center">
          {m.at_risk ? <AlertTriangle className="h-3.5 w-3.5 text-amber-500 inline" /> : <span className="text-muted-foreground">—</span>}
        </td>
        <td className="py-2 px-2 text-xs tabular-nums">{m.percent_complete ?? 0}%</td>
        <td className="py-2 px-2 text-[11px] whitespace-nowrap">{fmt(m.start_date)} – {fmt(m.end_date)}</td>
        <td className="py-2 px-2 text-[11px] whitespace-nowrap">{fmt(m.actual_start_date)} – {fmt(m.actual_end_date)}</td>
        <td className="py-2 px-2 text-xs text-center">{activityCount[m.id] || 0}</td>
        <td className="py-2 px-2 text-xs text-center">{commentsCount[m.id] || 0}</td>
        <td className="py-2 px-2">
          <div className="flex items-center gap-1 justify-end">
            {onEditMilestone && (
              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => onEditMilestone(m)} title="Edit">
                <Pencil className="h-3 w-3" />
              </Button>
            )}
            {onAddSubMilestone && (
              <Button
                size="icon"
                variant="ghost"
                className={cn("h-6 w-6", accent)}
                onClick={() => onAddSubMilestone(m.id, m.name)}
                title={depth === 0 ? "Add sub-task" : "Add nested sub-task"}
              >
                <AddChildIcon className="h-3 w-3" />
              </Button>
            )}
          </div>
        </td>
      </tr>,
    ];
    if (!isCollapsed && hasKids) {
      kids.forEach((k) => rows.push(...renderRow(k, depth + 1)));
    }
    return rows;
  };

  return (
    <div className="rounded-lg border overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="text-left py-2 px-2 font-medium">Name</th>
            <th className="text-left py-2 px-2 font-medium">Status</th>
            <th className="text-center py-2 px-2 font-medium">Risk</th>
            <th className="text-left py-2 px-2 font-medium">Progress</th>
            <th className="text-left py-2 px-2 font-medium">Planned</th>
            <th className="text-left py-2 px-2 font-medium">Actual</th>
            <th className="text-center py-2 px-2 font-medium">Acts</th>
            <th className="text-center py-2 px-2 font-medium">Cmts</th>
            <th className="text-right py-2 px-2 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {parents.flatMap((p) => renderRow(p, 0))}
        </tbody>
      </table>
    </div>
  );
}

export default function SiteMilestoneList({ siteId, milestones, activities = [], onChanged, onAddSubMilestone, onEditMilestone, onOpenActivity }: Props) {
  const { user } = useCurrentUser();
  const [comments, setComments] = useState<Comment[]>([]);
  const [view, setView] = useState<"card" | "table">("card");

  const { parents, childrenByParent } = useMemo(() => {
    const parents = milestones.filter((m) => !m.parent_id);
    const childrenByParent: Record<string, HubMilestone[]> = {};
    milestones
      .filter((m) => m.parent_id)
      .forEach((m) => {
        (childrenByParent[m.parent_id as string] ||= []).push(m);
      });
    return { parents, childrenByParent };
  }, [milestones]);

  const avgProgress = parents.length
    ? Math.round(parents.reduce((s, m) => s + (m.percent_complete || 0), 0) / parents.length)
    : 0;
  const completedMs = parents.filter((m) => m.status === "completed").length;
  const atRiskMs = milestones.filter((m) => m.at_risk).length;

  const activityCount: Record<string, number> = {};
  const activitiesById: Record<string, Activity[]> = {};
  activities.forEach((a) => {
    if (a.milestone_id) {
      activityCount[a.milestone_id] = (activityCount[a.milestone_id] || 0) + 1;
      (activitiesById[a.milestone_id] ||= []).push(a);
    }
  });

  const commentsCount = useMemo(() => {
    const counts: Record<string, number> = {};
    comments.forEach((c) => { counts[c.milestone_id] = (counts[c.milestone_id] || 0) + 1; });
    return counts;
  }, [comments]);

  const fetchComments = useCallback(async () => {
    const ids = milestones.map((m) => m.id);
    if (ids.length === 0) {
      setComments([]);
      return;
    }
    const { data, error } = await supabase
      .from("site_milestone_comments")
      .select("id, milestone_id, user_id, content, created_at")
      .in("milestone_id", ids)
      .order("created_at", { ascending: false });
    if (error) return;
    const userIds = [...new Set((data || []).map((c: any) => c.user_id))];
    let nameMap: Record<string, string> = {};
    if (userIds.length > 0) {
      const { data: us } = await supabase.from("users").select("id, full_name").in("id", userIds);
      (us || []).forEach((u: any) => (nameMap[u.id] = u.full_name || "User"));
    }
    setComments(
      (data || []).map((c: any) => ({ ...c, author_name: nameMap[c.user_id] || "User" }))
    );
  }, [milestones]);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-4 gap-3">
        <div className="rounded-xl border bg-card p-4 shadow-card text-center">
          <p className="text-2xl font-bold">{avgProgress}%</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">Overall completion</p>
        </div>
        <div className="rounded-xl border bg-card p-4 shadow-card text-center">
          <p className="text-2xl font-bold">{completedMs}/{parents.length}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">Milestones completed</p>
        </div>
        <div className="rounded-xl border bg-card p-4 shadow-card text-center">
          <p className="text-2xl font-bold">{activities.length}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">Activities logged</p>
        </div>
        <div
          className={cn(
            "rounded-xl border bg-card p-4 shadow-card text-center",
            atRiskMs > 0 && "border-amber-400 bg-amber-50/60 dark:bg-amber-950/20"
          )}
        >
          <p className={cn("text-2xl font-bold", atRiskMs > 0 && "text-amber-700 dark:text-amber-400")}>
            {atRiskMs}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">At Risk</p>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-4 shadow-card space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground font-medium">Overall progress</span>
          <span className="font-bold">{avgProgress}%</span>
        </div>
        <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${avgProgress}%` }} />
        </div>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {parents.length} milestone{parents.length === 1 ? "" : "s"}
        </p>
        <div className="inline-flex rounded-lg border p-0.5 bg-muted/40">
          <Button
            size="sm"
            variant={view === "card" ? "default" : "ghost"}
            className="h-7 px-2.5 text-xs"
            onClick={() => setView("card")}
          >
            <LayoutGrid className="h-3.5 w-3.5 mr-1" /> Cards
          </Button>
          <Button
            size="sm"
            variant={view === "table" ? "default" : "ghost"}
            className="h-7 px-2.5 text-xs"
            onClick={() => setView("table")}
          >
            <Rows3 className="h-3.5 w-3.5 mr-1" /> Table
          </Button>
        </div>
      </div>

      {parents.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">No milestones added yet.</p>
      ) : view === "card" ? (
        <div className="space-y-3">
          {parents.map((m) => (
            <MilestoneCard
              key={m.id}
              siteId={siteId}
              m={m}
              childrenList={childrenByParent[m.id] || []}
              childrenByParent={childrenByParent}
              activityCount={activityCount}
              activitiesById={activitiesById}
              comments={comments}
              onCommentAdded={fetchComments}
              onChanged={onChanged}
              currentUserId={user?.id}
              onAddSubMilestone={onAddSubMilestone}
              onEditMilestone={onEditMilestone}
              onOpenActivity={onOpenActivity}
              depth={0}
              ancestorPath={[]}
            />
          ))}
        </div>
      ) : (
        <TableView
          parents={parents}
          childrenByParent={childrenByParent}
          activityCount={activityCount}
          commentsCount={commentsCount}
          onEditMilestone={onEditMilestone}
          onAddSubMilestone={onAddSubMilestone}
        />
      )}
    </div>
  );
}
