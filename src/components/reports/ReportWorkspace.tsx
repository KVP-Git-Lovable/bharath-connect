import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Loader2, Search, ChevronRight, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { toast } from "sonner";
import { SummaryCards } from "./ReportShell";
import { ColumnPicker } from "./ColumnPicker";
import { ChartBuilder } from "./ChartBuilder";
import { SavedReportBar } from "./SavedReportBar";
import { generateReportPdf } from "./reportPdf";
import { useSavedReports } from "@/hooks/useSavedReports";
import { useIsMobile } from "@/hooks/use-mobile";
import type { ChartConfig, ReportColumn, SavedReport } from "./reportTypes";

interface Props<R> {
  /** Stable key used to store saved reports, e.g. "leads". */
  module: string;
  title: string;
  description?: string;
  pill?: ReactNode;
  columns: ReportColumn<R>[];
  rows: R[];
  rowKey: (row: R) => string;
  /** Return a route to open the underlying record when the row is clicked. */
  rowLink?: (row: R) => string | null;
  /** Filter controls rendered in the filter grid. */
  filters: ReactNode;
  /** Serialisable filter state saved with the report. */
  filterState: Record<string, unknown>;
  onApplyFilterState: (state: Record<string, unknown>) => void;
  /** Human readable filter lines for the PDF header. */
  filterSummary: string[];
  fileName: string;
  /** Shown in the PDF header. */
  generatedBy?: string;
  summary?: { label: string; value: string }[];
  defaultCharts?: ChartConfig[];
  loading: boolean;
  generated: boolean;
  onGenerate: () => void;
}

export function ReportWorkspace<R>({
  module,
  title,
  description,
  pill,
  columns,
  rows,
  rowKey,
  rowLink,
  filters,
  filterState,
  onApplyFilterState,
  filterSummary,
  fileName,
  generatedBy = "",
  summary,
  defaultCharts = [],
  loading,
  generated,
  onGenerate,
}: Props<R>) {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { favourite, loading: savedLoading } = useSavedReports(module);
  const cacheKey = `report-session:${module}`;

  const [visible, setVisible] = useState<string[]>(
    columns.filter((c) => !c.defaultHidden).map((c) => c.key)
  );
  const [charts, setCharts] = useState<ChartConfig[]>(defaultCharts);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeName, setActiveName] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [cachedRows, setCachedRows] = useState<R[] | null>(null);
  const appliedFavourite = useRef(false);
  const restored = useRef(false);

  // Rows shown: freshly generated rows, or the session-restored ones when the
  // user navigates into a record and comes back.
  const shownRows = generated ? rows : cachedRows || [];
  const isGenerated = generated || cachedRows !== null;

  const apply = (r: SavedReport) => {
    if (r.config.filters) onApplyFilterState(r.config.filters);
    if (r.config.visibleColumns?.length) {
      setVisible(r.config.visibleColumns.filter((k) => columns.some((c) => c.key === k)));
    }
    setCharts(r.config.charts || []);
    setActiveId(r.id);
    setActiveName(r.name);
  };

  // Restore the last generated report for this module (e.g. after opening a
  // record and navigating back).
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    try {
      const raw = sessionStorage.getItem(cacheKey);
      if (!raw) return;
      const cached = JSON.parse(raw) as {
        rows: R[];
        visibleColumns?: string[];
        charts?: ChartConfig[];
        filters?: Record<string, unknown>;
      };
      if (!cached?.rows) return;
      appliedFavourite.current = true;
      if (cached.filters) onApplyFilterState(cached.filters);
      if (cached.visibleColumns?.length) {
        setVisible(cached.visibleColumns.filter((k) => columns.some((c) => c.key === k)));
      }
      if (cached.charts) setCharts(cached.charts);
      setCachedRows(cached.rows);
    } catch {
      /* ignore malformed cache */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist the generated result so it survives a round-trip to a record page.
  useEffect(() => {
    if (!generated) return;
    setCachedRows(null);
    try {
      sessionStorage.setItem(
        cacheKey,
        JSON.stringify({ rows, visibleColumns: visible, charts, filters: filterState })
      );
    } catch {
      /* storage full / unavailable */
    }
  }, [generated, rows, visible, charts, filterState, cacheKey]);

  // Open the pinned report automatically on first load.
  useEffect(() => {
    if (savedLoading || appliedFavourite.current || !favourite) return;
    appliedFavourite.current = true;
    apply(favourite);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedLoading, favourite]);

  const visibleColumns = useMemo(
    () => columns.filter((c) => visible.includes(c.key)),
    [columns, visible]
  );

  // ---- Sorting (applies to both the desktop table and the mobile cards) ----
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" } | null>(null);

  const toggleSort = (key: string) =>
    setSort((prev) =>
      !prev || prev.key !== key
        ? { key, dir: "asc" }
        : prev.dir === "asc"
          ? { key, dir: "desc" }
          : null
    );

  const sortedRows = useMemo(() => {
    if (!sort) return shownRows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col) return shownRows;
    const factor = sort.dir === "asc" ? 1 : -1;
    return [...shownRows].sort((a, b) => {
      const av = col.value(a);
      const bv = col.value(b);
      const aEmpty = av === null || av === undefined || av === "";
      const bEmpty = bv === null || bv === undefined || bv === "";
      if (aEmpty && bEmpty) return 0;
      if (aEmpty) return 1;
      if (bEmpty) return -1;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * factor;
      return String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: "base" }) * factor;
    });
  }, [shownRows, sort, columns]);

  const cellText = (col: ReportColumn<R>, row: R) => {
    const v = col.value(row);
    if (v === null || v === undefined || v === "") return "-";
    return typeof v === "number" ? v.toLocaleString("en-IN") : String(v);
  };


  const download = async () => {
    setDownloading(true);
    try {
      await generateReportPdf({
        title,
        fileName,
        generatedBy,
        filters: filterSummary,
        columns: visibleColumns.map((c) => ({
          header: c.header,
          width: c.pdfWidth || 2,
          align: c.align === "right" ? "right" : "left",
        })),
        rows: sortedRows.map((r) => visibleColumns.map((c) => cellText(c, r))),
        summary,
      });
      toast.success("PDF downloaded");
    } catch {
      toast.error("Failed to download PDF");
    } finally {
      setDownloading(false);
    }
  };

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
          <SavedReportBar
            module={module}
            currentConfig={{ filters: filterState, visibleColumns: visible, charts }}
            activeId={activeId}
            activeName={activeName}
            onApply={apply}
            onSaved={(id, name) => {
              setActiveId(id);
              setActiveName(name);
            }}
            onCleared={() => {
              setActiveId(null);
              setActiveName(null);
            }}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">{filters}</div>

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={onGenerate} disabled={loading}>
              {loading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Search className="h-4 w-4 mr-2" />
              )}
              Generate Report
            </Button>
            <ColumnPicker columns={columns} visible={visible} onChange={setVisible} />
            <Button
              variant="outline"
              onClick={download}
              disabled={!isGenerated || shownRows.length === 0 || downloading}
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

      {isGenerated && (
        <>
          {summary && summary.length > 0 && <SummaryCards items={summary} />}

          <ChartBuilder columns={columns} rows={shownRows} charts={charts} onChange={setCharts} />

          <p className="text-sm text-muted-foreground">
            Showing {shownRows.length} record{shownRows.length !== 1 ? "s" : ""}
          </p>

          {shownRows.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                No records found for the selected filters.
              </CardContent>
            </Card>
          ) : isMobile ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <select
                  value={sort?.key ?? ""}
                  onChange={(e) =>
                    setSort(e.target.value ? { key: e.target.value, dir: sort?.dir ?? "asc" } : null)
                  }
                  className="h-9 flex-1 rounded-md border bg-background px-2 text-xs"
                  aria-label="Sort by"
                >
                  <option value="">Sort by…</option>
                  {visibleColumns.map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.header}
                    </option>
                  ))}
                </select>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!sort}
                  onClick={() => sort && setSort({ ...sort, dir: sort.dir === "asc" ? "desc" : "asc" })}
                >
                  {sort?.dir === "desc" ? <ArrowDown className="h-4 w-4" /> : <ArrowUp className="h-4 w-4" />}
                </Button>
              </div>

              {sortedRows.map((r) => {
                const link = rowLink?.(r) || null;
                const [primary, ...rest] = visibleColumns;
                return (
                  <Card
                    key={rowKey(r)}
                    onClick={() => link && navigate(link)}
                    className={`shadow-card ${link ? "cursor-pointer active:bg-muted/60" : ""}`}
                  >
                    <CardContent className="p-3 space-y-2">
                      {primary && (
                        <div className="flex items-start justify-between gap-2">
                          <div className="text-sm font-semibold break-words">
                            {primary.render ? primary.render(r) : cellText(primary, r)}
                          </div>
                          {link && <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
                        </div>
                      )}
                      <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                        {rest.map((c) => (
                          <div key={c.key} className="min-w-0">
                            <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
                              {c.header}
                            </dt>
                            <dd className="text-sm break-words">
                              {c.render ? c.render(r) : cellText(c, r)}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <Card className="shadow-card">
              <CardContent className="p-0 overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {visibleColumns.map((c) => (
                        <TableHead key={c.key} className={c.align === "right" ? "text-right" : ""}>
                          <button
                            type="button"
                            onClick={() => toggleSort(c.key)}
                            title={`Sort by ${c.header}`}
                            className={`inline-flex items-center gap-1 hover:text-foreground ${
                              c.align === "right" ? "flex-row-reverse" : ""
                            } ${sort?.key === c.key ? "text-foreground font-semibold" : ""}`}
                          >
                            {c.header}
                            {sort?.key === c.key ? (
                              sort.dir === "asc" ? (
                                <ArrowUp className="h-3.5 w-3.5" />
                              ) : (
                                <ArrowDown className="h-3.5 w-3.5" />
                              )
                            ) : (
                              <ArrowUpDown className="h-3 w-3 opacity-40" />
                            )}
                          </button>
                        </TableHead>
                      ))}
                      {rowLink && <TableHead className="w-8" />}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedRows.map((r) => {
                      const link = rowLink?.(r) || null;
                      return (
                        <TableRow
                          key={rowKey(r)}
                          onClick={() => link && navigate(link)}
                          className={link ? "cursor-pointer hover:bg-muted/60" : ""}
                        >
                          {visibleColumns.map((c) => (
                            <TableCell key={c.key} className={c.align === "right" ? "text-right" : ""}>
                              {c.render ? c.render(r) : cellText(c, r)}
                            </TableCell>
                          ))}
                          {rowLink && (
                            <TableCell className="w-8 text-muted-foreground">
                              {link && <ChevronRight className="h-4 w-4" />}
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
