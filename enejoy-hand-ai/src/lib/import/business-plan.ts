import type { Clinic } from "@/lib/tenant-types";
import type { PlanRecord } from "@/lib/types";
import { matchClinic } from "./daily-report";
import { normalizeLabel, parseNumberCell } from "./normalize";

export type BusinessPlanResult = { records: PlanRecord[]; months: string[]; clinicRows: number; plRows: number; warnings: string[] };

/**
 * 事業計画書（行＝科目・院、列＝月）を読み取る。
 * 「7月」「8月」…の見出し行を探し、期首（fromMonth）から順に年月を割り当てる。
 * 行名が院に一致すれば院の売上計画、それ以外は損益の行として保存する。
 */
export function parseBusinessPlan(grid: string[][], opts: { clinics: Clinic[]; fromMonth: string }): BusinessPlanResult {
  const warnings: string[] = [];
  let headerIdx = -1;
  let monthCols: { col: number; month: string }[] = [];
  for (let r = 0; r < Math.min(grid.length, 30); r++) {
    const cols = grid[r]
      .map((c, col) => ({ col, m: /^(\d{1,2})月$/.exec(normalizeLabel(c)) }))
      .filter((x) => x.m);
    if (cols.length >= 3) {
      headerIdx = r;
      const [startY, startM] = opts.fromMonth.split("-").map(Number);
      let y = startY;
      let prev = startM - 1;
      monthCols = cols.map(({ col, m }) => {
        const mm = Number(m![1]);
        if (mm <= prev) y++;
        prev = mm;
        return { col, month: `${y}-${String(mm).padStart(2, "0")}` };
      });
      if (Number(cols[0].m![1]) !== startM) {
        warnings.push(`最初の月が期首（${startM}月）ではありません。${startY}年${cols[0].m![1]}月から割り当てました。`);
      }
      break;
    }
  }
  if (headerIdx < 0) {
    return { records: [], months: [], clinicRows: 0, plRows: 0, warnings: ["「7月」「8月」などの月の見出し行が見つかりませんでした。"] };
  }
  const labelCol = Math.max(0, monthCols[0].col - 1);
  const records: PlanRecord[] = [];
  let clinicRows = 0;
  let plRows = 0;
  const usedClinics = new Set<string>();
  for (let r = headerIdx + 1; r < grid.length; r++) {
    const row = grid[r];
    const label = (row.slice(0, monthCols[0].col).find((c) => c.trim()) ?? row[labelCol] ?? "").trim();
    if (!label) continue;
    const clinic = matchClinic(label, opts.clinics);
    const clinicId = clinic && !usedClinics.has(clinic.id) ? clinic.id : undefined;
    let any = false;
    for (const { col, month } of monthCols) {
      const v = parseNumberCell(row[col]);
      if (v === undefined) continue;
      any = true;
      records.push({ month, label, clinicId, amountJpy: v });
    }
    if (!any) continue;
    if (clinicId) {
      usedClinics.add(clinicId);
      clinicRows++;
    } else plRows++;
  }
  return { records, months: monthCols.map((m) => m.month), clinicRows, plRows, warnings };
}
