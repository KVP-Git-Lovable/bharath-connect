import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Camera, ImagePlus, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import CameraCapture from "@/components/CameraCapture";
import { isNative, takeNativePhoto } from "@/utils/nativePermissions";
import { uploadActivityPhoto, resolveActivityPhotoUrl } from "@/utils/activityPhotos";
import type { ActivityPhotoEntry } from "@/hooks/useActivities";
import { format, parseISO } from "date-fns";

interface ActivityPhotoManagerProps {
  photos: ActivityPhotoEntry[];
  onChange?: (photos: ActivityPhotoEntry[]) => void;
  editable?: boolean;
  compact?: boolean;
}

function PhotoThumb({
  photo,
  editable,
  onRemove,
  onOpen,
}: {
  photo: ActivityPhotoEntry;
  editable?: boolean;
  onRemove?: () => void;
  onOpen?: (url: string) => void;
}) {
  const [url, setUrl] = useState<string>("");
  useEffect(() => {
    let active = true;
    resolveActivityPhotoUrl(photo.url).then((u) => {
      if (active) setUrl(u);
    });
    return () => {
      active = false;
    };
  }, [photo.url]);

  return (
    <div className="relative group">
      <button
        type="button"
        onClick={() => url && onOpen?.(url)}
        className="block w-full aspect-square rounded-lg overflow-hidden bg-muted border"
      >
        {url ? (
          <img src={url} alt="Activity photo" className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        )}
      </button>
      {editable && onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center shadow"
        >
          <X className="h-3 w-3" />
        </button>
      )}
      {(photo.at || photo.address) && (
        <p className="text-[9px] text-muted-foreground mt-0.5 line-clamp-1">
          {photo.at ? format(parseISO(photo.at), "MMM d, h:mm a") : ""}
          {photo.lat && photo.lng ? ` • ${Number(photo.lat).toFixed(3)},${Number(photo.lng).toFixed(3)}` : ""}
        </p>
      )}
    </div>
  );
}

export default function ActivityPhotoManager({ photos, onChange, editable = false, compact = false }: ActivityPhotoManagerProps) {
  const [showCamera, setShowCamera] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addBlobs = useCallback(
    async (blobs: Blob[]) => {
      if (!onChange || blobs.length === 0) return;
      setUploading(true);
      try {
        const entries: ActivityPhotoEntry[] = [];
        for (const blob of blobs) {
          const entry = await uploadActivityPhoto(blob);
          entries.push(entry);
        }
        onChange([...photos, ...entries]);
        toast.success(`${entries.length} photo${entries.length > 1 ? "s" : ""} added`);
      } catch (err: any) {
        toast.error(err.message || "Failed to upload photo");
      } finally {
        setUploading(false);
      }
    },
    [onChange, photos]
  );

  const handleTakePhoto = useCallback(async () => {
    if (isNative()) {
      const blob = await takeNativePhoto();
      if (blob) {
        await addBlobs([blob]);
        return;
      }
    }
    setShowCamera(true);
  }, [addBlobs]);

  const handleFiles = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      if (files.length > 0) await addBlobs(files);
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    [addBlobs]
  );

  const handleRemove = (idx: number) => {
    if (!onChange) return;
    onChange(photos.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-2">
      {editable && (
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" className="flex-1 gap-1.5" onClick={handleTakePhoto} disabled={uploading}>
            {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
            Take Photo
          </Button>
          <Button type="button" variant="outline" size="sm" className="flex-1 gap-1.5" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            <ImagePlus className="h-3.5 w-3.5" />
            Upload
          </Button>
          <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFiles} />
        </div>
      )}

      {photos.length > 0 ? (
        <div className={`grid gap-2 ${compact ? "grid-cols-4" : "grid-cols-3"}`}>
          {photos.map((p, idx) => (
            <PhotoThumb
              key={`${p.url}-${idx}`}
              photo={p}
              editable={editable}
              onRemove={() => handleRemove(idx)}
              onOpen={(u) => setViewerUrl(u)}
            />
          ))}
        </div>
      ) : (
        !editable && <p className="text-xs text-muted-foreground">No photos uploaded</p>
      )}

      <CameraCapture
        open={showCamera}
        onClose={() => setShowCamera(false)}
        onCapture={(blob) => addBlobs([blob])}
        title="Capture Activity Photo"
      />

      {viewerUrl && (
        <div
          className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4"
          onClick={() => setViewerUrl(null)}
          style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          <button
            type="button"
            className="absolute top-4 right-4 h-9 w-9 rounded-full bg-white/15 text-white flex items-center justify-center"
            style={{ top: "max(1rem, env(safe-area-inset-top))" }}
            onClick={() => setViewerUrl(null)}
          >
            <X className="h-5 w-5" />
          </button>
          <img src={viewerUrl} alt="Activity photo" className="max-w-full max-h-full object-contain rounded-lg" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}
