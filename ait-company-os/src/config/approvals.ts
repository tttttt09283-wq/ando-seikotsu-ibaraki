import type { ApprovalCategory } from "@/lib/types";

/** CEO承認が必須となる行動の種類 */
export const APPROVAL_CATEGORY_LABEL: Record<ApprovalCategory, string> = {
  sns_post: "SNSへの公開投稿",
  external_message: "メール・DMの外部送信",
  customer_proposal: "顧客への提案送信",
  contract: "契約",
  payment: "支払い・購入",
  budget_change: "予算変更",
  new_agent: "新規AI社員の追加",
  data_deletion: "重要データの削除",
  external_write: "外部サービスへの書き込み",
};
