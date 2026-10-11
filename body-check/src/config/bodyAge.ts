/**
 * ===== カラダ年齢（下半身の体力年齢）の基準データ =====
 *
 * 【出典】
 *   中谷敏昭ほか「30秒椅子立ち上がりテスト（CS-30テスト）成績の加齢変化と標準値の作成」
 *  臨床スポーツ医学 20(3): 349-355, 2003（日本人 n=1,469）
 *
 * 下の数値は、上記論文の性別・年齢階級別5段階評価表のうち「普通」の範囲（下限〜上限）です。
 * 「30秒間で何回立ち上がれたか」が、どの年代の「普通」の範囲に届いているかで年代を判定します。
 *
 * ※この判定は下半身の筋持久力に限った目安です。医学的な年齢・健康状態を示すものではありません。
 * ※数値を見直す場合は、原著論文の表と照らし合わせたうえで、ここを書き換えてください。
 */

export type SexId = "male" | "female" | "unspecified";

export const SEX_OPTIONS: { id: SexId; label: string }[] = [
  { id: "female", label: "女性" },
  { id: "male", label: "男性" },
  { id: "unspecified", label: "回答しない" },
];

export interface AgeBand {
  id: string;
  /** 結果画面に表示する名前（「◯◯レベル」の◯◯部分） */
  label: string;
  /** 「普通」の範囲（回）[下限, 上限] */
  male: [number, number];
  female: [number, number];
}

/** 若い年代から順に並べる（判定は上から順に行います） */
export const CS30_AGE_BANDS: AgeBand[] = [
  { id: "20s", label: "20代", male: [28, 32], female: [23, 28] },
  { id: "30s", label: "30代", male: [26, 30], female: [24, 28] },
  { id: "40s", label: "40代", male: [25, 29], female: [23, 27] },
  { id: "50s", label: "50代", male: [22, 27], female: [20, 24] },
  { id: "60-64", label: "60代前半", male: [20, 25], female: [19, 23] },
  { id: "65-69", label: "60代後半", male: [18, 21], female: [17, 21] },
  { id: "70-74", label: "70代前半", male: [16, 20], female: [15, 19] },
  { id: "75-79", label: "70代後半", male: [15, 17], female: [13, 17] },
  { id: "80plus", label: "80代以上", male: [14, 16], female: [13, 16] },
];

export const BODY_AGE_SOURCE =
  "中谷ら「30秒椅子立ち上がりテスト（CS-30テスト）成績の加齢変化と標準値の作成」臨床スポーツ医学 20(3), 2003";

/** 事前アンケートの年代 → 比較に使う年齢帯（10代は標準値がないため20代と比較） */
export const AGE_GROUP_TO_BANDS: Record<string, string[]> = {
  "10s": ["20s"],
  "20s": ["20s"],
  "30s": ["30s"],
  "40s": ["40s"],
  "50s": ["50s"],
  "60s": ["60-64", "65-69"],
  "70plus": ["70-74", "75-79", "80plus"],
};
