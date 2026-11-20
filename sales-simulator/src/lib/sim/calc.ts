import { roundCount } from "./sanitize";
import type { SimInput, SimResult } from "./types";

/** 0除算を防ぐ割り算。分母が0以下なら null */
export function safeDivide(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return null;
  return numerator / denominator;
}

/** 件数 = 母数 × 率(%) を四捨五入（掛けてから100で割り、誤差を抑える） */
export function countByRate(base: number, ratePercent: number): number {
  return roundCount((base * ratePercent) / 100);
}

/**
 * 月間売上を計算する（純粋関数・UIに依存しない）。
 *
 * 重複計上しないためのルール:
 * - 患者数（稼働カルテ数）と延べ来院数は1回だけ数える。柔整・鍼灸の併用患者がいても来院数は増えない。
 * - 柔整・鍼灸の対応率はそれぞれ「延べ来院数に対する割合」。合計が100%を超えてもよい（併用）。
 * - 鍼灸の2術件数は「鍼灸延べ対応数 − 1術件数」とし、1術＋2術が必ず鍼灸延べ対応数と一致する。
 * - 自費施術・EMS・物販・その他はそれぞれ独立した売上項目として1回ずつだけ加算する。
 */
export function calculate(input: SimInput): SimResult {
  const { basic, judo, acu, self } = input;
  const warnings: string[] = [];

  const totalVisits = roundCount(basic.karteCount * basic.visitsPerKarte);

  // 柔整保険
  let judoCount: number;
  if (judo.useManualCount) {
    judoCount = Math.max(0, Math.round(judo.manualCount));
    if (judoCount > totalVisits) {
      warnings.push(
        `柔整保険の延べ対応数（${judoCount}回）が延べ来院数（${totalVisits}回）を超えているため、延べ来院数に合わせて計算しています。`,
      );
      judoCount = totalVisits;
    }
  } else {
    judoCount = countByRate(totalVisits, judo.rate);
  }
  const judoEffectiveRate = (safeDivide(judoCount, totalVisits) ?? 0) * 100;
  const judoCopaySales = judoCount * judo.copay;
  const judoClaimSales = judoCount * judo.claim;

  // 鍼灸保険
  const acuCount = countByRate(totalVisits, acu.rate);
  const oneRate = Math.min(100, Math.max(0, acu.oneRate));
  const twoRate = Math.round((100 - oneRate) * 10) / 10;
  const oneCount = countByRate(acuCount, oneRate);
  const twoCount = acuCount - oneCount;
  const acuCopaySales = oneCount * acu.one.copay + twoCount * acu.two.copay;
  const acuClaimSales = oneCount * acu.one.claim + twoCount * acu.two.claim;

  // 自費
  const treatmentCount = Math.max(0, Math.round(self.treatmentCount));
  const treatmentSales = treatmentCount * self.treatmentPrice;
  const emsCount = countByRate(totalVisits, self.emsRate);
  const emsSales = emsCount * self.emsPrice;
  const selfTotal = treatmentSales + emsSales + self.productSales + self.otherSales;
  if (treatmentCount > totalVisits && totalVisits > 0) {
    warnings.push(
      `自費施術の延べ件数（${treatmentCount}件）が延べ来院数（${totalVisits}回）を上回っています。1回の来院で複数施術がある場合以外は入力を確認してください。`,
    );
  }

  const judoTotal = judoCopaySales + judoClaimSales;
  const acuTotal = acuCopaySales + acuClaimSales;
  const insuranceTotal = judoTotal + acuTotal;
  const totalSales = insuranceTotal + selfTotal;
  const fixedSales = self.productSales + self.otherSales;
  const variableSales = totalSales - fixedSales;

  const rawRate = safeDivide(totalSales, basic.targetSales);
  const achievementRate = rawRate === null ? null : rawRate * 100;

  return {
    totalVisits,
    judo: {
      effectiveRate: judoEffectiveRate,
      count: judoCount,
      copaySales: judoCopaySales,
      claimSales: judoClaimSales,
      total: judoTotal,
    },
    acu: {
      count: acuCount,
      oneRate,
      twoRate,
      oneCount,
      twoCount,
      copaySales: acuCopaySales,
      claimSales: acuClaimSales,
      total: acuTotal,
    },
    self: {
      treatmentCount,
      treatmentSales,
      emsCount,
      emsSales,
      productSales: self.productSales,
      otherSales: self.otherSales,
      total: selfTotal,
    },
    insuranceTotal,
    totalSales,
    fixedSales,
    variableSales,
    achievementRate,
    shortfall: Math.max(0, basic.targetSales - totalSales),
    surplus: Math.max(0, totalSales - basic.targetSales),
    salesPerKarte: safeDivide(totalSales, basic.karteCount),
    salesPerVisit: safeDivide(totalSales, totalVisits),
    salesPerStaff: safeDivide(totalSales, basic.staffCount),
    visitsPerDay: safeDivide(totalVisits, basic.workingDays),
    warnings,
  };
}
