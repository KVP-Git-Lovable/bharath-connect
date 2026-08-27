import jsPDF from "jspdf";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { downloadPDF } from "@/utils/nativeDownload";
import { resolveSignedUrl } from "@/utils/signedStorage";

/**
 * jsPDF's built-in Helvetica is WinAnsi only — glyphs such as ₹ render as
 * garbage ("¹" plus broken kerning). Normalise every string we draw.
 */
function pdfText(value: unknown): string {
  return String(value ?? "")
    .replace(/\u20B9/g, "Rs. ")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[^\x20-\x7E\n]/g, "");
}

export interface PdfColumn {
  header: string;
  width: number; // relative weight
  align?: "left" | "right" | "center";
}

export interface PdfSummaryItem {
  label: string;
  value: string;
}

export interface GenerateReportPdfArgs {
  title: string;
  filters: string[];
  columns: PdfColumn[];
  rows: string[][];
  summary?: PdfSummaryItem[];
  generatedBy: string;
  orientation?: "portrait" | "landscape";
  fileName: string;
  /** Optional chart image (PNG data URL) rendered below the table/summary. */
  chartImage?: { data: string; aspect: number };
}

interface CompanyInfo {
  company_name: string | null;
  logo_url: string | null;
  address: string | null;
}

let cachedCompany: CompanyInfo | null | undefined;

async function getCompany(): Promise<CompanyInfo | null> {
  if (cachedCompany !== undefined) return cachedCompany;
  try {
    const { data } = await (supabase as any)
      .from("company_branding")
      .select("company_name, logo_url, address");
    const rows = (data ?? []) as CompanyInfo[];
    // Prefer the profile row that actually has a logo uploaded.
    cachedCompany =
      rows.find((r) => r.logo_url && r.logo_url.trim() !== "") ?? rows[0] ?? null;
  } catch {
    cachedCompany = null;
  }
  return cachedCompany;
}

async function loadImageDataUrl(url: string): Promise<{ data: string; w: number; h: number } | null> {
  try {
    let dataUrl = url;
    if (!url.startsWith("data:")) {
      const fetchUrl = url.startsWith("http") ? url : `${window.location.origin}${url}`;
      const res = await fetch(fetchUrl);
      const blob = await res.blob();
      dataUrl = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onloadend = () => resolve(r.result as string);
        r.onerror = reject;
        r.readAsDataURL(blob);
      });
    }
    const dims: { w: number; h: number } = await new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = () => resolve({ w: 120, h: 120 });
      img.src = dataUrl;
    });
    return { data: dataUrl, w: dims.w, h: dims.h };
  } catch {
    return null;
  }
}

export async function generateReportPdf(args: GenerateReportPdfArgs): Promise<void> {
  const orientation = args.orientation ?? "landscape";
  const doc = new jsPDF({ orientation, unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 12;
  const usableW = pageW - margin * 2;

  const company = await getCompany();
  const companyName = company?.company_name || "QuickLocate";

  let y = margin;

  // ---- Header (logo left, company block beside it) ----
  const logoBoxH = 16;
  let textX = margin;
  let headerBottom = y + logoBoxH;
  if (company?.logo_url) {
    let src = company.logo_url;
    if (src.includes("/employee-photos/")) {
      src = (await resolveSignedUrl("employee-photos", src)) || src;
    }
    const img = await loadImageDataUrl(src);
    if (img) {
      const ratio = img.w && img.h ? img.w / img.h : 1;
      const logoH = logoBoxH;
      const logoW = Math.min(30, logoH * ratio);
      let fmt: "JPEG" | "PNG" | "GIF" = "PNG";
      if (img.data.startsWith("data:image/jpeg") || img.data.startsWith("data:image/jpg")) {
        fmt = "JPEG";
      } else if (img.data.startsWith("data:image/gif")) {
        fmt = "GIF";
      }
      try {
        doc.addImage(img.data, fmt, margin, y, logoW, logoH);
        textX = margin + logoW + 6;
      } catch (e) {
        // If image fails (e.g., SVG), continue without logo
      }
    }
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(20, 30, 60);
  doc.text(pdfText(companyName), textX, y + 7);
  if (company?.address) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(110, 110, 110);
    doc.text(pdfText(company.address).slice(0, 100), textX, y + 12.5);
  }

  y = headerBottom + 3;

  doc.setDrawColor(200, 170, 80);
  doc.setLineWidth(0.6);
  doc.line(margin, y, pageW - margin, y);
  y += 7;

  // ---- Title ----
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(20, 30, 60);
  doc.text(pdfText(args.title), margin, y);
  y += 6;

  // ---- Filters ----
  if (args.filters.length) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(90, 90, 90);
    const filterText = args.filters.map(pdfText).join("    |    ");
    const lines = doc.splitTextToSize(filterText, usableW);
    doc.text(lines, margin, y);
    y += lines.length * 4 + 2;
  }

  // ---- Table ----
  const totalWeight = args.columns.reduce((s, c) => s + c.width, 0);
  const colX: number[] = [];
  let acc = margin;
  const colWidths = args.columns.map((c) => (c.width / totalWeight) * usableW);
  args.columns.forEach((_, i) => {
    colX.push(acc);
    acc += colWidths[i];
  });

  const drawHeader = () => {
    doc.setFillColor(20, 30, 60);
    doc.rect(margin, y, usableW, 7, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(255, 255, 255);
    args.columns.forEach((c, i) => {
      const cx = c.align === "right" ? colX[i] + colWidths[i] - 2 : colX[i] + 2;
      doc.text(pdfText(c.header), cx, y + 4.7, { align: c.align === "right" ? "right" : "left" });
    });
    y += 7;
  };

  drawHeader();

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(40, 40, 40);

  args.rows.forEach((row, idx) => {
    // compute row height based on wrapped cells
    const wrapped = row.map((cell, i) =>
      doc.splitTextToSize(pdfText(cell), colWidths[i] - 3)
    );
    const rowLines = Math.max(...wrapped.map((w) => w.length), 1);
    const rowH = rowLines * 4 + 2;

    if (y + rowH > pageH - 16) {
      doc.addPage();
      y = margin;
      drawHeader();
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(40, 40, 40);
    }

    if (idx % 2 === 1) {
      doc.setFillColor(244, 246, 250);
      doc.rect(margin, y, usableW, rowH, "F");
    }

    wrapped.forEach((cellLines, i) => {
      const align = args.columns[i].align;
      const cx = align === "right" ? colX[i] + colWidths[i] - 2 : colX[i] + 2;
      doc.text(cellLines, cx, y + 4, { align: align === "right" ? "right" : "left" });
    });
    y += rowH;
  });

  // ---- Summary ----
  if (args.summary && args.summary.length) {
    const blockH = 16 + args.summary.length * 6.5;
    if (y + blockH > pageH - 16) {
      doc.addPage();
      y = margin;
    }
    y += 6;
    doc.setDrawColor(200, 170, 80);
    doc.setLineWidth(0.5);
    doc.line(margin, y, pageW - margin, y);
    y += 6.5;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.setTextColor(20, 30, 60);
    doc.text("Summary", margin, y);
    y += 6.5;

    doc.setFontSize(9);
    const labels = args.summary.map((s) => pdfText(s.label) + ":");
    doc.setFont("helvetica", "normal");
    const labelW = Math.max(...labels.map((l) => doc.getTextWidth(l)));
    const valueX = margin + labelW + 6;

    args.summary.forEach((s, i) => {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(80, 80, 80);
      doc.text(labels[i], margin, y);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(20, 30, 60);
      doc.text(pdfText(s.value), valueX, y);
      y += 6.5;
    });
  }

  // ---- Optional chart image ----
  if (args.chartImage) {
    const imgW = usableW;
    const imgH = imgW / (args.chartImage.aspect || 2);
    if (y + imgH + 6 > pageH - 16) {
      doc.addPage();
      y = margin;
    }
    y += 6;
    try {
      doc.addImage(args.chartImage.data, "PNG", margin, y, imgW, imgH);
      y += imgH;
    } catch {
      /* ignore */
    }
  }



  // ---- Footer on every page ----
  const pageCount = doc.getNumberOfPages();
  const stamp = format(new Date(), "dd MMM yyyy, HH:mm");
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(130, 130, 130);
    doc.text(
      pdfText(`Generated: ${stamp}  |  By: ${args.generatedBy}`),
      margin,
      pageH - 7
    );
    doc.text(`Page ${p} of ${pageCount}`, pageW - margin, pageH - 7, { align: "right" });
  }

  await downloadPDF(doc, args.fileName);
}
