import Link from "next/link";
import { requireHq } from "@/lib/auth/session";
import { Card, PageHeader } from "@/components/ui";
import { WageImportForm } from "./WageImportForm";

/** 賃金管理表（Excel）から賃金マスタを取り込む（本部のみ） */
export default async function WageImportPage() {
  await requireHq();
  return (
    <>
      <PageHeader
        title="賃金管理表の取込"
        description="今お使いの賃金管理表（残業代計算表）から、スタッフごとの賃金を賃金マスタに取り込みます。"
        actions={
          <Link href="/hq/wages" className="text-sm text-brand-700 underline">
            賃金マスタへ戻る
          </Link>
        }
      />
      <div className="space-y-6">
        <Card title="ファイルを選んで確認">
          <WageImportForm />
        </Card>
        <Card title="読み取る内容">
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
            <li>Google スプレッドシートは「ファイル → ダウンロード → Microsoft Excel（.xlsx）」で保存したファイルを選んでください。最新の月のシート（「R8.9」など）を自動で選びます。</li>
            <li>氏名（A列）でスタッフに照合します。未登録・同姓同名の人は取り込みません。</li>
            <li>給与形態：支給総額の式が「基本時給×(通常＋有休)」なら時給、「基礎賃金×出勤日数」なら日給、それ以外は月給。</li>
            <li>月の所定時間は基本時給の式（「=基礎賃金/151」の151）、残業の基準時間は超過残業数の式（「=通常+有休-191-固定残業数」の191）から読みます。</li>
            <li>交通費：数値なら月額、「=150*出勤日数」のような式なら日額。固定残業代・資格・役職手当・雑手当はその月の値です。</li>
            <li>固定残業時間（みなし残業）は勤務条件の値を使います。表と違う場合は確認事項に表示します（スタッフ詳細の勤務条件で直してください）。</li>
            <li>適用開始月（既定はシートの月）から登録します。同じ月の登録は上書き、過去の月の賃金は残ります。</li>
          </ul>
        </Card>
      </div>
    </>
  );
}
