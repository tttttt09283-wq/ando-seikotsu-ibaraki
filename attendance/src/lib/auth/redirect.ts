/**
 * ログイン後の遷移先は自サイト内のパスのみ許可する（オープンリダイレクト防止）。
 * 共用端末画面（/kiosk）へ管理画面のログインから遷移させることもしない。
 */
export function safeNextPath(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/")) return "/";
  if (value.startsWith("//") || value.startsWith("/\\") || value.startsWith("/kiosk")) return "/";
  return value;
}
