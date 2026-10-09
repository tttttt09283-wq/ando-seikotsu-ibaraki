/**
 * ===== チェック項目と採点基準の設定ファイル =====
 *
 * ★ 採点基準を変えたいときは、このファイルの points（点数）や min（下限値）を書き換えてください。
 *   画面のプログラムを触らなくても、採点に反映されます。
 *
 * 【重要】ここで設定している採点基準は、医学的に検証されたものではありません。
 *   「あんど式」独自の仮の参考指標です。年齢別の基準などは、将来、信頼できる研究データを
 *   参照して見直す前提です。根拠のない「身体年齢」の算出は行いません。
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

export const CHECK_ORDER: CheckId[] = ["balance", "legs", "flexibility", "shoulder", "condition"];

export const CHECK_META: Record<
  CheckId,
  { number: number; title: string; shortName: string; resultName: string; emoji: string }
> = {
  balance: { number: 1, title: "バランス", shortName: "バランス", resultName: "バランス", emoji: "🦩" },
  legs: { number: 2, title: "下半身の筋持久力", shortName: "下半身", resultName: "下半身の筋持久力", emoji: "🪑" },
  flexibility: { number: 3, title: "柔軟性", shortName: "柔軟性", resultName: "柔軟性", emoji: "🙇" },
  shoulder: { number: 4, title: "肩の動き", shortName: "肩の動き", resultName: "肩の動き", emoji: "🙌" },
  condition: { number: 5, title: "身体のコンディション", shortName: "コンディション", resultName: "身体のコンディション", emoji: "🌤️" },
};

// ---------- CHECK 1：バランス（片足立ち） ----------
// 左右それぞれの得点の平均をこの項目の得点にします（片側のみ回答した場合はその側の得点）。

export const BALANCE_OPTIONS: ChoiceOption[] = [
  { id: "lt5", label: "5秒未満", points: 4 },
  { id: "5to9", label: "5〜9秒", points: 8 },
  { id: "10to19", label: "10〜19秒", points: 12 },
  { id: "20to29", label: "20〜29秒", points: 16 },
  { id: "30plus", label: "30秒以上", points: 20 },
];

/** ストップウォッチで計った秒数から選択肢を自動で選ぶための下限秒数 */
export const BALANCE_MIN_SECONDS: Record<string, number> = {
  lt5: 0,
  "5to9": 5,
  "10to19": 10,
  "20to29": 20,
  "30plus": 30,
};

// ---------- CHECK 2：下半身（30秒椅子立ち上がり） ----------

export const LEGS_INPUT = { min: 0, max: 50, durationSeconds: 30 } as const;

/** 回数が min 以上なら points 点（上から順に判定） */
export const LEGS_THRESHOLDS: { min: number; points: number }[] = [
  { min: 25, points: 20 },
  { min: 20, points: 16 },
  { min: 15, points: 12 },
  { min: 10, points: 8 },
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

// ---------- CHECK 4：肩の動き（両腕上げ） ----------

export const SHOULDER_PAIN_OPTION_ID = "pain";

export const SHOULDER_OPTIONS: ChoiceOption[] = [
  { id: "smooth", label: "左右ともスムーズに上がる", points: 20 },
  { id: "asymmetry", label: "左右差がある", points: 12 },
  { id: "stiff", label: "上げにくさがある", points: 8 },
  { id: SHOULDER_PAIN_OPTION_ID, label: "痛みがある", points: 4 },
];

// ---------- CHECK 5：身体のコンディション ----------
// 5問の合計（各4点 × 5問 = 20点満点）

export const CONDITION_PAIN_QUESTION_ID = "q1";
export const CONDITION_OFTEN_OPTION_ID = "often";

export const CONDITION_QUESTIONS: { id: string; text: string }[] = [
  { id: CONDITION_PAIN_QUESTION_ID, text: "日常生活で身体に痛みがありますか？" },
  { id: "q2", text: "朝起きたとき身体が重いですか？" },
  { id: "q3", text: "長時間同じ姿勢でいるとつらいですか？" },
  { id: "q4", text: "運動不足を感じていますか？" },
  { id: "q5", text: "身体の動きに不安がありますか？" },
];

export const CONDITION_OPTIONS: ChoiceOption[] = [
  { id: "rarely", label: "ほとんどない", points: 4 },
  { id: "sometimes", label: "ときどきある", points: 2 },
  { id: CONDITION_OFTEN_OPTION_ID, label: "よくある", points: 0 },
];
