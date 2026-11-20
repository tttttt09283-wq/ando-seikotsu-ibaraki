import { calculate, safeDivide } from "./calc";
import { roundCount } from "./sanitize";
import type { SimInput } from "./types";

/**
 * 目標逆算シミュレーション。
 *
 * 売上を2つに分けて考える:
 * - 固定売上 … 物販売上・その他売上（カルテ数が変わっても変わらない）
 * - 連動売上 … 柔整・鍼灸・自費施術・EMS（延べ来院数に比例して増減する）
 *
 * 「現在の構成比・単価・来院頻度」を保つため、カルテ数や来院回数を変えるときは
 * - 各保険の対応率・1術/2術比率・EMS利用率はそのまま
 * - 自費施術件数は「現在の 自費施術件数 ÷ 延べ来院数」の比率を保って増減
 * - 柔整を直接入力している場合は、現在の実効対応率（件数 ÷ 来院数）に換算
 * して再計算する。各件数は通常計算と同じ丸め（四捨五入）を通すため、単純な割り算とずれない。
 */

export interface ProjectionChange {
  karteCount?: number;
  visitsPerKarte?: number;
  acuRate?: number;
  treatmentPrice?: number;
}

export function projectInput(base: SimInput, change: ProjectionChange): SimInput {
  const baseResult = calculate(base);
  const baseVisits = baseResult.totalVisits;

  const karteCount = change.karteCount ?? base.basic.karteCount;
  const visitsPerKarte = change.visitsPerKarte ?? base.basic.visitsPerKarte;
  const newVisits = roundCount(karteCount * visitsPerKarte);

  const treatmentCount =
    baseVisits > 0
      ? roundCount((newVisits * base.self.treatmentCount) / baseVisits)
      : base.self.treatmentCount;

  return {
    basic: { ...base.basic, karteCount, visitsPerKarte },
    judo: base.judo.useManualCount
      ? { ...base.judo, useManualCount: false, rate: baseResult.judo.effectiveRate }
      : { ...base.judo },
    acu: {
      ...base.acu,
      rate: change.acuRate ?? base.acu.rate,
      one: { ...base.acu.one },
      two: { ...base.acu.two },
    },
    self: {
      ...base.self,
      treatmentCount,
      treatmentPrice: change.treatmentPrice ?? base.self.treatmentPrice,
    },
  };
}

/**
 * 単調非減少な関数 f について、f(n) >= target を満たす最小の整数 n（lo〜hi）を二分探索で求める。
 * 見つからなければ null。
 */
export function findMinInteger(
  f: (n: number) => number,
  target: number,
  lo: number,
  hi: number,
): number | null {
  if (hi < lo || f(hi) < target) return null;
  let left = lo;
  let right = hi;
  while (left < right) {
    const mid = Math.floor((left + right) / 2);
    if (f(mid) >= target) right = mid;
    else left = mid + 1;
  }
  return left;
}

export type ReverseCaseKey = "karte" | "visits" | "acuRate" | "selfPrice";

export interface ReverseCase {
  key: ReverseCaseKey;
  label: string;
  description: string;
  unit: string;
  current: number;
  /** 目標達成に必要な最小値。達成不可能なら null */
  required: number | null;
  /** 必要値 − 現在値 */
  delta: number | null;
  achievable: boolean;
  /** すでに現状で目標を達成している */
  alreadyAchieved: boolean;
  /** 必要値にしたときの総売上 */
  resultingSales: number | null;
  /** 補足（達成できない理由など） */
  note?: string;
}

export interface ReverseResult {
  targetSales: number;
  currentSales: number;
  /** 目標 − 現状（マイナスなら超過） */
  gap: number;
  fixedSales: number;
  variableSales: number;
  /** 現在のカルテ1枚あたり連動売上 */
  variablePerKarte: number | null;

  requiredKarte: number | null;
  additionalKarte: number | null;
  requiredVisits: number | null;
  requiredVisitsPerDay: number | null;
  requiredSalesPerStaff: number | null;
  currentSalesPerStaff: number | null;

  cases: ReverseCase[];
}

const MAX_KARTE = 1_000_000;
const MAX_VISITS_PER_KARTE_TENTHS = 310; // 31.0回/月（毎日来院）まで
const MAX_SELF_PRICE_STEPS = 100_000; // 10円刻みで 1,000,000円まで
const SELF_PRICE_STEP = 10;

function salesOf(base: SimInput, change: ProjectionChange): number {
  return calculate(projectInput(base, change)).totalSales;
}

function findRequiredKarte(base: SimInput, target: number): number | null {
  const f = (k: number) => salesOf(base, { karteCount: k });
  if (f(0) >= target) return 0;
  // 上限を倍々で広げてから二分探索
  let hi = Math.max(1, base.basic.karteCount);
  while (f(hi) < target) {
    if (hi >= MAX_KARTE) return null;
    hi = Math.min(MAX_KARTE, hi * 2);
  }
  return findMinInteger(f, target, 0, hi);
}

export function reverseCalculate(base: SimInput): ReverseResult {
  const current = calculate(base);
  const target = base.basic.targetSales;
  const alreadyAchieved = current.totalSales >= target;

  // ① カルテ数を増やす
  const requiredKarte = findRequiredKarte(base, target);
  const karteCase: ReverseCase = {
    key: "karte",
    label: "カルテ数を増やす",
    description: "来院頻度・対応率・単価はそのままで、稼働カルテ数だけを増やす",
    unit: "枚",
    current: base.basic.karteCount,
    required: requiredKarte,
    delta: requiredKarte === null ? null : requiredKarte - base.basic.karteCount,
    achievable: requiredKarte !== null,
    alreadyAchieved,
    resultingSales: requiredKarte === null ? null : salesOf(base, { karteCount: requiredKarte }),
    note: requiredKarte === null ? "来院に連動する売上が0のため、カルテ数を増やしても目標に届きません。" : undefined,
  };

  // ② 来院回数を増やす（0.1回刻み）
  const visitsTenths = findMinInteger(
    (t) => salesOf(base, { visitsPerKarte: t / 10 }),
    target,
    0,
    MAX_VISITS_PER_KARTE_TENTHS,
  );
  const requiredVisitsPerKarte = visitsTenths === null ? null : visitsTenths / 10;
  const visitsCase: ReverseCase = {
    key: "visits",
    label: "来院回数を増やす",
    description: "カルテ数はそのままで、1カルテあたりの月間来院回数を増やす",
    unit: "回",
    current: base.basic.visitsPerKarte,
    required: requiredVisitsPerKarte,
    delta:
      requiredVisitsPerKarte === null
        ? null
        : Math.round((requiredVisitsPerKarte - base.basic.visitsPerKarte) * 10) / 10,
    achievable: requiredVisitsPerKarte !== null,
    alreadyAchieved,
    resultingSales:
      requiredVisitsPerKarte === null ? null : salesOf(base, { visitsPerKarte: requiredVisitsPerKarte }),
    note:
      requiredVisitsPerKarte === null
        ? "月31回（毎日来院）まで増やしても目標に届きません。"
        : undefined,
  };

  // ③ 鍼灸保険対応率を高める（1%刻み、最大100%）
  const acuRate = findMinInteger((r) => salesOf(base, { acuRate: r }), target, 0, 100);
  const acuCase: ReverseCase = {
    key: "acuRate",
    label: "鍼灸保険対応率を高める",
    description: "カルテ数・来院回数はそのままで、鍼灸保険の対応率を高める",
    unit: "%",
    current: base.acu.rate,
    required: acuRate,
    delta: acuRate === null ? null : Math.round((acuRate - base.acu.rate) * 10) / 10,
    achievable: acuRate !== null,
    alreadyAchieved,
    resultingSales: acuRate === null ? null : salesOf(base, { acuRate }),
    note: acuRate === null ? "鍼灸保険対応率を100%にしても目標に届きません。" : undefined,
  };

  // ④ 自費単価を高める（10円刻み）
  const priceSteps = findMinInteger(
    (p) => salesOf(base, { treatmentPrice: p * SELF_PRICE_STEP }),
    target,
    0,
    MAX_SELF_PRICE_STEPS,
  );
  const requiredPrice = priceSteps === null ? null : priceSteps * SELF_PRICE_STEP;
  const selfCase: ReverseCase = {
    key: "selfPrice",
    label: "自費単価を高める",
    description: "自費施術の件数はそのままで、平均単価を高める",
    unit: "円",
    current: base.self.treatmentPrice,
    required: requiredPrice,
    delta: requiredPrice === null ? null : requiredPrice - base.self.treatmentPrice,
    achievable: requiredPrice !== null,
    alreadyAchieved,
    resultingSales: requiredPrice === null ? null : salesOf(base, { treatmentPrice: requiredPrice }),
    note:
      requiredPrice === null
        ? base.self.treatmentCount === 0
          ? "自費施術の件数が0のため、単価を上げても売上は増えません。"
          : "現実的な単価の範囲（100万円まで）では目標に届きません。"
        : undefined,
  };

  const requiredVisits =
    requiredKarte === null ? null : roundCount(requiredKarte * base.basic.visitsPerKarte);

  return {
    targetSales: target,
    currentSales: current.totalSales,
    gap: target - current.totalSales,
    fixedSales: current.fixedSales,
    variableSales: current.variableSales,
    variablePerKarte: safeDivide(current.variableSales, base.basic.karteCount),
    requiredKarte,
    additionalKarte: requiredKarte === null ? null : Math.max(0, requiredKarte - base.basic.karteCount),
    requiredVisits,
    requiredVisitsPerDay: requiredVisits === null ? null : safeDivide(requiredVisits, base.basic.workingDays),
    requiredSalesPerStaff: safeDivide(target, base.basic.staffCount),
    currentSalesPerStaff: current.salesPerStaff,
    cases: [karteCase, visitsCase, acuCase, selfCase],
  };
}
