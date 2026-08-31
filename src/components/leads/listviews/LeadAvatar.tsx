import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

interface Props {
  name?: string | null;
  photoUrl?: string | null;
  className?: string;
}

function initials(name?: string | null) {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

export function LeadAvatar({ name, photoUrl, className }: Props) {
  return (
    <Avatar className={cn("h-9 w-9 shrink-0", className)}>
      {photoUrl ? <AvatarImage src={photoUrl} alt={name ?? "Lead"} /> : null}
      <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
        {initials(name)}
      </AvatarFallback>
    </Avatar>
  );
}

export default LeadAvatar;
