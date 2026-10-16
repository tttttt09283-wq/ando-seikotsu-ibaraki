import type { ApprovalPolicyInput, ApprovalRecommendation } from "@/lib/tenant-types";

/**
 * 承認者の推奨ルール（ケースバイケース）。
 * 承認依頼はまず統括責任者（岩永）に届き、司令塔はここで決めた「推奨承認者と理由」を添える。
 * presidentRequired = true のものは代表 村上の決裁が必須（岩永は承認できず、代表へ回す・却下・修正依頼のみ）。
 */

/** これ以上の支払い・購入は代表の決裁を推奨（円） */
const PAYMENT_PRESIDENT_RECOMMENDED_JPY = 50_000;
/** これ以上の支払い・購入・予算変更は代表の決裁が必須（円） */
const PRESIDENT_REQUIRED_JPY = 300_000;
/** AI社員の追加で、月額がこれ以上なら代表の決裁を推奨（円） */
const NEW_AGENT_PRESIDENT_RECOMMENDED_JPY = 10_000;

const op = (reason: string): ApprovalRecommendation => ({ approver: "operator", presidentRequired: false, reason });
const pres = (reason: string, required = false): ApprovalRecommendation => ({
  approver: "president",
  presidentRequired: required,
  reason,
});

export function recommendApprover(input: ApprovalPolicyInput): ApprovalRecommendation {
  const cost = input.costJpy;

  // 機密情報（患者情報・スタッフ評価）を外へ出す・使うものは常に代表の決裁
  if (input.sensitive && input.category !== "staff_evaluation") {
    return pres("患者情報やスタッフ評価などの機密情報を含むため、代表の決裁が必要です。", true);
  }

  switch (input.category) {
    case "staff_evaluation":
      return pres(
        "スタッフの評価・クラスの確定は処遇とキャリアに直結し、確定後の変更はスタッフの信頼を損ないます。代表の決裁が必要です。",
        true,
      );
    case "contract":
      return pres("契約は会社として法的な責任を負うため、代表の決裁が必要です。", true);
    case "data_deletion":
      return pres("重要データの削除は取り消せないため、代表の決裁が必要です。", true);
    case "budget_change":
      return cost >= PRESIDENT_REQUIRED_JPY
        ? pres(`予算の変更額が${PRESIDENT_REQUIRED_JPY.toLocaleString("ja-JP")}円以上のため、代表の決裁が必要です。`, true)
        : pres("予算の変更は会社全体のお金の使い方に関わるため、代表の決裁を推奨します。");
    case "payment":
      if (cost >= PRESIDENT_REQUIRED_JPY) {
        return pres(`金額が${PRESIDENT_REQUIRED_JPY.toLocaleString("ja-JP")}円以上のため、代表の決裁が必要です。`, true);
      }
      return cost >= PAYMENT_PRESIDENT_RECOMMENDED_JPY
        ? pres(`金額が${PAYMENT_PRESIDENT_RECOMMENDED_JPY.toLocaleString("ja-JP")}円以上のため、代表の決裁を推奨します。`)
        : op("少額で、AI部門の予算内に収まるため、統括責任者の判断で問題ありません。");
    case "new_agent":
      return cost >= NEW_AGENT_PRESIDENT_RECOMMENDED_JPY
        ? pres(`月額の追加費用が${NEW_AGENT_PRESIDENT_RECOMMENDED_JPY.toLocaleString("ja-JP")}円以上になるため、代表の決裁を推奨します。`)
        : op("追加費用が小さく、AI部門の月間予算内に収まるため、統括責任者の判断で問題ありません。");
    case "customer_proposal":
      return input.corporate
        ? pres("法人（企業）への提案は会社の看板を背負う取引の入口になるため、代表の決裁を推奨します。")
        : op("個人のお客様向けの通常の案内で、費用も発生しないため、統括責任者の判断で問題ありません。");
    case "sns_post":
      return op("通常の発信で費用は発生しません。表現と個人情報の有無を確認のうえ、統括責任者の判断で問題ありません。");
    case "external_message":
      return op("通常の連絡で費用は発生しないため、統括責任者の判断で問題ありません。");
    case "external_write":
      return op("外部サービスへの書き込みですが、機密情報を含まないため統括責任者の判断で問題ありません。");
  }
}
