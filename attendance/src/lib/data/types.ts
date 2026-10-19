/** DB 行の型（supabase/migrations と対応。将来は `supabase gen types` の生成物に置き換える） */

export type ClinicStatus = "active" | "suspended" | "closed";
export type StaffStatus = "active" | "on_leave" | "retired";
export type AssignmentType = "primary" | "support";

export interface ClinicRow {
  clinic_id: string;
  clinic_code: string;
  name: string;
  status: ClinicStatus;
  opened_on: string | null;
  suspended_on: string | null;
  closed_on: string | null;
  display_order: number;
  legal_holiday_weekday: number | null;
}

export interface StaffRow {
  staff_id: string;
  staff_code: string;
  auth_user_id: string | null;
  family_name: string;
  given_name: string;
  family_name_kana: string | null;
  given_name_kana: string | null;
  hire_date: string;
  retire_date: string | null;
  status: StaffStatus;
}

export interface StaffPrivateRow {
  staff_id: string;
  birth_date: string | null;
  phone: string | null;
  email: string | null;
  postal_code: string | null;
  address: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  notes: string | null;
}

export interface AssignmentRow {
  assignment_id: string;
  staff_id: string;
  clinic_id: string;
  assignment_type: AssignmentType;
  valid_from: string;
  valid_to: string | null;
  note: string | null;
}

export interface ContractRow {
  contract_id: string;
  staff_id: string;
  valid_from: string;
  valid_to: string | null;
  employment_type: "full_time" | "part_time" | "contract" | "other";
  weekly_scheduled_days: number;
  weekly_scheduled_minutes: number;
  daily_scheduled_minutes: number;
  legal_weekly_limit_minutes: number;
  fixed_overtime_minutes: number;
  note: string | null;
}

/** 分 → 「8時間」「7.5時間」 */
export function minutesToHours(minutes: number) {
  return `${Number((minutes / 60).toFixed(2))}時間`;
}

export interface AccountRow {
  user_id: string;
  email: string;
  display_name: string;
  disabled: boolean;
}

export interface RoleGrantRow {
  id: string;
  user_id: string;
  role: "super_admin" | "hq_admin" | "clinic_manager" | "staff";
  clinic_id: string | null;
  valid_from: string;
  valid_to: string | null;
}

export const CLINIC_STATUS_LABELS: Record<ClinicStatus, string> = {
  active: "営業中",
  suspended: "休止",
  closed: "閉鎖",
};

export const STAFF_STATUS_LABELS: Record<StaffStatus, string> = {
  active: "在籍",
  on_leave: "休職",
  retired: "退職",
};

export const ASSIGNMENT_TYPE_LABELS: Record<AssignmentType, string> = {
  primary: "主所属",
  support: "応援",
};

export function staffName(s: Pick<StaffRow, "family_name" | "given_name">) {
  return `${s.family_name} ${s.given_name}`;
}

/** 期間 [from, to] に date が含まれるか（to が null は無期限） */
export function isActiveOn(row: { valid_from: string; valid_to: string | null }, date: string) {
  return row.valid_from <= date && (row.valid_to === null || row.valid_to >= date);
}
