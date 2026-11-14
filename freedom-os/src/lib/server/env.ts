import "server-only";

/** 公開 URL に伏せ字・空白などが混ざっていないか（貼り付けミスで起動しないのを防ぐ） */
function clean(v: string | undefined): string {
  const s = (v ?? "").trim();
  return /^[\x21-\x7e]+$/.test(s) ? s : "";
}

export const env = {
  supabaseUrl: clean(process.env.NEXT_PUBLIC_SUPABASE_URL),
  supabaseAnonKey: clean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  anthropicKey: (process.env.ANTHROPIC_API_KEY ?? "").trim(),
  anthropicModel: (process.env.ANTHROPIC_MODEL ?? "").trim() || "claude-opus-5-5",
  allowedEmails: (process.env.ALLOWED_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
};

export const supabaseConfigured = () => !!(env.supabaseUrl && env.supabaseAnonKey);

/**
 * ローカルモード（Supabase なし・JSON ファイル保存）を使えるか。
 * Vercel 上では常に無効。本番ビルドでは FREEDOM_ALLOW_LOCAL_MODE=1 のときだけ。
 */
export function localModeAllowed(): boolean {
  if (process.env.VERCEL) return false;
  if (process.env.NODE_ENV !== "production") return true;
  return process.env.FREEDOM_ALLOW_LOCAL_MODE === "1";
}

export type DataMode = "supabase" | "local" | "unconfigured";
export function dataMode(): DataMode {
  if (supabaseConfigured()) return "supabase";
  return localModeAllowed() ? "local" : "unconfigured";
}

export const aiConfigured = () => !!env.anthropicKey;
