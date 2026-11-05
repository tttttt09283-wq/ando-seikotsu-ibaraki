// 環境変数（未設定なら分かりやすいエラーにする）
export function supabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error("NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY が設定されていません（.env.example を参照）");
  return { url, anonKey };
}
export const loginIdDomain = () => process.env.LOGIN_ID_DOMAIN || "ando.jp";
