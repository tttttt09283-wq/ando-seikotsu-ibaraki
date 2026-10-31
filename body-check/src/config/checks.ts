/**
 * ===== チェック項目と採点基準の設定ファイル =====
 *
 * ★ 採点基準を変えたいときは、このファイルの points（点数）や min（下限値）を書き換えてください。
 *   画面のプログラムを触らなくても、採点に反映されます。
 *
 * 【重要】ここで設定している採点基準は、医学的に検証されたものではありません。
 *   「あんど式」独自の仮の参考指標です。
 *   姿勢・体幹年齢の基準（年代ごとの目安の値）は src/config/bodyAge.ts にあります。
 */
import type { AgeGroupId, CheckId, SymptomId } from "@/types";

/** 1項目あたりの満点 */
export const MAX_POINTS_PER_CHECK = 20;

export interface ChoiceOption {
  id: string;
  label: string;
  /** この選択肢の得点（0〜20） */
  points: number;
}

// ---------- 事前アンケート ----------

/** 実年齢の入力範囲 */
export const AGE_INPUT = { min: 10, max: 99 } as const;

/** 実年齢 → 年代（匿名統計用） */
export function ageGroupOf(age: number): AgeGroupId {
  if (age < 20) return "10s";
  if (age >= 70) return "70plus";
  return `${Math.floor(age / 10) * 10}s` as AgeGroupId;
}

export const AGE_GROUPS: { id: AgeGroupId; label: string }[] = [
  { id: "10s", label: "10代" },
  { id: "20s", label: "20代" },
  { id: "30s", label: "30代" },
  { id: "40s", label: "40代" },
  { id: "50s", label: "50代" },
  { id: "60s", label: "60代" },
  { id: "70plus", label: "70代以上" },
];

export const SYMPTOMS: { id: SymptomId; label: string }[] = [
  { id: "neck_shoulder", label: "首・肩こり" },
  { id: "low_back", label: "腰痛" },
  { id: "knee_hip", label: "膝・股関節" },
  { id: "posture", label: "姿勢" },
  { id: "headache_eye", label: "頭痛・眼精疲労" },
  { id: "sports", label: "スポーツによる痛み" },
  { id: "pelvis_postpartum", label: "骨盤・産後" },
  { id: "ingrown_nail", label: "巻き爪" },
  { id: "other", label: "その他" },
  { id: "none", label: "特になし" },
];

// ---------- 項目の表示名 ----------

export const CHECK_ORDER: CheckId[] = ["balance", "plank", "flexibility", "legs"];

export const CHECK_META: Record<
  CheckId,
  { number: number; title: string; shortName: string; resultName: string; emoji: string }
> = {
  balance: { number: 1, title: "バランス力（片足立ち）", shortName: "バランス力", resultName: "バランス力", emoji: "🦩" },
  plank: { number: 2, title: "体幹の強さ（プランク）", shortName: "体幹の強さ", resultName: "体幹の強さ", emoji: "💪" },
  flexibility: { number: 3, title: "柔軟性（前屈）", shortName: "柔軟性", resultName: "柔軟性", emoji: "🙇" },
  legs: { number: 4, title: "瞬発力（スクワット）", shortName: "瞬発力", resultName: "瞬発力", emoji: "🏃" },
};

// ---------- CHECK 1：バランス力（片足立ち・目を開けて） ----------
// 左右それぞれの得点の平均をこの項目の得点にします（片側のみ回答した場合はその側の得点）。

export const BALANCE_OPTIONS: ChoiceOption[] = [
  { id: "lt5", label: "5秒未満", points: 2 },
  { id: "5to9", label: "5〜9秒", points: 5 },
  { id: "10to19", label: "10〜19秒", points: 8 },
  { id: "20to29", label: "20〜29秒", points: 11 },
  { id: "30to44", label: "30〜44秒", points: 14 },
  { id: "45to59", label: "45〜59秒", points: 17 },
  { id: "60plus", label: "60秒キープできた", points: 20 },
];

/** ストップウォッチで計った秒数から選択肢を自動で選ぶための下限秒数 */
export const BALANCE_MIN_SECONDS: Record<string, number> = {
  lt5: 0,
  "5to9": 5,
  "10to19": 10,
  "20to29": 20,
  "30to44": 30,
  "45to59": 45,
  "60plus": 60,
};

/** 姿勢・体幹年齢の計算に使う、各選択肢の代表の秒数 */
export const BALANCE_SECONDS: Record<string, number> = {
  lt5: 3,
  "5to9": 7,
  "10to19": 15,
  "20to29": 25,
  "30to44": 37,
  "45to59": 52,
  "60plus": 60,
};

// ---------- CHECK 2：体幹の強さ（プランク） ----------

export const PLANK_INPUT = { min: 0, max: 300, stopwatchMax: 180 } as const;

/** 秒数が min 以上なら points 点（上から順に判定） */
export const PLANK_THRESHOLDS: { min: number; points: number }[] = [
  { min: 90, points: 20 },
  { min: 60, points: 16 },
  { min: 40, points: 12 },
  { min: 20, points: 8 },
  { min: 0, points: 4 },
];

// ---------- CHECK 3：柔軟性（前屈） ----------

export const FLEXIBILITY_OPTIONS: ChoiceOption[] = [
  { id: "palm", label: "床に手のひらがつく", points: 20 },
  { id: "fingertips", label: "指先が床につく", points: 16 },
  { id: "ankle", label: "足首付近まで届く", points: 12 },
  { id: "shin", label: "すね付近まで届く", points: 8 },
  { id: "knee", label: "膝付近までしか届かない", points: 4 },
];

/** 姿勢・体幹年齢の計算に使う、届いた位置の段階（大きいほどやわらかい） */
export const FLEXIBILITY_LEVEL: Record<string, number> = { palm: 5, fingertips: 4, ankle: 3, shin: 2, knee: 1 };

// ---------- CHECK 4：瞬発力（30秒スクワット・椅子を使って） ----------

export const LEGS_INPUT = { min: 0, max: 50, durationSeconds: 30 } as const;

/** 回数が min 以上なら points 点（上から順に判定） */
export const LEGS_THRESHOLDS: { min: number; points: number }[] = [
  { min: 25, points: 20 },
  { min: 20, points: 16 },
  { min: 15, points: 12 },
  { min: 10, points: 8 },
  { min: 0, points: 4 },
];
