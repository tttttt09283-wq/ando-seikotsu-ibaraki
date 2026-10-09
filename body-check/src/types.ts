/**
 * アプリ全体で使う「データの形」の定義
 * （TypeScript の「型」：データにどんな値が入るかを決めておくことで、書き間違いを防ぎます）
 */

export type CheckId = "balance" | "legs" | "flexibility" | "shoulder" | "condition";

export type AgeGroupId = "10s" | "20s" | "30s" | "40s" | "50s" | "60s" | "70plus";

export type SymptomId =
  | "neck_shoulder"
  | "low_back"
  | "knee_hip"
  | "posture"
  | "headache_eye"
  | "sports"
  | "pelvis_postpartum"
  | "ingrown_nail"
  | "other"
  | "none";

/** 各チェックの回答。「回答した」か「スキップした」かを必ず区別します */
export type CheckAnswer<T> = { status: "answered"; value: T } | { status: "skipped" };

export interface BalanceValue {
  /** 左足の結果（片側だけ実施した場合は null） */
  left: string | null;
  right: string | null;
}

/** コンディション質問への回答（質問ID → 選択肢ID） */
export type ConditionValue = Record<string, string>;

export interface Answers {
  balance?: CheckAnswer<BalanceValue>;
  legs?: CheckAnswer<number>;
  flexibility?: CheckAnswer<string>;
  shoulder?: CheckAnswer<string>;
  condition?: CheckAnswer<ConditionValue>;
}

export interface Profile {
  ageGroup: AgeGroupId | null;
  symptoms: SymptomId[];
}

export type RankId = "S" | "A" | "B" | "C";

export interface CheckScore {
  id: CheckId;
  /** 0〜20点。スキップ・未回答の場合は null（0点扱いにしない） */
  score: number | null;
  /** 画面に表示する回答内容の要約 */
  summary: string;
}

export interface ScoreResult {
  items: CheckScore[];
  /** 回答済み項目だけで100点換算した総合スコア。回答が0件なら null */
  total: number | null;
  rank: RankId | null;
  answeredCount: number;
  /** 回答数が少なく、参考情報が不足しているか */
  insufficient: boolean;
  /** 得意な項目（点数の高い順） */
  strengths: CheckId[];
  /** 改善の余地がある項目（点数の低い順） */
  improvements: CheckId[];
  /** 痛みに関する回答があるか（セルフケアの出し方を慎重にするため） */
  painFlags: { shoulderPain: boolean; dailyPainOften: boolean };
}
