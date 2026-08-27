import React from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Trash2, User, Users } from "lucide-react";
import MultiProfileSelector from "./MultiProfileSelector";

export interface OverrideEntry {
  id: string;
  ref_id: string;
  type: "user" | "team";
  amount: number;
  name: string;
}

interface Props {
  field: "ta" | "da";
  overrides: OverrideEntry[];
  defaultAmount: number;
  unitLabel?: string;
  onUpdateAmount: (id: string, amount: number) => void;
  onDelete: (entry: OverrideEntry) => void;
  onAdd: (type: "user" | "team", refId: string, name: string) => void;
}

const OverrideTable = React.memo<Props>(({ field, overrides, defaultAmount, unitLabel, onUpdateAmount, onDelete, onAdd }) => {
  const excludeIds = overrides.map((o) => o.ref_id);
  const label = field === "ta" ? "TA" : "DA";
  return (
    <div className="space-y-3 mt-3">
      <p className="text-xs text-muted-foreground">
        Default: <span className="font-semibold text-foreground">₹{defaultAmount}{unitLabel ? ` ${unitLabel}` : ""}</span> for users not listed below
      </p>

      {overrides.length > 0 && (
        <div className="rounded-md border overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[11px] px-2">User / Team</TableHead>
                <TableHead className="text-[11px] px-2">Type</TableHead>
                <TableHead className="text-[11px] px-2">{label} Amount (₹){unitLabel ? ` ${unitLabel}` : ""}</TableHead>
                <TableHead className="text-[11px] px-1 w-[40px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {overrides.map((o) => (
                <TableRow key={`${o.id}-${field}`}>
                  <TableCell className="text-xs font-medium py-2 px-2">{o.name}</TableCell>
                  <TableCell className="py-2 px-2">
                    <Badge variant={o.type === "user" ? "default" : "secondary"} className="text-[10px]">
                      {o.type === "user" ? <><User className="h-3 w-3 mr-1" />User</> : <><Users className="h-3 w-3 mr-1" />Team</>}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-2 px-2">
                    <Input type="number" min="0" className="h-8 text-xs w-[100px]" value={o.amount}
                      onChange={(e) => onUpdateAmount(o.id, Number(e.target.value))} />
                  </TableCell>
                  <TableCell className="py-2 px-1">
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={() => onDelete(o)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <MultiProfileSelector excludeIds={excludeIds}
          onAdd={(s) => s.forEach((x) => onAdd("user", x.id, x.name))} label="Add Users" />
        <MultiProfileSelector excludeIds={excludeIds}
          onAdd={(s) => s.forEach((x) => onAdd("team", x.id, x.name))} label="Add Teams" managersOnly />
      </div>

      {overrides.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-2">
          No custom {label} overrides yet. Add users or teams above.
        </p>
      )}
    </div>
  );
});
OverrideTable.displayName = "OverrideTable";
export default OverrideTable;
