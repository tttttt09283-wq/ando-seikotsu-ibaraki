import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabaseEnv } from "./env";

// サービスロール（RLS を無視できる鍵）。ID・PASSの発行・再発行と、退職者のログイン停止にだけ使う。
// 呼び出す前に必ず requirePermission("master.manage") で操作者の権限を確認すること
export function createAdminClient() {
  const { url } = supabaseEnv();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY が設定されていません");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
