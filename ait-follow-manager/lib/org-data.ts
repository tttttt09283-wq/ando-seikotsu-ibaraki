import "server-only";
import type { OrgContext } from "@/lib/auth/context";
import type { DbClient } from "@/lib/db/server";

export type StaffOption = { id: string; name: string; storeIds: (string | null)[]; roles: string[] };

/** 組織のスタッフ一覧（RLS により同じ組織のメンバーのみ） */
export async function listStaff(ctx: OrgContext, supabase: DbClient): Promise<StaffOption[]> {
  const { data: users } = await supabase.from("users").select("id, display_name, is_active").order("display_name");
  // memberships は自分の行＋管理者は組織内全体が見える。Staff には自分以外の所属が見えないため、名前の表示のみに使う
  const { data: ms } = await supabase
    .from("memberships")
    .select("user_id, store_id, role")
    .eq("organization_id", ctx.org.id)
    .eq("status", "active");
  const byUser = new Map<string, StaffOption>();
  for (const u of users ?? []) {
    if (!u.is_active) continue;
    byUser.set(u.id, { id: u.id, name: u.display_name, storeIds: [], roles: [] });
  }
  for (const m of ms ?? []) {
    const s = byUser.get(m.user_id);
    if (s) {
      s.storeIds.push(m.store_id);
      s.roles.push(m.role);
    }
  }
  return [...byUser.values()];
}

export async function listTags(ctx: OrgContext, supabase: DbClient) {
  const { data } = await supabase.from("tags").select("id, name, color").eq("organization_id", ctx.org.id).order("name");
  return data ?? [];
}

export function storeName(ctx: OrgContext, id: string | null | undefined) {
  return ctx.stores.find((s) => s.id === id)?.name ?? "—";
}
