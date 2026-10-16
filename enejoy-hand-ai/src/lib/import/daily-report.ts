import type { Clinic, MetricDef } from "@/lib/tenant-types";
import { normalizeLabel, parseNumberCell } from "./normalize";

export type DailyReportRow = { clinicId: string; label: string; values: Record<string, number> };
export type DailyReportResult = {
  rows: DailyReportRow[];
  /** 一致した指標の key */
  metrics: string[];
  /** 院として認識できなかった行名 */
  unmatched: string[];
  warnings: string[];
};

/** 見出しに一致する指標（前方一致・最長一致） */
export function matchMetric(header: string, metrics: MetricDef[]): MetricDef | undefined {
  const h = normalizeLabel(header);
  if (!h) return undefined;
  let best: { m: MetricDef; len: number } | undefined;
  for (const m of metrics) {
    for (const a of m.aliases) {
      const al = normalizeLabel(a);
      if (al && h.startsWith(al) && (!best || al.length > best.len)) best = { m, len: al.length };
    }
  }
  return best?.m;
}

export function matchClinic(label: string, clinics: Clinic[]): Clinic | undefined {
  const l = normalizeLabel(label);
  if (!l) return undefined;
  return clinics.find((c) => c.aliases.some((a) => l.includes(normalizeLabel(a))));
}

/**
 * 日計表（TOPシート）の表を読み取る。
 * 見出し行（指標の見出しが3つ以上ある行）を探し、その下の行を院・全院合計として取り込む。
 * 院名は、最初の指標の列より左のセルから探す。患者個人の情報は扱わない（集計値のみ）。
 */
export function parseDailyReport(
  grid: string[][],
  opts: { clinics: Clinic[]; metrics: MetricDef[]; totalRowAliases: string[] },
): DailyReportResult {
  const warnings: string[] = [];
  let headerIdx = -1;
  let colMap: { col: number; metric: MetricDef }[] = [];
  for (let r = 0; r < Math.min(grid.length, 40); r++) {
    const map: { col: number; metric: MetricDef }[] = [];
    const used = new Set<string>();
    grid[r].forEach((cell, col) => {
      const m = matchMetric(cell, opts.metrics);
      if (m && !used.has(m.key)) {
        used.add(m.key);
        map.push({ col, metric: m });
      }
    });
    if (map.length >= 3) {
      headerIdx = r;
      colMap = map;
      break;
    }
  }
  if (headerIdx < 0) {
    return { rows: [], metrics: [], unmatched: [], warnings: ["見出し行（累計実績・新患数などの列名）が見つかりませんでした。日計表のTOPシートか確認してください。"] };
  }
  const firstMetricCol = Math.min(...colMap.map((c) => c.col));
  const totals = opts.totalRowAliases.map(normalizeLabel);
  const rows: DailyReportRow[] = [];
  const unmatched: string[] = [];
  const seen = new Set<string>();

  for (let r = headerIdx + 1; r < grid.length; r++) {
    const row = grid[r];
    const labels = row.slice(0, firstMetricCol).map((c) => c.trim()).filter(Boolean);
    const values: Record<string, number> = {};
    for (const { col, metric } of colMap) {
      const v = parseNumberCell(row[col]);
      if (v !== undefined) values[metric.key] = v;
    }
    if (labels.length === 0 || Object.keys(values).length === 0) continue;
    let clinicId: string | undefined;
    let label = labels[0];
    for (const l of labels) {
      const n = normalizeLabel(l);
      if (totals.some((t) => n.startsWith(t)) || /^全/.test(n)) {
        clinicId = "all";
        label = l;
        break;
      }
      const c = matchClinic(l, opts.clinics);
      if (c) {
        clinicId = c.id;
        label = l;
        break;
      }
    }
    if (!clinicId) {
      unmatched.push(labels.join(" "));
      continue;
    }
    if (seen.has(clinicId)) {
      warnings.push(`「${label}」の行が複数あります。最初の行だけを取り込みました。`);
      continue;
    }
    seen.add(clinicId);
    rows.push({ clinicId, label, values });
  }
  if (rows.length === 0) warnings.push("院の行が見つかりませんでした。院名の書き方を確認してください。");
  return { rows, metrics: colMap.map((c) => c.metric.key), unmatched, warnings };
}
