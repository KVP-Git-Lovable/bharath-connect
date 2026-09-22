import { useEffect, useState } from "react";
import { AvatarImage } from "@/components/ui/avatar";
import { resolveSignedUrl } from "@/utils/signedStorage";

/**
 * Resolve a private-bucket object path / legacy public URL into a signed URL.
 * Returns "" while resolving or when the file is unavailable.
 */
export function useSignedStorageUrl(bucket: string, value?: string | null) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    let active = true;
    if (!value) {
      setUrl("");
      return;
    }
    resolveSignedUrl(bucket, value).then((u) => {
      if (active) setUrl(u);
    });
    return () => {
      active = false;
    };
  }, [bucket, value]);
  return url;
}

interface SignedAvatarImageProps extends Omit<React.ComponentPropsWithoutRef<typeof AvatarImage>, "src"> {
  src?: string | null;
  bucket?: string;
}

/** Drop-in replacement for <AvatarImage> when the photo lives in a private bucket. */
export function SignedAvatarImage({ src, bucket = "employee-photos", ...props }: SignedAvatarImageProps) {
  const signed = useSignedStorageUrl(bucket, src);
  if (!signed) return null;
  return <AvatarImage {...props} src={signed} />;
}

interface SignedImageProps extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, "src"> {
  src?: string | null;
  bucket?: string;
}

/** Plain <img> variant for private-bucket assets. */
export function SignedImage({ src, bucket = "employee-photos", ...props }: SignedImageProps) {
  const signed = useSignedStorageUrl(bucket, src);
  if (!signed) return null;
  return <img {...props} src={signed} />;
}

interface SignedAudioProps extends Omit<React.AudioHTMLAttributes<HTMLAudioElement>, "src"> {
  src?: string | null;
  bucket?: string;
}

/** <audio> variant for private-bucket recordings. */
export function SignedAudio({ src, bucket = "activity-audio", ...props }: SignedAudioProps) {
  const signed = useSignedStorageUrl(bucket, src);
  if (!signed) return null;
  const type = signed.includes(".m4a") ? "audio/mp4" : signed.includes(".ogg") ? "audio/ogg" : "audio/webm";
  return (
    <audio {...props} controls preload="metadata">
      <source src={signed} type={type} />
    </audio>
  );
}
