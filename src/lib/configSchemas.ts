// Shared schemas for configurable modules: builtin field seeds + condition
// fields used by the rule builder.

export type FieldType = "text" | "number" | "dropdown" | "date" | "toggle" | "file";

export interface FieldDef {
  id: string;
  key: string;
  label: string;
  type: FieldType;
  visible: boolean;
  required: boolean;
  builtin: boolean;
  deleted?: boolean;
  defaultValue?: unknown;
  helpText?: string;
  options?: string[];
  order: number;
}

export interface ApprovalStep {
  id: string;
  name: string;
  approverType: "user" | "role" | "reporting_manager";
  approverIds?: string[];
  approverRoles?: string[];
  mode: "sequential" | "parallel";
  parallelRule?: "all" | "any";
}

export type RuleOp = "eq" | "neq" | "gt" | "lt" | "gte" | "lte" | "contains";

export interface RuleCondition {
  field: string;
  op: RuleOp;
  value: string;
}

export interface ApprovalRule {
  id: string;
  name: string;
  conditions: RuleCondition[];
  logic: "AND" | "OR";
  action: "add_step" | "skip_to" | "replace";
  targetStepId?: string;
  extraApproverRoles?: string[];
  extraApproverIds?: string[];
  extraStepName?: string;
}

export interface WorkflowDef {
  steps: ApprovalStep[];
  rules: ApprovalRule[];
}

export const EMPTY_WORKFLOW: WorkflowDef = { steps: [], rules: [] };

// Builtin field seeds keyed by module name — mirror the current toggles so
// admins see everything in one place.
export const BUILTIN_FIELDS: Record<string, Omit<FieldDef, "id" | "order">[]> = {
  activities: [
    { key: "checkIn", label: "Check In button", type: "toggle", visible: true, required: false, builtin: true },
    { key: "gpsTrack", label: "GPS Track", type: "toggle", visible: true, required: false, builtin: true },
    { key: "voiceNote", label: "Voice Note in description", type: "toggle", visible: true, required: false, builtin: true },
    { key: "takePhoto", label: "Take Photo", type: "toggle", visible: true, required: false, builtin: true },
    { key: "uploadGallery", label: "Upload from Gallery", type: "toggle", visible: true, required: false, builtin: true },
    { key: "milestone", label: "Milestone selection", type: "dropdown", visible: true, required: false, builtin: true },
    { key: "activityType", label: "Activity Type", type: "dropdown", visible: true, required: true, builtin: true },
    { key: "description", label: "Description", type: "text", visible: true, required: false, builtin: true },
  ],
  projects: [
    { key: "name", label: "Site Name", type: "text", visible: true, required: true, builtin: true },
    { key: "address", label: "Address", type: "text", visible: true, required: false, builtin: true },
    { key: "gallery", label: "Gallery tab", type: "toggle", visible: true, required: false, builtin: true },
    { key: "documents", label: "Documents tab", type: "toggle", visible: true, required: false, builtin: true },
  ],
  expenses: [
    { key: "category", label: "Category", type: "dropdown", visible: true, required: true, builtin: true },
    { key: "amount", label: "Amount", type: "number", visible: true, required: true, builtin: true },
    { key: "date", label: "Expense date", type: "date", visible: true, required: true, builtin: true },
    { key: "receipt", label: "Receipt upload", type: "file", visible: true, required: false, builtin: true },
    { key: "notes", label: "Notes", type: "text", visible: true, required: false, builtin: true },
  ],
  leave: [
    { key: "leaveType", label: "Leave Type", type: "dropdown", visible: true, required: true, builtin: true },
    { key: "fromDate", label: "From date", type: "date", visible: true, required: true, builtin: true },
    { key: "toDate", label: "To date", type: "date", visible: true, required: true, builtin: true },
    { key: "reason", label: "Reason", type: "text", visible: true, required: false, builtin: true },
    { key: "document", label: "Supporting document", type: "file", visible: true, required: false, builtin: true },
  ],
  attendance: [
    { key: "selfie", label: "Selfie", type: "file", visible: true, required: true, builtin: true },
    { key: "gps", label: "GPS location", type: "toggle", visible: true, required: true, builtin: true },
  ],
  customers: [
    { key: "name", label: "Customer Name", type: "text", visible: true, required: true, builtin: true },
    { key: "industry", label: "Industry", type: "text", visible: true, required: false, builtin: true },
    { key: "phone", label: "Phone", type: "text", visible: true, required: true, builtin: true },
    { key: "primaryContact", label: "Primary Contact", type: "text", visible: true, required: false, builtin: true },
  ],
  vendors: [
    { key: "name", label: "Vendor Name", type: "text", visible: true, required: true, builtin: true },
    { key: "gst", label: "GST number", type: "text", visible: true, required: false, builtin: true },
    { key: "pan", label: "PAN number", type: "text", visible: true, required: false, builtin: true },
    { key: "phone", label: "Phone", type: "text", visible: true, required: true, builtin: true },
  ],
  procurement: [
    { key: "vendor", label: "Vendor", type: "dropdown", visible: true, required: true, builtin: true },
    { key: "amount", label: "PO Amount", type: "number", visible: true, required: true, builtin: true },
    { key: "budget", label: "Budget", type: "number", visible: true, required: false, builtin: true },
    { key: "notes", label: "Notes / Reason", type: "text", visible: true, required: false, builtin: true },
  ],
  goods_receipt: [
    { key: "photos", label: "GRN photos", type: "file", visible: true, required: false, builtin: true },
    { key: "rating", label: "Vendor rating", type: "number", visible: true, required: false, builtin: true },
  ],
  reports: [],
};

export function seedFields(module: string): FieldDef[] {
  const list = BUILTIN_FIELDS[module] ?? [];
  return list.map((f, i) => ({
    ...f,
    id: `builtin-${f.key}`,
    order: i,
  }));
}

// Merge stored fields with the current builtin seed so newly-added builtin
// fields show up even for older configs.
export function mergeWithBuiltins(module: string, stored: FieldDef[] | undefined): FieldDef[] {
  const seed = seedFields(module);
  if (!stored || stored.length === 0) return seed;
  const byKey = new Map(stored.map((f) => [f.key, f]));
  const merged: FieldDef[] = [];
  seed.forEach((s) => {
    const existing = byKey.get(s.key);
    if (existing) {
      merged.push({ ...s, ...existing, builtin: true });
      byKey.delete(s.key);
    } else {
      merged.push(s);
    }
  });
  // remaining are custom fields
  Array.from(byKey.values()).forEach((c) => merged.push(c));
  return merged.sort((a, b) => a.order - b.order).map((f, i) => ({ ...f, order: i }));
}

export const OP_LABELS: Record<RuleOp, string> = {
  eq: "equals",
  neq: "not equals",
  gt: "greater than",
  lt: "less than",
  gte: ">=",
  lte: "<=",
  contains: "contains",
};
