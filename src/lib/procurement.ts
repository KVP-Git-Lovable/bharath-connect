// Shared constants and helpers for the Procurement module

export const PROC_STATUSES = [
  "Requisition",
  "Requisition Approved",
  "Quote Awaited",
  "Quote Received",
  "PO Issued",
  "PO Finalised",
  "Goods Received",
  "Invoice Received",
  "Paid",
  "Closed",
] as const;
export type ProcStatus = (typeof PROC_STATUSES)[number];

// Statuses a user is allowed to set directly on the PO form (creation only)
export const USER_FORM_STATUSES: ProcStatus[] = ["Requisition"];

export const UOM_OPTIONS = ["Nos", "Kg", "Ton", "Bags", "Sqft", "Rmt", "Set"] as const;

export const PAYMENT_TERMS = [
  "Immediate",
  "Net 15",
  "Net 30",
  "Net 60",
  "Against Delivery",
] as const;

export const GRN_STATUSES = [
  "Pending",
  "Partially Received",
  "Fully Received",
  "Rejected",
] as const;
export type GrnStatus = (typeof GRN_STATUSES)[number];

// The ordered lifecycle
export const STATUS_FLOW: ProcStatus[] = [
  "Requisition",
  "Requisition Approved",
  "Quote Awaited",
  "Quote Received",
  "PO Issued",
  "PO Finalised",
  "Goods Received",
  "Invoice Received",
  "Paid",
  "Closed",
];

export interface Transition {
  to: ProcStatus;
  label: string;
  /** requires admin/manager approval rights */
  approver: boolean;
  variant?: "default" | "destructive" | "outline";
}

// Allowed button-driven transitions from a given status
export function allowedTransitions(status: string): Transition[] {
  switch (status) {
    case "Requisition":
      return [{ to: "Requisition Approved", label: "Approve Requisition", approver: true }];
    case "Requisition Approved":
      return [{ to: "Quote Awaited", label: "Mark Quote Awaited", approver: false }];
    case "Quote Awaited":
      return [{ to: "Quote Received", label: "Mark Quote Received", approver: false }];
    case "Quote Received":
      return [{ to: "PO Issued", label: "Issue PO", approver: true }];
    case "PO Issued":
      return [{ to: "PO Finalised", label: "Finalise PO", approver: true }];
    case "PO Finalised":
      return [{ to: "Goods Received", label: "Mark Goods Received", approver: true }];
    case "Goods Received":
      return [{ to: "Invoice Received", label: "Mark Invoice Received", approver: true }];
    case "Invoice Received":
      return [{ to: "Paid", label: "Mark Paid", approver: true }];
    case "Paid":
      return [{ to: "Closed", label: "Close PO", approver: true }];
    default:
      return [];
  }
}

export function statusColor(status: string) {
  switch (status) {
    case "Requisition": return "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400";
    case "Requisition Approved": return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
    case "Quote Awaited": return "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400";
    case "Quote Received": return "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400";
    case "PO Issued": return "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400";
    case "PO Finalised": return "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400";
    case "Goods Received": return "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400";
    case "Invoice Received": return "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400";
    case "Paid": return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400";
    case "Closed": return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400";
    case "Rejected": return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
    case "Cancelled": return "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400";
    default: return "bg-gray-100 text-gray-600";
  }
}

// GRN-specific status colors
export function grnStatusColor(status: string) {
  switch (status) {
    case "Pending": return "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400";
    case "Partially Received": return "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400";
    case "Fully Received": return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
    case "Rejected": return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
    default: return "bg-gray-100 text-gray-600";
  }
}

export const fmtAmt = (n: number) =>
  `₹${(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Determine PO status after a GRN receipt, based on total received vs ordered.
export function receiptDrivenStatus(
  totalOrdered: number,
  totalReceived: number,
  current: string
): ProcStatus | null {
  if (totalReceived <= 0) return null;
  if (totalReceived >= totalOrdered) return "Goods Received";
  return null;
}
