/**
 * ===== 結果の詳しい解説を組み立てる =====
 * 各チェックの点数からレベル（良好／まずまず／要チェック）を決め、文章を割り当てます。
 */
import { CHECK_META, SHOULDER_PAIN_OPTION_ID } from "@/config/checks";
import { ALL_GOOD_CONSULT, FEEDBACK, FEEDBACK_THRESHOLDS, type FeedbackLevel, type FeedbackText } from "@/config/feedback";
import type { Answers, CheckId, ScoreResult } from "@/types";

export function getFeedbackLevel(score: number): FeedbackLevel {
  if (score >= FEEDBACK_THRESHOLDS.good) return "good";
  if (score >= FEEDBACK_THRESHOLDS.fair) return "fair";
  return "low";
}

export interface ItemFeedback extends FeedbackText {
  id: CheckId;
  title: string;
  level: FeedbackLevel;
  score: number;
}

export interface DetailedFeedback {
  items: ItemFeedback[];
  /** 整骨院で確認できること（点数の低い順） */
  consultPoints: { id: CheckId; title: string; text: string }[];
  /** 全項目が良好のときに出す一文（それ以外は null） */
  allGoodMessage: string | null;
  /** 肩に痛みがあると回答した場合の追記 */
  painNote: string | null;
}

export function buildDetailedFeedback(result: ScoreResult, answers: Answers): DetailedFeedback {
  const items: ItemFeedback[] = result.items
    .filter((i): i is typeof i & { score: number } => i.score !== null)
    .map((i) => {
      const level = getFeedbackLevel(i.score);
      return { id: i.id, title: CHECK_META[i.id].title, level, score: i.score, ...FEEDBACK[i.id][level] };
    });

  const consultPoints = items
    .filter((i) => i.level !== "good" && i.clinic)
    .sort((a, b) => a.score - b.score)
    .map((i) => ({ id: i.id, title: i.title, text: i.clinic as string }));

  const shoulderPain = answers.shoulder?.status === "answered" && answers.shoulder.value === SHOULDER_PAIN_OPTION_ID;

  return {
    items,
    consultPoints,
    allGoodMessage: items.length > 0 && consultPoints.length === 0 ? ALL_GOOD_CONSULT : null,
    painNote: shoulderPain
      ? "肩に痛みがあるとのことでした。痛みが続く場合は、自己判断で動かし続けず、早めにご相談ください。"
      : null,
  };
}
