import type { SimInput } from "./types";

/**
 * デモ用の初期値。
 * すべて仮の数値であり、実際の保険請求単価・算定額を示すものではない。
 */
export const DEFAULT_INPUT: SimInput = {
  basic: {
    karteCount: 100,
    visitsPerKarte: 5,
    workingDays: 25,
    staffCount: 4,
    targetSales: 4_000_000,
  },
  judo: {
    rate: 100,
    useManualCount: false,
    manualCount: 500,
    copay: 500,
    claim: 1_700,
  },
  acu: {
    rate: 60,
    oneRate: 30,
    one: { copay: 300, claim: 1_200 },
    two: { copay: 400, claim: 1_600 },
  },
  self: {
    treatmentCount: 100,
    treatmentPrice: 2_000,
    emsRate: 20,
    emsPrice: 2_000,
    productSales: 0,
    otherSales: 0,
  },
};

export function cloneInput(input: SimInput): SimInput {
  return {
    basic: { ...input.basic },
    judo: { ...input.judo },
    acu: { ...input.acu, one: { ...input.acu.one }, two: { ...input.acu.two } },
    self: { ...input.self },
  };
}
