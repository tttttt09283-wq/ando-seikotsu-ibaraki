import { clinicOpenIn, getClinics } from "@/lib/clinics";
import { addMonths } from "@/lib/import/year-grid";
import type { CompanyData, MidPlanScenario, MidPlanYear } from "@/lib/types";
import { TENANT } from "@/tenant";
import { budgetTable } from "./budget-metrics";
import { staffFor } from "./kpi-metrics";

/**
 * 中期事業計画（今期＋来期以降）の計算。
 * - 今期：過ぎた月は実績、今月は着地予想、これからの月は確定予算（＝今期の着地見込み）
 * - 来期以降：前年の院・月の売上 × 既存店の成長率（院ごとに上書き可）。取り込んだ計画があればそれを使う
 * - 新店：開院月の月商から、立ち上がり期間をかけて成熟時の月商まで伸びる
 * - 人員：今期は組織図・予算の人員、来期以降は計画の人数（未入力は前年のまま）
 */

export type PlanData = Pick<CompanyData, "budget" | "clinicSetup" | "clinicMonths" | "org" | "kpis" | "midPlan">;

export function fyStarts(): string[] {
  const first = TENANT.revenueTarget.fromMonth;
  return Array.from({ length: TENANT.fiscal.planYears + 1 }, (_, i) => addMonths(first, 12 * i));
}

export function termLabel(fyStart: string): string {
  const diff = (Number(fyStart.slice(0, 4)) - Number(TENANT.revenueTarget.fromMonth.slice(0, 4))) | 0;
  return `第${TENANT.fiscal.term + diff}期`;
}

/** 和暦の年度表記（例：R8.7〜R9.6） */
export function eraLabel(fyStart: string): string {
  const end = addMonths(fyStart, 11);
  const r = (m: string) => `R${Number(m.slice(0, 4)) - 2018}.${Number(m.slice(5))}`;
  return `${r(fyStart)}〜${r(end)}`;
}

export function defaultYear(fyStart: string): MidPlanYear {
  return { fyStart, growthRate: TENANT.fiscal.defaultGrowth, clinicGrowth: {}, staff: {}, monthly: {} };
}

export function newScenario(id: string, name: string, now: string, actorId: string): MidPlanScenario {
  return {
    id,
    name,
    years: fyStarts().slice(1).map(defaultYear),
    newStores: [],
    updatedAt: now,
    updatedBy: actorId,
  };
}

function ramp(store: MidPlanScenario["newStores"][number], month: string): number {
  if (month < store.openMonth) return 0;
  const [y1, m1] = store.openMonth.split("-").map(Number);
  const [y2, m2] = month.split("-").map(Number);
  const k = (y2 - y1) * 12 + (m2 - m1);
  const span = Math.max(1, store.rampMonths);
  return Math.round(store.startJpy + (store.matureJpy - store.startJpy) * Math.min(1, k / span));
}

export type PlanRow = {
  id: string;
  name: string;
  isNew: boolean;
  monthly: number[];
  annual: number;
  /** 年平均の施術者数（換算。分からなければ null） */
  staff: number | null;
  growth: number | null;
  imported: boolean;
};

export function midPlanTable(data: PlanData, now: Date, scenario: MidPlanScenario | null) {
  const clinics = getClinics(data);
  const starts = fyStarts();
  const current = budgetTable(data, now, "confirmed");
  const years: {
    fyStart: string;
    term: string;
    era: string;
    kind: "current" | "plan";
    growthRate: number | null;
    rows: PlanRow[];
    revenue: number;
    existingRevenue: number;
    newRevenue: number;
    prevRevenue: number | null;
    yoy: number | null;
    targetJpy: number | null;
    gap: number | null;
    clinicsOpen: number;
    staffAvg: number | null;
    perStaffMonthly: number | null;
    laborJpy: number | null;
    otherJpy: number | null;
    profitJpy: number | null;
    margin: number | null;
    note?: string;
  }[] = [];

  const newStores = (scenario?.newStores ?? []).filter((s) => !clinics.some((c) => c.name === s.name));
  let prev = new Map<string, { monthly: number[]; staff: number | null }>();

  starts.forEach((fy, yi) => {
    const months = Array.from({ length: 12 }, (_, i) => addMonths(fy, i));
    const cfg: MidPlanYear | null = yi === 0 ? null : (scenario?.years.find((y) => y.fyStart === fy) ?? defaultYear(fy));
    const rows: PlanRow[] = [];
    for (const c of clinics) {
      const openMonths = months.filter((m) => clinicOpenIn(c, m));
      if (!openMonths.length) continue;
      let monthly: number[];
      let staff: number | null;
      let growth: number | null = null;
      let imported = false;
      if (yi === 0) {
        const row = current.rows.find((r) => r.clinicId === c.id);
        monthly = months.map((m, i) => {
          const cell = row?.cells[i];
          if (!cell || !cell.open) return 0;
          if (cell.status === "past") return cell.actual ?? cell.budget;
          if (cell.status === "current") return cell.forecast ?? cell.budget;
          return cell.budget;
        });
        const st = openMonths.map((m) => staffFor(data, clinics, m, c.id)).filter((x): x is number => x != null);
        staff = st.length ? Math.round((st.reduce((n, x) => n + x, 0) / st.length) * 10) / 10 : null;
      } else {
        const p = prev.get(c.id);
        growth = cfg!.clinicGrowth[c.id] ?? cfg!.growthRate;
        const imp = cfg!.monthly[c.id];
        imported = Boolean(imp);
        const nonzero = (p?.monthly ?? []).filter((v) => v > 0);
        const fallback = nonzero.length ? nonzero.slice(-3).reduce((n, v) => n + v, 0) / Math.min(3, nonzero.length) : TENANT.budget.standardPerClinicJpy;
        monthly = months.map((m, i) => {
          if (!clinicOpenIn(c, m)) return 0;
          if (imp) return imp[i] ?? 0;
          const base = p && p.monthly[i] > 0 ? p.monthly[i] : fallback;
          return Math.round(base * growth!);
        });
        staff = cfg!.staff[c.id] ?? p?.staff ?? null;
      }
      rows.push({ id: c.id, name: c.name, isNew: Boolean(c.added), monthly, annual: monthly.reduce((n, v) => n + v, 0), staff, growth, imported });
    }
    for (const s of newStores) {
      const monthly = months.map((m) => ramp(s, m));
      if (!monthly.some((v) => v > 0)) continue;
      rows.push({ id: s.id, name: s.name, isNew: true, monthly, annual: monthly.reduce((n, v) => n + v, 0), staff: s.staff, growth: null, imported: false });
    }

    const revenue = rows.reduce((n, r) => n + r.annual, 0);
    const newRevenue = rows.filter((r) => newStores.some((s) => s.id === r.id)).reduce((n, r) => n + r.annual, 0);
    // 施術者数は、営業している月数で按分した年平均
    let staffMonths = 0;
    let staffedRevenue = 0;
    for (const r of rows) {
      if (r.staff == null) continue;
      const open = r.monthly.filter((v) => v > 0).length;
      staffMonths += r.staff * open;
      staffedRevenue += r.annual;
    }
    const prevRevenue = yi === 0 ? null : years[yi - 1].revenue;
    const targetJpy = yi === 0 ? TENANT.revenueTarget.amountJpy : (cfg!.targetJpy ?? null);
    const laborJpy = scenario?.laborPerStaffYearJpy != null && staffMonths > 0 ? Math.round((scenario.laborPerStaffYearJpy * staffMonths) / 12) : null;
    const otherJpy = scenario?.otherCostRate != null ? Math.round((revenue * scenario.otherCostRate) / 100) : null;
    const profitJpy = laborJpy != null || otherJpy != null ? revenue - (laborJpy ?? 0) - (otherJpy ?? 0) : null;
    years.push({
      fyStart: fy,
      term: termLabel(fy),
      era: eraLabel(fy),
      kind: yi === 0 ? "current" : "plan",
      growthRate: cfg?.growthRate ?? null,
      rows,
      revenue,
      existingRevenue: revenue - newRevenue,
      newRevenue,
      prevRevenue,
      yoy: prevRevenue ? Math.round((revenue / prevRevenue) * 1000) / 10 : null,
      targetJpy,
      gap: targetJpy != null ? targetJpy - revenue : null,
      clinicsOpen: rows.filter((r) => r.monthly[11] > 0).length,
      staffAvg: staffMonths > 0 ? Math.round((staffMonths / 12) * 10) / 10 : null,
      perStaffMonthly: staffMonths > 0 ? Math.round(staffedRevenue / staffMonths) : null,
      laborJpy,
      otherJpy,
      profitJpy,
      margin: profitJpy != null && revenue > 0 ? Math.round((profitJpy / revenue) * 1000) / 10 : null,
      note: cfg?.note,
    });
    prev = new Map(rows.map((r) => [r.id, { monthly: r.monthly, staff: r.staff }]));
  });

  // 前期（今期の前の年度）の実績：日計表や年間予算表から取り込んだ前年の売上
  const prevFy = addMonths(starts[0], -12);
  const prevMonths = Array.from({ length: 12 }, (_, i) => addMonths(prevFy, i));
  const prevRecords = data.clinicMonths.filter((r) => r.clinicId !== "all" && prevMonths.includes(r.month) && r.values.salesActual != null);
  const previous = prevRecords.length
    ? {
        fyStart: prevFy,
        term: termLabel(prevFy),
        era: eraLabel(prevFy),
        revenue: prevRecords.reduce((n, r) => n + (r.values.salesActual ?? 0), 0),
        months: new Set(prevRecords.map((r) => r.month)).size,
      }
    : null;
  if (previous && previous.months === 12 && years[0]) {
    years[0].prevRevenue = previous.revenue;
    years[0].yoy = Math.round((years[0].revenue / previous.revenue) * 1000) / 10;
  }
  return { scenarioId: scenario?.id ?? null, years, previous };
}

export type MidPlanTable = ReturnType<typeof midPlanTable>;
