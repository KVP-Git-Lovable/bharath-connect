import { useState, useEffect } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ImageIcon, User, Clock } from "lucide-react";
import { format, parseISO } from "date-fns";
import { resolveActivityPhotoUrl } from "@/utils/activityPhotos";
import { getSiteAttachmentUrl } from "@/utils/siteAttachments";
import type { HubGalleryPhoto } from "@/hooks/useSiteHub";

async function resolve(photo: HubGalleryPhoto): Promise<string> {
  if (photo.kind === "activity") return resolveActivityPhotoUrl(photo.storageKey);
  return (await getSiteAttachmentUrl(photo.storageKey)) || "";
}

interface GalleryThumbProps {
  photo: HubGalleryPhoto;
  onOpen: (photo: HubGalleryPhoto, url: string) => void;
  onActivityClick?: (activityId: string) => void;
}

function GalleryThumb({ photo, onOpen, onActivityClick }: GalleryThumbProps) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    let active = true;
    resolve(photo).then((u) => { if (active) setUrl(u); });
    return () => { active = false; };
  }, [photo]);

  return (
    <div className="group rounded-lg overflow-hidden border bg-card flex flex-col">
      <button
        type="button"
        onClick={() => url && onOpen(photo, url)}
        className="relative aspect-square bg-muted overflow-hidden"
      >
        {url ? (
          <img src={url} alt={photo.label || "Activity photo"} loading="lazy"
            className="h-full w-full object-cover transition-transform group-hover:scale-105" />
        ) : (
          <div className="h-full w-full flex items-center justify-center text-muted-foreground">
            <ImageIcon className="h-6 w-6" />
          </div>
        )}
      </button>
      <div className="p-2 space-y-1">
        <div className="flex items-center gap-1 text-[11px] text-muted-foreground truncate">
          <User className="h-3 w-3 shrink-0" />
          <span className="truncate">{photo.uploadedBy}</span>
        </div>
        {photo.at && (
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Clock className="h-3 w-3 shrink-0" />
            <span>{format(parseISO(photo.at), "dd MMM yy, h:mm a")}</span>
          </div>
        )}
        {photo.activityCode && (
          <button
            type="button"
            onClick={() => photo.activityId && onActivityClick?.(photo.activityId)}
            className="w-full text-left"
          >
            <Badge variant="secondary" className="text-[10px] font-mono cursor-pointer hover:bg-primary hover:text-primary-foreground">
              {photo.activityCode}
            </Badge>
          </button>
        )}
      </div>
    </div>
  );
}

interface SiteGalleryProps {
  gallery: HubGalleryPhoto[];
  onActivityClick?: (activityId: string) => void;
}

export default function SiteGallery({ gallery, onActivityClick }: SiteGalleryProps) {
  const [preview, setPreview] = useState<{ photo: HubGalleryPhoto; url: string } | null>(null);

  if (gallery.length === 0) {
    return <p className="text-sm text-muted-foreground py-8 text-center">No photos uploaded yet.</p>;
  }

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {gallery.map((p, i) => (
          <GalleryThumb key={`${p.storageKey}-${i}`} photo={p} onOpen={(photo, url) => setPreview({ photo, url })} onActivityClick={onActivityClick} />
        ))}
      </div>

      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-w-2xl p-2">
          {preview && (
            <div className="space-y-2">
              <img src={preview.url} alt={preview.photo.label || "Photo"} className="w-full max-h-[70vh] object-contain rounded" />
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-2 pb-1 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><User className="h-3 w-3" />{preview.photo.uploadedBy}</span>
                {preview.photo.at && <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{format(parseISO(preview.photo.at), "dd MMM yyyy, h:mm a")}</span>}
                {preview.photo.activityCode && (
                  <Badge variant="secondary" className="font-mono cursor-pointer" onClick={() => { preview.photo.activityId && onActivityClick?.(preview.photo.activityId); setPreview(null); }}>
                    {preview.photo.activityCode}
                  </Badge>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
