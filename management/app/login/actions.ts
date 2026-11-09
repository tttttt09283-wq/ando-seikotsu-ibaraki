"use server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loginIdDomain } from "@/lib/supabase/env";
import { toAuthEmail } from "@/lib/login-id";
import { safeNext } from "@/lib/reauth";

export type LoginState = { error?: string };

export async function signIn(_prev: LoginState, fd: FormData): Promise<LoginState> {
  const id = String(fd.get("login_id") ?? "").trim();
  const password = String(fd.get("password") ?? "");
  if (!id || !password) return { error: "ログインIDとPASSを入力してください" };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email: toAuthEmail(id, loginIdDomain()), password });
  // ID と PASS のどちらが違うかは教えない
  if (error) return { error: "ログインIDまたはPASSが正しくありません（退職などで停止中の場合もログインできません）" };
  const { data: me } = await supabase.rpc("me");
  if (!me) {
    await supabase.auth.signOut();
    return { error: "このIDは業務管理システムに登録されていません。社長に登録を依頼してください" };
  }
  redirect(safeNext(String(fd.get("next") ?? "")));
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
