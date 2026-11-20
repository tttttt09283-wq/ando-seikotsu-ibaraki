/**
 * 整骨院 総売上シミュレーターの入力・出力の型。
 * 率（rate）はすべて「%」（0〜100）で保持する。
 */

export interface BasicInput {
  /** 稼働カルテ数（枚） */
  karteCount: number;
  /** 1カルテあたり月間平均来院回数（回） */
  visitsPerKarte: number;
  /** 診療日数（日） */
  workingDays: number;
  /** スタッフ人数（人） */
  staffCount: number;
  /** 月間目標売上（円） */
  targetSales: number;
}

export interface JudoInput {
  /** 柔整保険対応率（%） */
  rate: number;
  /** true の場合、延べ対応数を直接入力値（manualCount）で上書きする */
  useManualCount: boolean;
  /** 直接入力時の柔整保険延べ対応数（回） */
  manualCount: number;
  /** 1対応あたり平均窓口負担額（円） */
  copay: number;
  /** 1対応あたり平均保険者請求額（円） */
  claim: number;
}

export interface UnitPrice {
  /** 平均窓口負担額（円） */
  copay: number;
  /** 平均保険者請求額（円） */
  claim: number;
}

export interface AcuInput {
  /** 鍼灸保険対応率（%） */
  rate: number;
  /** 1術対応率（%）。2術対応率は 100 - oneRate */
  oneRate: number;
  one: UnitPrice;
  two: UnitPrice;
}

export interface SelfInput {
  /** 自費施術延べ件数（件） */
  treatmentCount: number;
  /** 自費施術平均単価（円） */
  treatmentPrice: number;
  /** EMS利用率（%）＝ EMS利用件数 ÷ 延べ来院数 */
  emsRate: number;
  /** EMS平均単価（円） */
  emsPrice: number;
  /** 物販売上（円・固定） */
  productSales: number;
  /** その他売上（円・固定） */
  otherSales: number;
}

export interface SimInput {
  basic: BasicInput;
  judo: JudoInput;
  acu: AcuInput;
  self: SelfInput;
}

export interface SimResult {
  /** 月間延べ来院数（回） */
  totalVisits: number;

  judo: {
    /** 実際に使われた対応率（%）。直接入力時は 件数÷来院数 */
    effectiveRate: number;
    count: number;
    copaySales: number;
    claimSales: number;
    total: number;
  };

  acu: {
    count: number;
    oneRate: number;
    twoRate: number;
    oneCount: number;
    twoCount: number;
    copaySales: number;
    claimSales: number;
    total: number;
  };

  self: {
    treatmentCount: number;
    treatmentSales: number;
    emsCount: number;
    emsSales: number;
    productSales: number;
    otherSales: number;
    /** 自費施術 + EMS + 物販 + その他 */
    total: number;
  };

  /** 保険売上合計（柔整 + 鍼灸） */
  insuranceTotal: number;
  /** 月間総売上 */
  totalSales: number;
  /** カルテ数に連動しない売上（物販・その他） */
  fixedSales: number;
  /** カルテ数（来院数）に連動する売上 */
  variableSales: number;

  /** 目標達成率（%）。目標0の場合は null */
  achievementRate: number | null;
  /** 目標までの不足金額（円）。達成済みなら 0 */
  shortfall: number;
  /** 目標超過額（円）。未達なら 0 */
  surplus: number;

  /** カルテ1枚あたり月間売上（円）。カルテ0なら null */
  salesPerKarte: number | null;
  /** 来院1回あたり売上（円）。来院0なら null */
  salesPerVisit: number | null;
  /** スタッフ1人あたり月間売上（円）。スタッフ0なら null */
  salesPerStaff: number | null;
  /** 1日あたり平均来院数（回）。診療日数0なら null */
  visitsPerDay: number | null;

  /** 入力に関する注意（計算は続行する） */
  warnings: string[];
}
