/**
 * Supabase Auth の接続先（公開してよい値。ブラウザにも送られる）。
 *
 * 環境変数 NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY を優先する。
 * ただし、値に「•」などの使えない文字が混ざっている場合（Vercel の画面で伏せ字の点を
 * そのままコピーしてしまった場合など）は、その値を使わず、下の本番プロジェクトの値を使う。
 * 環境変数が未設定のときは null（＝ローカル代替モードの簡易ログイン）。
 */
export const IWANAGA_SUPABASE_URL = "https://ouprhkyemuoxvhwmwbbv.supabase.co";
export const IWANAGA_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im91cHJoa3llbXVveHZod213YmJ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ0ODk1OTUsImV4cCI6MjExMDA2NTU5NX0.E9QuF0wD1ESanCDSDyp_zBEJ5ve_cJd7kdInQXIClvg";

const PRINTABLE_ASCII = /^[\x21-\x7e]+$/;

function clean(v: string | undefined): string | undefined {
  const t = v?.trim();
  return t ? t : undefined;
}

export function resolveSupabasePublic(rawUrl: string | undefined, rawKey: string | undefined): { url: string; anonKey: string } | null {
  const url = clean(rawUrl);
  const key = clean(rawKey);
  if (!url && !key) return null;
  const urlOk = url && PRINTABLE_ASCII.test(url) && /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(url);
  const keyOk = key && PRINTABLE_ASCII.test(key) && key.length > 20;
  return {
    url: urlOk ? url!.replace(/\/$/, "") : IWANAGA_SUPABASE_URL,
    anonKey: keyOk ? key! : IWANAGA_SUPABASE_ANON_KEY,
  };
}

export function supabasePublic() {
  return resolveSupabasePublic(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}
