import * as XLSX from "xlsx";

export interface ParsedQuotationRow {
  rowNum: number;
  companyRaw: string;
  companyKey: string;
  enquiry_number: string | null;
  enquiry_received_date: string | null; // yyyy-MM-dd
  quotation_number: string | null;
  quotation_date: string | null; // yyyy-MM-dd
  value_without_gst: number | null;
  followed_by_raw: string | null;
  status_raw: string | null;
  po_date: string | null;
  po_number: string | null;
  po_amount: number | null;
  remarks: string | null;
}

export interface ImportGroup {
  companyKey: string;
  companyDisplay: string;
  existingLeadId: string | null;
  rows: ParsedQuotationRow[];
}

export interface ImportPlan {
  groups: ImportGroup[];
  newLeadCount: number;
  existingLeadCount: number;
  totalQuotations: number;
  unmatchedFollowedBy: string[];
  unmatchedStatus: string[];
}

const normalize = (s: unknown): string => String(s ?? "").replace(/\s+/g, " ").trim();
const normKey = (s: unknown): string => normalize(s).toLowerCase().replace(/[^a-z0-9]/g, "");

/** Header aliases matched by regex, robust to punctuation/spacing variations across exports. */
const HEADER_PATTERNS: [keyof Omit<ParsedQuotationRow, "rowNum" | "companyRaw" | "companyKey">, RegExp][] = [
  ["enquiry_received_date", /enq.*(rcd|received)/i],
  ["enquiry_number", /enq.*no/i],
  ["quotation_number", /q\w*n?\.?\s*no/i],
  ["quotation_date", /q\w*[nd]\.?\s*d[a]?t/i],
  ["value_without_gst", /value.*gst/i],
  ["followed_by_raw", /follow/i],
  ["status_raw", /^status/i],
  ["po_date", /po\s*d/i],
  ["po_number", /po\s*no/i],
  ["po_amount", /po\s*amount/i],
  ["remarks", /remark/i],
];
const COMPANY_PATTERN = /customer|company|party/i;

function excelDateToISO(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (typeof value === "number") {
    const d = XLSX.SSF.parse_date_code(value);
    if (!d) return null;
    return `${d.y.toString().padStart(4, "0")}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  const s = String(value).trim();
  // DD.MM.YYYY or DD/MM/YYYY or DD-MM-YYYY
  const m = s.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})$/);
  if (m) {
    let [, dd, mm, yyyy] = m;
    if (yyyy.length === 2) yyyy = `20${yyyy}`;
    return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }
  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return null;
}

function toNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(String(value).replace(/[^0-9.-]/g, ""));
  return isNaN(n) ? null : n;
}

/** Parses the uploaded workbook: finds the header row by scanning for the "Customer"/"Company" column, then reads every row below it. */
export async function parseQuotationWorkbook(file: File): Promise<ParsedQuotationRow[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });

  let headerRowIdx = -1;
  let colMap: Partial<Record<string, number>> = {};
  for (let i = 0; i < Math.min(raw.length, 10); i++) {
    const row = raw[i] || [];
    const companyCol = row.findIndex((c) => COMPANY_PATTERN.test(normalize(c)));
    if (companyCol >= 0) {
      headerRowIdx = i;
      colMap.company = companyCol;
      row.forEach((cell, idx) => {
        const label = normalize(cell);
        if (!label) return;
        for (const [key, pattern] of HEADER_PATTERNS) {
          if (pattern.test(label) && colMap[key] === undefined) { colMap[key] = idx; break; }
        }
      });
      break;
    }
  }
  if (headerRowIdx === -1) {
    throw new Error('Could not find a "Customer Name" column in this file — is it the Format C register?');
  }

  const out: ParsedQuotationRow[] = [];
  for (let i = headerRowIdx + 1; i < raw.length; i++) {
    const row = raw[i] || [];
    const companyRaw = normalize(row[colMap.company!]);
    if (!companyRaw) continue; // skip blank rows
    out.push({
      rowNum: i + 1,
      companyRaw,
      companyKey: normKey(companyRaw),
      enquiry_number: colMap.enquiry_number !== undefined ? normalize(row[colMap.enquiry_number]) || null : null,
      enquiry_received_date: colMap.enquiry_received_date !== undefined ? excelDateToISO(row[colMap.enquiry_received_date]) : null,
      quotation_number: colMap.quotation_number !== undefined ? normalize(row[colMap.quotation_number]) || null : null,
      quotation_date: colMap.quotation_date !== undefined ? excelDateToISO(row[colMap.quotation_date]) : null,
      value_without_gst: colMap.value_without_gst !== undefined ? toNumber(row[colMap.value_without_gst]) : null,
      followed_by_raw: colMap.followed_by_raw !== undefined ? normalize(row[colMap.followed_by_raw]) || null : null,
      status_raw: colMap.status_raw !== undefined ? normalize(row[colMap.status_raw]) || null : null,
      po_date: colMap.po_date !== undefined ? excelDateToISO(row[colMap.po_date]) : null,
      po_number: colMap.po_number !== undefined ? normalize(row[colMap.po_number]) || null : null,
      po_amount: colMap.po_amount !== undefined ? toNumber(row[colMap.po_amount]) : null,
      remarks: colMap.remarks !== undefined ? normalize(row[colMap.remarks]) || null : null,
    });
  }
  return out;
}

/** Groups rows by company (matching existing leads first, then merging same-company rows within this same file), and checks Followed-by/Status against known names. */
export function buildImportPlan(
  rows: ParsedQuotationRow[],
  existingLeads: { id: string; company: string | null; name: string }[],
  users: { id: string; full_name: string }[],
  statuses: { id: string; name: string }[]
): ImportPlan {
  const existingByKey = new Map<string, string>(); // companyKey -> leadId
  for (const l of existingLeads) {
    const key = normKey(l.company || l.name);
    if (key && !existingByKey.has(key)) existingByKey.set(key, l.id);
  }
  const userByKey = new Map(users.map((u) => [normKey(u.full_name), u]));
  const statusByKey = new Map(statuses.map((s) => [normKey(s.name), s]));

  const groups = new Map<string, ImportGroup>();
  const unmatchedFollowedBy = new Set<string>();
  const unmatchedStatus = new Set<string>();

  for (const row of rows) {
    if (!groups.has(row.companyKey)) {
      groups.set(row.companyKey, {
        companyKey: row.companyKey,
        companyDisplay: row.companyRaw,
        existingLeadId: existingByKey.get(row.companyKey) ?? null,
        rows: [],
      });
    }
    groups.get(row.companyKey)!.rows.push(row);

    if (row.followed_by_raw && !userByKey.has(normKey(row.followed_by_raw))) unmatchedFollowedBy.add(row.followed_by_raw);
    if (row.status_raw && !statusByKey.has(normKey(row.status_raw))) unmatchedStatus.add(row.status_raw);
  }

  const groupList = Array.from(groups.values());
  return {
    groups: groupList,
    newLeadCount: groupList.filter((g) => !g.existingLeadId).length,
    existingLeadCount: groupList.filter((g) => g.existingLeadId).length,
    totalQuotations: rows.length,
    unmatchedFollowedBy: Array.from(unmatchedFollowedBy),
    unmatchedStatus: Array.from(unmatchedStatus),
  };
}

export function resolveUser(users: { id: string; full_name: string }[], raw: string | null) {
  if (!raw) return null;
  return users.find((u) => normKey(u.full_name) === normKey(raw)) ?? null;
}

export function resolveStatus(statuses: { id: string; name: string }[], raw: string | null) {
  if (!raw) return null;
  return statuses.find((s) => normKey(s.name) === normKey(raw)) ?? null;
}
