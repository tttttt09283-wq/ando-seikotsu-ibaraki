import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { publicEnv } from "@/lib/env";

/**
 * ログイン中ユーザーの権限で動く Supabase クライアント（RLS が適用される）。
 * 通常の画面・Server Action はすべてこれを使う。
 */
export async function createSupabaseServer() {
  // 先に cookies() を呼び、ログイン情報に依存するページとして動的レンダリングさせる
  const cookieStore = await cookies();
  const env = publicEnv();
  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options);
        } catch {
          // Server Component からは Cookie を書けない。セッション更新は proxy.ts が担う。
        }
      },
    },
  });
}
