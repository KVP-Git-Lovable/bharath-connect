import { SignedImage } from "@/components/ui/signed-image";
import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Camera, UserCircle, X } from "lucide-react";
import CameraCapture from "./CameraCapture";
import { toast } from "sonner";

interface ProfileSetupModalProps {
  userId: string;
  profilePictureUrl: string | null;
  onComplete: () => void;
}

export default function ProfileSetupModal({ userId, profilePictureUrl, onComplete }: ProfileSetupModalProps) {
  const [open, setOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    // Show modal if no profile picture set
    if (!profilePictureUrl) {
      setOpen(true);
    } else {
      setOpen(false);
    }
  }, [profilePictureUrl]);

  const handleCapture = async (blob: Blob) => {
    setUploading(true);
    try {
      const timestamp = Date.now();
      const filePath = `${userId}/baseline_${timestamp}.jpg`;

      const { error: uploadError } = await supabase.storage
        .from("employee-photos")
        .upload(filePath, blob, { contentType: "image/jpeg", upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("employee-photos")
        .getPublicUrl(filePath);

      const publicUrl = urlData.publicUrl;

      // Update profile
      const { error: updateError } = await supabase
        .from("profiles")
        .update({
          profile_picture_url: publicUrl,
          onboarding_completed: true,
        })
        .eq("id", userId);

      if (updateError) throw updateError;

      setPreviewUrl(publicUrl);
      toast.success("Profile photo saved successfully!");
      setOpen(false);
      onComplete();
    } catch (err: any) {
      console.error("Upload error:", err);
      toast.error(err.message || "Failed to upload photo");
    } finally {
      setUploading(false);
    }
  };

  const handleSkip = async () => {
    // Mark onboarding as completed even if skipped
    await supabase
      .from("profiles")
      .update({ onboarding_completed: true })
      .eq("id", userId);
    setOpen(false);
    onComplete();
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => { if (!v) handleSkip(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserCircle className="h-5 w-5" />
              Setup Your Profile
            </DialogTitle>
            <DialogDescription>
              Take a selfie to set up face verification for attendance. This photo will be used as your baseline for daily check-in matching.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col items-center gap-4 py-4">
            {previewUrl ? (
              <SignedImage src={previewUrl} alt="Profile" className="w-32 h-32 rounded-full object-cover border-2 border-primary" />
            ) : (
              <div className="w-32 h-32 rounded-full bg-muted flex items-center justify-center">
                <UserCircle className="h-16 w-16 text-muted-foreground" />
              </div>
            )}

            <Button onClick={() => setCameraOpen(true)} disabled={uploading} className="gap-2">
              <Camera className="h-4 w-4" />
              {uploading ? "Uploading..." : "Take Profile Photo"}
            </Button>

            <Button variant="ghost" onClick={handleSkip} className="text-muted-foreground text-sm">
              Skip for now
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <CameraCapture
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCapture={handleCapture}
        title="Profile Photo"
      />
    </>
  );
}
