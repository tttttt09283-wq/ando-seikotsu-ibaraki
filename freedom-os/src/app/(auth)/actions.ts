"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { dataMode, env } from "@/lib/server/env";

const Cred = z.object({
  email: z.string().trim().toLowerCase().email("メールアドレスの形式が正しくありません"),
  password: z.string().min(8, "パスワードは8文字以上にしてください").max(128),
});

export type AuthState = { error?: string; message?: string };

function allowed(email: string) {
  return !env.allowedEmails.length || env.allowedEmails.includes(email);
}

export async function signInAction(_: AuthState, fd: FormData): Promise<AuthState> {
  if (dataMode() !== "supabase") return { error: "Supabase が未設定です" };
  const p = Cred.safeParse({ email: fd.get("email"), password: fd.get("password") });
  if (!p.success) return { error: p.error.issues[0].message };
  if (!allowed(p.data.email)) return { error: "このメールアドレスでは利用できません" };
  const sb = await createSupabaseServerClient();
  const { error } = await sb.auth.signInWithPassword(p.data);
  if (error) return { error: error.message.includes("Invalid login") ? "メールアドレスまたはパスワードが違います" : error.message.includes("Email not confirmed") ? "メールアドレスの確認が完了していません。届いたメールのリンクを開いてください" : `ログインできませんでした（${error.message}）` };
  redirect("/");
}

export async function signUpAction(_: AuthState, fd: FormData): Promise<AuthState> {
  if (dataMode() !== "supabase") return { error: "Supabase が未設定です" };
  const p = Cred.safeParse({ email: fd.get("email"), password: fd.get("password") });
  if (!p.success) return { error: p.error.issues[0].message };
  if (!allowed(p.data.email)) return { error: "このメールアドレスでは登録できません" };
  const h = await headers();
  const origin = h.get("origin") ?? `https://${h.get("host")}`;
  const sb = await createSupabaseServerClient();
  const { data, error } = await sb.auth.signUp({ ...p.data, options: { emailRedirectTo: `${origin}/auth/callback` } });
  if (error) return { error: `登録できませんでした（${error.message}）` };
  if (data.session) redirect("/");
  return { message: "確認メールを送信しました。メールのリンクを開くとログインできます。" };
}

export async function signOutAction() {
  if (dataMode() === "supabase") {
    const sb = await createSupabaseServerClient();
    await sb.auth.signOut();
  }
  redirect("/login");
}
