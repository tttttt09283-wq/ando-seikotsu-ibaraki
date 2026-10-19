import { ComingSoon } from "@/components/app/ComingSoon";

export const metadata = { title: "CSV取込" };

export default function ImportPage() {
  return (
    <ComingSoon
      title="CSV取込"
      phase="フェーズ3"
      items={[
        "銀行明細・会計ソフトの出力・売上データの汎用CSV（UTF-8／Shift_JIS を自動判定）",
        "列の割り当て（日付・金額・入出金・摘要）と、日付・金額の検証",
        "取込前のプレビュー、重複の検知（同じ明細・同じファイルの再取込を防ぐ）",
        "予定と一致する明細は「予定を確定にする」候補として表示（二重計上を防ぐ）",
        "エラーレポートと監査ログ、数式インジェクション対策",
      ]}
      note="データベース側の受け皿（import_jobs / import_rows、重複防止キー）は用意済みです。"
    />
  );
}
