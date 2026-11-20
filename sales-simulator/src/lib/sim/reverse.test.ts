import { describe, expect, it } from "vitest";
import { calculate } from "./calc";
import { cloneInput, DEFAULT_INPUT } from "./defaults";
import { findMinInteger, projectInput, reverseCalculate } from "./reverse";
import type { SimInput } from "./types";

function make(mutate: (i: SimInput) => void = () => {}): SimInput {
  const input = cloneInput(DEFAULT_INPUT);
  mutate(input);
  return input;
}

describe("findMinInteger", () => {
  it("条件を満たす最小の整数を返す", () => {
    expect(findMinInteger((n) => n * 3, 10, 0, 100)).toBe(4);
    expect(findMinInteger((n) => n, 0, 0, 10)).toBe(0);
    expect(findMinInteger((n) => n, 11, 0, 10)).toBeNull();
  });
});

describe("projectInput", () => {
  it("自費施術件数は延べ来院数に比例して増減する", () => {
    const p = projectInput(DEFAULT_INPUT, { karteCount: 200 });
    expect(p.basic.karteCount).toBe(200);
    expect(p.self.treatmentCount).toBe(200); // 100件/500回 → 1000回なら200件
    expect(p.self.productSales).toBe(DEFAULT_INPUT.self.productSales); // 固定売上は変えない
  });

  it("元の入力を変更しない", () => {
    const base = cloneInput(DEFAULT_INPUT);
    projectInput(base, { karteCount: 999, acuRate: 10 });
    expect(base).toEqual(DEFAULT_INPUT);
  });

  it("変更なしなら売上は現状と一致する（柔整直接入力でも）", () => {
    const base = make((i) => { i.judo.useManualCount = true; i.judo.manualCount = 437; });
    expect(calculate(projectInput(base, {})).totalSales).toBe(calculate(base).totalSales);
  });
});

describe("reverseCalculate", () => {
  const r = reverseCalculate(DEFAULT_INPUT);

  it("必要カルテ数は目標を満たす最小の整数", () => {
    const k = r.requiredKarte!;
    expect(k).not.toBeNull();
    const salesAt = (n: number) => calculate(projectInput(DEFAULT_INPUT, { karteCount: n })).totalSales;
    expect(salesAt(k)).toBeGreaterThanOrEqual(4_000_000);
    expect(salesAt(k - 1)).toBeLessThan(4_000_000);
    expect(k).toBe(195); // 1枚あたり20,550円 → 4,000,000 / 20,550 = 194.6…
    expect(r.additionalKarte).toBe(95);
    expect(r.requiredVisits).toBe(975);
    expect(r.requiredVisitsPerDay).toBe(39);
  });

  it("単純な割り算で出る値と違っても、探索結果が正しい（端数で差が出るケース）", () => {
    // 来院回数 4.3回・率に端数 → 単純割り算は丸め誤差でずれる
    const base = make((i) => {
      i.basic.visitsPerKarte = 4.3;
      i.acu.rate = 37;
      i.acu.oneRate = 45;
      i.self.emsRate = 17;
      i.self.productSales = 50_000;
      i.basic.targetSales = 3_333_333;
    });
    const rr = reverseCalculate(base);
    const k = rr.requiredKarte!;
    const salesAt = (n: number) => calculate(projectInput(base, { karteCount: n })).totalSales;
    expect(salesAt(k)).toBeGreaterThanOrEqual(3_333_333);
    expect(salesAt(k - 1)).toBeLessThan(3_333_333);
  });

  it("スタッフ1人あたり必要売上・現状との差", () => {
    expect(r.requiredSalesPerStaff).toBe(1_000_000);
    expect(r.gap).toBe(1_945_000);
    expect(r.fixedSales).toBe(0);
  });

  it("固定売上だけで目標を超えるならカルテ0枚", () => {
    const base = make((i) => { i.self.productSales = 5_000_000; });
    expect(reverseCalculate(base).requiredKarte).toBe(0);
  });

  it("連動売上が0なら達成不可（null）", () => {
    const base = make((i) => {
      i.judo.rate = 0; i.acu.rate = 0; i.self.treatmentCount = 0; i.self.emsRate = 0;
    });
    const rr = reverseCalculate(base);
    expect(rr.requiredKarte).toBeNull();
    expect(rr.cases.find((c) => c.key === "karte")!.achievable).toBe(false);
  });

  it("4つの改善ケースがそれぞれ最小値を返す", () => {
    const visits = r.cases.find((c) => c.key === "visits")!;
    expect(visits.required).toBe(9.8); // 100枚×9.8回=980回
    const atVisits = (v: number) => calculate(projectInput(DEFAULT_INPUT, { visitsPerKarte: v })).totalSales;
    expect(atVisits(9.8)).toBeGreaterThanOrEqual(4_000_000);
    expect(atVisits(9.7)).toBeLessThan(4_000_000);

    const acu = r.cases.find((c) => c.key === "acuRate")!;
    expect(acu.achievable).toBe(false); // 100%でも 2,055,000 + 370,000 で届かない
    expect(acu.required).toBeNull();

    const price = r.cases.find((c) => c.key === "selfPrice")!;
    // 不足 1,945,000円 ÷ 100件 = 19,450円 の上乗せ → 21,450円
    expect(price.required).toBe(21_450);
    expect(price.resultingSales).toBe(4_000_000);
  });

  it("ゼロ入力でも例外を出さない", () => {
    const base = make((i) => {
      i.basic = { karteCount: 0, visitsPerKarte: 0, workingDays: 0, staffCount: 0, targetSales: 0 };
    });
    const rr = reverseCalculate(base);
    expect(rr.requiredKarte).toBe(0);
    expect(rr.requiredSalesPerStaff).toBeNull();
    expect(rr.requiredVisitsPerDay).toBeNull();
  });
});
