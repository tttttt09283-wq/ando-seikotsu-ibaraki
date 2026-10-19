/**
 * 動作モード
 * - supabase：NEXT_PUBLIC_SUPABASE_URL と公開キーが設定されている。ログイン必須・RLSで企業ごとに分離
 * - demo：Supabase 未設定のときだけ。架空のデモデータ（画面に常に「デモデータ」と表示）
 *   本番ビルド（NODE_ENV=production）では CASHFLOW_ALLOW_DEMO=1 を明示しない限り使えない
 */
export type AppMode = "supabase" | "demo";

export function supabaseEnv(): { url: string; key: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return url && key ? { url, key } : null;
}

export function appMode(): AppMode {
  if (supabaseEnv()) return "supabase";
  if (process.env.NODE_ENV === "production" && process.env.CASHFLOW_ALLOW_DEMO !== "1") {
    throw new Error(
      "Supabase の設定（NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY）がありません。デモとして動かす場合だけ CASHFLOW_ALLOW_DEMO=1 を設定してください。",
    );
  }
  return "demo";
}
