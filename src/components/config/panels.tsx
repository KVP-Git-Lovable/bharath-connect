import {
  ConfigSection, ConfigToggleRow, ConfigSelectRow, ConfigNumberRow, ConfigTimeRow, ConfigInfoMessage,
} from "./ConfigControls";
import { EditableListEditor, LeaveTypeEditor, LeaveTypeItem } from "./EditableListEditor";
import { ApprovalTransitionEditor } from "./ApprovalTransitionEditor";
import { useAppConfiguration, ApprovalTransition } from "@/hooks/useAppConfiguration";
import { FieldManager } from "./FieldManager";
import { WorkflowBuilder } from "./WorkflowBuilder";

const ADMIN_MANAGER = [
  { value: "admin", label: "Admin only" },
  { value: "admin_manager", label: "Admin + Manager" },
];
const ADMIN_MANAGER_ALL = [
  { value: "admin", label: "Admin only" },
  { value: "admin_manager", label: "Admin + Manager" },
  { value: "all", label: "All" },
];
const ALL_MANAGER_ADMIN = [
  { value: "all", label: "All" },
  { value: "admin_manager", label: "Manager + Admin" },
  { value: "admin", label: "Admin only" },
];

type Tab = "config" | "approval";

export function ModulePanel({ module, tab }: { module: string; tab: Tab }) {
  const legacy = <LegacyModulePanel module={module} tab={tab} />;
  if (tab === "config") {
    return (
      <div className="space-y-6">
        {legacy}
        <FieldManager module={module} />
      </div>
    );
  }
  return (
    <div className="space-y-6">
      <WorkflowBuilder module={module} />
      <details className="rounded-lg border p-3">
        <summary className="cursor-pointer text-sm font-medium">Legacy approval settings</summary>
        <div className="pt-3">{legacy}</div>
      </details>
    </div>
  );
}

function LegacyModulePanel({ module, tab }: { module: string; tab: Tab }) {
  const { getValue, setValue, hasValue } = useAppConfiguration();
  const g = <T,>(key: string) => getValue<T>(module, key);
  const s = (key: string, v: unknown) => setValue(module, key, v);

  const bool = (key: string) => Boolean(g<boolean>(key));
  const boolOr = (key: string, fallbackKey: string) =>
    hasValue(module, key) ? bool(key) : bool(fallbackKey);
  const num = (key: string) => Number(g<number>(key));
  const str = (key: string) => String(g<string>(key) ?? "");
  const trans = (key: string) => g<ApprovalTransition>(key);

  const takePhoto = boolOr("takePhoto", "photoUpload");
  const uploadGallery = boolOr("uploadGallery", "photoUpload");

  if (module === "activities") {
    if (tab === "config")
      return (
        <ConfigSection title="Activity settings">
          <ConfigToggleRow label="Check In button" description="Show the check-in action on activities" checked={bool("checkIn")} onChange={(v) => s("checkIn", v)} />
          <ConfigToggleRow label="GPS Track" description="Capture GPS location during activities" checked={bool("gpsTrack")} onChange={(v) => s("gpsTrack", v)} />
          <ConfigToggleRow label="Voice Note in description" checked={bool("voiceNote")} onChange={(v) => s("voiceNote", v)} />
          <ConfigToggleRow label="Take Photo" description="Show the camera / Take Photo button on the activity form" checked={takePhoto} onChange={(v) => s("takePhoto", v)} />
          <ConfigToggleRow label="Upload from Gallery" description="Show the Upload button on the activity form" checked={uploadGallery} onChange={(v) => s("uploadGallery", v)} />
          <ConfigToggleRow label="Require Milestone selection" description="Make milestone mandatory" checked={bool("requireMilestone")} onChange={(v) => s("requireMilestone", v)} />
          <ConfigToggleRow label="Require Activity Type selection" checked={bool("requireActivityType")} onChange={(v) => s("requireActivityType", v)} />
          <ConfigToggleRow label="Allow backdated activity logging" checked={bool("allowBackdated")} onChange={(v) => s("allowBackdated", v)} />
          <ConfigSelectRow label="Who can assign activities to others" value={str("assignPermission")} onChange={(v) => s("assignPermission", v)} options={ADMIN_MANAGER_ALL} />
        </ConfigSection>
      );
    return (
      <ConfigSection title="Approval">
        <ConfigToggleRow label="Require manager approval for activity submission" description="Off = no approval needed (default)" checked={bool("requireManagerApproval")} onChange={(v) => s("requireManagerApproval", v)} />
      </ConfigSection>
    );
  }

  if (module === "projects") {
    if (tab === "config")
      return (
        <ConfigSection title="Projects / Sites settings">
          <ConfigToggleRow label="Gallery tab" checked={bool("galleryTab")} onChange={(v) => s("galleryTab", v)} />
          <ConfigToggleRow label="Documents tab" checked={bool("documentsTab")} onChange={(v) => s("documentsTab", v)} />
          <ConfigSelectRow label="Who can create new Sites" value={str("createSites")} onChange={(v) => s("createSites", v)} options={ADMIN_MANAGER} />
          <ConfigSelectRow label="Who can edit Site details" value={str("editSite")} onChange={(v) => s("editSite", v)} options={ADMIN_MANAGER} />
          <ConfigSelectRow label="Who can add Milestones" value={str("addMilestones")} onChange={(v) => s("addMilestones", v)} options={ADMIN_MANAGER} />
          <ConfigSelectRow label="Who can update Milestone progress" value={str("updateMilestoneProgress")} onChange={(v) => s("updateMilestoneProgress", v)} options={ADMIN_MANAGER_ALL} />
        </ConfigSection>
      );
    return <ConfigInfoMessage>No approval flow for this module</ConfigInfoMessage>;
  }

  if (module === "procurement") {
    if (tab === "config")
      return (
        <ConfigSection title="Procurement settings">
          <ConfigToggleRow label="Internal Transfer flow" checked={bool("internalTransfer")} onChange={(v) => s("internalTransfer", v)} />
          <ConfigToggleRow label="Budget field on Requisition" checked={bool("budgetField")} onChange={(v) => s("budgetField", v)} />
          <ConfigToggleRow label="Bill To / Ship To fields" checked={bool("billShipFields")} onChange={(v) => s("billShipFields", v)} />
          <ConfigToggleRow label="Require Notes / Reason on Requisition" checked={bool("requireNotes")} onChange={(v) => s("requireNotes", v)} />
          <ConfigSelectRow label="Who can create Requisition" value={str("createRequisition")} onChange={(v) => s("createRequisition", v)} options={ALL_MANAGER_ADMIN} />
          <ConfigSelectRow label="Who can edit PO rates after approval" value={str("editRatesAfterApproval")} onChange={(v) => s("editRatesAfterApproval", v)} options={ADMIN_MANAGER} />
        </ConfigSection>
      );
    return (
      <div className="space-y-4">
        <ApprovalTransitionEditor title="Requisition → Requisition Approved" value={trans("transition.requisition_approved")} onChange={(v) => s("transition.requisition_approved", v)} />
        <ApprovalTransitionEditor title="Quote Received → PO Issued" value={trans("transition.po_issued")} onChange={(v) => s("transition.po_issued", v)} />
        <ApprovalTransitionEditor title="Invoice Received → Paid" value={trans("transition.paid")} onChange={(v) => s("transition.paid", v)} />
        <ApprovalTransitionEditor title="Any stage → Rejected" value={trans("transition.rejected")} onChange={(v) => s("transition.rejected", v)} />
      </div>
    );
  }

  if (module === "goods_receipt") {
    if (tab === "config") {
      const metrics = g<string[]>("ratingMetrics") ?? [];
      const thresholds = (g<Record<string, number>>("badgeThresholds")) ?? { preferred: 4.5, reliable: 3.5, needsImprovement: 2.5, poor: 0 };
      const setThreshold = (k: string, v: number) => s("badgeThresholds", { ...thresholds, [k]: v });
      return (
        <div className="space-y-6">
          <ConfigSection title="Photos">
            <ConfigToggleRow label="Take Photo button" checked={bool("takePhoto")} onChange={(v) => s("takePhoto", v)} />
            <ConfigToggleRow label="Upload from Gallery button" checked={bool("uploadGallery")} onChange={(v) => s("uploadGallery", v)} />
            <ConfigNumberRow label="Maximum number of photos allowed" value={num("maxPhotos")} onChange={(v) => s("maxPhotos", v)} />
          </ConfigSection>
          <ConfigSection title="Vendor rating">
            <ConfigToggleRow label="Vendor Rating after GRN" checked={bool("vendorRating")} onChange={(v) => s("vendorRating", v)} />
            <div className="p-3">
              <p className="text-xs text-muted-foreground mb-2">Rating scale: 5 stars (fixed)</p>
              <EditableListEditor title="Rating metrics" items={metrics} onChange={(v) => s("ratingMetrics", v)} placeholder="New rating metric" />
            </div>
          </ConfigSection>
          <ConfigSection title="Rating badge thresholds (min score)">
            <ConfigNumberRow label="Preferred Vendor" value={thresholds.preferred} onChange={(v) => setThreshold("preferred", v)} />
            <ConfigNumberRow label="Reliable" value={thresholds.reliable} onChange={(v) => setThreshold("reliable", v)} />
            <ConfigNumberRow label="Needs Improvement" value={thresholds.needsImprovement} onChange={(v) => setThreshold("needsImprovement", v)} />
            <ConfigNumberRow label="Poor" value={thresholds.poor} onChange={(v) => setThreshold("poor", v)} />
          </ConfigSection>
        </div>
      );
    }
    return (
      <ConfigSection title="Approval">
        <ConfigToggleRow label="Require admin approval before GRN is confirmed" description="Off = GRN is created directly" checked={bool("requireApproval")} onChange={(v) => s("requireApproval", v)} />
      </ConfigSection>
    );
  }

  if (module === "expenses") {
    if (tab === "config") {
      const categories = g<string[]>("categories") ?? [];
      return (
        <div className="space-y-6">
          <ConfigSection title="Expense settings">
            <ConfigToggleRow label="Receipt photo upload" checked={bool("receiptUpload")} onChange={(v) => s("receiptUpload", v)} />
            <ConfigToggleRow label="Require receipt photo" checked={bool("requireReceipt")} onChange={(v) => s("requireReceipt", v)} />
            <ConfigNumberRow label="Maximum expense amount without approval" description="Below this auto-approved" prefix="₹" value={num("autoApproveMax")} onChange={(v) => s("autoApproveMax", v)} />
            <ConfigSelectRow label="Who can submit expenses" value={str("submitPermission")} onChange={(v) => s("submitPermission", v)} options={[{ value: "all", label: "All" }, { value: "admin_manager", label: "Manager + Admin only" }]} />
          </ConfigSection>
          <div className="rounded-lg border border-border/60 p-4">
            <EditableListEditor title="Expense categories" items={categories} onChange={(v) => s("categories", v)} placeholder="New category" />
          </div>
        </div>
      );
    }
    return (
      <div className="space-y-4">
        <ApprovalTransitionEditor title="Submitted → Approved" value={trans("transition.approved")} onChange={(v) => s("transition.approved", v)} />
        <ApprovalTransitionEditor title="Submitted → Rejected" value={trans("transition.rejected")} onChange={(v) => s("transition.rejected", v)} />
      </div>
    );
  }

  if (module === "leave") {
    if (tab === "config") {
      const leaveTypes = g<LeaveTypeItem[]>("leaveTypes") ?? [];
      return (
        <div className="space-y-6">
          <div className="rounded-lg border border-border/60 p-4 space-y-2">
            <p className="text-sm font-semibold">Leave types (with max days)</p>
            <LeaveTypeEditor items={leaveTypes} onChange={(v) => s("leaveTypes", v)} />
          </div>
          <ConfigSection title="Leave settings">
            <ConfigToggleRow label="Allow half-day leave" checked={bool("allowHalfDay")} onChange={(v) => s("allowHalfDay", v)} />
            <ConfigToggleRow label="Require document upload for sick leave" checked={bool("requireDocSickLeave")} onChange={(v) => s("requireDocSickLeave", v)} />
            <ConfigSelectRow label="Who can view team leave calendar" value={str("viewTeamCalendar")} onChange={(v) => s("viewTeamCalendar", v)} options={ADMIN_MANAGER_ALL} />
          </ConfigSection>
        </div>
      );
    }
    return (
      <div className="space-y-4">
        <ApprovalTransitionEditor title="Applied → Approved" value={trans("transition.approved")} onChange={(v) => s("transition.approved", v)} />
        <ApprovalTransitionEditor title="Applied → Rejected" value={trans("transition.rejected")} onChange={(v) => s("transition.rejected", v)} />
      </div>
    );
  }

  if (module === "attendance") {
    if (tab === "config")
      return (
        <div className="space-y-6">
          <ConfigSection title="Attendance settings">
            <ConfigToggleRow label="GPS location capture on check-in" checked={bool("gpsCapture")} onChange={(v) => s("gpsCapture", v)} />
            <ConfigToggleRow label="Require selfie on check-in" checked={bool("requireSelfie")} onChange={(v) => s("requireSelfie", v)} />
            <ConfigToggleRow label="Allow manual check-in without GPS" checked={bool("allowManualNoGps")} onChange={(v) => s("allowManualNoGps", v)} />
            <ConfigTimeRow label="Work hours — Start time" value={str("workStart")} onChange={(v) => s("workStart", v)} />
            <ConfigTimeRow label="Work hours — End time" value={str("workEnd")} onChange={(v) => s("workEnd", v)} />
            <ConfigNumberRow label="Late check-in threshold (minutes)" value={num("lateThresholdMins")} onChange={(v) => s("lateThresholdMins", v)} />
            <ConfigToggleRow label="Check-out reminder notification" checked={bool("checkoutReminder")} onChange={(v) => s("checkoutReminder", v)} />
            <ConfigTimeRow label="Check-out reminder time" value={str("checkoutReminderTime")} onChange={(v) => s("checkoutReminderTime", v)} />
          </ConfigSection>
          <RegularisationConfig />
        </div>
      );
    return (
      <div className="space-y-6">
        <ConfigInfoMessage>Attendance is auto-recorded, no approval flow</ConfigInfoMessage>
        <RegularisationApproval />
      </div>
    );
  }

  if (module === "customers") {
    if (tab === "config")
      return (
        <ConfigSection title="Customers / CRM settings">
          <ConfigToggleRow label="Require primary contact when creating customer" checked={bool("requireContactOnCreate")} onChange={(v) => s("requireContactOnCreate", v)} />
          <ConfigToggleRow label="Allow duplicate phone numbers" checked={bool("allowDuplicatePhone")} onChange={(v) => s("allowDuplicatePhone", v)} />
          <ConfigSelectRow label="Who can create Customers" value={str("createCustomer")} onChange={(v) => s("createCustomer", v)} options={ADMIN_MANAGER_ALL} />
          <ConfigSelectRow label="Who can edit Opportunities" value={str("editOpportunity")} onChange={(v) => s("editOpportunity", v)} options={ADMIN_MANAGER_ALL} />
          <ConfigSelectRow label="Who can delete Customers" value={str("deleteCustomer")} onChange={(v) => s("deleteCustomer", v)} options={ADMIN_MANAGER} />
        </ConfigSection>
      );
    return (
      <div className="space-y-4">
        <ApprovalTransitionEditor title="Opportunity → Won" value={trans("transition.opportunity_won")} onChange={(v) => s("transition.opportunity_won", v)} />
        <ApprovalTransitionEditor title="Opportunity → Lost" value={trans("transition.opportunity_lost")} onChange={(v) => s("transition.opportunity_lost", v)} />
      </div>
    );
  }

  if (module === "vendors") {
    if (tab === "config")
      return (
        <ConfigSection title="Vendor settings">
          <ConfigToggleRow label="Require GST number" checked={bool("requireGST")} onChange={(v) => s("requireGST", v)} />
          <ConfigToggleRow label="Require PAN number" checked={bool("requirePAN")} onChange={(v) => s("requirePAN", v)} />
          <ConfigToggleRow label="Allow rating edits" checked={bool("allowRatingEdit")} onChange={(v) => s("allowRatingEdit", v)} />
          <ConfigSelectRow label="Who can create Vendors" value={str("createVendor")} onChange={(v) => s("createVendor", v)} options={ADMIN_MANAGER} />
          <ConfigSelectRow label="Who can edit Vendors" value={str("editVendor")} onChange={(v) => s("editVendor", v)} options={ADMIN_MANAGER} />
          <ConfigSelectRow label="Who can delete Vendors" value={str("deleteVendor")} onChange={(v) => s("deleteVendor", v)} options={ADMIN_MANAGER} />
        </ConfigSection>
      );
    return <ConfigInfoMessage>No approval flow for this module</ConfigInfoMessage>;
  }

  if (module === "reports") {
    if (tab === "config")
      return (
        <ConfigSection title="Report visibility">
          <ConfigToggleRow label="Activity Report" checked={bool("activityReport")} onChange={(v) => s("activityReport", v)} />
          <ConfigToggleRow label="Attendance Report" checked={bool("attendanceReport")} onChange={(v) => s("attendanceReport", v)} />
          <ConfigToggleRow label="Expense Report" checked={bool("expenseReport")} onChange={(v) => s("expenseReport", v)} />
          <ConfigToggleRow label="Leave Report" checked={bool("leaveReport")} onChange={(v) => s("leaveReport", v)} />
          <ConfigToggleRow label="Lead Report" checked={bool("leadReport")} onChange={(v) => s("leadReport", v)} />
          <ConfigToggleRow label="Milestone Report" checked={bool("milestoneReport")} onChange={(v) => s("milestoneReport", v)} />
          <ConfigToggleRow label="Payment Report" checked={bool("paymentReport")} onChange={(v) => s("paymentReport", v)} />
          <ConfigToggleRow label="Procurement Report" checked={bool("procurementReport")} onChange={(v) => s("procurementReport", v)} />
        </ConfigSection>

      );
    return <ConfigInfoMessage>No approval flow for this module</ConfigInfoMessage>;
  }

  return null;
}

function RegularisationConfig() {
  const { getValue, setValue } = useAppConfiguration();
  const m = "regularisation";
  return (
    <ConfigSection title="Regularisation">
      <ConfigToggleRow label="Allow regularisation requests" description="Enable / disable the entire feature" checked={Boolean(getValue<boolean>(m, "allowRegularisation"))} onChange={(v) => setValue(m, "allowRegularisation", v)} />
      <ConfigNumberRow label="Maximum days in past for regularisation" value={Number(getValue<number>(m, "maxPastDays"))} onChange={(v) => setValue(m, "maxPastDays", v)} />
      <ConfigToggleRow label="Require reason for regularisation" checked={Boolean(getValue<boolean>(m, "requireReason"))} onChange={(v) => setValue(m, "requireReason", v)} />
    </ConfigSection>
  );
}

function RegularisationApproval() {
  const { getValue, setValue } = useAppConfiguration();
  const m = "regularisation";
  return (
    <div className="space-y-4">
      <p className="text-sm font-semibold">Regularisation approval</p>
      <ApprovalTransitionEditor title="Submitted → Approved" value={getValue<ApprovalTransition>(m, "transition.approved")} onChange={(v) => setValue(m, "transition.approved", v)} />
      <ApprovalTransitionEditor title="Submitted → Rejected" value={getValue<ApprovalTransition>(m, "transition.rejected")} onChange={(v) => setValue(m, "transition.rejected", v)} />
    </div>
  );
}
