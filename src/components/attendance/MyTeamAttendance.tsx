import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { CheckCircle, CloudOff, XCircle, Search, Eye, ChevronRight, Users, FileBarChart } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import TeamAttendanceReportGenerator from "./TeamAttendanceReportGenerator";

interface TeamMember {
  id: string;
  full_name: string;
  username: string;
  reporting_manager_id: string | null;
}

interface MemberAttendance {
  user_id: string;
  date: string;
  check_in_time: string | null;
  check_out_time: string | null;
  status: string;
  total_hours: number | null;
}

interface LeaveInfo {
  user_id: string;
  from_date: string;
  to_date: string;
  status: string;
}

export default function MyTeamAttendance() {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [attendanceMap, setAttendanceMap] = useState<Record<string, MemberAttendance | null>>({});
  const [leaveMap, setLeaveMap] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);
  const [memberHistory, setMemberHistory] = useState<MemberAttendance[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const today = format(new Date(), "yyyy-MM-dd");

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setCurrentUserId(user.id);
      }
    });
  }, []);

  const fetchTeamData = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch all active users in the organisation
      const { data: users } = await supabase
        .from("users")
        .select("id, full_name, username, reporting_manager_id")
        .eq("is_active", true)
        .order("full_name");

      const memberList = (users || []) as TeamMember[];
      setTeamMembers(memberList);

      if (memberList.length === 0) {
        setAttendanceMap({});
        setLeaveMap({});
        setLoading(false);
        return;
      }

      // Fetch today's attendance for everyone
      const { data: attendanceData } = await supabase
        .from("attendance")
        .select("user_id, date, check_in_time, check_out_time, status, total_hours")
        .eq("date", today);

      const attMap: Record<string, MemberAttendance | null> = {};
      memberList.forEach((m) => {
        attMap[m.id] = null;
      });
      attendanceData?.forEach((a: any) => {
        attMap[a.user_id] = a;
      });
      setAttendanceMap(attMap);

      // Fetch approved leaves covering today
      const { data: leaves } = await supabase
        .from("leave_applications")
        .select("user_id, from_date, to_date, status")
        .eq("status", "approved")
        .lte("from_date", today)
        .gte("to_date", today);

      const lMap: Record<string, boolean> = {};
      leaves?.forEach((l: any) => {
        lMap[l.user_id] = true;
      });
      setLeaveMap(lMap);
    } catch (err) {
      console.error("Error fetching team data:", err);
      toast.error("Failed to load team data");
    } finally {
      setLoading(false);
    }
  }, [today]);

  useEffect(() => {
    fetchTeamData();
  }, [fetchTeamData]);

  const getStatus = (memberId: string) => {
    if (leaveMap[memberId]) return "leave";
    const att = attendanceMap[memberId];
    if (!att) return "absent";
    if (att.status === "present" || att.status === "regularized") return "present";
    return att.status;
  };

  const stats = useMemo(() => {
    let present = 0, onLeave = 0, absent = 0;
    teamMembers.forEach((m) => {
      const s = getStatus(m.id);
      if (s === "present" || s === "regularized") present++;
      else if (s === "leave") onLeave++;
      else absent++;
    });
    return { present, onLeave, absent, total: teamMembers.length };
  }, [teamMembers, attendanceMap, leaveMap]);

  const filteredMembers = useMemo(() => {
    if (!searchQuery) return teamMembers;
    const q = searchQuery.toLowerCase();
    return teamMembers.filter(
      (m) =>
        m.full_name?.toLowerCase().includes(q) ||
        m.username?.toLowerCase().includes(q)
    );
  }, [teamMembers, searchQuery]);

  const openMemberDetail = async (member: TeamMember) => {
    setSelectedMember(member);
    setHistoryLoading(true);
    try {
      const startOfMonth = format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), "yyyy-MM-dd");
      const { data } = await supabase
        .from("attendance")
        .select("user_id, date, check_in_time, check_out_time, status, total_hours")
        .eq("user_id", member.id)
        .gte("date", startOfMonth)
        .order("date", { ascending: false });
      setMemberHistory(data || []);
    } catch {
      toast.error("Failed to load attendance history");
    } finally {
      setHistoryLoading(false);
    }
  };

  const getInitials = (name: string) => {
    return name
      ?.split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2) || "?";
  };

  const statusConfig: Record<string, { color: string; bg: string; label: string }> = {
    present: { color: "text-[hsl(150,45%,30%)]", bg: "bg-[hsl(150,35%,93%)]", label: "Present" },
    regularized: { color: "text-[hsl(150,45%,30%)]", bg: "bg-[hsl(150,35%,93%)]", label: "Present" },
    leave: { color: "text-[hsl(35,60%,40%)]", bg: "bg-[hsl(35,50%,93%)]", label: "On Leave" },
    absent: { color: "text-[hsl(0,45%,35%)]", bg: "bg-[hsl(0,40%,94%)]", label: "Absent" },
  };

  const renderMemberRow = (member: TeamMember) => {
    const status = getStatus(member.id);
    const config = statusConfig[status] || statusConfig.absent;
    const att = attendanceMap[member.id];

    return (
      <div key={member.id}>
        <div className="flex items-center gap-3 py-3 px-3 rounded-xl transition-all hover:bg-accent/50 border-l-4 border-l-[hsl(210,50%,55%)]">
          <Avatar className="h-10 w-10 flex-shrink-0">
            <AvatarFallback className="text-xs font-semibold bg-muted">
              {getInitials(member.full_name)}
            </AvatarFallback>
          </Avatar>

          <div className="flex-1 min-w-0">
            <div className="font-medium text-sm truncate">{member.full_name}</div>
            <div className="text-xs text-muted-foreground">
              {att?.check_in_time
                ? `In: ${format(new Date(att.check_in_time), "h:mm a")}`
                : "No check-in"}
              {att?.total_hours ? ` · ${att.total_hours.toFixed(1)}h` : ""}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <Badge className={cn("text-[11px] px-2 py-0.5 font-medium border-0", config.bg, config.color)}>
              {config.label}
            </Badge>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => openMemberDetail(member)}
            >
              <Eye className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (teamMembers.length === 0) {
    return (
      <div className="text-center py-12 space-y-3">
        <Users className="h-12 w-12 mx-auto text-muted-foreground/50" />
        <p className="text-muted-foreground font-medium">No team members found</p>
        <p className="text-sm text-muted-foreground">You don't have any direct or indirect reports.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Report Generator */}
      {showReport && (
        <TeamAttendanceReportGenerator onClose={() => setShowReport(false)} />
      )}

      {/* Member Count */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground">{stats.total} Members</span>
        <Button variant="outline" size="sm" onClick={() => setShowReport(!showReport)} className="gap-1.5">
          <FileBarChart className="h-4 w-4" />
          Generate Report
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-[hsl(150,35%,93%)] rounded-2xl p-4 text-center">
          <CheckCircle className="h-5 w-5 mx-auto mb-1 text-[hsl(150,50%,45%)]" />
          <div className="text-2xl font-bold text-[hsl(150,45%,30%)]">{stats.present}</div>
          <div className="text-[11px] font-medium text-[hsl(150,35%,40%)]">Present Today</div>
        </div>
        <div className="bg-[hsl(35,50%,93%)] rounded-2xl p-4 text-center">
          <CloudOff className="h-5 w-5 mx-auto mb-1 text-[hsl(35,50%,45%)]" />
          <div className="text-2xl font-bold text-[hsl(35,45%,35%)]">{stats.onLeave}</div>
          <div className="text-[11px] font-medium text-[hsl(35,40%,45%)]">On Leave</div>
        </div>
        <div className="bg-[hsl(0,40%,94%)] rounded-2xl p-4 text-center">
          <XCircle className="h-5 w-5 mx-auto mb-1 text-[hsl(0,50%,55%)]" />
          <div className="text-2xl font-bold text-[hsl(0,45%,35%)]">{stats.absent}</div>
          <div className="text-[11px] font-medium text-[hsl(0,35%,45%)]">Absent</div>
        </div>
      </div>

      {/* Approvals Link */}
      <Button
        variant="ghost"
        className="w-full bg-[hsl(25,50%,93%)] hover:bg-[hsl(25,50%,90%)] rounded-xl py-3 text-[hsl(25,45%,35%)] font-medium"
        onClick={() => window.location.href = "/pending-approvals"}
      >
        Approvals
        <ChevronRight className="h-4 w-4 ml-1" />
      </Button>

      {/* Team Members */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-sm">Team Members ({filteredMembers.length})</h3>
          <div className="relative w-48">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search members..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-8 text-xs rounded-full bg-muted border-0"
            />
          </div>
        </div>

        <div className="space-y-1">
          {filteredMembers.map((member) => renderMemberRow(member))}
        </div>
      </div>

      {/* Member Detail Dialog */}
      <Dialog open={!!selectedMember} onOpenChange={(open) => !open && setSelectedMember(null)}>
        <DialogContent className="max-w-md max-h-[70vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <Avatar className="h-10 w-10">
                <AvatarFallback>{selectedMember ? getInitials(selectedMember.full_name) : ""}</AvatarFallback>
              </Avatar>
              <div>
                <div>{selectedMember?.full_name}</div>
                <div className="text-xs text-muted-foreground font-normal">This month's attendance</div>
              </div>
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 mt-2">
            {historyLoading ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
              </div>
            ) : memberHistory.length > 0 ? (
              memberHistory.map((record) => {
                const isPresent = record.status === "present" || record.status === "regularized";
                return (
                  <div
                    key={`${record.user_id}-${record.date}`}
                    className={cn(
                      "flex items-center justify-between p-3 rounded-xl",
                      isPresent ? "bg-[hsl(150,35%,94%)]" : "bg-[hsl(0,40%,95%)]"
                    )}
                  >
                    <div>
                      <div className="font-medium text-sm">{format(new Date(record.date), "EEE, MMM dd")}</div>
                      <div className="text-xs text-muted-foreground">
                        {record.check_in_time
                          ? `${format(new Date(record.check_in_time), "h:mm a")} - ${record.check_out_time ? format(new Date(record.check_out_time), "h:mm a") : "Active"}`
                          : "No check-in"}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {record.total_hours && (
                        <span className="text-xs text-muted-foreground">{record.total_hours.toFixed(1)}h</span>
                      )}
                      <Badge
                        className={cn(
                          "text-[11px] border-0",
                          isPresent
                            ? "bg-[hsl(150,35%,93%)] text-[hsl(150,45%,30%)]"
                            : "bg-[hsl(0,40%,94%)] text-[hsl(0,45%,35%)]"
                        )}
                      >
                        {isPresent ? "Present" : record.status === "leave" ? "Leave" : "Absent"}
                      </Badge>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                No attendance records this month
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
