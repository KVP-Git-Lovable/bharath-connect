import { ReactNode } from "react";

/** A single column definition used for the table, the column picker,
 *  chart grouping/measures and the PDF export. */
export interface ReportColumn<R = Record<string, unknown>> {
  key: string;
  header: string;
  align?: "left" | "right";
  /** Raw value used for grouping, summing, sorting and PDF text. */
  value: (row: R) => string | number | null | undefined;
  /** Optional custom cell renderer. Falls back to the raw value. */
  render?: (row: R) => ReactNode;
  /** Numeric columns can be used as a chart measure (sum / average). */
  numeric?: boolean;
  /** Relative width used in the PDF export. */
  pdfWidth?: number;
  /** Hidden by default in the table (still selectable in the column picker). */
  defaultHidden?: boolean;
}

export type ChartKind = "bar" | "hbar" | "pie" | "line";

export interface ChartConfig {
  id: string;
  title: string;
  type: ChartKind;
  /** Column key used to group rows on the X axis / slices. */
  groupBy: string;
  /** "count" or a numeric column key. */
  measure: string;
  /** How the measure is aggregated. Ignored for count. */
  aggregate?: "sum" | "avg";
  /** Limit the number of groups shown (top N by value). */
  topN?: number;
}

export interface SavedReportConfig {
  filters?: Record<string, unknown>;
  visibleColumns?: string[];
  charts?: ChartConfig[];
}

export interface SavedReport {
  id: string;
  module: string;
  name: string;
  config: SavedReportConfig;
  is_favourite: boolean;
  updated_at: string;
}
