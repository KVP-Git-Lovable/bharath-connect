import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

/** Empty state for a tab whose feature ships in a later phase. */
export default function TabPlaceholder({
  icon: Icon,
  title,
  description,
  points,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  points: string[];
}) {
  return (
    <Card className="border-dashed">
      <CardContent className="py-10 px-4 sm:px-8 flex flex-col items-center text-center gap-3">
        <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center">
          <Icon className="h-7 w-7 text-primary" />
        </div>
        <h3 className="text-base font-semibold">{title}</h3>
        <p className="text-sm text-muted-foreground max-w-md">{description}</p>
        <ul className="mt-2 text-xs text-muted-foreground space-y-1 text-left">
          {points.map((p) => (
            <li key={p} className="flex gap-2">
              <span className="text-primary">•</span>
              <span>{p}</span>
            </li>
          ))}
        </ul>
        <span className="mt-2 rounded-full bg-muted px-3 py-1 text-[11px] font-medium text-muted-foreground">
          Coming soon
        </span>
      </CardContent>
    </Card>
  );
}
