import { clinicOpenIn, getClinics } from "@/lib/clinics";
import { addMonths } from "@/lib/import/year-grid";
import type { Clinic } from "@/lib/tenant-types";
import { jstMonthKey } from "@/lib/time";
import { SPECIAL_SERIES, type CompanyData, type KpiDef } from "@/lib/types";
import { TENANT } from "@/tenant";
import { cellOf, confirmedSource, fiscalMonths } from "./budget-metrics";

/**
 * 管理項目（KPI）の計算：院別・ブロック別・全院の、月ごとの値・目標・達成度。
 * 数字は保存データ（日計表・手入力・予算・組織図）から計算する。通信はしない。
 */

export type KpiData = Pick<CompanyData, "kpis" | "clinicMonths" | "budget" | "clinicSetup" | "org">;

export function kpiDefs(data: Pick<CompanyData, "kpis">): KpiDef[] {
  return (data.kpis?.defs ?? TENANT.kpis).filter((d) => !d.archived);
}

/** 管理項目の式で使える系列（指標の key・特別な系列・手入力の管理項目） */
export function seriesOptions(data: Pick<CompanyData, "kpis">): { key: string; label: string; unit: string }[] {
  return [
    ...Object.entries(SPECIAL_SERIES).map(([key, label]) => ({ key, label, unit: key === "staff" ? "person" : "yen" })),
    ...TENANT.metrics.map((m) => ({ key: m.key, label: m.label, unit: m.unit })),
    ...(data.kpis?.defs ?? TENANT.kpis).filter((d) => d.calc.kind === "manual").map((d) => ({ key: d.id, label: `${d.name}（手入力）`, unit: d.unit })),
  ];
}

/** その月に有効な施術者の人数：組織図（その月以前で最新の実際の配置）→ なければ確定予算の人員 */
export function staffFor(data: KpiData, clinics: Clinic[], month: string, clinicId: string): number | null {
  const snaps = (data.org?.snapshots ?? []).filter((s) => s.kind === "actual" && s.month <= month).sort((a, b) => b.month.localeCompare(a.month));
  for (const s of snaps) {
    const c = s.clinics.find((x) => x.clinicId === clinicId);
    if (c) return c.fte;
  }
  const b = cellOf(confirmedSource(data), clinics, month, clinicId);
  return b.staff ?? null;
}

type Ctx = { data: KpiData; clinics: Clinic[]; values: Map<string, Record<string, number>> };

function makeCtx(data: KpiData): Ctx {
  const values = new Map<string, Record<string, number>>();
  for (const r of data.clinicMonths) values.set(`${r.month}|${r.clinicId}`, r.values);
  return { data, clinics: getClinics(data), values };
}

/** 院1つ・1か月の系列の値 */
function seriesOne(ctx: Ctx, key: string, month: string, clinicId: string): number | null {
  const c = ctx.clinics.find((x) => x.id === clinicId);
  if (c && !clinicOpenIn(c, month)) return null;
  if (key === "budget") return cellOf(confirmedSource(ctx.data), ctx.clinics, month, clinicId).amountJpy || null;
  if (key === "staff") return staffFor(ctx.data, ctx.clinics, month, clinicId);
  if (key === "lastYearSales") return ctx.values.get(`${addMonths(month, -12)}|${clinicId}`)?.salesActual ?? null;
  const v = ctx.values.get(`${month}|${clinicId}`)?.[key];
  return v ?? null;
}

const summable = (key: string, unit: string) => {
  if (key in SPECIAL_SERIES) return true;
  const m = TENANT.metrics.find((x) => x.key === key);
  if (m) return m.total === "sum";
  return unit !== "percent";
};

/** 複数の院の合計（率・単価のように合計できないものは平均）。全院のときは日計表の全院合計の行があればそれを使う */
function seriesMany(ctx: Ctx, key: string, unit: string, month: string, clinicIds: string[], all: boolean): number | null {
  if (all && !(key in SPECIAL_SERIES)) {
    const v = ctx.values.get(`${month}|all`)?.[key];
    if (v != null) return v;
  }
  const xs = clinicIds.map((id) => seriesOne(ctx, key, month, id)).filter((v): v is number => v != null);
  if (!xs.length) return null;
  const sum = xs.reduce((n, v) => n + v, 0);
  return summable(key, unit) ? sum : Math.round((sum / xs.length) * 10) / 10;
}

function valueOf(ctx: Ctx, def: KpiDef, month: string, clinicIds: string[], all: boolean): number | null {
  const calc = def.calc;
  if (calc.kind === "series") return seriesMany(ctx, calc.key, def.unit, month, clinicIds, all);
  if (calc.kind === "manual") return seriesMany(ctx, def.id, def.unit, month, clinicIds, all);
  // 比率：分子・分母がそろっている院だけで計算する（全院でも院の合計どうしで割る）
  let num = 0;
  let den = 0;
  let any = false;
  for (const id of clinicIds) {
    const n = seriesOne(ctx, calc.numerator, month, id);
    const d = seriesOne(ctx, calc.denominator, month, id);
    if (n == null || d == null || d === 0) continue;
    num += n;
    den += d;
    any = true;
  }
  if (!any || den === 0) return null;
  const v = num / den;
  return def.unit === "percent" ? Math.round(v * 1000) / 10 : Math.round(v * 10) / 10;
}

function targetOf(ctx: Ctx, def: KpiDef, month: string, clinicIds: string[], all: boolean): number | null {
  const t = def.target;
  if (clinicIds.length === 1 && def.clinicTargets?.[clinicIds[0]] != null) return def.clinicTargets[clinicIds[0]];
  if (!t) return null;
  if (t.kind === "value") {
    // 合計する項目（金額・件数・人数）の固定目標は1院あたりの値として、院の数をかける。率・比率はそのまま
    const per = def.calc.kind !== "ratio" && def.unit !== "percent" ? clinicIds.length : 1;
    return t.value * per;
  }
  return seriesMany(ctx, t.key, def.unit, month, clinicIds, all);
}

/** 達成度（%）：高いほど良い項目は 値÷目標、低いほど良い項目は 目標÷値 */
export function achievement(def: Pick<KpiDef, "direction">, value: number | null, target: number | null): number | null {
  if (value == null || target == null || target === 0) return null;
  if (def.direction === "down") return value === 0 ? 100 : Math.round((target / value) * 1000) / 10;
  return Math.round((value / target) * 1000) / 10;
}

export type KpiCell = { v: number | null; t: number | null; a: number | null };

/**
 * 管理項目の表。columns = 院 → ブロック → 全院。
 * cells[kpiId][month][columnId] = 値・目標・達成度
 */
export function kpiTable(data: KpiData, now: Date) {
  const ctx = makeCtx(data);
  const defs = kpiDefs(data);
  const months = fiscalMonths();
  const current = jstMonthKey(now);
  const clinics = ctx.clinics;
  const blocks = [...new Set(clinics.map((c) => c.block).filter((b): b is string => Boolean(b)))];
  const columns: { id: string; label: string; kind: "clinic" | "block" | "all"; clinicIds: string[]; block?: string }[] = [
    ...clinics.map((c) => ({ id: c.id, label: c.short, kind: "clinic" as const, clinicIds: [c.id], block: c.block })),
    ...blocks.map((b) => ({ id: `block:${b}`, label: `${b}ブロック`, kind: "block" as const, clinicIds: clinics.filter((c) => c.block === b).map((c) => c.id) })),
    { id: "all", label: "全院", kind: "all" as const, clinicIds: clinics.map((c) => c.id) },
  ];
  const cells: Record<string, Record<string, Record<string, KpiCell>>> = {};
  for (const def of defs) {
    cells[def.id] = {};
    for (const month of months) {
      if (month > current) continue;
      const row: Record<string, KpiCell> = {};
      for (const col of columns) {
        const openIds = col.clinicIds.filter((id) => clinicOpenIn(clinics.find((c) => c.id === id)!, month));
        if (!openIds.length) continue;
        const v = valueOf(ctx, def, month, openIds, col.kind === "all");
        const t = targetOf(ctx, def, month, openIds, col.kind === "all");
        if (v == null && t == null) continue;
        row[col.id] = { v, t, a: achievement(def, v, t) };
      }
      cells[def.id][month] = row;
    }
  }
  // データのある最新の月（今月は途中なので、前月までにデータがあれば前月を既定にする）
  const withData = months.filter((m) => m <= current && defs.some((d) => Object.values(cells[d.id]?.[m] ?? {}).some((c) => c.v != null)));
  const latestComplete = [...withData].reverse().find((m) => m < current);
  return {
    defs,
    months: months.filter((m) => m <= current),
    currentMonth: current,
    defaultMonth: latestComplete ?? withData[withData.length - 1] ?? current,
    columns: columns.map(({ id, label, kind, block }) => ({ id, label, kind, block: block ?? null })),
    cells,
    series: seriesOptions(data),
  };
}

export type KpiTable = ReturnType<typeof kpiTable>;
