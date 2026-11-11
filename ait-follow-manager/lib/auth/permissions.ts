/**
 * 権限の単一定義（docs/05 の権限マトリクスと一致させる）。
 * サーバー側認可・UI の表示制御・テストはすべてこの定義を参照する。
 * DB 側の RLS が最終防衛線で、ここは二重防御の1層目。
 */

export type Role = "org_admin" | "store_manager" | "staff";

export const ROLE_LABELS: Record<Role, string> = {
  org_admin: "組織管理者",
  store_manager: "店舗責任者",
  staff: "スタッフ",
};

/** org = 組織全体に対して可能 / store = 所属店舗に対してのみ可能 / none = 不可 */
export type Scope = "org" | "store" | "none";

export const PERMISSIONS = {
  "organization.update": { org_admin: "org", store_manager: "none", staff: "none" },
  "store.create": { org_admin: "org", store_manager: "none", staff: "none" },
  "store.update": { org_admin: "org", store_manager: "store", staff: "none" },
  "staff.invite": { org_admin: "org", store_manager: "store", staff: "none" },
  "staff.change_role": { org_admin: "org", store_manager: "none", staff: "none" },
  "customer.read": { org_admin: "org", store_manager: "store", staff: "store" },
  "customer.write": { org_admin: "org", store_manager: "store", staff: "store" },
  "customer.delete": { org_admin: "org", store_manager: "none", staff: "none" },
  "customer.export": { org_admin: "org", store_manager: "none", staff: "none" },
  "customer.import": { org_admin: "org", store_manager: "store", staff: "none" },
  "consent.record": { org_admin: "org", store_manager: "store", staff: "store" },
  "visit.record": { org_admin: "org", store_manager: "store", staff: "store" },
  "task.act": { org_admin: "org", store_manager: "store", staff: "store" },
  "task.assign_others": { org_admin: "org", store_manager: "store", staff: "none" },
  "rule.manage": { org_admin: "org", store_manager: "store", staff: "none" },
  "rule.run": { org_admin: "org", store_manager: "store", staff: "none" },
  "template.read": { org_admin: "org", store_manager: "org", staff: "org" },
  "template.manage": { org_admin: "org", store_manager: "store", staff: "none" },
  "analytics.view": { org_admin: "org", store_manager: "store", staff: "none" },
  "audit.view": { org_admin: "org", store_manager: "none", staff: "none" },
} as const satisfies Record<string, Record<Role, Scope>>;

export type Permission = keyof typeof PERMISSIONS;

export const PERMISSION_LABELS: Record<Permission, string> = {
  "organization.update": "会社情報・組織設定の編集",
  "store.create": "店舗の追加",
  "store.update": "店舗情報の編集",
  "staff.invite": "スタッフの招待・無効化",
  "staff.change_role": "ロールの変更",
  "customer.read": "顧客の閲覧",
  "customer.write": "顧客の登録・編集",
  "customer.delete": "顧客の削除（匿名化）",
  "customer.export": "顧客データのエクスポート",
  "customer.import": "CSV取込",
  "consent.record": "連絡同意・配信停止の記録",
  "visit.record": "来店・予約の記録",
  "task.act": "タスク対応・記録",
  "task.assign_others": "他のスタッフへのタスク割当",
  "rule.manage": "フォロー条件の編集",
  "rule.run": "フォロー対象の今すぐ抽出",
  "template.read": "テンプレートの閲覧・コピー",
  "template.manage": "テンプレートの作成・編集",
  "analytics.view": "分析の閲覧",
  "audit.view": "監査ログの閲覧",
};

export type MembershipLike = { role: Role; store_id: string | null };

/**
 * 権限判定。
 * - storeId を指定：その店舗に対して可能か（store スコープは当該店舗の所属が必要）
 * - storeId が null：組織全体を対象とする操作（org スコープが必要）
 * - storeId を省略：いずれかの店舗で可能か（メニュー表示判定用）
 */
export function can(
  memberships: readonly MembershipLike[],
  permission: Permission,
  storeId?: string | null,
): boolean {
  const rule = PERMISSIONS[permission];
  return memberships.some((m) => {
    const scope: Scope = rule[m.role];
    if (scope === "none") return false;
    if (scope === "org") return true;
    // store スコープ
    if (storeId === undefined) return m.store_id !== null;
    if (storeId === null) return false;
    return m.store_id === storeId;
  });
}

/** 指定権限を持つ店舗 ID の一覧（org スコープなら全店舗） */
export function storesWithPermission(
  memberships: readonly MembershipLike[],
  permission: Permission,
  allStoreIds: readonly string[],
): string[] {
  return allStoreIds.filter((id) => can(memberships, permission, id));
}

export function highestRole(memberships: readonly MembershipLike[]): Role | null {
  if (memberships.some((m) => m.role === "org_admin")) return "org_admin";
  if (memberships.some((m) => m.role === "store_manager")) return "store_manager";
  if (memberships.some((m) => m.role === "staff")) return "staff";
  return null;
}
