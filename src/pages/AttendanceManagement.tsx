import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Check, X, User, Calendar, Users, ClipboardList, Settings, CalendarDays, FileText, BarChart3 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";

import LiveAttendanceMonitoring from "@/components/LiveAttendanceMonitoring";
import HolidayManagement from "@/components/HolidayManagement";
import LeaveBalancesManager from "@/components/attendance/LeaveBalancesManager";
import LeaveTypesManager from "@/components/attendance/LeaveTypesManager";
import AttendancePolicyConfig from "@/components/attendance/AttendancePolicyConfig";
import AttendanceReportGenerator from "@/components/attendance/AttendanceReportGenerator";
import WorkingDaysConfig from "@/components/attendance/WorkingDaysConfig";
import RejectionReasonDialog from "@/components/RejectionReasonDialog";
import { ExpandableText } from "@/components/ui/expandable-text";

interface LeaveApplication {
  id: string;
  user_id: string;
  leave_type_id: string;
  from_date: string;
  to_date: string;
  reason: string;
  status: string;
  applied_date: string;
  total_days: number;
  profiles?: { full_name: string; username: string };
  leave_types?: { name: string };
}

interface RegularizationRequest {
  id: string;
  user_id: string;
  attendance_date: string | null;
  date: string;
  current_check_in_time: string | null;
  current_check_out_time: string | null;
  requested_check_in_time: string | null;
  requested_check_out_time: string | null;
  reason: string;
  status: string;
  created_at: string;
  profiles?: { full_name: string; username: string };
}

const overviewTabs = [
  { key: "live", label: "Live Attendance", icon: User },
  { key: "leave", label: "Leave Management", icon: Calendar },
  { key: "regularization", label: "Regularization", icon: Users },
  { key: "leave-balances", label: "Leave Balances", icon: ClipboardList },
  { key: "reports", label: "Reports", icon: BarChart3 },
];

const configTabs = [
  { key: "leave-types", label: "Leave Types", icon: FileText },
  { key: "holidays", label: "Holidays", icon: CalendarDays },
  { key: "working-days", label: "Working Days", icon: Calendar },
  { key: "policy", label: "Attendance Policy", icon: Settings },
];

export default function AttendanceManagement() {
  const navigate = useNavigate();
  const [section, setSection] = useState<"overview" | "configuration">("overview");
  const [activeTab, setActiveTab] = useState("live");
  const [leaveApplications, setLeaveApplications] = useState<LeaveApplication[]>([]);
  const [regularizationRequests, setRegularizationRequests] = useState<RegularizationRequest[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedUser, setSelectedUser] = useState("all");
  const [allUsers, setAllUsers] = useState<Array<{ id: string; full_name: string }>>([]);
  const [showRejectionDialog, setShowRejectionDialog] = useState(false);
  const [rejectionTarget, setRejectionTarget] = useState<{ type: "leave" | "reg"; id: string } | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [subordinateIds, setSubordinateIds] = useState<string[]>([]);

  // Determine current user role and subordinates on mount
  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setCurrentUserId(user.id);

      // Check if admin
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .single();
      const admin = roleData?.role === "admin";
      setIsAdmin(admin);

      if (!admin) {
        // Fetch subordinates using reporting_manager_id from users table
        const { data: subs } = await supabase
          .from("users")
          .select("id")
          .eq("reporting_manager_id", user.id)
          .eq("is_active", true);
        setSubordinateIds(subs?.map(s => s.id) || []);
      }
    };
    init();
  }, []);

  useEffect(() => {
    if (currentUserId === null) return;
    if (activeTab === "leave") {
      fetchLeaveApplications();
      fetchUsers();
    } else if (activeTab === "regularization") {
      fetchRegularizationRequests();
      fetchUsers();
    }
  }, [activeTab, selectedUser, currentUserId, isAdmin]);

  // Auto-refresh when users are added/modified
  useEffect(() => {
    const channel = supabase.channel('attendance-mgmt-users')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, () => { fetchUsers(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const fetchUsers = async () => {
    try {
      if (isAdmin) {
        const { data, error } = await supabase.from("users").select("id, full_name").eq("is_active", true).order("full_name");
        if (error) throw error;
        setAllUsers(data || []);
      } else {
        // Only show subordinates in the dropdown
        if (subordinateIds.length === 0) {
          setAllUsers([]);
          return;
        }
        const { data, error } = await supabase.from("users").select("id, full_name").in("id", subordinateIds).eq("is_active", true).order("full_name");
        if (error) throw error;
        setAllUsers(data || []);
      }
    } catch (error) {
      console.error("Error fetching users:", error);
    }
  };

  const fetchLeaveApplications = async () => {
    try {
      setIsLoading(true);

      // Non-admin with no subordinates → no results
      if (!isAdmin && subordinateIds.length === 0) {
        setLeaveApplications([]);
        setIsLoading(false);
        return;
      }

      let query = supabase.from("leave_applications").select("*");

      // Apply hierarchy filter for non-admins
      if (!isAdmin) {
        query = query.in("user_id", subordinateIds);
      }

      if (selectedUser !== "all") query = query.eq("user_id", selectedUser);
      const { data, error } = await query.order("applied_date", { ascending: false });
      if (error) throw error;

      const userIds = [...new Set(data?.map((app) => app.user_id) || [])];
      const leaveTypeIds = [...new Set(data?.map((app) => app.leave_type_id) || [])];

      const { data: profiles } = await supabase.from("users").select("id, full_name, username").in("id", userIds.length ? userIds : ["__none__"]);
      const { data: leaveTypes } = await supabase.from("leave_types").select("id, name").in("id", leaveTypeIds.length ? leaveTypeIds : ["__none__"]);

      const enrichedData = data?.map((app) => ({
        ...app,
        profiles: profiles?.find((p) => p.id === app.user_id),
        leave_types: leaveTypes?.find((lt) => lt.id === app.leave_type_id),
      })) || [];

      setLeaveApplications(enrichedData);
    } catch (error) {
      console.error("Error fetching leave applications:", error);
      toast.error("Failed to fetch leave applications");
    } finally {
      setIsLoading(false);
    }
  };

  const fetchRegularizationRequests = async () => {
    try {
      setIsLoading(true);

      if (!isAdmin && subordinateIds.length === 0) {
        setRegularizationRequests([]);
        setIsLoading(false);
        return;
      }

      let query = supabase.from("regularization_requests").select("*").eq("status", "pending");

      if (!isAdmin) {
        query = query.in("user_id", subordinateIds);
      }

      if (selectedUser !== "all") query = query.eq("user_id", selectedUser);
      const { data, error } = await query.order("created_at", { ascending: false });
      if (error) throw error;

      const userIds = [...new Set(data?.map((req) => req.user_id) || [])];
      const { data: profiles } = await supabase.from("users").select("id, full_name, username").in("id", userIds.length ? userIds : ["__none__"]);

      const enrichedData = data?.map((req) => ({
        ...req,
        profiles: profiles?.find((p) => p.id === req.user_id),
      })) || [];

      setRegularizationRequests(enrichedData);
    } catch (error) {
      console.error("Error fetching regularization requests:", error);
      toast.error("Failed to fetch regularization requests");
    } finally {
      setIsLoading(false);
    }
  };

  const handleLeaveStatusUpdate = async (applicationId: string, newStatus: string, rejectionReason?: string) => {
    try {
      const app = leaveApplications.find(a => a.id === applicationId);
      const updateData: any = {
        status: newStatus,
        approved_date: newStatus === "approved" ? new Date().toISOString() : null,
      };
      const { data: { user } } = await supabase.auth.getUser();
      if (user) updateData.approved_by = user.id;

      const { error } = await supabase.from("leave_applications").update(updateData).eq("id", applicationId);
      if (error) throw error;

      // Notify employee + admins
      if (app) {
        try {
          const { sendNotificationWithPush, getAdminUserIds } = await import('@/utils/notificationHelpers');
          const adminIds = await getAdminUserIds();
          const recipients = Array.from(new Set([app.user_id, ...adminIds]));
          await sendNotificationWithPush(recipients, {
            title: `Leave ${newStatus === 'approved' ? 'Approved' : 'Rejected'}`,
            message: `Your leave from ${format(new Date(app.from_date), 'MMM dd')} to ${format(new Date(app.to_date), 'MMM dd')}${newStatus === 'rejected' && rejectionReason ? ` - Reason: ${rejectionReason}` : ''} has been ${newStatus}.`,
            type: 'leave_decision',
            related_table: 'leave_applications',
            related_id: applicationId,
          });
        } catch (e) { console.error('Push notification error:', e); }
      }

      toast.success(`Leave application ${newStatus} successfully`);
      fetchLeaveApplications();
    } catch (error) {
      console.error("Error updating leave application:", error);
      toast.error("Failed to update leave application");
    }
  };

  const handleRegularizationStatusUpdate = async (requestId: string, newStatus: string, rejectionReason?: string) => {
    try {
      const { data: request, error: fetchError } = await supabase
        .from("regularization_requests")
        .select("*")
        .eq("id", requestId)
        .single();
      if (fetchError) throw fetchError;

      const { data: { user } } = await supabase.auth.getUser();

      if (newStatus === "approved" && request) {
        let totalHours = null;
        if (request.requested_check_in_time && request.requested_check_out_time) {
          const checkIn = new Date(request.requested_check_in_time);
          const checkOut = new Date(request.requested_check_out_time);
          totalHours = (checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60);
        }

        const { error: attendanceError } = await supabase.from("attendance").upsert(
          {
            user_id: request.user_id,
            date: request.attendance_date || request.date,
            check_in_time: request.requested_check_in_time,
            check_out_time: request.requested_check_out_time,
            status: "regularized",
            total_hours: totalHours,
            notes: `Regularized via request #${requestId.slice(0, 8)}`,
            regularized_request_id: requestId,
          },
          { onConflict: "user_id,date" }
        );
        if (attendanceError) {
          console.error("Error updating attendance:", attendanceError);
          throw attendanceError;
        }
      }

      const updateData: any = {
        status: newStatus,
        approved_at: newStatus === "approved" ? new Date().toISOString() : null,
        rejection_reason: rejectionReason || null,
      };
      if (user) updateData.approved_by = user.id;

      const { error } = await supabase.from("regularization_requests").update(updateData).eq("id", requestId);
      if (error) throw error;

      // Notify employee + admins
      try {
        const { sendNotificationWithPush, getAdminUserIds } = await import('@/utils/notificationHelpers');
        const adminIds = await getAdminUserIds();
        const recipients = Array.from(new Set([request.user_id, ...adminIds]));
        await sendNotificationWithPush(recipients, {
          title: `Regularisation ${newStatus === 'approved' ? 'Approved' : 'Rejected'}`,
          message: `Your regularisation for ${format(new Date(request.attendance_date || request.date), 'MMM dd, yyyy')}${newStatus === 'rejected' && rejectionReason ? ` - Reason: ${rejectionReason}` : ''} has been ${newStatus}.`,
          type: 'regularization_decision',
          related_table: 'regularization_requests',
          related_id: requestId,
        });
      } catch (e) { console.error('Push notification error:', e); }

      toast.success(`Regularization request ${newStatus} successfully`);
      fetchRegularizationRequests();
    } catch (error) {
      console.error("Error updating regularization request:", error);
      toast.error("Failed to update regularization request");
    }
  };

  const handleRejectClick = (type: "leave" | "reg", id: string) => {
    setRejectionTarget({ type, id });
    setShowRejectionDialog(true);
  };

  const handleConfirmRejection = async (reason: string) => {
    if (!rejectionTarget) return;
    if (rejectionTarget.type === "leave") {
      await handleLeaveStatusUpdate(rejectionTarget.id, "rejected", reason);
    } else {
      await handleRegularizationStatusUpdate(rejectionTarget.id, "rejected", reason);
    }
    setRejectionTarget(null);
  };

  const getStatusBadge = (status: string) => {
    const config: Record<string, { cls: string; label: string }> = {
      pending: { cls: "bg-yellow-100 text-yellow-800", label: "Pending" },
      approved: { cls: "bg-green-100 text-green-800", label: "Approved" },
      rejected: { cls: "bg-red-100 text-red-800", label: "Rejected" },
    };
    const c = config[status] || { cls: "bg-muted text-muted-foreground", label: status };
    return <Badge className={c.cls}>{c.label}</Badge>;
  };

  const formatTime = (t: string | null) => (t ? format(new Date(t), "HH:mm") : "--");

  return (
    <motion.div className="p-2 sm:p-4 space-y-3 sm:space-y-6 max-w-6xl mx-auto" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      {/* Page Header */}
      <div>
        <h1 className="text-lg sm:text-3xl font-bold tracking-tight">Attendance Management</h1>
        <p className="text-xs sm:text-sm text-muted-foreground">Monitor attendance, manage leaves & policies</p>
      </div>

      {/* Section Toggle */}
      <div className="flex gap-1.5 sm:gap-2">
        <button
          onClick={() => { setSection("overview"); setActiveTab("live"); }}
          className={`px-3 sm:px-5 py-2 sm:py-2.5 rounded-lg text-xs sm:text-sm font-semibold transition-all ${
            section === "overview"
              ? "bg-primary text-primary-foreground shadow-md"
              : "bg-muted text-muted-foreground hover:bg-muted/80"
          }`}
        >
          Overview
        </button>
        <button
          onClick={() => { setSection("configuration"); setActiveTab("leave-types"); }}
          className={`px-3 sm:px-5 py-2 sm:py-2.5 rounded-lg text-xs sm:text-sm font-semibold transition-all ${
            section === "configuration"
              ? "bg-primary text-primary-foreground shadow-md"
              : "bg-muted text-muted-foreground hover:bg-muted/80"
          }`}
        >
          Configuration
        </button>
      </div>

      {/* Sub-Tabs */}
      <div className="overflow-x-auto -mx-2 px-2 sm:mx-0 sm:px-0">
        <div className="flex gap-1 border-b pb-2 min-w-max">
          {(section === "overview" ? overviewTabs : configTabs).map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`py-1.5 sm:py-2 px-2 sm:px-3 rounded-t-lg transition-colors flex items-center text-[11px] sm:text-sm font-medium whitespace-nowrap ${
                  activeTab === tab.key
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                <Icon className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-1.5" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === "live" && <LiveAttendanceMonitoring />}

      {activeTab === "leave" && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Leave Applications Management</CardTitle>
                <CardDescription>Review and manage employee leave requests</CardDescription>
              </div>
              <Select value={selectedUser} onValueChange={setSelectedUser}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Filter by user" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Employees</SelectItem>
                  {allUsers.map((user) => (
                    <SelectItem key={user.id} value={user.id}>{user.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
              </div>
            ) : leaveApplications.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">No leave applications found.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Leave Type</TableHead>
                    <TableHead>Start Date</TableHead>
                    <TableHead>End Date</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Applied Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leaveApplications.map((app) => (
                    <TableRow key={app.id}>
                      <TableCell className="font-medium">{app.profiles?.full_name || "Unknown User"}</TableCell>
                      <TableCell>{app.leave_types?.name || "Unknown"}</TableCell>
                      <TableCell>{format(new Date(app.from_date), "MMM dd, yyyy")}</TableCell>
                      <TableCell>{format(new Date(app.to_date), "MMM dd, yyyy")}</TableCell>
                      <TableCell><ExpandableText text={app.reason} title="Leave Reason" /></TableCell>
                      <TableCell>{app.applied_date ? format(new Date(app.applied_date), "MMM dd, yyyy") : "--"}</TableCell>
                      <TableCell>{getStatusBadge(app.status)}</TableCell>
                      <TableCell>
                      {app.status === "pending" && (isAdmin || subordinateIds.includes(app.user_id)) && (
                          <div className="flex space-x-2">
                            <Button size="sm" onClick={() => handleLeaveStatusUpdate(app.id, "approved")} className="bg-green-600 hover:bg-green-700">
                              <Check className="h-4 w-4" />
                            </Button>
                            <Button size="sm" variant="destructive" onClick={() => handleRejectClick("leave", app.id)}>
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === "regularization" && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Pending Regularization Requests</CardTitle>
                <CardDescription>Review and approve attendance regularization requests</CardDescription>
              </div>
              <Select value={selectedUser} onValueChange={setSelectedUser}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Filter by user" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Employees</SelectItem>
                  {allUsers.map((user) => (
                    <SelectItem key={user.id} value={user.id}>{user.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
              </div>
            ) : regularizationRequests.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">No pending regularization requests found.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Current In/Out</TableHead>
                    <TableHead>Requested In/Out</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Requested On</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {regularizationRequests.map((req) => (
                    <TableRow key={req.id}>
                      <TableCell className="font-medium">{req.profiles?.full_name || "Unknown User"}</TableCell>
                      <TableCell>{format(new Date(req.attendance_date || req.date), "MMM dd, yyyy")}</TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <div>In: {formatTime(req.current_check_in_time)}</div>
                          <div>Out: {formatTime(req.current_check_out_time)}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <div>In: {formatTime(req.requested_check_in_time)}</div>
                          <div>Out: {formatTime(req.requested_check_out_time)}</div>
                        </div>
                      </TableCell>
                      <TableCell><ExpandableText text={req.reason} title="Regularization Reason" /></TableCell>
                      <TableCell>{format(new Date(req.created_at), "MMM dd, yyyy")}</TableCell>
                      <TableCell>
                      {(isAdmin || subordinateIds.includes(req.user_id)) && (
                        <div className="flex space-x-2">
                          <Button size="sm" onClick={() => handleRegularizationStatusUpdate(req.id, "approved")} className="bg-green-600 hover:bg-green-700">
                            <Check className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="destructive" onClick={() => handleRejectClick("reg", req.id)}>
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === "leave-balances" && <LeaveBalancesManager />}
      {activeTab === "reports" && <AttendanceReportGenerator />}
      {activeTab === "leave-types" && <LeaveTypesManager />}
      {activeTab === "holidays" && <HolidayManagement />}
      {activeTab === "working-days" && <WorkingDaysConfig />}
      {activeTab === "policy" && <AttendancePolicyConfig />}

      <RejectionReasonDialog
        isOpen={showRejectionDialog}
        onClose={() => setShowRejectionDialog(false)}
        onConfirm={handleConfirmRejection}
        title={rejectionTarget?.type === "leave" ? "Reject Leave Application" : "Reject Regularization Request"}
      />
    </motion.div>
  );
}
