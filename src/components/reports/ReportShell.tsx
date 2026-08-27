import { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Download, Search, Loader2 } from "lucide-react";

interface ReportShellProps {
  title: string;
  description?: string;
  pill?: ReactNode;
  filters: ReactNode;
  summary?: ReactNode;
  chart?: ReactNode;
  table: ReactNode;
  loading: boolean;
  downloading: boolean;
  generated: boolean;
  recordCount: number;
  onGenerate: () => void;
  onDownload: () => void;
}

export function ReportShell({
  title,
  description,
  pill,
  filters,
  summary,
  chart,
  table,
  loading,
  downloading,
  generated,
  recordCount,
  onGenerate,
  onDownload,
}: ReportShellProps) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold">{title}</h1>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
        {pill}
      </div>


      <Card className="shadow-card">
        <CardContent className="p-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">{filters}</div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={onGenerate} disabled={loading}>
              {loading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Search className="h-4 w-4 mr-2" />
              )}
              Generate Report
            </Button>
            <Button
              variant="outline"
              onClick={onDownload}
              disabled={!generated || recordCount === 0 || downloading}
            >
              {downloading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              Download PDF
            </Button>
          </div>
        </CardContent>
      </Card>

      {generated && (
        <>
          {summary}
          {chart}
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Showing {recordCount} record{recordCount !== 1 ? "s" : ""}
            </p>
          </div>
          {recordCount === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                No records found for the selected filters.
              </CardContent>
            </Card>
          ) : (
            <Card className="shadow-card">
              <CardContent className="p-0 overflow-auto">{table}</CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

interface SummaryCardsProps {
  items: { label: string; value: string }[];
}

export function SummaryCards({ items }: SummaryCardsProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {items.map((it) => (
        <Card key={it.label} className="shadow-card">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">{it.label}</p>
            <p className="text-lg font-bold mt-0.5">{it.value}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
