import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { config } from "../config";

/** Supabase Auth（管理者ログイン）用のサーバークライアント。公開キー（anon）のみ使う */
export async function supabaseServer() {
  const store = await cookies();
  return createServerClient(config.supabaseUrl!, config.supabaseAnonKey!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // Server Component からは Cookie を書けない（proxy.ts で更新する）
        }
      },
    },
  });
}
