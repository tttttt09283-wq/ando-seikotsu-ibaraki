// マンダラの取り込み（9×9 グリッド形式／一覧形式）と書き出し。
// 取り込みは「プレビュー → 項目の対応付け → 確定」の順で行い、既定では既存の値を上書きしない。
import { AREA_CODES, type AreaCode, type MandalaAction, type MandalaGoal } from "../types";
import { trimGrid } from "./csv";

export interface ImportAction {
  position: number;
  title: string;
  description?: string;
  due_date?: string | null;
  kpi_name?: string;
  kpi_target?: number | null;
  kpi_unit?: string;
  priority?: number | null;
  memo?: string;
}
export interface ImportArea {
  code: AreaCode;
  title: string;
  actions: ImportAction[];
}
export interface MandalaImportData {
  center: string;
  areas: ImportArea[];
}

// 3×3 ブロック内の位置（行優先、中央を除く）→ 1..8。中央は 0
export const CELL_TO_POS = [1, 2, 3, 4, 0, 5, 6, 7, 8];
// 9 ブロック（行優先）→ 領域。中央ブロックは中心
export const BLOCK_TO_AREA: (AreaCode | "CENTER")[] = ["A", "B", "C", "D", "CENTER", "E", "F", "G", "H"];

export function looksLikeGrid(rows: string[][]): boolean {
  const g = trimGrid(rows);
  if (g.length !== 9 || g[0]?.length !== 9) return false;
  // 中央のセルに値があり、各ブロックの中央にも概ね値がある
  const centers = [1, 4, 7].flatMap((r) => [1, 4, 7].map((c) => g[r][c]));
  return g[4][4] !== "" && centers.filter((v) => v !== "").length >= 5;
}

export function parseGrid(rows: string[][]): MandalaImportData {
  const g = trimGrid(rows);
  if (g.length < 9 || (g[0]?.length ?? 0) < 9) throw new Error("9行×9列のマンダラ形式ではありません");
  const cell = (r: number, c: number) => (g[r]?.[c] ?? "").trim();
  const center = cell(4, 4);
  const areas: ImportArea[] = [];
  for (let b = 0; b < 9; b++) {
    const area = BLOCK_TO_AREA[b];
    if (area === "CENTER") continue;
    const br = Math.floor(b / 3) * 3;
    const bc = (b % 3) * 3;
    // 領域名：外側ブロックの中央 → 無ければ中央ブロックの対応セル
    const centerBlockCell = cell(3 + Math.floor(b / 3), 3 + (b % 3));
    const title = cell(br + 1, bc + 1) || centerBlockCell;
    const actions: ImportAction[] = [];
    for (let k = 0; k < 9; k++) {
      const pos = CELL_TO_POS[k];
      if (pos === 0) continue;
      const v = cell(br + Math.floor(k / 3), bc + (k % 3));
      if (v) actions.push({ position: pos, title: v });
    }
    areas.push({ code: area, title, actions });
  }
  return { center, areas };
}

// ---- 一覧形式 ---------------------------------------------------------------
export const LIST_FIELDS = [
  { key: "area", label: "領域（A〜H／領域名／中心）", required: true },
  { key: "position", label: "番号（1〜8。領域名の行は0）", required: true },
  { key: "title", label: "項目名", required: true },
  { key: "description", label: "説明", required: false },
  { key: "due_date", label: "期限", required: false },
  { key: "kpi_name", label: "KPI名称", required: false },
  { key: "kpi_target", label: "KPI目標値", required: false },
  { key: "kpi_unit", label: "単位", required: false },
  { key: "priority", label: "優先順位（1〜3）", required: false },
  { key: "memo", label: "メモ", required: false },
] as const;
export type ListFieldKey = (typeof LIST_FIELDS)[number]["key"];
export type ListMapping = Partial<Record<ListFieldKey, number>>; // フィールド → 列番号

const SYNONYMS: Record<ListFieldKey, string[]> = {
  area: ["領域", "エリア", "カテゴリ", "分野", "area", "領域コード"],
  position: ["番号", "no", "位置", "順番", "position", "#"],
  title: ["項目名", "項目", "行動", "目標", "タイトル", "title", "内容"],
  description: ["説明", "詳細", "description"],
  due_date: ["期限", "締切", "期日", "due", "due_date"],
  kpi_name: ["kpi名称", "kpi", "指標", "kpi_name"],
  kpi_target: ["kpi目標値", "目標値", "target", "kpi_target"],
  kpi_unit: ["単位", "unit"],
  priority: ["優先順位", "優先度", "priority"],
  memo: ["メモ", "備考", "memo", "note"],
};

export function guessMapping(header: string[]): ListMapping {
  const m: ListMapping = {};
  const h = header.map((x) => x.trim().toLowerCase().replace(/\s/g, ""));
  const used = new Set<number>();
  // 1回目：完全一致、2回目：部分一致（「KPI目標値」が「KPI」に先取りされないように）
  for (const exact of [true, false]) {
    for (const f of LIST_FIELDS) {
      if (m[f.key] != null) continue;
      const syn = SYNONYMS[f.key].map((x) => x.toLowerCase());
      const idx = h.findIndex((x, i) => !used.has(i) && x !== "" && (exact ? syn.includes(x) : syn.some((sy) => x.includes(sy))));
      if (idx >= 0) {
        m[f.key] = idx;
        used.add(idx);
      }
    }
  }
  return m;
}

export function normalizeDate(v: string): string | null {
  const s = v.trim();
  if (!s) return null;
  const m = s.match(/^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?/);
  if (m) {
    const out = `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
    return /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(out) ? out : null;
  }
  const ym = s.match(/^(\d{4})[-/.年](\d{1,2})月?$/);
  if (ym) {
    // 年月だけなら月末
    const y = Number(ym[1]);
    const mo = Number(ym[2]);
    if (mo < 1 || mo > 12) return null;
    const last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
    return `${ym[1]}-${String(mo).padStart(2, "0")}-${last}`;
  }
  return null;
}

function toNumber(v: string): number | null {
  const s = v.replace(/[,，円¥\s]/g, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function resolveArea(v: string, existingTitles: Map<string, AreaCode>): AreaCode | "CENTER" | null {
  const s = v.trim();
  if (!s) return null;
  if (["中心", "中心目標", "center", "CENTER", "0"].includes(s)) return "CENTER";
  const up = s.toUpperCase();
  if ((AREA_CODES as string[]).includes(up)) return up as AreaCode;
  const m = up.match(/^([A-H])[.．:：\s]/);
  if (m) return m[1] as AreaCode;
  return existingTitles.get(s) ?? null;
}

export interface ListParseResult {
  data: MandalaImportData;
  errors: string[];
}

/** 一覧形式（1行目が見出し）。領域名で指定された行は既存マンダラの領域名から A〜H を探す */
export function parseList(rows: string[][], mapping: ListMapping, existingAreaTitles: Map<string, AreaCode> = new Map()): ListParseResult {
  const errors: string[] = [];
  const get = (r: string[], k: ListFieldKey) => (mapping[k] != null ? (r[mapping[k]!] ?? "").toString().trim() : "");
  const areas = new Map<AreaCode, ImportArea>();
  // 領域名を先に拾う（番号0の行）
  const titleToCode = new Map(existingAreaTitles);
  let center = "";
  const body = rows.slice(1);
  let autoIdx = 0;
  for (const r of body) {
    const areaRaw = get(r, "area");
    const pos = toNumber(get(r, "position"));
    if (pos === 0 && areaRaw && !(["中心", "中心目標", "CENTER", "center"].includes(areaRaw))) {
      const resolved = resolveArea(areaRaw, titleToCode);
      let code: AreaCode | null;
      if (!resolved || resolved === "CENTER") {
        code = AREA_CODES[autoIdx] ?? null;
        autoIdx++;
      } else code = resolved;
      if (code) {
        titleToCode.set(areaRaw, code);
        if (get(r, "title")) titleToCode.set(get(r, "title"), code);
      }
    }
  }
  body.forEach((r, i) => {
    const line = i + 2;
    if (r.every((c) => (c ?? "").toString().trim() === "")) return;
    const area = resolveArea(get(r, "area"), titleToCode);
    const pos = toNumber(get(r, "position"));
    const title = get(r, "title");
    if (!area) return void errors.push(`${line}行目：領域「${get(r, "area")}」を A〜H に対応付けられません`);
    if (area === "CENTER") {
      center = title;
      return;
    }
    if (pos == null || pos < 0 || pos > 8 || !Number.isInteger(pos)) return void errors.push(`${line}行目：番号は 0〜8 の整数にしてください`);
    const a = areas.get(area) ?? { code: area, title: "", actions: [] };
    areas.set(area, a);
    if (pos === 0) {
      a.title = title;
      return;
    }
    if (a.actions.some((x) => x.position === pos)) return void errors.push(`${line}行目：${area}${pos} が重複しています`);
    const dueRaw = get(r, "due_date");
    const due = dueRaw ? normalizeDate(dueRaw) : null;
    if (dueRaw && !due) errors.push(`${line}行目：期限「${dueRaw}」を日付として読めません（空欄として扱います）`);
    const pr = toNumber(get(r, "priority"));
    a.actions.push({
      position: pos,
      title,
      description: get(r, "description") || undefined,
      due_date: due,
      kpi_name: get(r, "kpi_name") || undefined,
      kpi_target: toNumber(get(r, "kpi_target")),
      kpi_unit: get(r, "kpi_unit") || undefined,
      priority: pr != null && pr >= 1 && pr <= 3 ? Math.round(pr) : null,
      memo: get(r, "memo") || undefined,
    });
  });
  return { data: { center, areas: [...areas.values()].sort((x, y) => x.code.localeCompare(y.code)) }, errors };
}

// ---- 差分（プレビュー用） ---------------------------------------------------
export type ImportMode = "fill" | "replace";
export interface ImportChange {
  target: string; // "中心" / "A" / "A3"
  field: string;
  before: string;
  after: string;
  applied: boolean; // fill モードで既存値がある場合は false（上書きしない）
}

const fieldLabel: Record<string, string> = {
  title: "項目名",
  description: "説明",
  due_date: "期限",
  kpi_name: "KPI名称",
  kpi_target: "KPI目標値",
  kpi_unit: "単位",
  priority: "優先順位",
  memo: "メモ",
};

export function diffImport(goals: MandalaGoal[], actions: MandalaAction[], data: MandalaImportData, mode: ImportMode): ImportChange[] {
  const changes: ImportChange[] = [];
  const decide = (before: string, after: string) => (mode === "replace" ? true : before.trim() === "");
  const center = goals.find((g) => g.code === "CENTER");
  if (data.center && data.center !== (center?.title ?? "")) {
    const before = center?.title ?? "";
    changes.push({ target: "中心", field: "項目名", before, after: data.center, applied: decide(before, data.center) });
  }
  for (const area of data.areas) {
    const g = goals.find((x) => x.code === area.code);
    if (area.title && area.title !== (g?.title ?? "")) {
      const before = g?.title ?? "";
      changes.push({ target: area.code, field: "領域名", before, after: area.title, applied: decide(before, area.title) });
    }
    for (const ia of area.actions) {
      const ex = g ? actions.find((x) => x.goal_id === g.id && x.position === ia.position) : undefined;
      for (const f of ["title", "description", "due_date", "kpi_name", "kpi_target", "kpi_unit", "priority", "memo"] as const) {
        const nv = ia[f];
        if (nv == null || nv === "") continue;
        const after = String(nv);
        const bv = ex ? (ex as unknown as Record<string, unknown>)[f] : null;
        const before = bv == null ? "" : String(bv);
        if (before === after) continue;
        // 優先順位の既定値（2）は「未設定」とみなさない
        changes.push({ target: `${area.code}${ia.position}`, field: fieldLabel[f], before, after, applied: decide(f === "priority" && !ex ? "" : before, after) });
      }
    }
  }
  return changes;
}

// ---- 書き出し --------------------------------------------------------------
export function exportList(goals: MandalaGoal[], actions: MandalaAction[]): string[][] {
  const rows: string[][] = [["領域", "番号", "項目名", "説明", "期限", "KPI名称", "KPI目標値", "KPI実績値", "単位", "優先順位", "ステータス", "進捗率", "完了日", "メモ"]];
  const center = goals.find((g) => g.code === "CENTER");
  rows.push(["中心", "0", center?.title ?? "", center?.description ?? "", "", "", "", "", "", "", "", "", "", ""]);
  for (const code of AREA_CODES) {
    const g = goals.find((x) => x.code === code);
    if (!g) continue;
    rows.push([code, "0", g.title, g.description, "", "", "", "", "", "", "", "", "", ""]);
    for (const a of actions.filter((x) => x.goal_id === g.id).sort((x, y) => x.position - y.position)) {
      rows.push([
        code,
        String(a.position),
        a.title,
        a.description,
        a.due_date ?? "",
        a.kpi_name,
        a.kpi_target == null ? "" : String(a.kpi_target),
        a.kpi_actual == null ? "" : String(a.kpi_actual),
        a.kpi_unit,
        String(a.priority),
        a.status,
        String(a.progress),
        a.completed_at ?? "",
        a.memo,
      ]);
    }
  }
  return rows;
}

export function exportGrid(goals: MandalaGoal[], actions: MandalaAction[]): string[][] {
  const g = Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => ""));
  const center = goals.find((x) => x.code === "CENTER");
  for (let b = 0; b < 9; b++) {
    const br = Math.floor(b / 3) * 3;
    const bc = (b % 3) * 3;
    const area = BLOCK_TO_AREA[b];
    if (area === "CENTER") {
      g[4][4] = center?.title ?? "";
      continue;
    }
    const goal = goals.find((x) => x.code === area);
    g[br + 1][bc + 1] = goal?.title ?? "";
    g[3 + Math.floor(b / 3)][3 + (b % 3)] = goal?.title ?? "";
    for (let k = 0; k < 9; k++) {
      const pos = CELL_TO_POS[k];
      if (pos === 0) continue;
      const a = goal ? actions.find((x) => x.goal_id === goal.id && x.position === pos) : undefined;
      g[br + Math.floor(k / 3)][bc + (k % 3)] = a?.title ?? "";
    }
  }
  return g;
}
