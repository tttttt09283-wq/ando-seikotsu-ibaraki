import type { SimInput } from "./types";

/**
 * 端数処理ルール（全体で統一）
 * - 回数・件数は「四捨五入」で整数にする（roundCount）。
 * - 浮動小数点の誤差（例: 4.999999999 → 5 にならない）を避けるため、ごく小さな補正値を足してから丸める。
 * - 金額は「件数（整数）× 単価（整数円）」で計算するため、常に整数円になる。
 */
const EPS = 1e-9;

export function roundCount(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.floor(value + 0.5 + EPS);
}

/** 文字列・空欄・NaN・負数を安全な数値に変換する */
export function toSafeNumber(value: unknown, fallback = 0): number {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "string") {
    const normalized = value
      .replace(/[０-９．]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
      .replace(/[,，\s円人回枚件日%％]/g, "");
    if (normalized === "") return fallback;
    value = Number(normalized);
  }
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return value;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** 0以上の数値（上限なし） */
export function nonNegative(value: unknown): number {
  return Math.max(0, toSafeNumber(value));
}

/** 0以上の整数（金額・件数・人数など） */
export function nonNegativeInt(value: unknown): number {
  return Math.round(nonNegative(value));
}

/** 0〜100% に制限した率（小数第1位まで） */
export function percent(value: unknown): number {
  return Math.round(clamp(toSafeNumber(value), 0, 100) * 10) / 10;
}

/** 小数第1位までの0以上の数値（平均来院回数など） */
export function nonNegativeOneDecimal(value: unknown): number {
  return Math.round(nonNegative(value) * 10) / 10;
}

/**
 * 入力全体を安全な値に正規化する。
 * localStorage から読んだ古い/壊れたデータにも使えるよう、欠けた項目は fallback で補う。
 */
export function sanitizeInput(raw: unknown, fallback: SimInput): SimInput {
  const r = (raw ?? {}) as Partial<Record<keyof SimInput, Record<string, unknown>>>;
  const b = r.basic ?? {};
  const j = r.judo ?? {};
  const a = (r.acu ?? {}) as Record<string, unknown>;
  const s = r.self ?? {};
  const aOne = (a.one ?? {}) as Record<string, unknown>;
  const aTwo = (a.two ?? {}) as Record<string, unknown>;

  const pick = (v: unknown, fb: number) => (v === undefined ? fb : v);

  return {
    basic: {
      karteCount: nonNegativeInt(pick(b.karteCount, fallback.basic.karteCount)),
      visitsPerKarte: nonNegativeOneDecimal(pick(b.visitsPerKarte, fallback.basic.visitsPerKarte)),
      workingDays: clamp(nonNegativeInt(pick(b.workingDays, fallback.basic.workingDays)), 0, 31),
      staffCount: nonNegativeInt(pick(b.staffCount, fallback.basic.staffCount)),
      targetSales: nonNegativeInt(pick(b.targetSales, fallback.basic.targetSales)),
    },
    judo: {
      rate: percent(pick(j.rate, fallback.judo.rate)),
      useManualCount:
        typeof j.useManualCount === "boolean" ? j.useManualCount : fallback.judo.useManualCount,
      manualCount: nonNegativeInt(pick(j.manualCount, fallback.judo.manualCount)),
      copay: nonNegativeInt(pick(j.copay, fallback.judo.copay)),
      claim: nonNegativeInt(pick(j.claim, fallback.judo.claim)),
    },
    acu: {
      rate: percent(pick(a.rate, fallback.acu.rate)),
      oneRate: percent(pick(a.oneRate, fallback.acu.oneRate)),
      one: {
        copay: nonNegativeInt(pick(aOne.copay, fallback.acu.one.copay)),
        claim: nonNegativeInt(pick(aOne.claim, fallback.acu.one.claim)),
      },
      two: {
        copay: nonNegativeInt(pick(aTwo.copay, fallback.acu.two.copay)),
        claim: nonNegativeInt(pick(aTwo.claim, fallback.acu.two.claim)),
      },
    },
    self: {
      treatmentCount: nonNegativeInt(pick(s.treatmentCount, fallback.self.treatmentCount)),
      treatmentPrice: nonNegativeInt(pick(s.treatmentPrice, fallback.self.treatmentPrice)),
      emsRate: percent(pick(s.emsRate, fallback.self.emsRate)),
      emsPrice: nonNegativeInt(pick(s.emsPrice, fallback.self.emsPrice)),
      productSales: nonNegativeInt(pick(s.productSales, fallback.self.productSales)),
      otherSales: nonNegativeInt(pick(s.otherSales, fallback.self.otherSales)),
    },
  };
}
