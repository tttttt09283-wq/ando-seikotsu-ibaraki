/** 金額の表示（円の整数） */
export function yen(n: number): string {
  return `${n < 0 ? "−" : ""}¥${Math.abs(Math.round(n)).toLocaleString("ja-JP")}`;
}

/** 大きな金額を万円で（グラフの軸など） */
export function man(n: number): string {
  const v = Math.round(n / 10_000);
  return `${v.toLocaleString("ja-JP")}万`;
}

/** 「1,234,567」「¥1,234,567」「1234567円」などを円の整数にする（不正なら null） */
export function parseYen(s: string): number | null {
  const t = s.normalize("NFKC").replace(/[¥\\,円\s]/g, "");
  if (!/^-?\d+$/.test(t)) return null;
  const n = Number(t);
  return Number.isSafeInteger(n) ? n : null;
}
