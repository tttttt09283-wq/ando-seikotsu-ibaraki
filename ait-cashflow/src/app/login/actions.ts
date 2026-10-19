"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { appMode } from "@/lib/config";
import { rateLimit } from "@/lib/rate-limit";
import { createSupabaseServer } from "@/lib/supabase/server";

export type AuthResult = { ok: boolean; message: string } | null;

const credentials = z.object({
  email: z.email("メールアドレスが正しくありません").max(254),
  password: z.string().min(8, "パスワードは8文字以上にしてください").max(128),
});

async function clientKey() {
  const h = await headers();
  return (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || "local";
}

export async function signInAction(_prev: AuthResult, fd: FormData): Promise<AuthResult> {
  if (appMode() !== "supabase") redirect("/");
  const p = credentials.safeParse({ email: fd.get("email"), password: fd.get("password") });
  if (!p.success) return { ok: false, message: p.error.issues[0]?.message ?? "入力内容が正しくありません" };
  const key = await clientKey();
  if (!rateLimit(`login:${key}`, 10, 10 * 60_000) || !rateLimit(`login:${p.data.email.toLowerCase()}`, 10, 10 * 60_000)) {
    return { ok: false, message: "ログインの試行が多すぎます。10分ほど待ってからお試しください" };
  }
  const sb = await createSupabaseServer();
  const { error } = await sb.auth.signInWithPassword(p.data);
  // 失敗の理由（存在しないメール等）は区別して見せない
  if (error) {
    return {
      ok: false,
      message: /confirm/i.test(error.message) ? "メールアドレスの確認が済んでいません。届いたメールのリンクを開いてください" : "メールアドレスまたはパスワードが違います",
    };
  }
  redirect("/");
}

export async function signUpAction(_prev: AuthResult, fd: FormData): Promise<AuthResult> {
  if (appMode() !== "supabase") redirect("/");
  const p = credentials.safeParse({ email: fd.get("email"), password: fd.get("password") });
  if (!p.success) return { ok: false, message: p.error.issues[0]?.message ?? "入力内容が正しくありません" };
  if (!rateLimit(`signup:${await clientKey()}`, 5, 60 * 60_000)) return { ok: false, message: "登録の試行が多すぎます。しばらく待ってからお試しください" };
  const h = await headers();
  const origin = h.get("origin") ?? `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  const sb = await createSupabaseServer();
  const { error } = await sb.auth.signUp({ ...p.data, options: { emailRedirectTo: `${origin}/auth/confirm` } });
  if (error) return { ok: false, message: "登録できませんでした。入力内容を確認してください" };
  return { ok: true, message: "確認メールを送りました。メールのリンクを開くと登録が完了します" };
}
