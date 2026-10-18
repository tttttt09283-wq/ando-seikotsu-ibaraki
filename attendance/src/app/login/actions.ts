"use server";

import { redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase/server";
import { loginSchema, parseForm } from "@/lib/validation/schemas";
import type { ActionResult } from "@/lib/errors";
import { safeNextPath } from "@/lib/auth/redirect";

export async function signIn(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = parseForm(loginSchema, formData);
  if (!parsed.ok) return parsed;

  const supabase = await createSupabaseServer();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    // アカウントの有無を推測されないよう、理由は区別しない
    return { ok: false, message: "メールアドレスまたはパスワードが正しくありません" };
  }
  redirect(safeNextPath(formData.get("next")));
}

export async function signOut() {
  const supabase = await createSupabaseServer();
  await supabase.auth.signOut();
  redirect("/login");
}
