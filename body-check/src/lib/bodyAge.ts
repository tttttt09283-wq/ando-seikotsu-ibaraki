/**
 * ===== 姿勢・体幹年齢の判定ロジック =====
 * 4つのチェックの記録を、年齢ごとの目安の値（src/config/bodyAge.ts）と比べて
 * 「その記録は何歳の人のふつうの記録に近いか」を項目ごとに出し、平均を姿勢・体幹年齢にします。
 * スキップした項目は使いません（0点扱いにしない）。
 */
import { BALANCE_SECONDS, CHECK_ORDER, FLEXIBILITY_LEVEL } from "@/config/checks";
import { BODY_AGE_CURVES, BODY_AGE_RANGE, SAME_AGE_MARGIN, type AgeCurve, type SexId } from "@/config/bodyAge";
import { isValidLegsCount, isValidPlankSeconds } from "@/lib/scoring";
import type { Answers, CheckId } from "@/types";

export type AgeComparison = "younger" | "same" | "older";

export interface ItemAge {
  id: CheckId;
  age: number;
}

export interface BodyAgeResult {
  /** 姿勢・体幹年齢（歳） */
  age: number;
  /** 項目ごとの年齢（測った項目だけ。チェックの順） */
  items: ItemAge[];
  /** 実年齢との比較（実年齢が未入力なら null） */
  comparison: AgeComparison | null;
  /** 姿勢・体幹年齢 − 実年齢（実年齢が未入力なら null） */
  diff: number | null;
}

/** 性別に合わせた「年齢ごとのふつうの記録」（回答しない場合は男女の平均） */
export function curveValues(curve: AgeCurve, sex: SexId | null): number[] {
  if (sex === "male") return curve.male;
  if (sex === "female") return curve.female;
  return curve.male.map((m, i) => (m + curve.female[i]) / 2);
}

/**
 * 記録 → 年齢。記録が「ふつうの記録」の表のどこに入るかを見て、年齢を間で按分します。
 * いちばん若い年齢の記録以上なら下限、いちばん上の年齢の記録以下なら上限の年齢。
 */
export function ageForValue(curve: AgeCurve, sex: SexId | null, value: number): number {
  const ys = curveValues(curve, sex);
  const ages = curve.ages;
  if (value >= ys[0]) return ages[0];
  if (value <= ys[ys.length - 1]) return ages[ages.length - 1];
  for (let i = 0; i < ys.length - 1; i++) {
    const hi = ys[i];
    const lo = ys[i + 1];
    if (value <= hi && value > lo) return ages[i] + ((hi - value) / (hi - lo)) * (ages[i + 1] - ages[i]);
  }
  return ages[ages.length - 1];
}

function clampAge(age: number): number {
  return Math.round(Math.min(BODY_AGE_RANGE.max, Math.max(BODY_AGE_RANGE.min, age)));
}

/** 各チェックの回答を、年齢と比べられる数値（秒・回・段階）にする。測っていなければ null */
export function measuredValue(id: CheckId, answers: Answers): number | null {
  switch (id) {
    case "balance": {
      const a = answers.balance;
      if (a?.status !== "answered") return null;
      const secs = [a.value.left, a.value.right]
        .map((o) => (o ? BALANCE_SECONDS[o] : undefined))
        .filter((v): v is number => typeof v === "number");
      return secs.length ? secs.reduce((x, y) => x + y, 0) / secs.length : null;
    }
    case "plank": {
      const a = answers.plank;
      return a?.status === "answered" && isValidPlankSeconds(a.value) ? a.value : null;
    }
    case "flexibility": {
      const a = answers.flexibility;
      return a?.status === "answered" ? (FLEXIBILITY_LEVEL[a.value] ?? null) : null;
    }
    case "legs": {
      const a = answers.legs;
      return a?.status === "answered" && isValidLegsCount(a.value) ? a.value : null;
    }
  }
}

export function compareWithActualAge(bodyAge: number, actualAge: number | null): { comparison: AgeComparison | null; diff: number | null } {
  if (actualAge === null) return { comparison: null, diff: null };
  // 20歳未満の方は、20歳レベル（表の下限）に届いていれば「年齢相応」とみなす
  const base = Math.max(actualAge, BODY_AGE_RANGE.min);
  const diff = bodyAge - base;
  if (diff <= -SAME_AGE_MARGIN) return { comparison: "younger", diff };
  if (diff >= SAME_AGE_MARGIN) return { comparison: "older", diff };
  return { comparison: "same", diff };
}

/** 姿勢・体幹年齢を出す。1項目も測っていなければ null */
export function estimateBodyAge(answers: Answers, sex: SexId | null, actualAge: number | null): BodyAgeResult | null {
  const items: ItemAge[] = [];
  for (const id of CHECK_ORDER) {
    const v = measuredValue(id, answers);
    if (v === null) continue;
    items.push({ id, age: clampAge(ageForValue(BODY_AGE_CURVES[id], sex, v)) });
  }
  if (items.length === 0) return null;
  const age = clampAge(items.reduce((s, i) => s + i.age, 0) / items.length);
  return { age, items, ...compareWithActualAge(age, actualAge) };
}

/** 実年齢との比較メッセージ（不安をあおらない表現にする） */
export function bodyAgeMessage(result: BodyAgeResult): string {
  const d = Math.abs(result.diff ?? 0);
  switch (result.comparison) {
    case "younger":
      return `実年齢より${d}歳若い！この調子をキープしましょう。`;
    case "same":
      return "年齢相応のレベルです。セルフケアでさらに若々しさをめざしましょう。";
    case "older":
      return `実年齢より${d}歳上という結果に。伸びしろがあります！続けるほど変化を感じやすい項目です。`;
    default:
      return "4つのチェックの記録を、年齢ごとの目安と比べた結果です。";
  }
}
