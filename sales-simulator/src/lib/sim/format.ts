const intFormatter = new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 0 });
const oneDecimalFormatter = new Intl.NumberFormat("ja-JP", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
});

/** 3桁区切りの整数 */
export function formatInt(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return intFormatter.format(Math.round(value));
}

export function formatYen(value: number | null | undefined): string {
  const s = formatInt(value);
  return s === "—" ? s : `${s}円`;
}

/** 小数第1位まで（不要な0は省略） */
export function formatOneDecimal(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return oneDecimalFormatter.format(Math.round(value * 10) / 10);
}

export function formatPercent(value: number | null | undefined): string {
  const s = formatOneDecimal(value);
  return s === "—" ? s : `${s}%`;
}

/** 「12,345円」を「123.5万円」のように短くする（グラフ軸用） */
export function formatManYen(value: number): string {
  if (Math.abs(value) >= 10_000) return `${oneDecimalFormatter.format(Math.round(value / 1000) / 10)}万円`;
  return `${intFormatter.format(value)}円`;
}

/** 増減を符号付きで表示 */
export function formatSigned(value: number | null | undefined, unit: string, decimals = false): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const body = decimals ? formatOneDecimal(Math.abs(value)) : formatInt(Math.abs(value));
  const sign = value > 0 ? "+" : value < 0 ? "−" : "±";
  return `${sign}${body}${unit}`;
}
