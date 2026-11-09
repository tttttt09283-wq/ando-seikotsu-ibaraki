// 承認・残数の修正・規定の公開など重要な操作の前に、最後にPASSでログインしてから一定時間以内かを確かめる
// （permissions.md §4：時間は要確認。初期値 12 時間、環境変数 REAUTH_HOURS で変更できる）
export function needsReauth(lastSignInAt: string | null | undefined, now: Date, hours: number): boolean {
  if (!lastSignInAt) return true;
  const t = new Date(lastSignInAt).getTime();
  if (Number.isNaN(t)) return true;
  return now.getTime() - t > hours * 3600_000;
}
export function reauthHours(env: string | undefined): number {
  const n = Number(env);
  return Number.isFinite(n) && n >= 1 && n <= 168 ? n : 12;
}
// ログイン後に戻る先（同じサイトの画面だけ。// で始まる外部URLは使わない）
export function safeNext(v: string | null | undefined): string {
  return v && v.startsWith("/") && !v.startsWith("//") && !v.startsWith("/\\") ? v.slice(0, 300) : "/";
}
