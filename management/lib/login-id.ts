// ログインID（POSと同じ方式：ID → ID@ando.jp で Supabase Auth にログイン）

export const LOGIN_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{2,31}$/; // DB の check と同じ

// 全角英数・記号を半角に、大文字を小文字に、前後の空白を除く
export function normalizeLoginId(input: string): string {
  return String(input ?? "")
    .replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[\s　]/g, "")
    .toLowerCase();
}

export function isValidLoginId(id: string): boolean {
  return LOGIN_ID_PATTERN.test(id);
}

// ログイン画面に入力された値 → Supabase Auth のメールアドレス
// 「@」が入っていればそのまま（社長など、メールでログインしている人のため）
export function toAuthEmail(input: string, domain = "ando.jp"): string {
  const v = normalizeLoginId(input);
  return v.includes("@") ? v : `${v}@${domain}`;
}
