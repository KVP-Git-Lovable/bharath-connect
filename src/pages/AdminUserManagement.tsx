import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ArrowLeft,
  Search,
  Users,
  Network,
  Shield,
  MoreVertical,
  Edit,
  Trash2,
  Eye,
  BarChart3,
  UserPlus,
  List,
  ChevronDown,
  ChevronRight,
  LogIn,
  Pencil,
  RefreshCw,
  Columns3,
  UserCheck,
  Battery,
  BatteryCharging,
  BatteryLow,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import CreateUserWizard from "@/components/admin/create-user/CreateUserWizard";
import { SignedAvatarImage, SignedImage } from "@/components/ui/signed-image";

// Types
interface Role {
  id: string;
  name: string;
  is_system: boolean;
}

interface AppUser {
  id: string;
  email: string;
  full_name: string | null;
  username: string | null;
  phone: string | null;
  role_id: string | null;
  reporting_manager_id: string | null;
  is_active: boolean;
  created_at: string;
  battery_level: number | null;
  battery_charging: boolean | null;
  device_status_at: string | null;
  roles?: { id: string; name: string } | null;
}

interface Employee {
  user_id: string;
  monthly_salary: number;
  daily_da_allowance: number;
  hq: string | null;
  date_of_joining: string | null;
  band: string | null;
}

// Role color mapping matching reference
const roleColorMap: Record<string, { border: string; text: string; bg: string; badge: string }> = {
  "Admin": { border: "border-t-rose-500", text: "text-rose-600 dark:text-rose-400", bg: "bg-rose-500/10", badge: "bg-rose-500" },
  "Sales Manager": { border: "border-t-emerald-500", text: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-500/10", badge: "bg-emerald-500" },
  "Field User": { border: "border-t-blue-500", text: "text-blue-600 dark:text-blue-400", bg: "bg-blue-500/10", badge: "bg-blue-500" },
  "Data Viewer": { border: "border-t-amber-500", text: "text-amber-600 dark:text-amber-400", bg: "bg-amber-500/10", badge: "bg-amber-500" },
};
const defaultRoleColor = { border: "border-t-slate-500", text: "text-slate-600 dark:text-slate-400", bg: "bg-slate-500/10", badge: "bg-slate-500" };
const getRoleColor = (role: string) => roleColorMap[role] || defaultRoleColor;

// Fetch hooks
function useRoles() {
  return useQuery({
    queryKey: ["security-profiles-as-roles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("security_profiles").select("id, name, is_system").order("name");
      if (error) throw error;
      return (data || []).map(d => ({ id: d.id, name: d.name, is_system: d.is_system })) as Role[];
    },
  });
}

function useAppUsers() {
  return useQuery({
    queryKey: ["admin-app-users"],
    queryFn: async () => {
      const { data, error } = await supabase.from("users").select("*, roles(id, name)").order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as AppUser[];
    },
  });
}

function useEmployees() {
  return useQuery({
    queryKey: ["admin-employees"],
    queryFn: async () => {
      const { data, error } = await supabase.from("employees").select("*");
      if (error) throw error;
      return (data || []) as Employee[];
    },
  });
}

function useProfiles() {
  return useQuery({
    queryKey: ["admin-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, profile_picture_url, user_status");
      if (error) throw error;
      return (data || []) as { id: string; profile_picture_url: string | null; user_status: string }[];
    },
  });
}

// Battery display for the admin Users & Roles table — mirrors the icon/color
// logic in DeviceStatusBadges but shows only the percentage (no network row).
function BatteryCell({ level, charging, statusAt }: { level: number | null; charging: boolean | null; statusAt: string | null }) {
  if (level == null) {
    return (
      <span className="text-sm text-muted-foreground" title="Battery not reported (e.g. iOS Safari, or device hasn't reported yet)">
        —
      </span>
    );
  }
  const stale = !statusAt || (Date.now() - new Date(statusAt).getTime()) > 3 * 60 * 1000;
  const Icon = charging ? BatteryCharging : level < 30 ? BatteryLow : Battery;
  const color = level >= 50 ? "text-emerald-600" : level >= 30 ? "text-amber-600" : "text-red-600";
  return (
    <span
      className={`inline-flex items-center gap-1 text-sm ${stale ? "opacity-50" : ""}`}
      title={`Battery ${level}%${charging ? " (charging)" : ""}${statusAt ? ` · updated ${new Date(statusAt).toLocaleString()}` : ""}`}
    >
      <Icon className={`h-4 w-4 ${color}`} />
      {level}%
    </span>
  );
}

function useUserSecurityAssignments() {
  return useQuery({
    queryKey: ["admin-user-security-assignments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_security_profiles")
        .select("user_id, profile_id, security_profiles(id, name)");
      if (error) throw error;
      console.log("User security assignments:", data);
      return (data || []) as { user_id: string; profile_id: string; security_profiles: { id: string; name: string } | null }[];
    },
  });
}

// User Detail Dialog
function UserDetailDialog({ user, employee, roleName }: { user: AppUser; employee?: Employee; roleName: string }) {
  const { data: profiles = [] } = useProfiles();
  const profile = profiles.find((p) => p.id === user.id);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon"><Eye className="h-4 w-4" /></Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>User Details</DialogTitle>
          <DialogDescription>Complete profile information</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              <SignedAvatarImage src={profile?.profile_picture_url || undefined} />
              <AvatarFallback className="bg-primary text-primary-foreground text-lg">
                {(user.full_name || user.username || "U").charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div>
              <h3 className="font-semibold text-lg">{user.full_name || "—"}</h3>
              <p className="text-sm text-muted-foreground">{user.email}</p>
              <Badge variant={user.is_active ? "default" : "secondary"}>
                {user.is_active ? "Active" : "Inactive"}
              </Badge>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><span className="text-muted-foreground">Phone:</span> <span className="font-medium">{user.phone || "—"}</span></div>
            <div><span className="text-muted-foreground">Role:</span> <Badge variant="outline">{roleName}</Badge></div>
            <div><span className="text-muted-foreground">HQ:</span> <span className="font-medium">{employee?.hq || "—"}</span></div>
            <div><span className="text-muted-foreground">Band:</span> <span className="font-medium">{employee?.band || "—"}</span></div>
            <div><span className="text-muted-foreground">Salary:</span> <span className="font-medium">₹{employee?.monthly_salary?.toLocaleString() || "0"}</span></div>
            <div><span className="text-muted-foreground">DA:</span> <span className="font-medium">₹{employee?.daily_da_allowance?.toLocaleString() || "0"}</span></div>
            <div><span className="text-muted-foreground">Joined:</span> <span className="font-medium">{employee?.date_of_joining || "—"}</span></div>
            <div><span className="text-muted-foreground">Created:</span> <span className="font-medium">{new Date(user.created_at).toLocaleDateString()}</span></div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Edit User Dialog - Tabbed version matching reference screenshot
function EditUserDialog({ user, employee, roles, allUsers, onSaved, open, onOpenChange, onDeleteUser }: {
  user: AppUser;
  employee?: Employee;
  roles: Role[];
  allUsers: AppUser[];
  onSaved: () => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleteUser: (user: AppUser) => void;
}) {
  const queryClient = useQueryClient();
  const [fullName, setFullName] = useState(user.full_name || "");
  const [username, setUsername] = useState(user.username || "");
  const [phone, setPhone] = useState(user.phone || "");
  const [roleId, setRoleId] = useState(user.role_id || "");
  const [managerId, setManagerId] = useState(user.reporting_manager_id || "none");
  const [secondaryManagerId, setSecondaryManagerId] = useState("none");
  const [newPassword, setNewPassword] = useState("");
  const [resettingPassword, setResettingPassword] = useState(false);

  const [dateOfJoining, setDateOfJoining] = useState(employee?.date_of_joining || "");
  const [loading, setLoading] = useState(false);
  const [deletingData, setDeletingData] = useState(false);
  const [editTab, setEditTab] = useState("basic");

  // Fetch current security profile assignment
  useEffect(() => {
    const fetchSecurityProfile = async () => {
      try {
        const { data, error } = await supabase
          .from("user_security_profiles")
          .select("profile_id")
          .eq("user_id", user.id)
          .maybeSingle();

        if (error && error.code !== "PGRST116") {
          console.error("Error fetching security profile:", error);
        }

        if (data?.profile_id) {
          console.log("Loaded role for user:", { userId: user.id, profileId: data.profile_id });
          setRoleId(data.profile_id);
        } else {
          console.log("No security profile found for user, using fallback:", { userId: user.id, roleId: user.role_id });
          setRoleId(user.role_id || "");
        }
      } catch (err) {
        console.error("Exception fetching security profile:", err);
        setRoleId(user.role_id || "");
      }
    };
    fetchSecurityProfile();
    setFullName(user.full_name || "");
    setUsername(user.username || "");
    setPhone(user.phone || "");
    setManagerId(user.reporting_manager_id || "none");
    setSecondaryManagerId("none");
    setNewPassword("");
    setEditTab("basic");
  }, [user.id]);

  const roleEnumMap: Record<string, string> = {};
  roles.forEach((r) => {
    if (r.name === "Admin") roleEnumMap[r.id] = "admin";
    else if (r.name === "Field User") roleEnumMap[r.id] = "user";
    else if (r.name === "Sales Manager") roleEnumMap[r.id] = "sales_manager";
    else if (r.name === "Data Viewer") roleEnumMap[r.id] = "data_viewer";
  });

  const managerOptions = allUsers.filter((u) => u.id !== user.id && u.is_active);

  const handleSave = async () => {
    setLoading(true);
    try {
      // Update user profile data (don't update role_id - use security_profiles instead)
      const updatePayload: any = {
        full_name: fullName || null,
        username: username || null,
        phone: phone || null,
        reporting_manager_id: managerId === "none" ? null : managerId,
      };

      const { error: userError } = await supabase.from("users").update(updatePayload).eq("id", user.id);
      if (userError) throw userError;

      const { error: profileError } = await supabase.from("profiles").update({
        full_name: fullName || null,
        username: username || null,
        phone_number: phone || null,
      }).eq("id", user.id);
      if (profileError) throw profileError;

      // Update security profile assignment
      if (roleId) {
        console.log("Saving role:", { userId: user.id, profileId: roleId });
        try {
          // First try to delete existing assignment
          const { error: deleteError } = await supabase
            .from("user_security_profiles")
            .delete()
            .eq("user_id", user.id);

          if (deleteError && deleteError.code !== "PGRST116") {
            console.warn("Warning deleting old role:", deleteError);
          }

          // Then insert the new assignment
          const { data, error: insertError } = await supabase
            .from("user_security_profiles")
            .insert({ user_id: user.id, profile_id: roleId });

          if (insertError) {
            console.error("Role assignment error details:", {
              error: insertError,
              userId: user.id,
              roleId: roleId,
              message: insertError.message,
              code: insertError.code,
            });
            throw new Error(`Failed to assign role: ${insertError.message}`);
          }
          console.log("Role saved successfully", data);
        } catch (err) {
          console.error("Role update exception:", err);
          throw err;
        }
      }


      const { error: empError } = await supabase.from("employees").upsert({
        user_id: user.id,
        manager_id: managerId === "none" ? null : managerId,
        secondary_manager_id: secondaryManagerId === "none" ? null : secondaryManagerId,
        date_of_joining: dateOfJoining || null,
      }, { onConflict: "user_id" });
      if (empError) throw empError;

      // Refetch data to ensure latest roles are shown
      await Promise.all([
        queryClient.refetchQueries({ queryKey: ["admin-user-security-assignments"] }),
        queryClient.refetchQueries({ queryKey: ["admin-app-users"] }),
      ]);
      toast.success("User updated successfully");
      onOpenChange(false);
      onSaved();
    } catch (err: any) {
      toast.error(err.message || "Failed to update user");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteData = async () => {
    setDeletingData(true);
    try {
      // Delete operational records but keep the user account
      await supabase.from("attendance").delete().eq("user_id", user.id);
      await supabase.from("gps_tracking").delete().eq("user_id", user.id);
      await supabase.from("gps_tracking_stops").delete().eq("user_id", user.id);
      await supabase.from("additional_expenses").delete().eq("user_id", user.id);
      await supabase.from("activity_events").delete().eq("user_id", user.id);
      await supabase.from("leave_applications").delete().eq("user_id", user.id);
      toast.success("User data cleared successfully");
      onSaved();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete data");
    } finally {
      setDeletingData(false);
    }
  };

  const generatePassword = () => {
    // Long random password so it never matches a known-breached ("weak") password
    const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
    const lower = "abcdefghijkmnpqrstuvwxyz";
    const digits = "23456789";
    const symbols = "!@#$%^&*-_+=";
    const all = upper + lower + digits + symbols;
    const rand = (set: string) => set.charAt(Math.floor(Math.random() * set.length));
    const chars = [rand(upper), rand(lower), rand(digits), rand(symbols)];
    for (let i = 0; i < 12; i++) chars.push(rand(all));
    setNewPassword(chars.sort(() => Math.random() - 0.5).join(""));
  };

  const handleResetPassword = async () => {
    if (newPassword.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    setResettingPassword(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-reset-password", {
        body: { target_user_id: user.id, new_password: newPassword },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success(`Password reset for ${user.email}. Share it with the user — they must change it on next login.`);
    } catch (err: any) {
      toast.error(err.message || "Failed to reset password");
    } finally {
      setResettingPassword(false);
    }
  };



  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit User: {user.full_name || user.email}</DialogTitle>
          <DialogDescription>Update user profile, managers and password</DialogDescription>
        </DialogHeader>
        <Tabs value={editTab} onValueChange={setEditTab} className="w-full">
          <TabsList className="w-full grid grid-cols-3">
            <TabsTrigger value="basic">Basic Info</TabsTrigger>
            <TabsTrigger value="managers">Managers</TabsTrigger>
            <TabsTrigger value="password">Reset Password</TabsTrigger>
          </TabsList>
          <TabsContent value="basic" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Full Name</Label>
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Username</Label>
              <Input value={username} onChange={(e) => setUsername(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Phone Number</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Date of Joining</Label>
              <Input type="date" value={dateOfJoining} onChange={(e) => setDateOfJoining(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input value={user.email} disabled className="bg-muted" />
              <p className="text-xs text-muted-foreground">Email cannot be changed</p>
            </div>
            <div className="space-y-2">
              <Label>Security Profile (Role)</Label>
              <Select value={roleId} onValueChange={setRoleId}>
                <SelectTrigger><SelectValue placeholder="Select role" /></SelectTrigger>
                <SelectContent>
                  {roles.map((r) => (
                    <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </TabsContent>
          <TabsContent value="managers" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Primary Manager</Label>
              <Select value={managerId} onValueChange={setManagerId}>
                <SelectTrigger><SelectValue placeholder="Select manager" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— None —</SelectItem>
                  {managerOptions.map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.full_name || u.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Secondary Manager</Label>
              <Select value={secondaryManagerId} onValueChange={setSecondaryManagerId}>
                <SelectTrigger><SelectValue placeholder="Select secondary manager" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— None —</SelectItem>
                  {managerOptions.map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.full_name || u.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </TabsContent>
          <TabsContent value="password" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>New Password</Label>
              <div className="flex gap-2">
                <Input
                  type="text"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new password"
                />
                <Button variant="outline" size="sm" onClick={generatePassword} className="shrink-0">
                  <RefreshCw className="h-3.5 w-3.5 mr-1" /> Generate
                </Button>
              </div>
              <Button
                className="w-full"
                size="sm"
                onClick={handleResetPassword}
                disabled={resettingPassword || newPassword.length < 6}
              >
                {resettingPassword ? "Resetting..." : "Reset Password"}
              </Button>
              <p className="text-xs text-muted-foreground">
                Sign-in email: <span className="font-medium">{user.email}</span>. The user must sign in with this
                exact email and will be asked to set their own password on next login.
              </p>
            </div>

          </TabsContent>
        </Tabs>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between mt-4 pt-4 border-t gap-2">
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="text-amber-600 border-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950 text-xs"
              onClick={handleDeleteData}
              disabled={deletingData}
            >
              {deletingData ? "Deleting..." : "Delete Data"}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              className="text-xs"
              onClick={() => { onOpenChange(false); onDeleteUser(user); }}
            >
              Delete User
            </Button>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" className="text-xs" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button size="sm" className="text-xs" onClick={handleSave} disabled={loading}>
              {loading ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ===== User Hierarchy with tree/list toggle =====
function UserHierarchy({ users, roles, profiles, userRoleMap, getRoleDisplayName }: { users: AppUser[]; roles: Role[]; profiles: { id: string; profile_picture_url: string | null }[]; userRoleMap: Map<string, string>; getRoleDisplayName: (user: AppUser) => string }) {
  const [viewMode, setViewMode] = useState<"tree" | "list">("list");
  const roleMap = new Map(roles.map((r) => [r.id, r.name]));
  const activeUsers = users.filter(u => u.is_active);
  const topLevel = activeUsers.filter((u) => !u.reporting_manager_id);
  const getChildren = (managerId: string) =>
    activeUsers.filter((u) => u.reporting_manager_id === managerId);

  // Collect unique roles for legend
  const allRoleNames = new Set<string>();
  activeUsers.forEach(u => {
    const rn = userRoleMap.get(u.id) || (u.role_id ? roleMap.get(u.role_id) : null);
    if (rn) allRoleNames.add(rn);
  });

  // Org chart tree node
  const renderOrgNode = (user: AppUser): React.ReactNode => {
    const children = getChildren(user.id);
    const roleName = getRoleDisplayName(user);
    const profile = profiles.find((p) => p.id === user.id);
    const colors = getRoleColor(roleName);
    // Compact node width for mobile: 64px mobile, 96px desktop
    const nodeW = 64;
    const nodeWMd = 96;
    const halfGap = 2; // gap-1 = 4px, half = 2

    return (
      <div key={user.id} className="flex flex-col items-center">
        <div className="flex flex-col items-center w-16 md:w-24">
          <div className={`rounded-full p-[2px] ring-2 ${colors.border.replace('border-t-', 'ring-')}`}>
            <Avatar className="h-8 w-8 md:h-12 md:w-12">
              <SignedAvatarImage src={profile?.profile_picture_url || undefined} />
              <AvatarFallback className={`text-[10px] md:text-sm font-semibold text-white ${colors.badge}`}>
                {(user.full_name || "U").charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </div>
          <p className="text-[9px] md:text-[11px] font-medium text-center mt-0.5 md:mt-1 leading-tight truncate w-full">
            {user.full_name || user.email}
          </p>
          <p className={`text-[8px] md:text-[9px] text-center truncate w-full ${colors.text}`}>{roleName}</p>
        </div>
        {children.length > 0 && (
          <>
            <div className="w-px h-2 md:h-4 bg-border" />
            <div className="relative flex items-start">
              {children.length > 1 && (
                <div
                  className="absolute top-0 h-px bg-border"
                  style={{
                    left: `calc(50% - ${(children.length - 1) * 34}px)`,
                    width: `${(children.length - 1) * 68}px`,
                  }}
                />
              )}
              <div className="flex gap-1 md:gap-2">
                {children.map(child => (
                  <div key={child.id} className="flex flex-col items-center">
                    <div className="w-px h-2 md:h-4 bg-border" />
                    {renderOrgNode(child)}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    );
  };

  // List view row with collapsible children
  const HierarchyRow = ({ user, level = 0 }: { user: AppUser; level?: number }) => {
    const [isOpen, setIsOpen] = useState(level < 1);
    const children = getChildren(user.id);
    const hasReports = children.length > 0;
    const roleName = getRoleDisplayName(user);
    const colors = getRoleColor(roleName);
    const profile = profiles.find(p => p.id === user.id);

    const levelAccents = [
      'border-l-rose-500', 'border-l-purple-500', 'border-l-blue-500',
      'border-l-emerald-500', 'border-l-amber-500', 'border-l-cyan-500',
    ];
    const accentClass = levelAccents[Math.min(level, levelAccents.length - 1)];

    return (
      <div className={level > 0 ? "ml-3 md:ml-5" : ""}>
        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
          <div className={`flex items-center gap-2.5 p-2 rounded-lg border-l-[3px] transition-colors ${accentClass} ${hasReports ? "cursor-pointer hover:bg-muted/60" : ""}`}>
            {hasReports ? (
              <CollapsibleTrigger asChild>
                <button className="shrink-0 p-0.5 rounded hover:bg-muted">
                  {isOpen ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                </button>
              </CollapsibleTrigger>
            ) : (
              <div className="w-[18px]" />
            )}
            <Avatar className="h-7 w-7 shrink-0">
              <SignedAvatarImage src={profile?.profile_picture_url || undefined} />
              <AvatarFallback className={`text-[10px] font-semibold text-white ${colors.badge}`}>
                {(user.full_name || "U").charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium truncate leading-tight">{user.full_name || user.email}</p>
            </div>
            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-5 shrink-0 font-medium border ${colors.bg} ${colors.text}`}>
              {roleName}
            </Badge>
            {hasReports && (
              <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums">{children.length}</span>
            )}
          </div>
          {hasReports && (
            <CollapsibleContent className="pt-1 space-y-1">
              {children.map(child => (
                <HierarchyRow key={child.id} user={child} level={level + 1} />
              ))}
            </CollapsibleContent>
          )}
        </Collapsible>
      </div>
    );
  };

  if (activeUsers.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Network className="h-12 w-12 mx-auto mb-3 opacity-50" />
        <p>No users found. Create users to see the hierarchy.</p>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="px-3 py-3 md:px-6 md:pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm md:text-base">
            <Users className="h-4 w-4" /> User Hierarchy
          </CardTitle>
          <ToggleGroup type="single" value={viewMode} onValueChange={(v) => v && setViewMode(v as "tree" | "list")} size="sm">
            <ToggleGroupItem value="tree" aria-label="Tree view" className="h-7 w-7 p-0">
              <Network className="h-3.5 w-3.5" />
            </ToggleGroupItem>
            <ToggleGroupItem value="list" aria-label="List view" className="h-7 w-7 p-0">
              <List className="h-3.5 w-3.5" />
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
        {/* Role color legend */}
        <div className="flex flex-wrap gap-1.5 mt-2">
          {Array.from(allRoleNames).map((rn) => {
            const c = getRoleColor(rn);
            return (
              <span
                key={rn}
                className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${c.bg} ${c.text}`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${c.badge}`} />
                {rn}
              </span>
            );
          })}
        </div>
      </CardHeader>
      <CardContent className="px-3 pb-3 md:px-6 md:pb-6">
        {viewMode === "tree" ? (
          <ScrollArea className="w-full">
            <div className="flex justify-center py-2 md:py-4 min-w-max">
              <div className="flex gap-1 md:gap-6">
                {topLevel.map(user => renderOrgNode(user))}
              </div>
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        ) : (
          <div className="space-y-1">
            {topLevel.map(user => (
              <HierarchyRow key={user.id} user={user} level={0} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Pagination component
function TablePagination({ total, page, pageSize, onPageChange }: {
  total: number; page: number; pageSize: number; onPageChange: (p: number) => void;
}) {
  const totalPages = Math.ceil(total / pageSize);
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between px-4 py-3 border-t gap-2">
      <p className="text-xs text-muted-foreground shrink-0">
        {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}
      </p>
      <div className="flex gap-1">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)} className="h-7 px-2 text-xs">
          Prev
        </Button>
        <span className="flex items-center text-xs text-muted-foreground px-1">{page}/{totalPages}</span>
        <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)} className="h-7 px-2 text-xs">
          Next
        </Button>
      </div>
    </div>
  );
}

export default function AdminUserManagement() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("overview");
  const [deleteTarget, setDeleteTarget] = useState<AppUser | null>(null);
  const [editingUser, setEditingUser] = useState<AppUser | null>(null);
  const [roleFilter, setRoleFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const pageSize = 10;

  // Column chooser config
  const allColumns = [
    { key: "photo", label: "Photo", default: true, locked: true },
    { key: "username", label: "User Name", default: true },
    { key: "email", label: "Email", default: true },
    { key: "role", label: "Role", default: true },
    { key: "manager", label: "Reporting Manager", default: true },
    { key: "active", label: "Active", default: true },
    { key: "battery", label: "Battery", default: true },
    { key: "full_name", label: "Full Name", default: false },
    { key: "phone", label: "Phone", default: false },
    { key: "email_status", label: "Email Status", default: false },
    { key: "joined", label: "Joined Date", default: false },
    { key: "action", label: "Actions", default: true, locked: true },
  ];
  const [visibleColumns, setVisibleColumns] = useState<string[]>(
    allColumns.filter((c) => c.default).map((c) => c.key)
  );
  const isColVisible = (key: string) => visibleColumns.includes(key);
  const toggleColumn = (key: string) => {
    setVisibleColumns((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const handleLoginAsUser = async (user: AppUser) => {
    try {
      // Get current user's session token
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      if (sessionError || !session) {
        toast.error('Not authenticated');
        return;
      }

      // Call Edge Function to generate impersonation session
      const { data: responseData, error: functionError } = await supabase.functions.invoke(
        'impersonate-user',
        {
          body: { target_user_id: user.id },
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        }
      );

      if (functionError) {
        console.error('Function error:', functionError);
        toast.error(functionError.message || 'Failed to impersonate user');
        return;
      }

      if (!responseData.success) {
        toast.error(responseData.error || 'Impersonation failed');
        return;
      }

      // Set the new session for the target user
      const { error: setSessionError } = await supabase.auth.setSession({
        access_token: responseData.session.access_token,
        refresh_token: responseData.session.refresh_token,
      });

      if (setSessionError) {
        console.error('Set session error:', setSessionError);
        toast.error('Failed to set session');
        return;
      }

      // Store impersonation info for reference
      localStorage.setItem('impersonation_info', JSON.stringify({
        impersonated_user_id: user.id,
        impersonated_user_email: user.email,
        impersonated_user_name: user.full_name,
        impersonation_start: new Date().toISOString(),
      }));

      console.log(`Successfully impersonating ${user.full_name || user.email}`);

      // Show success message
      toast.success(`Logged in as ${user.full_name || user.email}`);

      // Redirect to dashboard
      setTimeout(() => {
        navigate('/dashboard');
      }, 500);
    } catch (err: any) {
      console.error('Impersonation error:', err);
      toast.error(err.message || 'Failed to impersonate user');
    }
  };

  const { data: appUsers = [], isLoading: usersLoading } = useAppUsers();
  const { data: employees = [] } = useEmployees();
  const { data: roles = [] } = useRoles();
  const { data: profiles = [] } = useProfiles();
  const { data: secAssignments = [] } = useUserSecurityAssignments();

  const queryClient = useQueryClient();

  // Map security profile names to display names
  const secProfileNameToDisplay: Record<string, string> = {
    "System Administrator": "Admin",
    "Sales Manager": "Sales Manager",
    "Field Sales Executive": "Field User",
    "Data Viewer": "Data Viewer",
  };

  // Build user→security profile name map from assignments
  const userRoleMap = new Map<string, string>();
  secAssignments.forEach((a) => {
    if (a.security_profiles?.name) {
      // Map security profile name to display name
      const displayName = secProfileNameToDisplay[a.security_profiles.name] || a.security_profiles.name;
      userRoleMap.set(a.user_id, displayName);
    }
  });

  // Debug: log the userRoleMap to help troubleshoot role display issues
  console.log("User role map population:", {
    totalUsers: appUsers.length,
    secAssignmentsCount: secAssignments.length,
    usersInRoleMap: userRoleMap.size,
    sampleAssignments: secAssignments.slice(0, 3),
    sampleRoleMap: Array.from(userRoleMap.entries()).slice(0, 3),
  });

  // Helper function to get role display name for a user (regular function for hoisting)
  function getRoleDisplayName(user: AppUser): string {
    // 1. Check security profile assignment
    const secProfileRole = userRoleMap.get(user.id);
    if (secProfileRole) return secProfileRole;

    // 2. Check users.roles relationship (from join)
    if (user.roles?.name) return user.roles.name;

    // 3. Default to dash
    return "—";
  }

  // Fallback: old roleMap from roles table for users not yet assigned a security profile
  const roleMap = new Map(roles.map((r) => [r.id, r.name]));

  const filteredUsers = appUsers.filter((u) => {
    const matchesSearch =
      (u.full_name || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (u.email || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (u.phone || "").toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRole = roleFilter === "all" || (u.role_id && roleMap.get(u.role_id) === roleFilter);
    return matchesSearch && matchesRole;
  });

  const paginatedUsers = filteredUsers.slice((page - 1) * pageSize, page * pageSize);

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-app-users"] });
    queryClient.invalidateQueries({ queryKey: ["admin-employees"] });
    queryClient.invalidateQueries({ queryKey: ["admin-profiles"] });
    queryClient.invalidateQueries({ queryKey: ["admin-user-security-assignments"] });
  };

  const toggleActive = useMutation({
    mutationFn: async ({ userId, isActive }: { userId: string; isActive: boolean }) => {
      const { error } = await supabase.from("users").update({ is_active: isActive }).eq("id", userId);
      if (error) throw error;
      await supabase.from("profiles").update({ user_status: isActive ? "active" : "inactive" }).eq("id", userId);
    },
    onSuccess: () => { invalidateAll(); toast.success("User status updated"); },
    onError: (err: any) => toast.error(err.message),
  });

  const deleteUser = useMutation({
    mutationFn: async (userId: string) => {
      await supabase.from("users").update({ reporting_manager_id: null }).eq("reporting_manager_id", userId);
      await supabase.from("employees").update({ manager_id: null }).eq("manager_id", userId);
      await supabase.from("leave_balance").delete().eq("user_id", userId);
      await supabase.from("leave_applications").delete().eq("user_id", userId);
      await supabase.from("employee_documents").delete().eq("user_id", userId);
      await supabase.from("activity_events").delete().eq("user_id", userId);
      await supabase.from("attendance").delete().eq("user_id", userId);
      await supabase.from("gps_tracking").delete().eq("user_id", userId);
      await supabase.from("gps_tracking_stops").delete().eq("user_id", userId);
      await supabase.from("additional_expenses").delete().eq("user_id", userId);
      await supabase.from("beat_plans").delete().eq("user_id", userId);
      const { data: userVisits } = await supabase.from("visits").select("id").eq("user_id", userId);
      if (userVisits && userVisits.length > 0) {
        const visitIds = userVisits.map(v => v.id);
        const { data: userOrders } = await supabase.from("orders").select("id").in("visit_id", visitIds);
        if (userOrders && userOrders.length > 0) {
          await supabase.from("order_items").delete().in("order_id", userOrders.map(o => o.id));
        }
        await supabase.from("orders").delete().eq("user_id", userId);
        await supabase.from("visits").delete().eq("user_id", userId);
      }
      await supabase.from("orders").delete().eq("user_id", userId);
      await supabase.from("employees").delete().eq("user_id", userId);
      await supabase.from("user_roles").delete().eq("user_id", userId);
      const { error: userDelError } = await supabase.from("users").delete().eq("id", userId);
      if (userDelError) throw userDelError;
      await supabase.from("profiles").update({ user_status: "deleted" }).eq("id", userId);
    },
    onSuccess: () => { invalidateAll(); toast.success("User deleted"); setDeleteTarget(null); },
    onError: (err: any) => toast.error(err.message || "Failed to delete user"),
  });

  // Per-role stats (using security profile assignments, not legacy role_id)
  const roleCounts = roles.map(r => ({
    name: r.name,
    count: secAssignments.filter(sa => sa.profile_id === r.id).length,
  }));

  return (
    <motion.div className="p-3 md:p-4 space-y-4 md:space-y-6 max-w-6xl mx-auto" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <h1 className="text-xl md:text-3xl font-bold text-foreground">User Management</h1>
          <p className="text-xs md:text-sm text-muted-foreground">Manage users, roles, and hierarchy</p>
        </div>
      </div>

      {/* Role-based stat cards */}
      <div className="grid grid-cols-3 md:flex gap-2 md:gap-3 md:overflow-x-auto pb-1">
        {/* Total Users card */}
        <Card className="border-t-2 border-t-foreground">
          <CardContent className="p-2.5 md:p-3 text-center">
            <p className="text-[10px] md:text-xs text-muted-foreground mb-0.5">Total</p>
            <div className="flex items-center justify-center gap-1">
              <Users className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-lg md:text-xl font-bold">{appUsers.length}</span>
            </div>
          </CardContent>
        </Card>
        {roleCounts.slice(0, 5).map((rc) => {
          const colors = getRoleColor(rc.name);
          return (
            <Card key={rc.name} className={`border-t-2 ${colors.border} md:min-w-[120px] md:flex-shrink-0`}>
              <CardContent className="p-2.5 md:p-3 text-center">
                <p className={`text-[10px] md:text-xs mb-0.5 truncate ${colors.text}`}>{rc.name}</p>
                <div className="flex items-center justify-center gap-1">
                  <span className="text-lg md:text-xl font-bold">{rc.count}</span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full flex">
          <TabsTrigger value="overview" className="flex-1 text-xs sm:text-sm gap-1.5">
            <BarChart3 className="h-3.5 w-3.5" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="users" className="flex-1 text-xs sm:text-sm gap-1.5">
            <Users className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Users & Roles</span>
            <span className="sm:hidden">Users</span>
          </TabsTrigger>
          <TabsTrigger value="create" className="flex-1 text-xs sm:text-sm gap-1.5">
            <UserPlus className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Create User</span>
            <span className="sm:hidden">Create</span>
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab - Hierarchy */}
        <TabsContent value="overview" className="space-y-4">
          <UserHierarchy users={appUsers} roles={roles} profiles={profiles} userRoleMap={userRoleMap} getRoleDisplayName={getRoleDisplayName} />
        </TabsContent>

        <TabsContent value="users" className="space-y-4">
          <Card>
            <CardHeader className="p-3 md:p-6">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <CardTitle className="text-base md:text-xl">Users & Roles</CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">{filteredUsers.length} users total</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="h-8 w-8 p-0 md:w-auto md:px-3 md:gap-1.5">
                        <Columns3 className="h-4 w-4" />
                        <span className="hidden md:inline">Columns</span>
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-56" align="end">
                      <p className="text-sm font-medium mb-3">Choose columns</p>
                      <ScrollArea className="h-[280px]">
                        <div className="space-y-3">
                          {allColumns.map((col) => (
                            <label key={col.key} className="flex items-center gap-2 cursor-pointer">
                              <Checkbox
                                checked={visibleColumns.includes(col.key)}
                                disabled={col.locked}
                                onCheckedChange={() => toggleColumn(col.key)}
                              />
                              <span className="text-sm">{col.label}</span>
                            </label>
                          ))}
                        </div>
                      </ScrollArea>
                    </PopoverContent>
                  </Popover>
                  <Button variant="outline" size="sm" className="h-8 w-8 p-0 md:w-auto md:px-3 md:gap-1.5" onClick={invalidateAll}>
                    <RefreshCw className="h-4 w-4" />
                    <span className="hidden md:inline">Refresh</span>
                  </Button>
                </div>
              </div>
              <div className="relative mt-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search name, email..."
                  className="pl-9 h-9 text-sm"
                  value={searchQuery}
                  onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
                />
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {usersLoading ? (
                <div className="text-center py-12 text-muted-foreground">Loading users...</div>
              ) : filteredUsers.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p className="text-sm">No users found.</p>
                </div>
              ) : (
                <>
                  {/* Desktop Table */}
                  <div className="hidden md:block overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {isColVisible("photo") && <TableHead className="w-[60px]">Photo</TableHead>}
                          {isColVisible("username") && <TableHead>User Name</TableHead>}
                          {isColVisible("full_name") && <TableHead>Full Name</TableHead>}
                          {isColVisible("email") && <TableHead>Email</TableHead>}
                          {isColVisible("phone") && <TableHead>Phone</TableHead>}
                          {isColVisible("role") && <TableHead>Role</TableHead>}
                          {isColVisible("manager") && <TableHead>Manager</TableHead>}
                          {isColVisible("email_status") && <TableHead>Email Status</TableHead>}
                          {isColVisible("joined") && <TableHead>Joined</TableHead>}
                          {isColVisible("active") && <TableHead>Active</TableHead>}
                          {isColVisible("battery") && <TableHead>Battery</TableHead>}
                          {isColVisible("action") && <TableHead>Actions</TableHead>}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {paginatedUsers.map((user) => {
                          const employee = employees.find((e) => e.user_id === user.id);
                          const roleName = getRoleDisplayName(user);
                          const manager = user.reporting_manager_id ? appUsers.find((u) => u.id === user.reporting_manager_id) : null;
                          const profile = profiles.find((p) => p.id === user.id);
                          const colors = getRoleColor(roleName);
                          return (
                            <TableRow key={user.id}>
                              {isColVisible("photo") && (
                                <TableCell>
                                  <Avatar
                                    className={`h-9 w-9 ${profile?.profile_picture_url ? 'cursor-pointer hover:ring-2 hover:ring-primary transition-all' : ''}`}
                                    onClick={() => profile?.profile_picture_url && setPhotoPreviewUrl(profile.profile_picture_url)}
                                  >
                                    <SignedAvatarImage src={profile?.profile_picture_url || undefined} />
                                    <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                                      {(user.full_name || user.email || "U").charAt(0).toUpperCase()}
                                    </AvatarFallback>
                                  </Avatar>
                                </TableCell>
                              )}
                              {isColVisible("username") && (
                                <TableCell><p className="text-sm font-medium truncate">{user.full_name || user.username || "—"}</p></TableCell>
                              )}
                              {isColVisible("full_name") && (
                                <TableCell><p className="text-sm truncate">{user.full_name || "—"}</p></TableCell>
                              )}
                              {isColVisible("email") && (
                                <TableCell><p className="text-sm text-muted-foreground truncate">{user.email}</p></TableCell>
                              )}
                              {isColVisible("phone") && (
                                <TableCell><p className="text-sm text-muted-foreground">{user.phone || "—"}</p></TableCell>
                              )}
                              {isColVisible("role") && (
                                <TableCell>
                                  <Badge variant="outline" className={`text-xs ${colors.bg} ${colors.text}`}>{roleName}</Badge>
                                </TableCell>
                              )}
                              {isColVisible("manager") && (
                                <TableCell className="text-sm">{manager?.full_name || manager?.email || "—"}</TableCell>
                              )}
                              {isColVisible("email_status") && (
                                <TableCell>
                                  <Badge variant="outline" className="text-xs bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">Verified</Badge>
                                </TableCell>
                              )}
                              {isColVisible("joined") && (
                                <TableCell className="text-sm text-muted-foreground">{employee?.date_of_joining || "—"}</TableCell>
                              )}
                              {isColVisible("active") && (
                                <TableCell>
                                  <Switch
                                    checked={user.is_active}
                                    onCheckedChange={(checked) => toggleActive.mutate({ userId: user.id, isActive: checked })}
                                  />
                                </TableCell>
                              )}
                              {isColVisible("battery") && (
                                <TableCell>
                                  <BatteryCell
                                    level={user.battery_level ?? null}
                                    charging={user.battery_charging ?? null}
                                    statusAt={user.device_status_at ?? null}
                                  />
                                </TableCell>
                              )}
                              {isColVisible("action") && (
                                <TableCell>
                                  <div className="flex items-center gap-1">
                                    <UserDetailDialog user={user} employee={employee} roleName={roleName} />
                                    <Button variant="ghost" size="sm" className="gap-1 text-xs h-8 px-2" onClick={() => setEditingUser(user)}>
                                      <Pencil className="h-3.5 w-3.5" /> Edit
                                    </Button>
                                    <DropdownMenu>
                                      <DropdownMenuTrigger asChild>
                                        <Button variant="ghost" size="icon" className="h-8 w-8"><MoreVertical className="h-4 w-4" /></Button>
                                      </DropdownMenuTrigger>
                                      <DropdownMenuContent align="end">
                                        <DropdownMenuItem onClick={() => setEditingUser(user)}>
                                          <Edit className="h-4 w-4 mr-2" /> Edit
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => handleLoginAsUser(user)}>
                                          <UserCheck className="h-4 w-4 mr-2" /> Login as User
                                        </DropdownMenuItem>
                                        <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeleteTarget(user)}>
                                          <Trash2 className="h-4 w-4 mr-2" /> Delete
                                        </DropdownMenuItem>
                                      </DropdownMenuContent>
                                    </DropdownMenu>
                                  </div>
                                </TableCell>
                              )}
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Mobile Card List */}
                  <div className="md:hidden divide-y">
                    {paginatedUsers.map((user) => {
                      const employee = employees.find((e) => e.user_id === user.id);
                      const roleName = getRoleDisplayName(user);
                      const manager = user.reporting_manager_id ? appUsers.find((u) => u.id === user.reporting_manager_id) : null;
                      const profile = profiles.find((p) => p.id === user.id);
                      const colors = getRoleColor(roleName);
                      return (
                        <div key={user.id} className="p-3 flex items-start gap-3">
                          <Avatar className="h-9 w-9 shrink-0 mt-0.5">
                            <SignedAvatarImage src={profile?.profile_picture_url || undefined} />
                            <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                              {(user.full_name || user.email || "U").charAt(0).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-medium truncate">{user.full_name || user.username || "—"}</p>
                              <div className="flex items-center gap-1 shrink-0">
                                <Switch
                                  checked={user.is_active}
                                  onCheckedChange={(checked) => toggleActive.mutate({ userId: user.id, isActive: checked })}
                                  className="scale-75"
                                />
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-7 w-7"><MoreVertical className="h-3.5 w-3.5" /></Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem onClick={() => setEditingUser(user)}>
                                      <Edit className="h-4 w-4 mr-2" /> Edit
                                    </DropdownMenuItem>
                                    <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeleteTarget(user)}>
                                      <Trash2 className="h-4 w-4 mr-2" /> Delete
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                            </div>
                            <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                            <div className="flex items-center gap-2 mt-1.5">
                              <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-5 ${colors.bg} ${colors.text}`}>{roleName}</Badge>
                              {manager && (
                                <span className="text-[10px] text-muted-foreground truncate">→ {manager.full_name || manager.email}</span>
                              )}
                              <span className="ml-auto shrink-0">
                                <BatteryCell
                                  level={user.battery_level ?? null}
                                  charging={user.battery_charging ?? null}
                                  statusAt={user.device_status_at ?? null}
                                />
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <TablePagination total={filteredUsers.length} page={page} pageSize={pageSize} onPageChange={setPage} />
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Create User Tab - Wizard */}
        <TabsContent value="create">
          <CreateUserWizard onSuccess={() => { invalidateAll(); setActiveTab("users"); }} />
        </TabsContent>

      </Tabs>

      {/* Edit User Dialog */}
      {editingUser && (
        <EditUserDialog
          user={editingUser}
          employee={employees.find((e) => e.user_id === editingUser.id)}
          roles={roles}
          allUsers={appUsers}
          onSaved={invalidateAll}
          open={!!editingUser}
          onOpenChange={(open) => { if (!open) setEditingUser(null); }}
          onDeleteUser={(u) => setDeleteTarget(u)}
        />
      )}

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete User</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{deleteTarget?.full_name || deleteTarget?.email}</strong>? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteUser.mutate(deleteTarget.id)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Photo Preview Lightbox */}
      <Dialog open={!!photoPreviewUrl} onOpenChange={(open) => !open && setPhotoPreviewUrl(null)}>
        <DialogContent className="max-w-md p-2 bg-background">
          <DialogHeader className="sr-only">
            <DialogTitle>Profile Photo</DialogTitle>
            <DialogDescription>Full size profile photo preview</DialogDescription>
          </DialogHeader>
          {photoPreviewUrl && (
            <SignedImage
              src={photoPreviewUrl}
              alt="Profile photo"
              className="w-full h-auto rounded-lg object-contain max-h-[70vh]"
            />
          )}
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
