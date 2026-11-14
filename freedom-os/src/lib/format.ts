import { format } from "date-fns";
import { ja } from "date-fns/locale";
import { toUTC } from "./date";

const yenFmt = new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 });
const numFmt = new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 1 });

/** 円表示（null は「—」） */
export function yen(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return yenFmt.format(Math.round(v));
}

/** 万円表示（グラフ・大きな数字用） */
export function man(v: number | null | undefined, digits = 1): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const m = v / 10000;
  return `${m.toLocaleString("ja-JP", { maximumFractionDigits: digits })}万円`;
}

export function num(v: number | null | undefined, unit = ""): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${numFmt.format(v)}${unit}`;
}

export function pct(v: number | null | undefined, digits = 0): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${(v * 100).toFixed(digits)}%`;
}

export function signedYen(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${v > 0 ? "+" : v < 0 ? "−" : "±"}${yenFmt.format(Math.abs(Math.round(v)))}`;
}

/** "2028年4月1日(土)" */
export function dateJa(d: string | null | undefined, withWeekday = false): string {
  if (!d) return "—";
  return format(toUTC(d), withWeekday ? "yyyy年M月d日(E)" : "yyyy年M月d日", { locale: ja });
}
export function monthJa(d: string | null | undefined): string {
  if (!d) return "—";
  return format(toUTC(d), "yyyy年M月", { locale: ja });
}
export function shortMonth(d: string): string {
  return format(toUTC(d), "yy/M", { locale: ja });
}
export function shortDate(d: string | null | undefined): string {
  if (!d) return "—";
  return format(toUTC(d), "M/d", { locale: ja });
}

/** ISO 時刻を日本時間の "2026/11/15 09:30" に */
export function jstDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(d);
}
