"use server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { passwordProblem } from "@/lib/password";
import { requireMe } from "@/server/session";

export type PasswordState = { error?: string };

export async function changePassword(_prev: PasswordState, fd: FormData): Promise<PasswordState> {
  await requireMe();
  const pw = String(fd.get("password") ?? "");
  const confirm = String(fd.get("confirm") ?? "");
  const problem = passwordProblem(pw);
  if (problem) return { error: problem };
  if (pw !== confirm) return { error: "確認用のPASSが一致しません" };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: pw });
  if (error) return { error: error.message.includes("different") ? "今と同じPASSにはできません" : "PASSを変更できませんでした。もう一度お試しください" };
  const { error: e2 } = await supabase.rpc("mark_password_changed");
  if (e2) return { error: "PASSは変更されましたが、記録に失敗しました。もう一度お試しください" };
  redirect("/?pw=changed");
}
