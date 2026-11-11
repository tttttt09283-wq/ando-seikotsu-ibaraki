export const TEMPLATE_CATEGORIES = {
  thanks_first_visit: "初回来店後のお礼",
  condition_check: "来店後の状態確認",
  next_appointment: "次回予約案内",
  lapsed: "一定期間未来店者への案内",
  seasonal: "季節のご挨拶",
  other: "その他",
} as const;

export type TemplateCategory = keyof typeof TEMPLATE_CATEGORIES;

export const TEMPLATE_VARIABLES = ["顧客名", "店舗名", "担当者名", "次回予約日"] as const;
export type TemplateVariable = (typeof TEMPLATE_VARIABLES)[number];

/**
 * 差し込み変数の置換（プレーンテキスト）。値が無い変数は空ではなく「（未設定）」等の代替を呼び出し側で渡す。
 * 未定義の変数はそのまま残す。HTML としては扱わない（表示は React のエスケープに任せる）。
 */
export function renderTemplate(body: string, vars: Partial<Record<TemplateVariable, string>>): string {
  return body.replace(/\{\{\s*([^{}\s]+)\s*\}\}/g, (match, name: string) => {
    const v = vars[name as TemplateVariable];
    return v === undefined ? match : v;
  });
}

export function findUnknownVariables(body: string): string[] {
  const names = [...body.matchAll(/\{\{\s*([^{}\s]+)\s*\}\}/g)].map((m) => m[1]);
  return [...new Set(names.filter((n) => !(TEMPLATE_VARIABLES as readonly string[]).includes(n)))];
}

export function copyName(name: string): string {
  const base = `${name}（コピー）`;
  return base.length > 60 ? base.slice(0, 60) : base;
}
