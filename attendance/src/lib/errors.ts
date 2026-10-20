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
  shifts_break_within: "休憩時間が勤務時間以上になっています",
  staff_wage_settings_shape: "月給は基礎賃金と月の所定時間、時給は時給、日給は日給を入力してください",
  shifts_time_order: "勤務時間は24時間以内にしてください",
  shift_templates_not_zero: "開始と終了が同じです",
  calendar_exception_unique: "その日付は既に登録されています",
};

/** DB の関数（RPC）が利用者向けに日本語で返したメッセージか */
const isJapanese = (message?: string) => Boolean(message && /[ぁ-んァ-ン一-龥]/.test(message));

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
  if (isJapanese(e.message) && ["42501", "23505", "23P01", "40001", "P0001", "P0002", "22023"].includes(e.code ?? "")) {
    return e.message as string;
  }
  switch (e.code) {
    case "42501":
      return "この操作を行う権限がありません";
    case "23505":
      return "同じ内容が既に登録されています";
    case "23P01":
      return "期間が重複しています";
    case "23514":
      return "入力内容が条件を満たしていません";
    case "40001":
      return "他の人が先に更新しました。画面を再読み込みしてください";
  }
  return "処理中にエラーが発生しました。時間をおいて再度お試しください";
}
