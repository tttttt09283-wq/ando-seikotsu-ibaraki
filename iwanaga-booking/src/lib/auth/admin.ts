/**
 * 現在の管理者を取得する。管理画面・管理APIのすべてで必ず呼ぶ（サーバー側認可）。
 */
import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { assertAuthModeAllowed, authMode, config } from "../config";
import { getRepo } from "../repo";
import { supabaseServer } from "../supabase/server";
import type { AdminContext } from "./permissions";
import { LOCAL_SESSION_COOKIE, verifySession } from "./session";

export function localSessionSecret(): string {
  const s = config.sessionSecret;
  if (s && s.length >= 32) return s;
  if (process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET（32文字以上）を設定してください");
  return "iwanaga-booking-local-dev-session-secret-0000";
}

export const LOCAL_ADMIN: AdminContext = {
  id: "local-owner",
  email: "local-admin@localhost",
  display_name: "管理者（ローカル）",
  role: "owner",
  allowed_controllers: ["iwanaga_private", "enejoy_hand"],
  can_export: true,
};

export async function getCurrentAdmin(): Promise<AdminContext | null> {
  assertAuthModeAllowed();
  if (authMode() === "local") {
    const store = await cookies();
    const p = verifySession(store.get(LOCAL_SESSION_COOKIE)?.value, localSessionSecret());
    return p && p.sub === LOCAL_ADMIN.id ? LOCAL_ADMIN : null;
  }
  const sb = await supabaseServer();
  const { data, error } = await sb.auth.getUser();
  if (error || !data.user) return null;
  const a = await getRepo().getAdminUserByAuthId(data.user.id);
  if (!a || !a.is_active) return null;
  return { id: a.id, email: a.email, display_name: a.display_name, role: a.role, allowed_controllers: a.allowed_controllers, can_export: a.can_export };
}

/** 管理画面ページ用：未ログイン・管理者以外はログイン画面へ */
export async function requireAdminPage(): Promise<AdminContext> {
  const a = await getCurrentAdmin();
  if (!a) redirect("/admin/login");
  return a;
}
