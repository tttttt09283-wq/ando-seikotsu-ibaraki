// 役職（docs/permissions.md）
export const ROLE_CODES = ["PRESIDENT", "GM", "BM", "MANAGER", "STAFF", "PART_TIMER"] as const;
export type RoleCode = (typeof ROLE_CODES)[number];

export const ROLE_LABEL: Record<RoleCode, string> = {
  PRESIDENT: "社長", GM: "GM", BM: "BM", MANAGER: "院長", STAFF: "一般スタッフ", PART_TIMER: "アルバイト",
};
export const GLOBAL_ROLES: RoleCode[] = ["PRESIDENT", "GM", "BM"];
export const STORE_ROLES: RoleCode[] = ["MANAGER", "STAFF", "PART_TIMER"];

export type Me = {
  id: string;
  name: string;
  login_id: string;
  staff_code: string;
  must_change_password: boolean;
  global_roles: { role: RoleCode; area_id: string | null; area: string | null }[];
  stores: { store_id: string; store: string; role: RoleCode; is_primary: boolean }[];
};

// ログイン後に最初に開く画面（ダッシュボードは PHASE 9 で中身を作る）
export function homePathFor(me: Pick<Me, "global_roles" | "stores">): string {
  const g = new Set(me.global_roles.map((r) => r.role));
  if (g.has("PRESIDENT")) return "/president";
  if (g.has("GM")) return "/gm";
  if (g.has("BM")) return "/area";
  const managed = me.stores.find((s) => s.role === "MANAGER");
  if (managed) return `/store/${managed.store_id}`;
  return "/me";
}

// 「交野院 院長／茨木院 一般スタッフ」のような表示
export function describeRoles(me: Pick<Me, "global_roles" | "stores">): string {
  const parts = [
    ...me.global_roles.map((r) => (r.role === "BM" && r.area ? `BM（${r.area}）` : ROLE_LABEL[r.role])),
    ...me.stores.map((s) => `${s.store} ${ROLE_LABEL[s.role]}`),
  ];
  return parts.join("／") || "役職なし";
}
