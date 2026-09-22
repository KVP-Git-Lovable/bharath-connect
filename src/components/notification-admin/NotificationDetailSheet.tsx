import { format } from "date-fns";
import { useNavigate } from "@/lib/router-compat";
import { ExternalLink } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DELIVERY_INFO, SOURCE_LABELS, type HistoryRow } from "@/hooks/useNotificationHistory";
import { moduleLabel } from "@/utils/notificationRoute";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-2 border-b last:border-b-0 text-sm">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="text-right min-w-0 break-words">{children}</span>
    </div>
  );
}

export default function NotificationDetailSheet({ row, onClose }: { row: HistoryRow | null; onClose: () => void }) {
  const navigate = useNavigate();
  const delivery = row ? DELIVERY_INFO[row.delivery_status] ?? DELIVERY_INFO['delivered'] : null;
  return (
    <Sheet open={!!row} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        {row && delivery && (
          <>
            <SheetHeader className="text-left">
              <div className="flex flex-wrap gap-1.5">
                <Badge variant="outline" className="font-normal">{SOURCE_LABELS[row.source] ?? row.source}</Badge>
                {row.is_test && <Badge variant="secondary" className="font-normal">Test</Badge>}
                <span className={`rounded-full px-2 py-0.5 text-xs ${delivery.tone}`}>{delivery.label}</span>
              </div>
              <SheetTitle className="text-base leading-snug">{row.title}</SheetTitle>
              <SheetDescription className="whitespace-pre-line text-sm">{row.message || "—"}</SheetDescription>
            </SheetHeader>

            <div className="mt-5">
              <Row label="Recipient">{row.recipient_name || "Unknown user"}</Row>
              <Row label="Sent">{format(new Date(row.created_at), "dd MMM yyyy, hh:mm a")}</Row>
              <Row label="Read">
                {row.is_read ? (row.read_at ? format(new Date(row.read_at), "dd MMM yyyy, hh:mm a") : "Yes") : "Not yet"}
              </Row>
              <Row label="Module">{moduleLabel(row.related_table)}</Row>
              {row.rule_name && <Row label="Rule">{row.rule_name}</Row>}
              <Row label="Delivery">{delivery.help}</Row>
              {row.is_dismissed && <Row label="Dismissed">The recipient dismissed it</Row>}
            </div>

            {row.route && (
              <Button variant="outline" className="w-full mt-5" onClick={() => navigate(row.route)}>
                <ExternalLink className="h-4 w-4 mr-1.5" /> Open {moduleLabel(row.related_table)}
              </Button>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
