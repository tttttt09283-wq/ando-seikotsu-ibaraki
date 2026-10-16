/** 見出し・行名の照合用：全角→半角、空白・改行・注記記号を除き、小文字にする */
export function normalizeLabel(s: string): string {
  return s
    .normalize("NFKC")
    .replace(/[\s　]/g, "")
    .replace(/[※*＊…]+.*$/, "")
    .replace(/\.{2,}.*$/, "")
    .toLowerCase();
}

/**
 * セルの文字列を数値にする。¥・カンマ・%・▲（マイナス）に対応。
 * 数値でないもの（空欄・#DIV/0! など）は undefined。
 */
export function parseNumberCell(raw: string | number | null | undefined): number | undefined {
  if (raw == null) return undefined;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : undefined;
  const s = raw.normalize("NFKC").trim();
  if (!s || s.startsWith("#")) return undefined;
  const neg = /^[▲△]/.test(s) || /^\(.*\)$/.test(s) || /^[¥\\]?\s*-/.test(s);
  const digits = s.replace(/[▲△¥\\,円%件人枚\s()+-]/g, "");
  if (!/^\d+(\.\d+)?$/.test(digits)) return undefined;
  const n = Number(digits);
  return neg ? -n : n;
}
