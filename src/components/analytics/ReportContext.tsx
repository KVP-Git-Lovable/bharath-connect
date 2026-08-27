import { createContext, useContext, useState, ReactNode } from "react";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { CalendarRange } from "lucide-react";

export type ReportTabKey =
  | "overview"
  | "attendance"
  | "procurement"
  | "activities"
  | "milestones"
  | "expenses"
  | "payments"
  | "leave"
  | "leads";

interface ReportContextValue {
  from: string;
  to: string;
  setFrom: (v: string) => void;
  setTo: (v: string) => void;
  tab: ReportTabKey;
  setTab: (t: ReportTabKey) => void;
  /** When true, the Procurement tab should default to POs pending approval. */
  procurementPendingOnly: boolean;
  setProcurementPendingOnly: (v: boolean) => void;
  /** Navigate to the Procurement tab filtered to pending-approval POs. */
  goToPendingProcurement: () => void;
}

const ReportContext = createContext<ReportContextValue | null>(null);

export function ReportProvider({ children }: { children: ReactNode }) {
  const [from, setFrom] = useState(format(new Date(), "yyyy-MM-01"));
  const [to, setTo] = useState(format(new Date(), "yyyy-MM-dd"));
  const [tab, setTabState] = useState<ReportTabKey>(
    () => (sessionStorage.getItem("analytics-tab") as ReportTabKey) || "overview"
  );

  // Remember the tab so returning from a record lands back on the same report.
  const setTab = (t: ReportTabKey) => {
    sessionStorage.setItem("analytics-tab", t);
    setTabState(t);
  };
  const [procurementPendingOnly, setProcurementPendingOnly] = useState(false);

  const goToPendingProcurement = () => {
    setProcurementPendingOnly(true);
    setTab("procurement");
  };

  return (
    <ReportContext.Provider
      value={{
        from,
        to,
        setFrom,
        setTo,
        tab,
        setTab,
        procurementPendingOnly,
        setProcurementPendingOnly,
        goToPendingProcurement,
      }}
    >
      {children}
    </ReportContext.Provider>
  );
}

export function useReportContext() {
  const ctx = useContext(ReportContext);
  if (!ctx) throw new Error("useReportContext must be used within ReportProvider");
  return ctx;
}

export function DateRangePill() {
  const { from, to } = useReportContext();
  const range = `${format(new Date(from), "dd MMM yyyy")} - ${format(new Date(to), "dd MMM yyyy")}`;
  return (
    <Badge variant="secondary" className="gap-1.5 font-medium">
      <CalendarRange className="h-3.5 w-3.5" />
      {range}
    </Badge>
  );
}
