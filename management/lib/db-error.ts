// データベースのエラー → 画面に出す日本語
type DbError = { code?: string; message?: string; details?: string | null } | null | undefined;

export function friendlyDbError(e: DbError): string {
  if (!e) return "処理に失敗しました";
  const msg = e.message ?? "";
  if (e.code === "23505") {
    if (/login_id/.test(msg + (e.details ?? ""))) return "このログインIDはすでに使われています";
    if (/staff_code/.test(msg + (e.details ?? ""))) return "このスタッフIDはすでに使われています";
    if (/pos_staff_id|pos_store_id/.test(msg + (e.details ?? ""))) return "このPOSの番号はすでに別の人（院）に紐づいています";
    if (/user_primary_assignment/.test(msg)) return "主所属はすでに設定されています（先に今の主所属を終了してください）";
    return "同じ内容がすでに登録されています";
  }
  if (e.code === "23P01") return "同じ院で期間が重なる所属があります（先に今の所属を終了してください）";
  if (e.code === "42501" || /row-level security/.test(msg)) return "この操作を行う権限がありません";
  if (e.code === "23514") return "入力値が条件に合いません";
  if (e.code === "P0001") return msg; // DB の関数・トリガーで出した日本語のメッセージ
  return `処理に失敗しました（${msg}）`;
}
