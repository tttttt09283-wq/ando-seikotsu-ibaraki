/**
 * ===== カラダ年齢（下半身の体力年齢）の判定ロジック =====
 * 30秒椅子立ち上がりの回数を、日本人の性別・年代別標準値（src/config/bodyAge.ts）と比べて、
 * 「どの年代の『普通』の範囲に届いているか」を判定します。
 */
import { AGE_GROUP_TO_BANDS, CS30_AGE_BANDS, type AgeBand, type SexId } from "@/config/bodyAge";
import { isValidLegsCount } from "@/lib/scoring";
import type { AgeGroupId } from "@/types";

export type AgeComparison = "younger" | "same" | "older";

export interface BodyAgeResult {
  band: AgeBand;
  /** 若い順の何番目の年齢帯か（0 = 20代） */
  bandIndex: number;
  /** 最も高い年代（80代以上）の「普通」にも届かなかった場合 true */
  belowAllBands: boolean;
  /** 実年代との比較（年代が未回答なら null） */
  comparison: AgeComparison | null;
}

/** 性別ごとの「普通」の下限（回答しない場合は男女の平均） */
export function normalLowerBound(band: AgeBand, sex: SexId): number {
  if (sex === "male") return band.male[0];
  if (sex === "female") return band.female[0];
  return (band.male[0] + band.female[0]) / 2;
}

export function compareWithActualAge(bandIndex: number, ageGroup: AgeGroupId | null): AgeComparison | null {
  if (!ageGroup) return null;
  const ids = AGE_GROUP_TO_BANDS[ageGroup];
  if (!ids) return null;
  const indexes = ids.map((id) => CS30_AGE_BANDS.findIndex((b) => b.id === id)).filter((i) => i >= 0);
  if (indexes.length === 0) return null;
  if (bandIndex < Math.min(...indexes)) return "younger";
  if (bandIndex > Math.max(...indexes)) return "older";
  return "same";
}

/**
 * 回数から年代を判定する。若い年代から順に見て、「普通」の下限以上の回数がある最初の年代を返す。
 * 回数が不正、または性別が未回答（null）の場合は null。
 */
export function estimateBodyAge(count: number, sex: SexId | null, ageGroup: AgeGroupId | null): BodyAgeResult | null {
  if (!isValidLegsCount(count) || !sex) return null;
  let bandIndex = CS30_AGE_BANDS.findIndex((band) => count >= normalLowerBound(band, sex));
  const belowAllBands = bandIndex === -1;
  if (belowAllBands) bandIndex = CS30_AGE_BANDS.length - 1;
  return {
    band: CS30_AGE_BANDS[bandIndex],
    bandIndex,
    belowAllBands,
    comparison: compareWithActualAge(bandIndex, ageGroup),
  };
}

/** 実年代との比較メッセージ（不安をあおらない表現にする） */
export function bodyAgeMessage(result: BodyAgeResult): string {
  switch (result.comparison) {
    case "younger":
      return "実際の年代より若いレベル！この調子をキープしましょう。";
    case "same":
      return "年代相応のレベルです。セルフケアでさらに若々しさをめざしましょう。";
    case "older":
      return "伸びしろがあります！無理のない運動を続けると、変化を感じやすい項目です。";
    default:
      return "30秒椅子立ち上がりの回数を、日本人の年代別の標準値と比べた目安です。";
  }
}
