import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Shield, Pencil, Trash2, Users2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

interface SecurityProfile {
  id: string;
  name: string;
  description: string | null;
  is_system: boolean;
  created_at: string;
}

interface Props {
  onSelectProfile?: (profile: SecurityProfile) => void;
  selectedProfileId?: string;
}

export default function SecurityProfilesList({ onSelectProfile, selectedProfileId }: Props) {
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [editProfile, setEditProfile] = useState<SecurityProfile | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  // Delete state
  const [deleteTarget, setDeleteTarget] = useState<SecurityProfile | null>(null);
  const [reassignProfileId, setReassignProfileId] = useState<string>("");
  const [deleteLoading, setDeleteLoading] = useState(false);

  const profilesQuery = useQuery({
    queryKey: ["security-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("security_profiles")
        .select("*")
        .order("name");
      if (error) throw error;
      return (data || []) as SecurityProfile[];
    },
  });

  const userCountsQuery = useQuery({
    queryKey: ["security-profile-user-counts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_security_profiles")
        .select("profile_id");
      if (error) throw error;
      const counts: Record<string, number> = {};
      (data || []).forEach((row: any) => {
        if (row.profile_id) {
          counts[row.profile_id] = (counts[row.profile_id] || 0) + 1;
        }
      });
      return counts;
    },
  });

  const createProfile = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Name required");
      const { error } = await supabase.from("security_profiles").insert({
        name: name.trim(),
        description: description.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["security-profiles"] });
      toast.success("Profile created");
      setName("");
      setDescription("");
      setAddOpen(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const updateProfile = useMutation({
    mutationFn: async () => {
      if (!editProfile || !name.trim()) throw new Error("Name required");
      const { error } = await supabase
        .from("security_profiles")
        .update({ name: name.trim(), description: description.trim() || null })
        .eq("id", editProfile.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["security-profiles"] });
      toast.success("Profile updated");
      setEditProfile(null);
      setName("");
      setDescription("");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      const assignedCount = userCounts[deleteTarget.id] || 0;

      if (assignedCount > 0) {
        if (!reassignProfileId) {
          toast.error("Please select a profile to reassign users to");
          setDeleteLoading(false);
          return;
        }
        // Reassign users to the selected profile
        const { error: reassignError } = await supabase
          .from("user_security_profiles")
          .update({ profile_id: reassignProfileId })
          .eq("profile_id", deleteTarget.id);
        if (reassignError) throw reassignError;
      }

      // Delete related permissions first
      const { error: permError } = await supabase
        .from("profile_object_permissions")
        .delete()
        .eq("profile_id", deleteTarget.id);
      if (permError) throw permError;

      // Now delete the profile
      const { error } = await supabase
        .from("security_profiles")
        .delete()
        .eq("id", deleteTarget.id);

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ["security-profiles"] });
      queryClient.invalidateQueries({ queryKey: ["security-profile-user-counts"] });
      toast.success("Profile deleted permanently");
      setDeleteTarget(null);
      setReassignProfileId("");
    } catch (err: any) {
      toast.error(err.message || "Failed to delete profile");
    } finally {
      setDeleteLoading(false);
    }
  };

  const profiles = profilesQuery.data || [];
  const userCounts = userCountsQuery.data || {};

  const openEdit = (p: SecurityProfile) => {
    setEditProfile(p);
    setName(p.name);
    setDescription(p.description || "");
  };

  const openDelete = (p: SecurityProfile) => {
    setDeleteTarget(p);
    setReassignProfileId("");
  };

  const deleteTargetUserCount = deleteTarget ? (userCounts[deleteTarget.id] || 0) : 0;
  const availableReassignProfiles = profiles.filter(
    (p) => deleteTarget && p.id !== deleteTarget.id
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 md:p-5">
          <div className="flex items-start sm:items-center justify-between mb-5 gap-3">
            <div className="min-w-0">
              <h2 className="text-lg md:text-xl font-semibold">Security Profiles</h2>
              <p className="text-xs md:text-sm text-muted-foreground">Define user roles with different permission sets</p>
            </div>
            <Dialog open={addOpen} onOpenChange={setAddOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="shrink-0"><Plus className="h-4 w-4 mr-1.5" />Create Profile</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Create Security Profile</DialogTitle></DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Profile Name</Label>
                    <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Regional Manager" />
                  </div>
                  <div className="space-y-2">
                    <Label>Description</Label>
                    <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe the access level..." rows={3} />
                  </div>
                  <Button onClick={() => createProfile.mutate()} disabled={createProfile.isPending} className="w-full">
                    {createProfile.isPending ? "Creating..." : "Create Profile"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {/* Desktop Table */}
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-xs font-medium text-muted-foreground">Profile Name</TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground">Description</TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground text-center">Type</TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground text-center">Users</TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {profiles.map((profile) => (
                  <TableRow
                    key={profile.id}
                    className={`cursor-pointer transition-colors ${selectedProfileId === profile.id ? "bg-primary/5" : ""}`}
                    onClick={() => onSelectProfile?.(profile)}
                  >
                    <TableCell className="py-3">
                      <div className="flex items-center gap-2.5">
                        <Shield className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <span className="font-medium text-sm">{profile.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="py-3 text-sm text-muted-foreground max-w-[300px]">
                      {profile.description || "—"}
                    </TableCell>
                    <TableCell className="py-3 text-center">
                      <Badge variant={profile.is_system ? "secondary" : "outline"} className="text-[11px] px-2 py-0.5">
                        {profile.is_system ? "System" : "Custom"}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-3 text-center">
                      <div className="flex items-center justify-center gap-1 text-sm text-muted-foreground">
                        <Users2 className="h-3.5 w-3.5" />
                        <span className="font-medium">{userCounts[profile.id] || 0}</span>
                      </div>
                    </TableCell>
                    <TableCell className="py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); openEdit(profile); }}>
                          <Pencil className="h-4 w-4 text-muted-foreground" />
                        </Button>
                        {profile.name !== "System Administrator" && (
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); openDelete(profile); }}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {profiles.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground text-sm">
                      No security profiles found. Create one to get started.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {/* Mobile Card List */}
          <div className="md:hidden space-y-3">
            {profiles.map((profile) => (
              <div
                key={profile.id}
                className={`border border-border rounded-lg p-3.5 cursor-pointer transition-colors ${selectedProfileId === profile.id ? "bg-primary/5 border-primary/30" : ""}`}
                onClick={() => onSelectProfile?.(profile)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Shield className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <span className="font-medium text-sm truncate">{profile.name}</span>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2 ml-6">
                      {profile.description || "No description"}
                    </p>
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); openEdit(profile); }}>
                      <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                    {profile.name !== "System Administrator" && (
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); openDelete(profile); }}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-2 ml-6">
                  <Badge variant={profile.is_system ? "secondary" : "outline"} className="text-[10px] px-1.5 py-0">
                    {profile.is_system ? "System" : "Custom"}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <Users2 className="h-3 w-3" />
                    {userCounts[profile.id] || 0} users
                  </span>
                </div>
              </div>
            ))}
            {profiles.length === 0 && (
              <p className="text-center py-8 text-muted-foreground text-sm">
                No security profiles found. Create one to get started.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={!!editProfile} onOpenChange={(open) => { if (!open) setEditProfile(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Profile</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Profile Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
            </div>
            <Button onClick={() => updateProfile.mutate()} disabled={updateProfile.isPending} className="w-full">
              {updateProfile.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) { setDeleteTarget(null); setReassignProfileId(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive">Delete "{deleteTarget?.name}"?</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              This will <strong>permanently delete</strong> this security profile and all its permissions. This action cannot be undone.
            </p>

            {deleteTargetUserCount > 0 && (
              <div className="border border-destructive/30 bg-destructive/5 rounded-lg p-4 space-y-3">
                <p className="text-sm font-medium text-destructive">
                  ⚠️ {deleteTargetUserCount} user{deleteTargetUserCount > 1 ? "s are" : " is"} assigned to this profile
                </p>
                <p className="text-xs text-muted-foreground">
                  Please select a profile to reassign these users to before deleting:
                </p>
                <Select value={reassignProfileId} onValueChange={setReassignProfileId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a profile to reassign users..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableReassignProfiles.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setDeleteTarget(null); setReassignProfileId(""); }}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleteLoading || (deleteTargetUserCount > 0 && !reassignProfileId)}
              onClick={handleDelete}
            >
              {deleteLoading ? "Deleting..." : "Delete Permanently"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
