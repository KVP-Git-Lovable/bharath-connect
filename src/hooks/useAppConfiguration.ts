import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "./useCurrentUser";
import { toast } from "sonner";

export type ConfigModule =
  | "activities"
  | "projects"
  | "procurement"
  | "goods_receipt"
  | "expenses"
  | "leave"
  | "attendance"
  | "regularisation"
  | "reports"
  | "customers"
  | "vendors";

export interface ConfigRow {
  module: string;
  config_key: string;
  config_value: unknown;
}

export interface ApprovalTransition {
  enabled: boolean;
  approverRoles: string[];
  rule: "any" | "all";
  notifyRoles: string[];
}

export const DEFAULT_TRANSITION: ApprovalTransition = {
  enabled: false,
  approverRoles: [],
  rule: "any",
  notifyRoles: [],
};

/**
 * Default configuration values. Source of truth for the shape of every
 * setting; used when a row hasn't been saved to the DB yet.
 */
export const CONFIG_DEFAULTS: Record<string, Record<string, unknown>> = {
  activities: {
    checkIn: true,
    gpsTrack: true,
    voiceNote: true,
    photoUpload: true,
    takePhoto: true,
    uploadGallery: true,
    requireMilestone: false,
    requireActivityType: true,
    allowBackdated: true,
    assignPermission: "admin_manager",
    requireManagerApproval: false,
  },
  projects: {
    galleryTab: true,
    documentsTab: true,
    createSites: "admin",
    editSite: "admin",
    addMilestones: "admin_manager",
    updateMilestoneProgress: "all",
  },
  procurement: {
    internalTransfer: true,
    budgetField: true,
    billShipFields: true,
    requireNotes: false,
    createRequisition: "all",
    editRatesAfterApproval: "admin",
    "transition.requisition_approved": DEFAULT_TRANSITION,
    "transition.po_issued": DEFAULT_TRANSITION,
    "transition.paid": DEFAULT_TRANSITION,
    "transition.rejected": DEFAULT_TRANSITION,
  },
  goods_receipt: {
    takePhoto: true,
    uploadGallery: true,
    maxPhotos: 20,
    vendorRating: true,
    ratingMetrics: [
      "Delivery Timeliness",
      "Material Quality",
      "Quantity Accuracy",
      "Overall Experience",
    ],
    badgeThresholds: { preferred: 4.5, reliable: 3.5, needsImprovement: 2.5, poor: 0 },
    requireApproval: false,
  },
  expenses: {
    receiptUpload: true,
    requireReceipt: false,
    autoApproveMax: 5000,
    categories: ["Travel", "Food", "Accommodation", "Miscellaneous"],
    submitPermission: "all",
    "transition.approved": DEFAULT_TRANSITION,
    "transition.rejected": DEFAULT_TRANSITION,
  },
  leave: {
    leaveTypes: [
      { name: "Casual Leave", maxDays: 12 },
      { name: "Sick Leave", maxDays: 10 },
      { name: "Earned Leave", maxDays: 15 },
    ],
    allowHalfDay: true,
    requireDocSickLeave: false,
    viewTeamCalendar: "admin_manager",
    "transition.approved": DEFAULT_TRANSITION,
    "transition.rejected": DEFAULT_TRANSITION,
  },
  attendance: {
    gpsCapture: true,
    requireSelfie: true,
    allowManualNoGps: false,
    workStart: "09:00",
    workEnd: "18:00",
    lateThresholdMins: 15,
    checkoutReminder: true,
    checkoutReminderTime: "18:30",
  },
  regularisation: {
    allowRegularisation: true,
    maxPastDays: 7,
    requireReason: true,
    "transition.approved": DEFAULT_TRANSITION,
    "transition.rejected": DEFAULT_TRANSITION,
  },
  reports: {
    activityReport: true,
    attendanceReport: true,
    expenseReport: true,
    leaveReport: true,
    procurementReport: true,
    leadReport: true,
    milestoneReport: true,
    paymentReport: true,
  },
  customers: {
    requireContactOnCreate: true,
    allowDuplicatePhone: false,
    createCustomer: "admin_manager",
    editOpportunity: "admin_manager",
    deleteCustomer: "admin",
    "transition.opportunity_won": DEFAULT_TRANSITION,
    "transition.opportunity_lost": DEFAULT_TRANSITION,
  },
  vendors: {
    requireGST: false,
    requirePAN: false,
    allowRatingEdit: true,
    createVendor: "admin_manager",
    editVendor: "admin_manager",
    deleteVendor: "admin",
  },
};

export function defaultValue(module: string, key: string): unknown {
  return CONFIG_DEFAULTS[module]?.[key];
}

export function useAppConfiguration() {
  const { user } = useCurrentUser();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["app-configuration"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("app_configuration" as any)
        .select("module, config_key, config_value");
      if (error) throw error;
      return ((data ?? []) as unknown) as ConfigRow[];
    },
    staleTime: 60 * 1000,
  });

  const map = new Map<string, unknown>();
  (data ?? []).forEach((r) => map.set(`${r.module}.${r.config_key}`, r.config_value));

  function getValue<T = unknown>(module: string, key: string): T {
    const stored = map.get(`${module}.${key}`);
    if (stored !== undefined && stored !== null) return stored as T;
    return defaultValue(module, key) as T;
  }

  function hasValue(module: string, key: string): boolean {
    const stored = map.get(`${module}.${key}`);
    return stored !== undefined && stored !== null;
  }

  const mutation = useMutation({
    mutationFn: async ({
      module,
      key,
      value,
    }: {
      module: string;
      key: string;
      value: unknown;
    }) => {
      const { error } = await supabase
        .from("app_configuration" as any)
        .upsert(
          {
            module,
            config_key: key,
            config_value: value as never,
            updated_by: user?.id ?? null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "module,config_key" },
        );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["app-configuration"] });
      toast.success("Configuration saved");
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Failed to save configuration";
      toast.error(msg);
    },
  });

  function setValue(module: string, key: string, value: unknown) {
    mutation.mutate({ module, key, value });
  }

  return { getValue, hasValue, setValue, isLoading, saving: mutation.isPending };
}
