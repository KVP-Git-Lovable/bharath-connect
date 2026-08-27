import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUserProfile } from "@/hooks/useUserProfile";
import CameraCapture from "@/components/CameraCapture";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import NotificationsEnableCard from "@/components/NotificationsEnableCard";
import { toast } from "sonner";
import { SignedAvatarImage, SignedImage } from "@/components/ui/signed-image";
import {
  Camera,
  Mail,
  Phone,
  MapPin,
  Building2,
  GraduationCap,
  Calendar,
  Shield,
  Pencil,
  Save,
  X,
  User,
  AlertTriangle,
  Trash2,
} from "lucide-react";

interface ProfileData {
  full_name: string;
  username: string;
  phone_number: string;
  profile_picture_url: string | null;
  email: string;
  address: string;
  alternate_email: string;
  education: string;
  emergency_contact_number: string;
  hq: string;
  date_of_joining: string | null;
  band: string;
}

export default function Profile() {
  const queryClient = useQueryClient();
  const { profile, roleName, isAdmin, initials, loading: profileLoading } = useUserProfile();
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [photoPreviewOpen, setPhotoPreviewOpen] = useState(false);
  const [data, setData] = useState<ProfileData>({
    full_name: "",
    username: "",
    phone_number: "",
    profile_picture_url: null,
    email: "",
    address: "",
    alternate_email: "",
    education: "",
    emergency_contact_number: "",
    hq: "",
    date_of_joining: null,
    band: "",
  });

  useEffect(() => {
    loadFullProfile();
  }, []);

  const loadFullProfile = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const [profileRes, employeeRes, userRes] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).single(),
      supabase.from("employees").select("*").eq("user_id", user.id).single(),
      supabase.from("users").select("email, phone").eq("id", user.id).single(),
    ]);

    setData({
      full_name: profileRes.data?.full_name || "",
      username: profileRes.data?.username || "",
      phone_number: profileRes.data?.phone_number || userRes.data?.phone || "",
      profile_picture_url: profileRes.data?.profile_picture_url || null,
      email: userRes.data?.email || user.email || "",
      address: employeeRes.data?.address || "",
      alternate_email: employeeRes.data?.alternate_email || "",
      education: employeeRes.data?.education || "",
      emergency_contact_number: employeeRes.data?.emergency_contact_number || "",
      hq: employeeRes.data?.hq || "",
      date_of_joining: employeeRes.data?.date_of_joining || null,
      band: employeeRes.data?.band || "",
    });
  };

  const handleCameraCapture = async (blob: Blob) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    setUploading(true);
    try {
      const filePath = `${user.id}/profile.jpg`;

      const { error: uploadError } = await supabase.storage
        .from("employee-photos")
        .upload(filePath, blob, { upsert: true, contentType: "image/jpeg" });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("employee-photos")
        .getPublicUrl(filePath);

      const url = urlData.publicUrl + "?t=" + Date.now();

      await supabase.from("profiles").update({ profile_picture_url: url }).eq("id", user.id);
      setData((prev) => ({ ...prev, profile_picture_url: url }));
      toast.success("Profile photo updated");
    } catch (err: any) {
      toast.error("Failed to upload photo: " + err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleRemovePhoto = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    setUploading(true);
    try {
      const filePath = `${user.id}/profile.jpg`;
      await supabase.storage.from("employee-photos").remove([filePath]);
      await supabase.from("profiles").update({ profile_picture_url: null }).eq("id", user.id);
      setData((prev) => ({ ...prev, profile_picture_url: null }));
      toast.success("Profile photo removed");
    } catch (err: any) {
      toast.error("Failed to remove photo: " + err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    setSaving(true);
    try {
      // Update profiles table
      const { error: profileError } = await supabase
        .from("profiles")
        .update({
          full_name: data.full_name,
          username: data.username,
          phone_number: data.phone_number,
        })
        .eq("id", user.id);

      if (profileError) throw profileError;

      // Update users table
      await supabase
        .from("users")
        .update({
          full_name: data.full_name,
          username: data.username,
          phone: data.phone_number,
        })
        .eq("id", user.id);

      // Update employees table
      const { data: empExists } = await supabase
        .from("employees")
        .select("id")
        .eq("user_id", user.id)
        .single();

      if (empExists) {
        await supabase
          .from("employees")
          .update({
            address: data.address,
            alternate_email: data.alternate_email,
            education: data.education,
            emergency_contact_number: data.emergency_contact_number,
          })
          .eq("user_id", user.id);
      }

      queryClient.invalidateQueries({ queryKey: ["user-profile-core", user.id] });
      toast.success("Profile updated successfully");
      setIsEditing(false);
    } catch (err: any) {
      toast.error("Failed to save: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (field: keyof ProfileData, value: string) => {
    setData((prev) => ({ ...prev, [field]: value }));
  };

  const displayRole = roleName || (isAdmin ? "Admin" : "User");

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="pb-20"
    >
      {/* Profile Header */}
      <div className="gradient-hero text-primary-foreground px-4 py-6 rounded-b-2xl">
        <div className="flex flex-col items-center gap-3">
          <div className="relative">
            <Avatar
              className="h-20 w-20 border-3 border-primary-foreground/30 shadow-lg cursor-pointer"
              onClick={() => data.profile_picture_url && setPhotoPreviewOpen(true)}
            >
              {data.profile_picture_url ? (
                <SignedAvatarImage src={data.profile_picture_url} alt="Profile" />
              ) : null}
              <AvatarFallback className="bg-primary-foreground/20 text-primary-foreground text-xl font-bold">
                {initials}
              </AvatarFallback>
            </Avatar>
            <button
              onClick={() => setCameraOpen(true)}
              disabled={uploading}
              className="absolute bottom-0 right-0 w-7 h-7 rounded-full bg-primary-foreground/90 flex items-center justify-center cursor-pointer hover:bg-primary-foreground transition-colors shadow-md"
            >
              <Camera className="h-3.5 w-3.5 text-primary" />
            </button>
          </div>
          <div className="text-center">
            <h1 className="text-lg font-bold">{data.full_name || "Your Name"}</h1>
            <div className="flex items-center justify-center gap-1.5 text-xs opacity-80 mt-0.5">
              <Shield className="h-3.5 w-3.5" />
              <span>{displayRole}</span>
            </div>
            {data.email && (
              <p className="text-xs opacity-70 mt-1">{data.email}</p>
            )}
          </div>
          {data.profile_picture_url && (
            <Button
              size="sm"
              variant="ghost"
              className="text-primary-foreground/80 hover:text-primary-foreground hover:bg-primary-foreground/10 text-xs gap-1.5"
              onClick={handleRemovePhoto}
              disabled={uploading}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Remove Photo
            </Button>
          )}
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Notifications */}
        {profile?.id && <NotificationsEnableCard userId={profile.id} />}

        {/* Edit Toggle */}
        <div className="flex justify-end">
          {isEditing ? (
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setIsEditing(false);
                  loadFullProfile();
                }}
              >
                <X className="h-4 w-4 mr-1" /> Cancel
              </Button>
              <Button size="sm" onClick={handleSave} disabled={saving}>
                <Save className="h-4 w-4 mr-1" /> {saving ? "Saving..." : "Save"}
              </Button>
            </div>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setIsEditing(true)}>
              <Pencil className="h-4 w-4 mr-1" /> Edit Profile
            </Button>
          )}
        </div>

        {/* Personal Information */}
        <Card className="shadow-card">
          <CardContent className="p-4 space-y-4">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <User className="h-4 w-4 text-primary" />
              Personal Information
            </h3>
            <Separator />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Full Name</Label>
                {isEditing ? (
                  <Input
                    value={data.full_name}
                    onChange={(e) => handleChange("full_name", e.target.value)}
                    placeholder="Enter full name"
                  />
                ) : (
                  <p className="text-sm font-medium">{data.full_name || "—"}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Username</Label>
                {isEditing ? (
                  <Input
                    value={data.username}
                    onChange={(e) => handleChange("username", e.target.value)}
                    placeholder="Enter username"
                  />
                ) : (
                  <p className="text-sm font-medium">{data.username || "—"}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground flex items-center gap-1">
                  <Mail className="h-3 w-3" /> Email
                </Label>
                <p className="text-sm font-medium text-muted-foreground">{data.email || "—"}</p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground flex items-center gap-1">
                  <Phone className="h-3 w-3" /> Phone Number
                </Label>
                {isEditing ? (
                  <Input
                    value={data.phone_number}
                    onChange={(e) => handleChange("phone_number", e.target.value)}
                    placeholder="Enter phone number"
                  />
                ) : (
                  <p className="text-sm font-medium">{data.phone_number || "—"}</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Employment Details */}
        <Card className="shadow-card">
          <CardContent className="p-4 space-y-4">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Building2 className="h-4 w-4 text-primary" />
              Employment Details
            </h3>
            <Separator />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground flex items-center gap-1">
                  <Shield className="h-3 w-3" /> Role
                </Label>
                <p className="text-sm font-medium">{displayRole}</p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Band / Designation</Label>
                <p className="text-sm font-medium">{data.band || "—"}</p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground flex items-center gap-1">
                  <MapPin className="h-3 w-3" /> HQ / Location
                </Label>
                <p className="text-sm font-medium">{data.hq || "—"}</p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground flex items-center gap-1">
                  <Calendar className="h-3 w-3" /> Date of Joining
                </Label>
                <p className="text-sm font-medium">
                  {data.date_of_joining
                    ? new Date(data.date_of_joining).toLocaleDateString("en-IN", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })
                    : "—"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Additional Information */}
        <Card className="shadow-card">
          <CardContent className="p-4 space-y-4">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <GraduationCap className="h-4 w-4 text-primary" />
              Additional Information
            </h3>
            <Separator />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Alternate Email</Label>
                {isEditing ? (
                  <Input
                    value={data.alternate_email}
                    onChange={(e) => handleChange("alternate_email", e.target.value)}
                    placeholder="Enter alternate email"
                  />
                ) : (
                  <p className="text-sm font-medium">{data.alternate_email || "—"}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" /> Emergency Contact
                </Label>
                {isEditing ? (
                  <Input
                    value={data.emergency_contact_number}
                    onChange={(e) => handleChange("emergency_contact_number", e.target.value)}
                    placeholder="Enter emergency contact"
                  />
                ) : (
                  <p className="text-sm font-medium">{data.emergency_contact_number || "—"}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Education</Label>
                {isEditing ? (
                  <Input
                    value={data.education}
                    onChange={(e) => handleChange("education", e.target.value)}
                    placeholder="Enter education"
                  />
                ) : (
                  <p className="text-sm font-medium">{data.education || "—"}</p>
                )}
              </div>

              <div className="col-span-1 sm:col-span-2 space-y-1.5">
                <Label className="text-xs text-muted-foreground flex items-center gap-1">
                  <MapPin className="h-3 w-3" /> Address
                </Label>
                {isEditing ? (
                  <Textarea
                    value={data.address}
                    onChange={(e) => handleChange("address", e.target.value)}
                    placeholder="Enter address"
                    rows={2}
                  />
                ) : (
                  <p className="text-sm font-medium">{data.address || "—"}</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={photoPreviewOpen} onOpenChange={setPhotoPreviewOpen}>
        <DialogContent className="max-w-md p-2 bg-black/90 border-none">
          {data.profile_picture_url && (
            <SignedImage
              src={data.profile_picture_url}
              alt="Profile Preview"
              className="w-full h-auto rounded-lg object-contain max-h-[80vh]"
            />
          )}
        </DialogContent>
      </Dialog>

      <CameraCapture
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCapture={handleCameraCapture}
        title="Profile Photo"
      />
    </motion.div>
  );
}
