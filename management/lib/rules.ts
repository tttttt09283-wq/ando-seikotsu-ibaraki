// 社内規定の表示用（純粋関数）
export type RuleStatus = "draft" | "pending_approval" | "approved" | "published" | "superseded" | "discarded";
export const RULE_STATUS: Record<RuleStatus, { text: string; tone: "warn" | "ok" | "danger" | "neutral" | "brand" }> = {
  draft: { text: "下書き", tone: "neutral" },
  pending_approval: { text: "社長の承認待ち", tone: "warn" },
  approved: { text: "承認済み（公開前）", tone: "brand" },
  published: { text: "公開中", tone: "ok" },
  superseded: { text: "旧版", tone: "neutral" },
  discarded: { text: "破棄", tone: "neutral" },
};
export const ROLE_LABEL: Record<string, string> = { PRESIDENT: "社長", GM: "GM", BM: "BM", MANAGER: "院長", STAFF: "一般スタッフ", PART_TIMER: "アルバイト" };
export const EMPLOYMENT_TYPES = ["正社員", "短時間正社員", "アルバイト", "役員"] as const;

export type AppliesTo = { roles?: string[]; employment_types?: string[] };
export function appliesLabel(a: AppliesTo | null | undefined): string {
  const roles = a?.roles ?? [], emp = a?.employment_types ?? [];
  if (!roles.length && !emp.length) return "全員";
  const parts: string[] = [];
  if (roles.length) parts.push("役職：" + roles.map((r) => ROLE_LABEL[r] ?? r).join("・"));
  if (emp.length) parts.push("雇用区分：" + emp.join("・"));
  return parts.join("／");
}

// 施行の表示：初期案（労務確認前）は「施行済み」と表示しない（FR-RL-4）
export function effectiveLabel(effective: string | null, provisional: boolean, today: string): string {
  if (provisional) return "初期案・労務確認中（施行前）";
  if (!effective) return "施行日未定";
  return effective <= today ? "施行中" : "施行前";
}

// 行ごとの差分（版の比較用）。LCS で「同じ・追加・削除」を返す
export type DiffLine = { kind: "same" | "add" | "del"; text: string };
export function lineDiff(before: string, after: string): DiffLine[] {
  const a = before.split("\n"), b = after.split("\n");
  const n = a.length, m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out: DiffLine[] = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { out.push({ kind: "same", text: a[i] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) out.push({ kind: "del", text: a[i++] });
    else out.push({ kind: "add", text: b[j++] });
  }
  while (i < n) out.push({ kind: "del", text: a[i++] });
  while (j < m) out.push({ kind: "add", text: b[j++] });
  return out;
}

// 本文（かんたんな Markdown：## 見出し・- 箇条書き・1. 番号付き・空行で段落）を表示用のかたまりに分ける。HTML は使わない
export type Block = { type: "h"; text: string } | { type: "ul"; items: string[] } | { type: "ol"; items: string[] } | { type: "p"; text: string };
export function parseBody(md: string): Block[] {
  const blocks: Block[] = [];
  let para: string[] = [];
  const flush = () => { if (para.length) { blocks.push({ type: "p", text: para.join("\n") }); para = []; } };
  for (const raw of md.replace(/\r\n/g, "\n").split("\n")) {
    const line = raw.trimEnd();
    const h = line.match(/^#{1,4}\s+(.*)$/), ul = line.match(/^\s*[-・]\s+(.*)$/), ol = line.match(/^\s*\d+[.．]\s*(.*)$/);
    if (!line.trim()) { flush(); continue; }
    if (h) { flush(); blocks.push({ type: "h", text: h[1] }); continue; }
    const kind = ul ? "ul" : ol ? "ol" : null;
    if (kind) {
      flush();
      const last = blocks[blocks.length - 1];
      const text = (ul ?? ol)![1];
      if (last && (last.type === "ul" || last.type === "ol") && last.type === kind) last.items.push(text); else blocks.push({ type: kind, items: [text] });
      continue;
    }
    para.push(line);
  }
  flush();
  return blocks;
}
