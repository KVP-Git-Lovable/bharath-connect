import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { SelectField, DateScopeFilter } from "./ReportFilters";
import { useReportScope } from "./useReportScope";
import { ReportWorkspace } from "./ReportWorkspace";
import type { ReportColumn } from "./reportTypes";
import { DateFieldOption, PresetKey, presetLabel, useDateScope } from "./dateScope";
import { formatCurrency } from "@/lib/currency";

const DATE_FIELDS: DateFieldOption[] = [
  { value: "quotation_date", label: "Quotation Date" },
  { value: "enquiry_received_date", label: "Enquiry Received Date" },
  { value: "po_date", label: "PO Date" },
  { value: "created_at", label: "Created Date", timestamp: true },
];

const PO_OPTIONS = [
  { value: "received", label: "PO Received" },
  { value: "pending", label: "PO Pending" },
];

interface Row {
  id: string;
  lead_id: string;
  lead: string;
  company: string;
  owner: string;
  quotation_number: string;
  quotation_date: string | null;
  enquiry_number: string;
  enquiry_received_date: string | null;
  value: number;
  value_text: string;
  followed_by: string;
  status: string;
  po_number: string;
  po_date: string | null;
  po_amount: number;
  po_amount_text: string;
  po_state: string;
  remarks: string;
}

const poBadge = (s: string) => (
  <Badge
    className={
      s === "PO Received"
        ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
        : "bg-muted text-muted-foreground"
    }
  >
    {s}
  </Badge>
);

export default function QuotationReport() {
  const scope = useReportScope();
  const { state, patch, from, to } = useDateScope("quotations", "quotation_date");
  const [owner, setOwner] = useState("all");
  const [followedBy, setFollowedBy] = useState("all");
  const [status, setStatus] = useState("all");
  const [po, setPo] = useState("all");
  const [statuses, setStatuses] = useState<{ value: string; label: string }[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);

  useEffect(() => {
    supabase
      .from("master_lead_statuses")
      .select("id, name")
      .order("name")
      .then(({ data }) => setStatuses((data || []).map((s) => ({ value: s.id, label: s.name }))));
  }, []);

  const generate = async () => {
    setLoading(true);
    try {
      let q = supabase
        .from("lead_quotations")
        .select(
          "id, lead_id, enquiry_number, enquiry_received_date, quotation_number, quotation_date, value_without_gst, followed_by_user_id, followed_by_name, status_id, status_name, po_date, po_number, po_amount, remarks, created_at, leads!inner(id, name, company, owner_id)"
        )
        .order("quotation_date", { ascending: false, nullsFirst: false });

      if (state.field === "created_at") {
        q = q.gte("created_at", `${from}T00:00:00`).lte("created_at", `${to}T23:59:59`);
      } else {
        q = q.gte(state.field, from).lte(state.field, to);
      }

      if (owner !== "all") q = q.eq("leads.owner_id", owner);
      else if (scope.userIds)
        q = q.in(
          "leads.owner_id",
          scope.userIds.length ? scope.userIds : ["00000000-0000-0000-0000-000000000000"]
        );
      if (followedBy !== "all") q = q.eq("followed_by_user_id", followedBy);
      if (status !== "all") q = q.eq("status_id", status);

      const { data, error } = await q;
      if (error) throw error;

      const nameMap = new Map(scope.users.map((u) => [u.id, u.full_name]));

      const mapped: Row[] = (data || []).map((r: any) => {
        const lead = r.leads || {};
        const value = Number(r.value_without_gst || 0);
        const poAmount = Number(r.po_amount || 0);
        const hasPo = !!(r.po_number || r.po_date || r.po_amount);
        return {
          id: r.id,
          lead_id: r.lead_id,
          lead: lead.name || "-",
          company: lead.company || "-",
          owner: lead.owner_id ? nameMap.get(lead.owner_id) || "-" : "-",
          quotation_number: r.quotation_number || "-",
          quotation_date: r.quotation_date,
          enquiry_number: r.enquiry_number || "-",
          enquiry_received_date: r.enquiry_received_date,
          value,
          value_text: formatCurrency(value, "INR"),
          followed_by: r.followed_by_name || (r.followed_by_user_id ? nameMap.get(r.followed_by_user_id) || "-" : "-"),
          status: r.status_name || "-",
          po_number: r.po_number || "-",
          po_date: r.po_date,
          po_amount: poAmount,
          po_amount_text: formatCurrency(poAmount, "INR"),
          po_state: hasPo ? "PO Received" : "PO Pending",
          remarks: r.remarks || "-",
        };
      });

      setRows(
        mapped.filter((r) => {
          if (po === "received") return r.po_state === "PO Received";
          if (po === "pending") return r.po_state === "PO Pending";
          return true;
        })
      );
      setGenerated(true);
    } catch {
      toast.error("Failed to generate report");
    } finally {
      setLoading(false);
    }
  };

  const columns: ReportColumn<Row>[] = useMemo(
    () => [
      {
        key: "quotation_number",
        header: "Qtn No",
        value: (r) => r.quotation_number,
        render: (r) => <span className="font-medium">{r.quotation_number}</span>,
        pdfWidth: 1.8,
      },
      {
        key: "quotation_date",
        header: "Qtn Date",
        value: (r) => (r.quotation_date ? format(new Date(`${r.quotation_date}T00:00:00`), "dd MMM yyyy") : "-"),
        pdfWidth: 1.7,
      },
      {
        key: "lead",
        header: "Lead",
        value: (r) => r.lead,
        render: (r) => <span className="block max-w-[170px] truncate">{r.lead}</span>,
        pdfWidth: 2.4,
      },
      {
        key: "company",
        header: "Company",
        value: (r) => r.company,
        render: (r) => <span className="block max-w-[160px] truncate">{r.company}</span>,
        pdfWidth: 2.2,
      },
      { key: "owner", header: "Lead Owner", value: (r) => r.owner, pdfWidth: 2 },
      {
        key: "value",
        header: "Value w/o GST",
        value: (r) => r.value,
        numeric: true,
        align: "right",
        render: (r) => r.value_text,
        pdfWidth: 1.8,
      },
      { key: "followed_by", header: "Followed By", value: (r) => r.followed_by, pdfWidth: 2 },
      { key: "status", header: "Status", value: (r) => r.status, pdfWidth: 1.8 },
      {
        key: "po_state",
        header: "PO Status",
        value: (r) => r.po_state,
        render: (r) => poBadge(r.po_state),
        pdfWidth: 1.6,
      },
      { key: "po_number", header: "PO No", value: (r) => r.po_number, pdfWidth: 1.7, defaultHidden: true },
      {
        key: "po_date",
        header: "PO Date",
        value: (r) => (r.po_date ? format(new Date(`${r.po_date}T00:00:00`), "dd MMM yyyy") : "-"),
        pdfWidth: 1.7,
        defaultHidden: true,
      },
      {
        key: "po_amount",
        header: "PO Amount",
        value: (r) => r.po_amount,
        numeric: true,
        align: "right",
        render: (r) => r.po_amount_text,
        pdfWidth: 1.8,
        defaultHidden: true,
      },
      { key: "enquiry_number", header: "Enq No", value: (r) => r.enquiry_number, pdfWidth: 1.7, defaultHidden: true },
      {
        key: "enquiry_received_date",
        header: "Enq Rcd Date",
        value: (r) =>
          r.enquiry_received_date ? format(new Date(`${r.enquiry_received_date}T00:00:00`), "dd MMM yyyy") : "-",
        pdfWidth: 1.8,
        defaultHidden: true,
      },
      {
        key: "remarks",
        header: "Remarks",
        value: (r) => r.remarks,
        render: (r) => <span className="block max-w-[220px] truncate">{r.remarks}</span>,
        pdfWidth: 3,
        defaultHidden: true,
      },
    ],
    []
  );

  const summary = useMemo(() => {
    const total = rows.reduce((s, r) => s + r.value, 0);
    const won = rows.filter((r) => r.po_state === "PO Received");
    const poTotal = won.reduce((s, r) => s + r.po_amount, 0);
    const conv = rows.length ? (won.length / rows.length) * 100 : 0;
    return [
      { label: "Quotations", value: String(rows.length) },
      { label: "Quoted Value", value: formatCurrency(total, "INR") },
      { label: "POs Received", value: String(won.length) },
      { label: "PO Value", value: formatCurrency(poTotal, "INR") },
      { label: "Conversion", value: `${conv.toFixed(0)}%` },
    ];
  }, [rows]);

  const fieldLabel = DATE_FIELDS.find((f) => f.value === state.field)?.label || state.field;

  return (
    <ReportWorkspace
      module="quotations"
      title="Quotation Report"
      description="Quotations raised against leads with values, follow-up owner, status and PO conversion."
      columns={columns}
      rows={rows}
      rowKey={(r) => r.id}
      rowLink={(r) => `/leads/${r.lead_id}`}
      loading={loading || scope.loading}
      generated={generated}
      onGenerate={generate}
      generatedBy={scope.generatedBy}
      fileName={`quotations-${from}-to-${to}.pdf`}
      summary={summary}
      defaultCharts={[
        {
          id: "value-owner",
          title: "Quoted Value by Lead Owner",
          type: "hbar",
          groupBy: "owner",
          measure: "value",
          aggregate: "sum",
          topN: 10,
        },
        {
          id: "count-owner",
          title: "Quotations by Lead Owner",
          type: "bar",
          groupBy: "owner",
          measure: "count",
        },
        {
          id: "value-lead",
          title: "Quoted Value by Lead",
          type: "hbar",
          groupBy: "lead",
          measure: "value",
          aggregate: "sum",
          topN: 10,
        },
        {
          id: "status-mix",
          title: "Quotation Status Mix",
          type: "pie",
          groupBy: "status",
          measure: "count",
        },
        {
          id: "po-mix",
          title: "PO Conversion",
          type: "pie",
          groupBy: "po_state",
          measure: "count",
        },
      ]}
      filterState={{ ...state, owner, followedBy, status, po }}
      onApplyFilterState={(s) => {
        patch({
          field: (s['field'] as string) || state.field,
          preset: (s['preset'] as PresetKey) || state.preset,
          customFrom: (s['customFrom'] as string) || state.customFrom,
          customTo: (s['customTo'] as string) || state.customTo,
        });
        setOwner((s['owner'] as string) || "all");
        setFollowedBy((s['followedBy'] as string) || "all");
        setStatus((s['status'] as string) || "all");
        setPo((s['po'] as string) || "all");
      }}
      filterSummary={[
        `${fieldLabel}: ${presetLabel(state.preset)} (${from} to ${to})`,
        `Lead Owner: ${owner === "all" ? "All" : scope.users.find((u) => u.id === owner)?.full_name || "-"}`,
        `Followed By: ${
          followedBy === "all" ? "All" : scope.users.find((u) => u.id === followedBy)?.full_name || "-"
        }`,
        `Status: ${status === "all" ? "All" : statuses.find((s) => s.value === status)?.label || status}`,
        `PO: ${po === "all" ? "All" : PO_OPTIONS.find((o) => o.value === po)?.label || po}`,
      ]}
      filters={
        <>
          <DateScopeFilter
            module="quotations"
            fields={DATE_FIELDS}
            state={state}
            onChange={patch}
            from={from}
            to={to}
          />
          <SelectField
            label="Lead Owner"
            value={owner}
            onChange={setOwner}
            allLabel="All Owners"
            options={scope.users.map((u) => ({ value: u.id, label: u.full_name }))}
          />
          <SelectField
            label="Followed By"
            value={followedBy}
            onChange={setFollowedBy}
            allLabel="All Users"
            options={scope.users.map((u) => ({ value: u.id, label: u.full_name }))}
          />
          <SelectField label="Status" value={status} onChange={setStatus} allLabel="All Statuses" options={statuses} />
          <SelectField label="PO Status" value={po} onChange={setPo} allLabel="All" options={PO_OPTIONS} />
        </>
      }
    />
  );
}
