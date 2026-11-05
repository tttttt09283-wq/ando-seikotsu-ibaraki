import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { supabaseEnv } from "./env";

// ログイン中のユーザーの権限で動くクライアント（RLS が効く）。既定のスキーマは mgmt
export async function createClient() {
  const { url, anonKey } = supabaseEnv();
  const cookieStore = await cookies();
  return createServerClient(url, anonKey, {
    db: { schema: "mgmt" },
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) cookieStore.set(name, value, options);
        } catch {
          // Server Component から呼ばれた場合は書き込めない（proxy.ts がセッションを更新する）
        }
      },
    },
  });
}
