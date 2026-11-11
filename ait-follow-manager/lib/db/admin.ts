import "server-only";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import type { Database } from "./database.types";

/**
 * service_role クライアント（RLS をバイパスする）。
 * 使用箇所は次に限定し、追加時はレビュー必須：
 *   - フォロータスク抽出ジョブ（lib/followup/generate.ts）
 *   - スタッフ招待（Auth Admin API）
 */
export function createAdminClient() {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = env();
  return createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type AdminClient = ReturnType<typeof createAdminClient>;
