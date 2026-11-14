import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { createSupabaseServerClient } from "../supabase/server";
import { dataMode, env } from "./env";
import { AuditedStore } from "./store/audited";
import { LocalStore } from "./store/local";
import { SupabaseStore } from "./store/supabase";

/** ローカルモードの固定ユーザー */
export const LOCAL_USER_ID = "00000000-0000-4000-8000-000000000001";

export interface AppSession {
  userId: string;
  email: string;
  mode: "supabase" | "local";
  store: AuditedStore;
}

export type SessionResult =
  | { ok: true; session: AppSession }
  | { ok: false; reason: "unconfigured" | "signed_out" | "not_allowed"; email?: string };

export const getSession = cache(async (): Promise<SessionResult> => {
  const mode = dataMode();
  if (mode === "unconfigured") return { ok: false, reason: "unconfigured" };
  if (mode === "local") {
    return { ok: true, session: { userId: LOCAL_USER_ID, email: "local@freedom-os", mode, store: new AuditedStore(new LocalStore(LOCAL_USER_ID)) } };
  }
  const sb = await createSupabaseServerClient();
  const { data, error } = await sb.auth.getUser();
  if (error || !data.user) return { ok: false, reason: "signed_out" };
  const email = (data.user.email ?? "").toLowerCase();
  if (env.allowedEmails.length && !env.allowedEmails.includes(email)) return { ok: false, reason: "not_allowed", email };
  return { ok: true, session: { userId: data.user.id, email, mode, store: new AuditedStore(new SupabaseStore(data.user.id, sb)) } };
});

/** 画面用：未ログインならログイン画面へ */
export async function requireSession(): Promise<AppSession> {
  const r = await getSession();
  if (r.ok) return r.session;
  if (r.reason === "unconfigured") redirect("/setup");
  if (r.reason === "not_allowed") redirect("/login?error=not_allowed");
  redirect("/login");
}

/** Server Action / API 用：例外を投げる */
export async function sessionOrThrow(): Promise<AppSession> {
  const r = await getSession();
  if (!r.ok) throw new Error(r.reason === "unconfigured" ? "データベースが未設定です" : "ログインが必要です");
  return r.session;
}
