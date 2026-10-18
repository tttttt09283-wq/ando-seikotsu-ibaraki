/** Server Action の戻り値 */
export type ActionResult = { ok: true; message: string } | { ok: false; message: string };

export const initialActionResult: ActionResult | null = null;

interface DbErrorLike {
  code?: string;
  message?: string;
  details?: string | null;
}

const CONSTRAINT_MESSAGES: Record<string, string> = {
  assignment_primary_no_overlap: "同じ期間に主所属が重複しています（異動は「異動登録」から行ってください）",
  assignment_support_no_overlap: "同じ院への応援登録が期間重複しています",
  contract_no_overlap: "雇用契約の期間が重複しています",
  user_roles_no_overlap: "同じロールが同じ期間に既に付与されています",
  user_roles_clinic_scope: "院長ロールには担当院の指定が必要です（他のロールでは院を指定しません）",
  clinics_clinic_code_key: "その院コードは既に使われています",
  staff_profiles_staff_code_key: "そのスタッフIDは既に使われています",
  staff_profiles_auth_user_id_key: "そのアカウントは既に別のスタッフに紐付いています",
};

/**
 * DB / Supabase のエラーを、利用者に見せられる日本語メッセージに変換する。
 * 想定外のエラーは内部情報を出さず汎用メッセージにする。
 */
export function toUserMessage(error: unknown): string {
  const e = (error ?? {}) as DbErrorLike;
  const text = `${e.message ?? ""} ${e.details ?? ""}`;

  for (const [constraint, message] of Object.entries(CONSTRAINT_MESSAGES)) {
    if (text.includes(constraint)) return message;
  }
  switch (e.code) {
    case "42501":
      return e.message && /[ぁ-んァ-ン一-龥]/.test(e.message) ? e.message : "この操作を行う権限がありません";
    case "23505":
      return "同じ内容が既に登録されています";
    case "23P01":
      return "期間が重複しています";
    case "23514":
      return "入力内容が条件を満たしていません";
    case "P0001":
    case "P0002":
    case "22023":
      return e.message ?? "処理できませんでした";
  }
  return "処理中にエラーが発生しました。時間をおいて再度お試しください";
}
