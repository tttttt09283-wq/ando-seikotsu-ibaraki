import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseEnv } from "@/lib/config";

/**
 * ログイン中の利用者として Supabase に接続する（RLS が効く）。
 * サービスロールキーはアプリでは使わない。
 */
export async function createSupabaseServer() {
  const env = supabaseEnv();
  if (!env) throw new Error("Supabase が設定されていません");
  const store = await cookies();
  return createServerClient(env.url, env.key, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // Server Component からの呼び出しでは Cookie を書けない（proxy.ts が更新する）
        }
      },
    },
  });
}
