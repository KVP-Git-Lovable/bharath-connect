import { useEffect, useMemo, useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ReportShell, SummaryCards } from "./ReportShell";
import { ReportChartCard } from "./ReportChartCard";
import { DateField, SelectField } from "./ReportFilters";
import { useReportScope } from "./useReportScope";
import { useReportContext, DateRangePill } from "@/components/analytics/ReportContext";
import { generateReportPdf } from "./reportPdf";
import { X } from "lucide-react";

interface Row {
  id: string;
  po_number: string;
  order_date: string | null;
  vendor: string;
  site: string;
  items: number;
  po_value: number;
  status: string;
  paid: number;
  payment_status: string;
  bill_gst: string;
  ship_gst: string;
}

const STATUS = [
  { value: "Requisition", label: "Requisition" },
  { value: "PO Issued", label: "PO Issued" },
  { value: "PO Sent", label: "PO Sent" },
  { value: "Invoice Received", label: "Invoice Received" },
  { value: "Closed", label: "Closed" },
];

const inr = (n: number) => `Rs ${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

const payBadge = (s: string) => {
  const map: Record<string, string> = {
    Paid: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    Partial: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
    Unpaid: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  };
  return <Badge className={map[s] || "bg-muted text-muted-foreground"}>{s}</Badge>;
};

export default function ProcurementReport() {
  const scope = useReportScope();
  const { from, to, setFrom, setTo, procurementPendingOnly, setProcurementPendingOnly } = useReportContext();
  const [site, setSite] = useState("all");
  const [vendor, setVendor] = useState("all");
  const [status, setStatus] = useState("all");
  const [sites, setSites] = useState<{ value: string; label: string }[]>([]);
  const [vendors, setVendors] = useState<{ value: string; label: string }[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [generated, setGenerated] = useState(false);

  useEffect(() => {
    supabase
      .from("project_sites")
      .select("id, site_name")
      .eq("is_active", true)
      .order("site_name")
      .then(({ data }) => setSites((data || []).map((s) => ({ value: s.id, label: s.site_name }))));
    supabase
      .from("vendors")
      .select("id, name")
      .order("name")
      .then(({ data }) => setVendors((data || []).map((v) => ({ value: v.id, label: v.name }))));
  }, []);

  // Auto-run when navigated here from the "Pending Approvals" card.
  useEffect(() => {
    if (procurementPendingOnly && sites.length && vendors.length && !generated) {
      generate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [procurementPendingOnly, sites, vendors]);

  const generate = async () => {
    setLoading(true);
    try {
      let q = supabase
        .from("procurement_orders")
        .select("id, po_number, order_date, vendor_id, site_id, status, total_amount, bill_to_gst, ship_to_gst")
        .gte("order_date", from)
        .lte("order_date", to)
        .order("order_date", { ascending: false });
      if (site !== "all") q = q.eq("site_id", site);
      if (vendor !== "all") q = q.eq("vendor_id", vendor);
      if (status !== "all") q = q.eq("status", status);
      if (procurementPendingOnly) q = q.neq("status", "Closed");
      const { data, error } = await q;
      if (error) throw error;
      const orders = data || [];
      const poIds = orders.map((o) => o.id);

      // item counts
      const itemCount = new Map<string, number>();
      if (poIds.length) {
        const { data: items } = await supabase
          .from("procurement_items")
          .select("procurement_id")
          .in("procurement_id", poIds);
        (items || []).forEach((it) => itemCount.set(it.procurement_id, (itemCount.get(it.procurement_id) || 0) + 1));
      }

      // payments via invoices
      const paidByPo = new Map<string, number>();
      if (poIds.length) {
        const { data: invoices } = await supabase
          .from("procurement_invoices")
          .select("id, po_id")
          .in("po_id", poIds);
        const invIds = (invoices || []).map((i) => i.id);
        const invToPo = new Map((invoices || []).map((i) => [i.id, i.po_id]));
        if (invIds.length) {
          const { data: payments } = await supabase
            .from("procurement_invoice_payments")
            .select("invoice_id, amount")
            .in("invoice_id", invIds);
          (payments || []).forEach((p) => {
            const po = invToPo.get(p.invoice_id);
            if (po) paidByPo.set(po, (paidByPo.get(po) || 0) + Number(p.amount || 0));
          });
        }
      }

      const siteMap = new Map(sites.map((s) => [s.value, s.label]));
      const vendorMap = new Map(vendors.map((v) => [v.value, v.label]));

      setRows(
        orders.map((o) => {
          const value = Number(o.total_amount || 0);
          const paid = paidByPo.get(o.id) || 0;
          const ps = paid <= 0 ? "Unpaid" : paid >= value && value > 0 ? "Paid" : "Partial";
          return {
            id: o.id,
            po_number: o.po_number || "—",
            order_date: o.order_date,
            vendor: o.vendor_id ? vendorMap.get(o.vendor_id) || "-" : "-",
            site: o.site_id ? siteMap.get(o.site_id) || "-" : "-",
            items: itemCount.get(o.id) || 0,
            po_value: value,
            status: o.status,
            paid,
            payment_status: ps,
            bill_gst: (o as any).bill_to_gst || "",
            ship_gst: (o as any).ship_to_gst || "",
          };
        })
      );
      setGenerated(true);
    } catch {
      toast.error("Failed to generate report");
    } finally {
      setLoading(false);
    }
  };

  const summary = useMemo(() => {
    const total = rows.reduce((s, r) => s + r.po_value, 0);
    const paid = rows.reduce((s, r) => s + r.paid, 0);
    return [
      { label: "Total POs", value: String(rows.length) },
      { label: "Total PO Value", value: inr(total) },
      { label: "Paid Amount", value: inr(paid) },
      { label: "Pending Amount", value: inr(Math.max(0, total - paid)) },
    ];
  }, [rows]);

  const chartData = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((r) => m.set(r.site, (m.get(r.site) || 0) + r.po_value));
    return Array.from(m.entries()).map(([name, value]) => ({ name, value }));
  }, [rows]);

  const download = async () => {
    setDownloading(true);
    try {
      await generateReportPdf({
        title: "Procurement Report",
        fileName: `procurement-report-${from}-to-${to}.pdf`,
        generatedBy: scope.generatedBy,
        filters: [
          `Period: ${from} to ${to}`,
          `Site: ${site === "all" ? "All" : sites.find((s) => s.value === site)?.label || "-"}`,
          `Vendor: ${vendor === "all" ? "All" : vendors.find((v) => v.value === vendor)?.label || "-"}`,
          `Status: ${status === "all" ? "All" : status}`,
        ],
        columns: [
          { header: "PO Number", width: 1.5 },
          { header: "Date", width: 1.4 },
          { header: "Vendor", width: 2.2 },
          { header: "Site", width: 1.8 },
          { header: "Items", width: 0.8, align: "right" },
          { header: "PO Value", width: 1.6, align: "right" },
          { header: "Status", width: 1.6 },
          { header: "Payment", width: 1.2 },
          { header: "Bill GST", width: 1.6 },
          { header: "Ship GST", width: 1.6 },
        ],
        rows: rows.map((r) => [
          r.po_number,
          r.order_date ? format(new Date(r.order_date), "dd MMM yyyy") : "--",
          r.vendor,
          r.site,
          String(r.items),
          inr(r.po_value),
          r.status,
          r.payment_status,
          r.bill_gst || "—",
          r.ship_gst || "—",
        ]),
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
    <ReportShell
      title="Procurement Report"
      description="Purchase orders, vendors, values and payment status."
      pill={
        <div className="flex flex-wrap items-center gap-2">
          {procurementPendingOnly && (
            <Badge variant="default" className="gap-1.5">
              Pending Approval Only
              <button
                onClick={() => setProcurementPendingOnly(false)}
                aria-label="Clear pending filter"
                className="ml-0.5 rounded-full hover:bg-primary-foreground/20"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          <DateRangePill />
        </div>
      }
      loading={loading}
      downloading={downloading}
      generated={generated}
      recordCount={rows.length}
      onGenerate={generate}
      onDownload={download}
      filters={
        <>
          <DateField label="From Date" value={from} onChange={setFrom} />
          <DateField label="To Date" value={to} onChange={setTo} />
          <SelectField label="Site / Project" value={site} onChange={setSite} allLabel="All Sites" options={sites} />
          <SelectField label="Vendor" value={vendor} onChange={setVendor} allLabel="All Vendors" options={vendors} />
          <SelectField label="Status" value={status} onChange={setStatus} allLabel="All Statuses" options={STATUS} />
        </>
      }
      summary={<SummaryCards items={summary} />}
      chart={
        <ReportChartCard
          title="PO Value by Site"
          description="Total purchase order value grouped by site"
          type="bar"
          data={chartData}
          formatValue={inr}
        />
      }
      table={
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>PO Number</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Vendor</TableHead>
              <TableHead>Site</TableHead>
              <TableHead className="text-right">Items</TableHead>
              <TableHead className="text-right">PO Value</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Payment</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.po_number}</TableCell>
                <TableCell>{r.order_date ? format(new Date(r.order_date), "dd MMM yyyy") : "--"}</TableCell>
                <TableCell>{r.vendor}</TableCell>
                <TableCell>{r.site}</TableCell>
                <TableCell className="text-right">{r.items}</TableCell>
                <TableCell className="text-right">{inr(r.po_value)}</TableCell>
                <TableCell>{r.status}</TableCell>
                <TableCell>{payBadge(r.payment_status)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      }
    />
  );
}
