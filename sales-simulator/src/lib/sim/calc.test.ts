import { describe, expect, it } from "vitest";
import { calculate, countByRate, safeDivide } from "./calc";
import { cloneInput, DEFAULT_INPUT } from "./defaults";
import { roundCount } from "./sanitize";
import type { SimInput } from "./types";

function make(mutate: (i: SimInput) => void = () => {}): SimInput {
  const input = cloneInput(DEFAULT_INPUT);
  mutate(input);
  return input;
}

describe("calculate（初期値）", () => {
  const r = calculate(DEFAULT_INPUT);

  it("延べ来院数 = カルテ数 × 平均来院回数", () => {
    expect(r.totalVisits).toBe(500);
  });

  it("柔整保険", () => {
    expect(r.judo.count).toBe(500);
    expect(r.judo.copaySales).toBe(250_000);
    expect(r.judo.claimSales).toBe(850_000);
    expect(r.judo.total).toBe(1_100_000);
  });

  it("鍼灸保険（1術30%・2術70%）", () => {
    expect(r.acu.count).toBe(300);
    expect(r.acu.oneCount).toBe(90);
    expect(r.acu.twoCount).toBe(210);
    expect(r.acu.twoRate).toBe(70);
    expect(r.acu.copaySales).toBe(90 * 300 + 210 * 400);
    expect(r.acu.claimSales).toBe(90 * 1200 + 210 * 1600);
    expect(r.acu.total).toBe(555_000);
  });

  it("自費・EMS", () => {
    expect(r.self.treatmentSales).toBe(200_000);
    expect(r.self.emsCount).toBe(100);
    expect(r.self.emsSales).toBe(200_000);
    expect(r.self.total).toBe(400_000);
  });

  it("総売上・達成率・不足額", () => {
    expect(r.totalSales).toBe(2_055_000);
    expect(r.achievementRate).toBeCloseTo(51.375, 6);
    expect(r.shortfall).toBe(1_945_000);
    expect(r.surplus).toBe(0);
  });

  it("KPI", () => {
    expect(r.salesPerKarte).toBe(20_550);
    expect(r.salesPerVisit).toBe(4_110);
    expect(r.salesPerStaff).toBe(513_750);
    expect(r.visitsPerDay).toBe(20);
  });
});

describe("重複計上しない", () => {
  it("柔整100%＋鍼灸60%でも延べ来院数・カルテ数は増えない", () => {
    const r = calculate(DEFAULT_INPUT);
    expect(r.judo.count + r.acu.count).toBe(800); // 対応数の合計は来院数を超えてよい
    expect(r.totalVisits).toBe(500); // 来院数は1回だけ数える
    expect(r.salesPerVisit).toBe(r.totalSales / 500);
  });

  it("総売上は各項目の単純合計と一致する（どれも二重に入らない）", () => {
    const input = make((i) => {
      i.self.productSales = 123_456;
      i.self.otherSales = 7_890;
    });
    const r = calculate(input);
    const sum =
      r.judo.total + r.acu.total + r.self.treatmentSales + r.self.emsSales + 123_456 + 7_890;
    expect(r.totalSales).toBe(sum);
    expect(r.self.total).toBe(r.self.treatmentSales + r.self.emsSales + 123_456 + 7_890);
    expect(r.insuranceTotal + r.self.total).toBe(r.totalSales);
    expect(r.fixedSales).toBe(123_456 + 7_890);
    expect(r.fixedSales + r.variableSales).toBe(r.totalSales);
  });

  it("窓口売上＋請求売上＝保険合計", () => {
    const r = calculate(DEFAULT_INPUT);
    expect(r.judo.copaySales + r.judo.claimSales).toBe(r.judo.total);
    expect(r.acu.copaySales + r.acu.claimSales).toBe(r.acu.total);
  });

  it("1術件数＋2術件数は常に鍼灸延べ対応数と一致する（端数があっても）", () => {
    for (let visits = 1; visits <= 60; visits++) {
      for (const acuRate of [0, 13, 33.3, 50, 66.7, 99.9, 100]) {
        for (const oneRate of [0, 12.5, 33.3, 50, 77.7, 100]) {
          const r = calculate(
            make((i) => {
              i.basic.karteCount = visits;
              i.basic.visitsPerKarte = 1;
              i.acu.rate = acuRate;
              i.acu.oneRate = oneRate;
            }),
          );
          expect(r.acu.oneCount + r.acu.twoCount).toBe(r.acu.count);
          expect(r.acu.oneCount).toBeGreaterThanOrEqual(0);
          expect(r.acu.twoCount).toBeGreaterThanOrEqual(0);
          expect(r.acu.count).toBeLessThanOrEqual(r.totalVisits);
        }
      }
    }
  });
});

describe("端数処理（四捨五入で統一）", () => {
  it("roundCount は四捨五入し、浮動小数点誤差に影響されない", () => {
    expect(roundCount(2.4)).toBe(2);
    expect(roundCount(2.5)).toBe(3);
    expect(roundCount(0.1 * 3 * 10)).toBe(3); // 2.9999999999999996
    expect(roundCount(1.005 * 1000)).toBe(1005); // 1004.9999999999999
    expect(roundCount(-3)).toBe(0);
    expect(roundCount(Number.NaN)).toBe(0);
  });

  it("延べ来院数：小数の来院回数も四捨五入", () => {
    expect(calculate(make((i) => { i.basic.karteCount = 33; i.basic.visitsPerKarte = 4.5; })).totalVisits).toBe(149); // 148.5
    expect(calculate(make((i) => { i.basic.karteCount = 7; i.basic.visitsPerKarte = 3.3; })).totalVisits).toBe(23); // 23.1
  });

  it("対応数：率をかけた結果を四捨五入", () => {
    expect(countByRate(149, 60)).toBe(89); // 89.4
    expect(countByRate(25, 50)).toBe(13); // 12.5 → 13
    expect(countByRate(7, 35)).toBe(2); // 2.45
    expect(countByRate(500, 33.3)).toBe(167); // 166.5 → 167
  });

  it("鍼灸1術は四捨五入、2術は残り（合計がずれない）", () => {
    const r = calculate(make((i) => { i.basic.karteCount = 5; i.basic.visitsPerKarte = 1; i.acu.rate = 100; i.acu.oneRate = 50; }));
    expect(r.acu.count).toBe(5);
    expect(r.acu.oneCount).toBe(3); // 2.5 → 3
    expect(r.acu.twoCount).toBe(2);
  });

  it("金額は常に整数円", () => {
    const r = calculate(make((i) => { i.basic.karteCount = 37; i.basic.visitsPerKarte = 3.7; i.acu.rate = 41.3; i.acu.oneRate = 27.9; i.self.emsRate = 13.3; }));
    for (const v of [r.totalSales, r.judo.total, r.acu.total, r.self.total, r.self.emsSales]) {
      expect(Number.isInteger(v)).toBe(true);
    }
  });
});

describe("柔整の直接入力", () => {
  it("直接入力した件数で計算する", () => {
    const r = calculate(make((i) => { i.judo.useManualCount = true; i.judo.manualCount = 420; }));
    expect(r.judo.count).toBe(420);
    expect(r.judo.effectiveRate).toBeCloseTo(84, 6);
    expect(r.judo.total).toBe(420 * 2200);
  });

  it("延べ来院数を超える場合は来院数に制限し警告する", () => {
    const r = calculate(make((i) => { i.judo.useManualCount = true; i.judo.manualCount = 900; }));
    expect(r.judo.count).toBe(500);
    expect(r.warnings.length).toBeGreaterThan(0);
  });
});

describe("ゼロ除算・ゼロ入力", () => {
  it("すべて0でも NaN / Infinity が出ない", () => {
    const zero = make((i) => {
      i.basic = { karteCount: 0, visitsPerKarte: 0, workingDays: 0, staffCount: 0, targetSales: 0 };
    });
    const r = calculate(zero);
    expect(r.totalVisits).toBe(0);
    expect(r.achievementRate).toBeNull();
    expect(r.salesPerKarte).toBeNull();
    expect(r.salesPerVisit).toBeNull();
    expect(r.salesPerStaff).toBeNull();
    expect(r.visitsPerDay).toBeNull();
    expect(r.judo.effectiveRate).toBe(0);
    expect(Number.isFinite(r.totalSales)).toBe(true);
    expect(r.shortfall).toBe(0);
  });

  it("safeDivide", () => {
    expect(safeDivide(10, 0)).toBeNull();
    expect(safeDivide(10, -1)).toBeNull();
    expect(safeDivide(10, 4)).toBe(2.5);
  });

  it("目標達成時は不足0・超過額を返す", () => {
    const r = calculate(make((i) => { i.basic.targetSales = 2_000_000; }));
    expect(r.shortfall).toBe(0);
    expect(r.surplus).toBe(55_000);
  });
});
