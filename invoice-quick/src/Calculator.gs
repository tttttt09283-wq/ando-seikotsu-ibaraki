/**
 * Calculator.gs
 * 金額計算ロジック（純粋関数のみ）。
 * Google のサービスに一切依存しないため、tests/calculator.test.js から Node.js で検証できます。
 *
 * ■ 計算ルール
 *  1. 明細金額 = 数量 × 単価（税抜）。1円未満は「端数処理」設定に従って丸める
 *  2. 税率（10% / 8% / 0%）ごとに明細金額を合計する
 *  3. 消費税 = 税率ごとの合計 × 税率。端数処理は「税率ごとに1回だけ」行う
 *     （適格請求書の端数処理ルール。明細ごとに丸めて合算することはしない）
 *  4. 合計（税込）= 小計（税抜）+ 消費税合計
 *  5. 源泉徴収（任意）= 小計（税抜）× 10.21%（100万円超の部分は 20.42%）。1円未満切り捨て
 *  6. ご請求金額 = 合計（税込）− 源泉徴収税額
 *
 * ■ 精度
 *  浮動小数点の誤差（例：0.1 × 30 = 3.0000000000000004）を避けるため、
 *  数量・単価を 10^4 倍した整数（BigInt）で計算します。小数は4桁まで対応。
 *
 * ■ マイナス金額（値引き行）
 *  端数処理は絶対値に対して行い、符号を戻します（切り捨て＝0方向、切り上げ＝0から遠ざかる方向）。
 */

const CALC_ROUNDING = Object.freeze({ FLOOR: 'floor', ROUND: 'round', CEIL: 'ceil' });
const CALC_TAX_RATES = Object.freeze([10, 8, 0]);
const CALC_DEFAULT_TAX_RATE = 10;
const CALC_SCALE = 10000; // 小数4桁
const CALC_LIMITS = Object.freeze({
  MAX_QUANTITY: 1000000,       // 数量の上限（絶対値）
  MAX_UNIT_PRICE: 1000000000,  // 単価の上限（絶対値・10億円）
  MAX_DECIMALS: 4,
  MAX_TOTAL: 1000000000000,    // 合計の上限（1兆円）
});
const CALC_WITHHOLDING = Object.freeze({
  THRESHOLD: 1000000,     // 100万円
  RATE_LOW: 1021,         // 10.21% = 1021 / 10000
  RATE_HIGH: 2042,        // 20.42%
  BASE_HIGH: 102100,      // 100万円 × 10.21%
});

/**
 * 端数処理の設定値（日本語ラベル等）を内部コードに変換する。
 * 空欄は「切り捨て」、解釈できない値は null。
 */
function normalizeRoundingMode(value) {
  const s = String(value == null ? '' : value).trim().toLowerCase();
  if (s === '') return CALC_ROUNDING.FLOOR;
  if (['切り捨て', '切捨て', '切捨', 'floor', 'truncate', 'down'].indexOf(s) >= 0) return CALC_ROUNDING.FLOOR;
  if (['四捨五入', 'round', 'half_up'].indexOf(s) >= 0) return CALC_ROUNDING.ROUND;
  if (['切り上げ', '切上げ', '切上', 'ceil', 'up'].indexOf(s) >= 0) return CALC_ROUNDING.CEIL;
  return null;
}

/**
 * 税率の入力値を 10 / 8 / 0 に正規化する。
 * 受け付ける形式：10, "10", "10%", "１０％", 0.1, 0.08 など
 * @return {number|null} 空欄は null、不正な値は NaN
 */
function normalizeTaxRate(value) {
  if (value === null || value === undefined) return null;
  let n;
  if (typeof value === 'number') {
    n = value;
  } else {
    const s = String(value)
      .replace(/[０-９．]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
      .replace(/[%％\s　]/g, '');
    if (s === '') return null;
    if (!/^\d+(\.\d+)?$/.test(s)) return NaN;
    n = Number(s);
  }
  if (!isFinite(n)) return NaN;
  if (n > 0 && n < 1) n = Math.round(n * 1000) / 10; // 0.1 → 10, 0.08 → 8（パーセント書式のセル対策）
  return CALC_TAX_RATES.indexOf(n) >= 0 ? n : NaN;
}

/** 小数が maxDecimals 桁以内か */
function hasAtMostDecimals(value, maxDecimals) {
  const n = Number(value);
  if (!isFinite(n)) return false;
  const factor = Math.pow(10, maxDecimals == null ? CALC_LIMITS.MAX_DECIMALS : maxDecimals);
  const scaled = n * factor;
  const tolerance = Math.max(1e-9, Math.abs(scaled) * 1e-14);
  return Math.abs(scaled - Math.round(scaled)) <= tolerance;
}

/** 数値を 10^4 倍した BigInt に変換する（小数4桁までが前提） */
function toScaledBigInt_(value) {
  const n = Number(value);
  if (!isFinite(n)) throw new Error('CALC_INVALID_NUMBER');
  return BigInt(Math.round(n * CALC_SCALE));
}

/**
 * 整数の割り算を指定の端数処理で丸める（絶対値で処理し符号を戻す）。
 * @param {bigint} numerator
 * @param {bigint} denominator 正の整数
 * @param {string} mode CALC_ROUNDING の値
 * @return {number}
 */
function divideAndRound(numerator, denominator, mode) {
  const zero = BigInt(0);
  const one = BigInt(1);
  const two = BigInt(2);
  if (denominator <= zero) throw new Error('CALC_INVALID_DENOMINATOR');
  const negative = numerator < zero;
  const abs = negative ? -numerator : numerator;
  let q = abs / denominator;
  const r = abs % denominator;
  if (r !== zero) {
    if (mode === CALC_ROUNDING.CEIL) q += one;
    else if (mode === CALC_ROUNDING.ROUND && r * two >= denominator) q += one;
  }
  const result = Number(negative ? -q : q);
  return result === 0 ? 0 : result; // -0 を 0 に
}

function requireMode_(mode) {
  const m = normalizeRoundingMode(mode);
  if (!m) throw new Error('CALC_INVALID_ROUNDING_MODE');
  return m;
}

/**
 * 明細金額（税抜・円）を計算する。
 * @param {number} quantity 数量（小数4桁まで）
 * @param {number} unitPrice 単価（税抜・小数4桁まで）
 * @param {string} mode 端数処理
 */
function calcLineAmount(quantity, unitPrice, mode) {
  const m = requireMode_(mode);
  const product = toScaledBigInt_(quantity) * toScaledBigInt_(unitPrice);
  const scale = BigInt(CALC_SCALE) * BigInt(CALC_SCALE);
  return divideAndRound(product, scale, m);
}

/**
 * 税率ごとの消費税額を計算する（端数処理はここで1回だけ）。
 * @param {number} base 税率ごとの対象額（税抜・整数）
 * @param {number} rate 10 / 8 / 0
 * @param {string} mode 端数処理
 */
function calcTax(base, rate, mode) {
  const m = requireMode_(mode);
  if (!Number.isInteger(base)) throw new Error('CALC_BASE_NOT_INTEGER');
  if (CALC_TAX_RATES.indexOf(rate) < 0) throw new Error('CALC_INVALID_TAX_RATE');
  if (rate === 0) return 0;
  return divideAndRound(BigInt(base) * BigInt(rate), BigInt(100), m);
}

/**
 * 源泉徴収税額（報酬・料金等）を計算する。1円未満は切り捨て。
 *   100万円以下：支払金額 × 10.21%
 *   100万円超  ：(支払金額 − 100万円) × 20.42% + 102,100円
 * @param {number} base 源泉徴収の対象額（税抜・整数）
 */
function calcWithholding(base) {
  if (!Number.isInteger(base)) throw new Error('CALC_BASE_NOT_INTEGER');
  if (base <= 0) return 0;
  const b = BigInt(base);
  const denom = BigInt(10000);
  if (base <= CALC_WITHHOLDING.THRESHOLD) {
    return Number((b * BigInt(CALC_WITHHOLDING.RATE_LOW)) / denom);
  }
  const over = b - BigInt(CALC_WITHHOLDING.THRESHOLD);
  return Number((over * BigInt(CALC_WITHHOLDING.RATE_HIGH)) / denom) + CALC_WITHHOLDING.BASE_HIGH;
}

/**
 * 書類全体の金額を計算する。
 * @param {Array<{name:string, quantity:number, unitPrice:number, taxRate:*, note:string}>} items
 * @param {{roundingMode:string, withholding:boolean}} options
 * @return {{
 *   roundingMode:string,
 *   lines:Array<Object>,
 *   groups:Object<number,{rate:number, base:number, tax:number, count:number}>,
 *   subtotal:number, taxTotal:number, total:number,
 *   withholding:number, billingAmount:number, hasReducedRate:boolean
 * }}
 */
function calculateDocument(items, options) {
  const opts = options || {};
  const mode = requireMode_(opts.roundingMode);
  const groups = {};
  CALC_TAX_RATES.forEach((r) => { groups[r] = { rate: r, base: 0, tax: 0, count: 0 }; });

  const lines = (items || []).map((item, i) => {
    let rate = normalizeTaxRate(item.taxRate);
    if (rate === null) rate = CALC_DEFAULT_TAX_RATE;
    if (CALC_TAX_RATES.indexOf(rate) < 0) throw new Error('CALC_INVALID_TAX_RATE');
    const amount = calcLineAmount(item.quantity, item.unitPrice, mode);
    groups[rate].base += amount;
    groups[rate].count += 1;
    return Object.assign({}, item, { index: i + 1, taxRate: rate, amount: amount });
  });

  let subtotal = 0;
  let taxTotal = 0;
  CALC_TAX_RATES.forEach((r) => {
    const g = groups[r];
    g.tax = calcTax(g.base, r, mode);
    subtotal += g.base;
    taxTotal += g.tax;
  });

  const total = subtotal + taxTotal;
  if (!Number.isSafeInteger(total)) throw new Error('CALC_OVERFLOW');
  const withholding = opts.withholding ? calcWithholding(subtotal) : 0;

  return {
    roundingMode: mode,
    lines: lines,
    groups: groups,
    subtotal: subtotal,
    taxTotal: taxTotal,
    total: total,
    withholding: withholding,
    billingAmount: total - withholding,
    hasReducedRate: groups[8].count > 0,
  };
}

/**
 * 計算結果の整合性セルフチェック（PDF 作成前に必ず実行）。
 * 明細合計・税率別合計・総額・源泉徴収の関係がすべて一致するか検証する。
 * @return {string[]} 不整合の内容（空配列なら OK）
 */
function checkCalculationIntegrity(result) {
  const problems = [];
  const lineSum = result.lines.reduce((s, l) => s + l.amount, 0);
  let baseSum = 0;
  let taxSum = 0;
  let countSum = 0;
  CALC_TAX_RATES.forEach((r) => {
    const g = result.groups[r];
    const expectedBase = result.lines.filter((l) => l.taxRate === r).reduce((s, l) => s + l.amount, 0);
    if (g.base !== expectedBase) problems.push(r + '%対象額が明細の合計と一致しません');
    if (g.tax !== calcTax(g.base, r, result.roundingMode)) problems.push(r + '%の消費税額が再計算結果と一致しません');
    baseSum += g.base;
    taxSum += g.tax;
    countSum += g.count;
  });
  if (countSum !== result.lines.length) problems.push('税率別の明細件数が一致しません');
  if (lineSum !== result.subtotal || baseSum !== result.subtotal) problems.push('小計が一致しません');
  if (taxSum !== result.taxTotal) problems.push('消費税合計が一致しません');
  if (result.subtotal + result.taxTotal !== result.total) problems.push('合計（税込）が一致しません');
  if (result.total - result.withholding !== result.billingAmount) problems.push('ご請求金額が一致しません');
  [result.subtotal, result.taxTotal, result.total, result.withholding, result.billingAmount].forEach((v) => {
    if (!Number.isSafeInteger(v)) problems.push('金額が整数ではありません');
  });
  return problems;
}

if (typeof module !== 'undefined' && module.exports) {
  Object.assign(module.exports, {
    CALC_ROUNDING, CALC_TAX_RATES, CALC_LIMITS, CALC_DEFAULT_TAX_RATE,
    normalizeRoundingMode, normalizeTaxRate, hasAtMostDecimals, divideAndRound,
    calcLineAmount, calcTax, calcWithholding, calculateDocument, checkCalculationIntegrity,
  });
}
