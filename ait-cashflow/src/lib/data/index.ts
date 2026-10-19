import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { appMode } from "@/lib/config";
import { todayJst } from "@/lib/cash/dates";
import { demoRepo } from "./demo";
import type { OrgData, Repo, SessionUser } from "./repo";
import { supabaseRepo } from "./supabase";

export function getRepo(): Repo {
  return appMode() === "supabase" ? supabaseRepo : demoRepo;
}

export const ORG_COOKIE = "cf_org";

/** ログイン必須のページ・操作の入口。未ログインならログイン画面へ */
export async function requireUser(): Promise<{ repo: Repo; user: SessionUser }> {
  const repo = getRepo();
  const user = await repo.currentUser();
  if (!user) redirect("/login");
  return { repo, user };
}

/**
 * 選んでいる企業のデータ。Cookie の企業IDは必ずメンバーシップで確かめ、メンバーでなければ使わない。
 * 企業がなければ作成画面へ。
 */
export async function requireOrg(): Promise<{ repo: Repo; user: SessionUser; data: OrgData; today: string; orgs: { id: string; name: string }[] }> {
  const { repo, user } = await requireUser();
  const list = await repo.memberships();
  if (!list.length) redirect("/onboarding");
  const store = await cookies();
  const wanted = store.get(ORG_COOKIE)?.value;
  const org = list.find((m) => m.organization.id === wanted) ?? list[0];
  const today = todayJst();
  const data = await repo.loadOrg(org.organization.id, today);
  if (!data) redirect("/onboarding");
  return { repo, user, data, today, orgs: list.map((m) => ({ id: m.organization.id, name: m.organization.name })) };
}
