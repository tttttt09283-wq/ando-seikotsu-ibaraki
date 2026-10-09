/**
 * ===== 総合スコア・ランクの設定ファイル =====
 * ランクの境目や表示メッセージを変えたいときは、ここを書き換えてください。
 * ※ランクは独自スコアに基づくもので、疾病リスクや医学的な健康状態を判定するものではありません。
 */
import type { RankId } from "@/types";

export const SCORING_CONFIG = {
  /** この数より回答済み項目が少ないと「参考情報が不足しています」と表示（5項目中） */
  minAnsweredForReliable: 3,
  /** この点数（20点満点）以上を「得意な項目」とする */
  strengthMinPoints: 16,
  /** この点数（20点満点）以下を「改善の余地がある項目」とする */
  improvementMaxPoints: 12,
  /** 結果メッセージで名前を挙げる「改善の余地がある項目」の最大数 */
  maxImprovementsInMessage: 2,
} as const;

/** 上から順に判定。min 点以上ならそのランク */
export const RANKS: { id: RankId; min: number; title: string; message: string; color: string }[] = [
  { id: "S", min: 90, title: "Sランク", message: "素晴らしいコンディション！", color: "#f5b301" },
  { id: "A", min: 75, title: "Aランク", message: "いい感じ！この調子！", color: "#14a8b5" },
  { id: "B", min: 60, title: "Bランク", message: "まだまだ伸びしろあり！", color: "#3f7fd0" },
  { id: "C", min: 0, title: "Cランク", message: "身体を見直すチャンス！", color: "#1e3a5f" },
];
