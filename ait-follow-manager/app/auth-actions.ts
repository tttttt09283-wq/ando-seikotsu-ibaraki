"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/db/server";
import { env } from "@/lib/env";
import { formString, runAction, UserFacingError, type ActionState } from "@/lib/actions";

const loginSchema = z.object({ email: z.email("メールアドレスを入力してください"), password: z.string().min(1, "パスワードを入力してください") });

export async function signIn(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const input = loginSchema.parse({ email: formString(fd, "email"), password: String(fd.get("password") ?? "") });
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword(input);
    // アカウントの有無を推測させないよう、失敗理由は区別しない
    if (error) throw new UserFacingError("メールアドレスまたはパスワードが正しくありません");
    redirect("/select-org");
  });
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function requestPasswordReset(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const email = z.email("メールアドレスを入力してください").parse(formString(fd, "email"));
    const supabase = await createClient();
    await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${env().SITE_URL}/auth/confirm?next=/account/password` });
    return { ok: true, message: "登録済みのメールアドレスであれば、再設定用のメールを送信しました。" };
  });
}

const passwordSchema = z
  .object({
    password: z
      .string()
      .min(10, "10文字以上で入力してください")
      .regex(/[a-z]/, "英小文字を含めてください")
      .regex(/[A-Z]/, "英大文字を含めてください")
      .regex(/[0-9]/, "数字を含めてください"),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { message: "確認用パスワードが一致しません", path: ["confirm"] });

export async function updatePassword(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { password } = passwordSchema.parse({ password: String(fd.get("password") ?? ""), confirm: String(fd.get("confirm") ?? "") });
    const supabase = await createClient();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw new UserFacingError("パスワードを更新できませんでした。別のパスワードをお試しください");
    return { ok: true, message: "パスワードを更新しました" };
  });
}

// ---- MFA（TOTP） ----

export async function verifyMfa(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const code = z.string().regex(/^\d{6}$/, "6桁の数字を入力してください").parse(formString(fd, "code"));
    const factorId = z.string().min(1).parse(formString(fd, "factorId"));
    const supabase = await createClient();
    const { data: challenge, error: cErr } = await supabase.auth.mfa.challenge({ factorId });
    if (cErr) throw new UserFacingError("認証を開始できませんでした");
    const { error } = await supabase.auth.mfa.verify({ factorId, challengeId: challenge.id, code });
    if (error) throw new UserFacingError("確認コードが正しくありません");
    redirect("/select-org");
  });
}
