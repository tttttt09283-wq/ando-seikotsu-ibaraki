/**
 * 学習記録の型と保存層のインターフェース。
 * 画面は LearningRepository だけに依存するため、localStorage → Supabase への切り替えは
 * src/lib/repository/index.ts の差し替えだけで済む構成にしている。
 */

export interface LessonProgress {
  /** 現在のステップ（0:解説 1:図解 2:臨床例 3:小テスト 4:復習） */
  stepIndex: number;
  status: "in-progress" | "completed";
  startedAt: string;
  completedAt?: string;
  updatedAt: string;
}

export interface QuestionResult {
  questionId: string;
  correct: boolean;
  topic: string;
  pointCodes?: string[];
}

export interface QuizAttempt {
  id: string;
  lessonId: string;
  at: string;
  score: number;
  total: number;
  results: QuestionResult[];
}

export interface CaseAttempt {
  id: string;
  caseId: string;
  at: string;
  score: number;
  total: number;
}

export type ReviewItemType = "question" | "lesson";

export interface ReviewItem {
  id: string;
  type: ReviewItemType;
  refId: string;
  lessonId: string;
  label: string;
  /** 間隔反復の箱（0〜4） */
  box: number;
  /** 次回の復習日 YYYY-MM-DD */
  due: string;
  lastReviewed?: string;
  lapses: number;
}

export interface LearningState {
  version: 1;
  lessons: Record<string, LessonProgress>;
  quizAttempts: QuizAttempt[];
  caseAttempts: CaseAttempt[];
  /** 日付(YYYY-MM-DD) → 学習秒数 */
  studyLog: Record<string, number>;
  favorites: string[];
  reviewItems: Record<string, ReviewItem>;
  lastVisited?: { lessonId: string; at: string };
}

export const emptyState = (): LearningState => ({
  version: 1,
  lessons: {},
  quizAttempts: [],
  caseAttempts: [],
  studyLog: {},
  favorites: [],
  reviewItems: {},
});

export interface LearningRepository {
  /** 保存先の名前（画面表示用） */
  readonly label: string;
  load(): Promise<LearningState>;
  save(state: LearningState): Promise<void>;
  clear(): Promise<void>;
}
