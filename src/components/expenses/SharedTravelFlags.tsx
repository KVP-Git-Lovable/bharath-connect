import { AlertTriangle, IndianRupee } from "lucide-react";
import { format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { useUndeclaredSharedTravel } from "@/hooks/useUndeclaredSharedTravel";

const inr = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

/**
 * Journeys that may have been paid twice.
 *
 * Two people at the same place on the same day, both being paid to get there,
 * and neither said they travelled together. That is perfectly normal when they
 * drove separately, so this only points it out — it never withholds or reduces
 * anything. The approver decides.
 */
export default function SharedTravelFlags({ yearMonth }: { yearMonth: string }) {
  const { data: flags = [], isLoading } = useUndeclaredSharedTravel(yearMonth);

  // Nothing to look at is the normal case, so say nothing at all.
  if (isLoading || flags.length === 0) return null;

  return (
    <section aria-labelledby="shared-travel-flags-heading">
      <div className="mb-3 flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-warning" />
        <h3 id="shared-travel-flags-heading" className="text-sm font-semibold">
          Worth a second look
        </h3>
      </div>

      <Card className="rounded-xs border-warning/30 bg-warning/5 shadow-card">
        <CardContent className="space-y-3 p-4">
          <p className="text-sm text-muted-foreground">
            {flags.length === 1
              ? "One journey looks like it was paid to two people."
              : `${flags.length} journeys look like they were paid to two people.`}{" "}
            If they travelled together, ask one of them to mark it on the activity.
          </p>

          <ul className="space-y-2">
            {flags.map((f) => (
              <li
                key={`${f.a_activity_id}-${f.b_activity_id}`}
                className="rounded-xs border bg-card px-3 py-2"
              >
                <p className="text-xs font-medium text-muted-foreground">
                  {format(new Date(f.activity_date), "dd MMM yyyy")} · {f.destination}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                  <span className="flex items-center gap-1">
                    <span className="font-semibold">{f.a_name}</span>
                    <span className="flex items-center text-muted-foreground">
                      <IndianRupee className="h-3 w-3" />
                      {inr(f.a_amount).replace("₹", "")}
                    </span>
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="font-semibold">{f.b_name}</span>
                    <span className="flex items-center text-muted-foreground">
                      <IndianRupee className="h-3 w-3" />
                      {inr(f.b_amount).replace("₹", "")}
                    </span>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {inr(f.a_amount + f.b_amount)} in total
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </section>
  );
}
