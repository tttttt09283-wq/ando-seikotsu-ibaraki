import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Me } from "@/lib/roles";

// ログイン中の自分（mgmt.me()）。退職・停止中や未登録なら null
export const getMe = cache(async (): Promise<Me | null> => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase.rpc("me");
  if (error) throw new Error(`ユーザー情報を読み込めませんでした：${error.message}`);
  return (data as Me | null) ?? null;
});

export async function requireMe(): Promise<Me> {
  const me = await getMe();
  if (!me) redirect("/login?e=inactive");
  return me;
}

// 権限の判定は DB の mgmt.can()（RLS と同じ判定）で行う
export async function can(permission: string, storeId?: string | null): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("can", { p_permission: permission, p_store: storeId ?? null });
  if (error) throw new Error(`権限を確認できませんでした：${error.message}`);
  return data === true;
}

export async function canAnywhere(permission: string): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("can_anywhere", { p_permission: permission });
  if (error) throw new Error(`権限を確認できませんでした：${error.message}`);
  return data === true;
}

export class ForbiddenError extends Error {}

// 重要な操作の前に必ず呼ぶ（画面でボタンを隠すだけにしない）
export async function requirePermission(permission: string, storeId?: string | null): Promise<Me> {
  const me = await requireMe();
  if (!(await can(permission, storeId))) throw new ForbiddenError("この操作を行う権限がありません");
  return me;
}
