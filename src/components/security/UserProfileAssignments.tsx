import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Search, UserPlus, X, Users2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

interface SecurityProfile {
  id: string;
  name: string;
}

interface Assignment {
  id: string;
  user_id: string;
  profile_id: string | null;
  profile_name?: string;
  full_name?: string;
  username?: string;
}

export default function UserProfileAssignments() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [assignOpen, setAssignOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedProfileId, setSelectedProfileId] = useState("");

  const profilesQuery = useQuery({
    queryKey: ["security-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("security_profiles").select("id, name").order("name");
      if (error) throw error;
      return (data || []) as SecurityProfile[];
    },
  });

  const assignmentsQuery = useQuery({
    queryKey: ["user-profile-assignments"],
    queryFn: async () => {
      const { data: assignments, error } = await supabase
        .from("user_security_profiles")
        .select("id, user_id, profile_id");
      if (error) throw error;

      const { data: profiles } = await supabase.from("profiles").select("id, full_name, username");
      const { data: secProfiles } = await supabase.from("security_profiles").select("id, name");

      const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));
      const secMap = new Map((secProfiles || []).map((s: any) => [s.id, s.name]));

      return (assignments || []).map((a: any) => {
        const user = profileMap.get(a.user_id) as any;
        return {
          ...a,
          full_name: user?.full_name || "Unknown",
          username: user?.username || "",
          profile_name: a.profile_id ? secMap.get(a.profile_id) || "Unknown" : "None",
        } as Assignment;
      });
    },
  });

  const usersQuery = useQuery({
    queryKey: ["all-profiles-for-assignment"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, full_name, username").order("full_name");
      if (error) throw error;
      return (data || []) as { id: string; full_name: string; username: string }[];
    },
  });

  const assignProfile = useMutation({
    mutationFn: async () => {
      if (!selectedUserId || !selectedProfileId) throw new Error("Select user and profile");
      const { data: existing } = await supabase
        .from("user_security_profiles")
        .select("id")
        .eq("user_id", selectedUserId)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from("user_security_profiles")
          .update({ profile_id: selectedProfileId })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("user_security_profiles")
          .insert({ user_id: selectedUserId, profile_id: selectedProfileId });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-profile-assignments"] });
      queryClient.invalidateQueries({ queryKey: ["security-profile-user-counts"] });
      toast.success("Profile assigned");
      setSelectedUserId("");
      setSelectedProfileId("");
      setAssignOpen(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const removeAssignment = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("user_security_profiles").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-profile-assignments"] });
      queryClient.invalidateQueries({ queryKey: ["security-profile-user-counts"] });
      toast.success("Assignment removed");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const assignments = (assignmentsQuery.data || []).filter((a) =>
    a.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    a.username?.toLowerCase().includes(search.toLowerCase())
  );

  const profiles = profilesQuery.data || [];
  const users = usersQuery.data || [];
  const assignedUserIds = new Set((assignmentsQuery.data || []).map((a) => a.user_id));

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-3 md:p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-3">
            <div className="min-w-0">
              <h2 className="text-base md:text-xl font-semibold">Permission Set Groups</h2>
              <p className="text-xs md:text-sm text-muted-foreground">Override role permissions for specific users</p>
            </div>
            <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="shrink-0 self-end sm:self-auto"><UserPlus className="h-4 w-4 mr-1.5" />Assign User</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Assign Security Profile</DialogTitle></DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">User</label>
                    <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                      <SelectTrigger><SelectValue placeholder="Select user..." /></SelectTrigger>
                      <SelectContent>
                        {users.map((u) => (
                          <SelectItem key={u.id} value={u.id}>
                            {u.full_name || u.username} {assignedUserIds.has(u.id) ? "(reassign)" : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Security Profile</label>
                    <Select value={selectedProfileId} onValueChange={setSelectedProfileId}>
                      <SelectTrigger><SelectValue placeholder="Select profile..." /></SelectTrigger>
                      <SelectContent>
                        {profiles.map((p) => (
                          <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button onClick={() => assignProfile.mutate()} disabled={assignProfile.isPending || !selectedUserId || !selectedProfileId} className="w-full">
                    {assignProfile.isPending ? "Assigning..." : "Assign Profile"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search users..." className="pl-9" />
          </div>

          {assignments.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground text-sm">
              {search ? "No matching users found" : "No users have been assigned to a permission set group yet"}
            </div>
          ) : (
            <>
              {/* Desktop Table */}
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="text-xs font-medium text-muted-foreground">User</TableHead>
                      <TableHead className="text-xs font-medium text-muted-foreground">Security Profile</TableHead>
                      <TableHead className="text-xs font-medium text-muted-foreground text-right w-16">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {assignments.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell className="py-2.5">
                          <div className="flex items-center gap-2.5">
                            <Avatar className="h-8 w-8">
                              <AvatarFallback className="text-[10px] bg-primary/10 text-primary font-medium">
                                {(a.full_name || "?").slice(0, 2).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="text-sm font-medium">{a.full_name}</p>
                              <p className="text-[11px] text-muted-foreground">{a.username}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="py-2.5">
                          <Badge variant="outline" className="text-xs font-normal">{a.profile_name}</Badge>
                        </TableCell>
                        <TableCell className="py-2.5 text-right">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeAssignment.mutate(a.id)}>
                            <X className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile Card List */}
              <div className="md:hidden space-y-2">
                {assignments.map((a) => (
                  <div key={a.id} className="flex items-center gap-2.5 p-2.5 border border-border rounded-lg">
                    <Avatar className="h-8 w-8 shrink-0">
                      <AvatarFallback className="text-[10px] bg-primary/10 text-primary font-medium">
                        {(a.full_name || "?").slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{a.full_name}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-normal">{a.profile_name}</Badge>
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => removeAssignment.mutate(a.id)}>
                      <X className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
