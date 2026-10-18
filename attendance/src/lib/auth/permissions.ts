/**
 * 画面・API 側の権限判定（純粋関数）。
 * DB の RLS（supabase/migrations/*_rls_*.sql）と同じ規則を表す。
 * ここでの判定は「表示の出し分け」と「API での早期拒否」のためで、最終的な防御は DB 側。
 */

export const ROLES = ["super_admin", "hq_admin", "clinic_manager", "staff"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  super_admin: "システム管理者",
  hq_admin: "本部事務",
  clinic_manager: "院長",
  staff: "一般スタッフ",
};

export interface RoleGrant {
  role: Role;
  clinicId: string | null;
}

export interface Actor {
  userId: string;
  email: string;
  displayName: string;
  roles: RoleGrant[];
}

export function hasRole(actor: Actor, role: Role) {
  return actor.roles.some((r) => r.role === role);
}

export function isSuperAdmin(actor: Actor) {
  return hasRole(actor, "super_admin");
}

/** 本部権限（システム管理者または本部事務） */
export function isHq(actor: Actor) {
  return isSuperAdmin(actor) || hasRole(actor, "hq_admin");
}

/** 院長として担当している院（兼務なら複数） */
export function managedClinicIds(actor: Actor): string[] {
  return [
    ...new Set(
      actor.roles.filter((r) => r.role === "clinic_manager" && r.clinicId).map((r) => r.clinicId as string),
    ),
  ];
}

/** 院の運営（シフト作成・勤怠確認など）ができるか */
export function canManageClinic(actor: Actor, clinicId: string) {
  return isHq(actor) || managedClinicIds(actor).includes(clinicId);
}

/** 店舗・スタッフ・所属などのマスタを変更できるか */
export function canEditMasters(actor: Actor) {
  return isHq(actor);
}

/** 付与できるロール：システム管理者は全て、本部事務は院長・スタッフのみ */
export function grantableRoles(actor: Actor): Role[] {
  if (isSuperAdmin(actor)) return [...ROLES];
  if (isHq(actor)) return ["clinic_manager", "staff"];
  return [];
}

export function canGrantRole(actor: Actor, role: Role) {
  return grantableRoles(actor).includes(role);
}

/** ログイン後の既定の遷移先 */
export function homePathFor(actor: Actor) {
  if (isHq(actor)) return "/hq";
  if (managedClinicIds(actor).length > 0) return "/manager";
  return "/me";
}

export class PermissionError extends Error {
  constructor(message = "この操作を行う権限がありません") {
    super(message);
    this.name = "PermissionError";
  }
}
