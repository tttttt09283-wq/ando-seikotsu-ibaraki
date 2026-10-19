import Link from "next/link";
import { requireHq } from "@/lib/auth/session";
import { Card, PageHeader } from "@/components/ui";
import { ImportForm } from "./ImportForm";

/** 有給残数の取込（本部）。最新の Excel を何度でも取り込み直せる（差分だけ調整として記録） */
export default async function LeaveImportPage() {
  await requireHq();
  return (
    <>
      <PageHeader
        title="有給残数の取込（Excel・CSV）"
        description="現在お使いの有給管理表（Excel）から、付与ごとの残数を取り込みます。取込後も、最新の表で取り込み直すと差分だけが調整されます。"
        actions={
          <Link href="/hq/leave" className="text-sm text-brand-700 underline">
            有給台帳へ戻る
          </Link>
        }
      />
      <div className="space-y-6">
        <Card title="1. ファイルを選んで確認">
          <ImportForm />
        </Card>
        <Card title="ファイルの形式">
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
            <li>1行に1回分の付与（例：2025年10月1日に11日付与）を書きます。同じ人の複数年分は行を分けてください。</li>
            <li>
              必須の列：<b>スタッフID</b>（社員番号でも可）・<b>付与日</b>・<b>付与日数</b>。任意：<b>取得済み日数</b>・<b>残日数</b>・<b>有効期限</b>・氏名・備考
            </li>
            <li>取得済み日数が無い場合は「付与日数 − 残日数」で計算します。両方ある場合は合っているか確認します。</li>
            <li>有効期限が空欄なら付与日から2年です。日付は「2025/10/1」「2025年10月1日」「令和7年10月1日」などに対応しています。</li>
            <li>見出しの行がファイルの先頭10行以内にあれば、上にタイトル行があっても読み込めます。最初のシートを読み込みます。</li>
            <li>
              取り込み直したとき：登録済みの付与（同じスタッフ・同じ付与日）は、残日数が違う場合だけ差分を「調整」として台帳に追記します。台帳の履歴は書き換えません。
            </li>
            <li>1行でも誤りがあると何も取り込みません（エラーの行を直してから、もう一度読み込んでください）。</li>
          </ul>
          <a href="/hq/leave/import/template" className="mt-4 inline-block rounded-md border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50">
            テンプレート（.xlsx）をダウンロード
          </a>
        </Card>
      </div>
    </>
  );
}
