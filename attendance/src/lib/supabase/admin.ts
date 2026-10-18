import "server-only";
import { createClient } from "@supabase/supabase-js";
import { publicEnv, serviceRoleKey } from "@/lib/env";

/**
 * service_role（RLS をバイパス）クライアント。
 * Supabase Auth のユーザー作成・パスワード再設定・利用停止だけに使う。
 * 業務データの読み書きには使わないこと（権限判定が DB で効かなくなるため）。
 * 呼び出し前に必ず requireHq() などで操作者の権限を確認する。
 */
export function createSupabaseAdmin() {
  return createClient(publicEnv().NEXT_PUBLIC_SUPABASE_URL, serviceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
