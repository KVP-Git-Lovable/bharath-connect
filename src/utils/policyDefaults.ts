import { devError } from '@/utils/devLog';

/**
 * Structured result type for self-healing policy hooks.
 * - data: the policy row or null if unavailable
 * - error: any error encountered during fetch/seed
 * - isFallback: true if auto-seed was attempted (indicates potential permission issues)
 */
export interface PolicyResult<T> {
  data: T | null;
  error: { message: string; code?: string; details?: string } | null;
  isFallback: boolean;
}

/**
 * Structured policy error logger for debugging.
 */
export function logPolicyError(
  context: string,
  error: unknown
): void {
  const err = error as { message?: string; code?: string; details?: string } | null;
  devError(`[Policy Error] ${context}`, {
    message: err?.message ?? 'Unknown error',
    code: err?.code ?? 'N/A',
    details: err?.details ?? 'N/A',
  });
}

// ─── Default Configs ────────────────────────────────────────────────

export const GLOBAL_LEAVE_POLICY_DEFAULTS = {
  is_enabled: true,
  reset_cycle: 'calendar_year',
  custom_reset_date: null,
  allow_negative_balance: false,
  max_negative_limit: 0,
  enable_carry_forward: false,
  max_carry_forward_limit: 0,
  carry_forward_expiry_months: null,
  min_notice_period_days: 1,
  max_continuous_leave_days: null,
  allow_backdated_leave: true,
  max_backdate_days: 7,
  enable_half_day: true,
  enable_sandwich_rule: false,
} as const;

export const AUTO_END_DAY_POLICY_DEFAULTS = {
  is_enabled: false,
  auto_close_time: '22:00:00',
  timezone: 'Asia/Kolkata',
  last_activity_source: 'all_activity',
  pre_warning_enabled: true,
  pre_warning_minutes_before: 15,
  close_in_progress_visits: true,
  cancel_planned_visits: false,
  mark_unproductive: false,
} as const;

export const REGULARIZATION_POLICY_DEFAULTS = {
  is_enabled: true,
  monthly_limit: null,
  daily_limit: 1,
  allow_checkin_edit: true,
  allow_checkout_edit: true,
  allow_status_edit: true,
  reason_mandatory: true,
  max_backdate_days: 7,
  allow_previous_month: false,
  restrict_after_payroll_lock: false,
  approval_mode: 'manager',
  update_attendance_on_approval: true,
  recalculate_hours: true,
  adjust_leave_balance: false,
} as const;
