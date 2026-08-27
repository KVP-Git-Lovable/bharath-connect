import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Check, X, Clock, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import RejectionReasonDialog from "@/components/RejectionReasonDialog";
import { useUserProfile } from "@/hooks/useUserProfile";

interface LeaveRequest {
  id: string;
  user_id: string;
  leave_type_id: string;
  from_date: string;
  to_date: string;
  reason: string;
  status: string;
  total_days: number;
  applied_date: string;
  employee_name: string;
  leave_type_name: string;
}

interface RegRequest {
  id: string;
  user_id: string;
  date: string;
  attendance_date: string | null;
  reason: string;
  status: string;
  created_at: string;
  requested_check_in_time: string | null;
  requested_check_out_time: string | null;
  current_check_in_time: string | null;
  current_check_out_time: string | null;
  employee_name: string;
}

type TabType = "leave" | "regularization";

export default function PendingApprovals() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const highlightId = searchParams.get("id");
  const highlightType = searchParams.get("type");
  const { isAdmin } = useUserProfile();

  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [regRequests, setRegRequests] = useState<RegRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showRejectionDialog, setShowRejectionDialog] = useState(false);
  const [rejectionTarget, setRejectionTarget] = useState<{ type: "leave" | "reg"; id: string } | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>(
    highlightType === "regularization_request" ? "regularization" : "leave"
  );

  useEffect(() => {
    fetchPendingRequests();
  }, []);

  const fetchPendingRequests = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // For admins: fetch ALL pending requests
      // For managers: fetch only from subordinates
      let userIds: string[] = [];
      let allUsers: { id: string; full_name: string | null }[] = [];

      if (isAdmin) {
        // Admin sees all users' requests
        const { data: allUsersRes } = await supabase.from("users").select("id, full_name");
        allUsers = allUsersRes || [];
        userIds = allUsers.map((u) => u.id);
      } else {
        // Manager sees only subordinates' requests
        const { data: subordinates } = await supabase
          .from("users")
          .select("id, full_name")
          .eq("reporting_manager_id", user.id);
        allUsers = subordinates || [];
        userIds = allUsers.map((s) => s.id);
      }

      const nameMap = new Map<string, string>(allUsers.map((u) => [u.id, u.full_name || "Unknown"]) || []);

      if (userIds.length === 0) {
        setLeaveRequests([]);
        setRegRequests([]);
        setLoading(false);
        return;
      }

      const [leavesRes, regsRes] = await Promise.all([
        supabase.from("leave_applications").select("*").in("user_id", userIds).eq("status", "pending").order("applied_date", { ascending: false }),
        supabase.from("regularization_requests").select("*").in("user_id", userIds).eq("status", "pending").order("created_at", { ascending: false }),
      ]);

      const leaveTypeIds = [...new Set(leavesRes.data?.map((l) => l.leave_type_id) || [])];
      let ltMap = new Map<string, string>();
      if (leaveTypeIds.length > 0) {
        const { data } = await supabase.from("leave_types").select("id, name").in("id", leaveTypeIds);
        ltMap = new Map((data || []).map((lt) => [lt.id, lt.name]));
      }

      setLeaveRequests(
        (leavesRes.data || []).map((l) => ({
          id: l.id, user_id: l.user_id, leave_type_id: l.leave_type_id,
          from_date: l.from_date, to_date: l.to_date, reason: l.reason || "",
          status: l.status, total_days: l.total_days,
          applied_date: l.applied_date || l.created_at,
          employee_name: nameMap.get(l.user_id) || "Unknown",
          leave_type_name: ltMap.get(l.leave_type_id) || "Leave",
        }))
      );

      setRegRequests(
        (regsRes.data || []).map((r) => ({ ...r, employee_name: nameMap.get(r.user_id) || "Unknown" }))
      );
    } catch (error) {
      console.error("Error fetching pending requests:", error);
      toast.error("Failed to load pending approvals");
    } finally {
      setLoading(false);
    }
  };

  const handleLeaveAction = async (id: string, status: "approved" | "rejected", reason?: string) => {
    setActionLoading(id);
    try {
      const app = leaveRequests.find((l) => l.id === id);
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("leave_applications").update({
        status, approved_by: user?.id, approved_date: status === "approved" ? new Date().toISOString() : null,
      }).eq("id", id);
      if (error) throw error;

      if (app) {
        try {
          const { sendNotificationWithPush, getAdminUserIds } = await import('@/utils/notificationHelpers');
          const adminIds = await getAdminUserIds();
          const recipients = Array.from(new Set([app.user_id, ...adminIds]));
          await sendNotificationWithPush(recipients, {
            title: `Leave ${status === "approved" ? "Approved" : "Rejected"}`,
            message: `Your ${app.leave_type_name} from ${format(new Date(app.from_date), "MMM dd")} to ${format(new Date(app.to_date), "MMM dd")}${status === "rejected" && reason ? ` - Reason: ${reason}` : ""} has been ${status}.`,
            type: "leave_decision", related_table: "leave_applications", related_id: id,
          });
        } catch (e) { console.error('Push notification error:', e); }
      }
      toast.success(`Leave ${status} successfully`);
      setLeaveRequests((prev) => prev.filter((l) => l.id !== id));
    } catch (error) {
      console.error("Error:", error);
      toast.error(`Failed to ${status} leave`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleRegAction = async (id: string, status: "approved" | "rejected", reason?: string) => {
    setActionLoading(id);
    try {
      const { data: request, error: fetchErr } = await supabase.from("regularization_requests").select("*").eq("id", id).single();
      if (fetchErr) throw fetchErr;
      const { data: { user } } = await supabase.auth.getUser();

      if (status === "approved" && request) {
        let totalHours = null;
        if (request.requested_check_in_time && request.requested_check_out_time) {
          const ci = new Date(request.requested_check_in_time);
          const co = new Date(request.requested_check_out_time);
          totalHours = (co.getTime() - ci.getTime()) / (1000 * 60 * 60);
        }
        await supabase.from("attendance").upsert({
          user_id: request.user_id, date: request.attendance_date || request.date,
          check_in_time: request.requested_check_in_time, check_out_time: request.requested_check_out_time,
          status: "regularized", total_hours: totalHours,
          notes: `Regularized via request #${id.slice(0, 8)}`, regularized_request_id: id,
        }, { onConflict: "user_id,date" });
      }

      const { error } = await supabase.from("regularization_requests").update({
        status, approved_by: user?.id,
        approved_at: status === "approved" ? new Date().toISOString() : null,
        rejection_reason: reason || null,
      }).eq("id", id);
      if (error) throw error;

      try {
        const { sendNotificationWithPush, getAdminUserIds } = await import('@/utils/notificationHelpers');
        const adminIds = await getAdminUserIds();
        const recipients = Array.from(new Set([request.user_id, ...adminIds]));
        await sendNotificationWithPush(recipients, {
          title: `Regularisation ${status === "approved" ? "Approved" : "Rejected"}`,
          message: `Your regularisation for ${format(new Date(request.attendance_date || request.date), "MMM dd, yyyy")}${status === "rejected" && reason ? ` - Reason: ${reason}` : ""} has been ${status}.`,
          type: "regularization_decision", related_table: "regularization_requests", related_id: id,
        });
      } catch (e) { console.error('Push notification error:', e); }

      toast.success(`Regularisation ${status} successfully`);
      setRegRequests((prev) => prev.filter((r) => r.id !== id));
    } catch (error) {
      console.error("Error:", error);
      toast.error(`Failed to ${status} regularisation`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleRejectClick = (type: "leave" | "reg", id: string) => {
    setRejectionTarget({ type, id });
    setShowRejectionDialog(true);
  };

  const handleConfirmRejection = async (reason: string) => {
    if (!rejectionTarget) return;
    if (rejectionTarget.type === "leave") await handleLeaveAction(rejectionTarget.id, "rejected", reason);
    else await handleRegAction(rejectionTarget.id, "rejected", reason);
    setRejectionTarget(null);
  };

  const totalPending = leaveRequests.length + regRequests.length;

  const ActionButtons = ({ id, type }: { id: string; type: "leave" | "reg" }) => (
    <div className="flex gap-2 pt-1">
      <Button size="sm" className="flex-1 bg-green-600 hover:bg-green-700" disabled={actionLoading === id}
        onClick={() => type === "leave" ? handleLeaveAction(id, "approved") : handleRegAction(id, "approved")}>
        {actionLoading === id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4 mr-1" />}Approve
      </Button>
      <Button size="sm" variant="destructive" className="flex-1" disabled={actionLoading === id}
        onClick={() => handleRejectClick(type, id)}>
        <X className="h-4 w-4 mr-1" />Reject
      </Button>
    </div>
  );

  return (
    <motion.div className="p-4 space-y-4 pb-24" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-xl font-bold">Pending Approvals</h1>
          <p className="text-sm text-muted-foreground">{totalPending} pending request{totalPending !== 1 ? "s" : ""}</p>
        </div>
      </div>

      {/* Tab Switch */}
      <div className="flex gap-2">
        {([
          { key: "leave" as TabType, label: "Leave", count: leaveRequests.length },
          { key: "regularization" as TabType, label: "Regularisation", count: regRequests.length },
        ]).map((tab) => (
          <Button key={tab.key} variant={activeTab === tab.key ? "default" : "outline"} size="sm"
            onClick={() => setActiveTab(tab.key)} className="flex-1">
            {tab.label} ({tab.count})
          </Button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* Leave */}
          {activeTab === "leave" && (
            <div className="space-y-3">
              {leaveRequests.length === 0 ? (
                <Card><CardContent className="py-8 text-center text-muted-foreground"><Check className="h-10 w-10 mx-auto mb-2 text-muted-foreground/40" />No pending leave requests</CardContent></Card>
              ) : leaveRequests.map((req) => (
                <Card key={req.id} className={highlightId === req.id ? "ring-2 ring-primary" : ""}>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-semibold">{req.employee_name}</p>
                        <Badge variant="secondary" className="mt-1">{req.leave_type_name}</Badge>
                      </div>
                      <Badge className="bg-yellow-100 text-yellow-800"><Clock className="h-3 w-3 mr-1" />Pending</Badge>
                    </div>
                    <div className="text-sm space-y-1 text-muted-foreground">
                      <p>📅 {format(new Date(req.from_date), "MMM dd, yyyy")} → {format(new Date(req.to_date), "MMM dd, yyyy")}</p>
                      <p>📝 {req.total_days} day{req.total_days !== 1 ? "s" : ""}</p>
                      <p>💬 {req.reason}</p>
                    </div>
                    <ActionButtons id={req.id} type="leave" />
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Regularization */}
          {activeTab === "regularization" && (
            <div className="space-y-3">
              {regRequests.length === 0 ? (
                <Card><CardContent className="py-8 text-center text-muted-foreground"><Check className="h-10 w-10 mx-auto mb-2 text-muted-foreground/40" />No pending regularisation requests</CardContent></Card>
              ) : regRequests.map((req) => (
                <Card key={req.id} className={highlightId === req.id ? "ring-2 ring-primary" : ""}>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-semibold">{req.employee_name}</p>
                        <p className="text-xs text-muted-foreground mt-1">{format(new Date(req.attendance_date || req.date), "MMM dd, yyyy")}</p>
                      </div>
                      <Badge className="bg-yellow-100 text-yellow-800"><Clock className="h-3 w-3 mr-1" />Pending</Badge>
                    </div>
                    <div className="text-sm space-y-1 text-muted-foreground">
                      {req.requested_check_in_time && <p>🕐 Requested In: {format(new Date(req.requested_check_in_time), "hh:mm a")}</p>}
                      {req.requested_check_out_time && <p>🕐 Requested Out: {format(new Date(req.requested_check_out_time), "hh:mm a")}</p>}
                      <p>💬 {req.reason}</p>
                    </div>
                    <ActionButtons id={req.id} type="reg" />
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      <RejectionReasonDialog
        isOpen={showRejectionDialog}
        onClose={() => { setShowRejectionDialog(false); setRejectionTarget(null); }}
        onConfirm={handleConfirmRejection}
      />
    </motion.div>
  );
}
