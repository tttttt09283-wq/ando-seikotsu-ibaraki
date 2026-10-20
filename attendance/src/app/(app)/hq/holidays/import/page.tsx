import Link from "next/link";
import { requireHq } from "@/lib/auth/session";
import { Card, PageHeader } from "@/components/ui";
import { todayJst } from "@/lib/time/jst";
import { HolidayImportForm } from "./HolidayImportForm";

/** 勤怠管理表（1人1ファイル）の一括取込（本部のみ） */
export default async function HolidayImportPage() {
  await requireHq();
  return (
    <>
      <PageHeader
        title="勤怠管理表の取込"
        description="今お使いの勤怠管理表（1人1ファイル）から、日ごとの出勤区分・有休の基準日・振休/代休の残りを取り込みます。全員分をまとめて取り込めます。"
        actions={
          <Link href="/hq/holidays" className="text-sm text-brand-700 underline">
            休日管理へ戻る
          </Link>
        }
      />
      <div className="space-y-6">
        <Card title="1. ファイルを選んで確認">
          <HolidayImportForm today={todayJst()} />
        </Card>
        <Card title="全員分をまとめて取り込む方法">
          <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-700">
            <li>
              Google ドライブで、全員分の勤怠管理表を<b>1つのフォルダ</b>に入れます。
            </li>
            <li>
              フォルダを右クリック →「<b>ダウンロード</b>」。Google スプレッドシートは自動で Excel（.xlsx）に変換され、zip ファイルになります。
            </li>
            <li>
              その <b>zip をそのまま選ぶ</b>（展開不要）か、展開したフォルダを「フォルダを選ぶ」で選びます。複数の .xlsx をまとめて選ぶこともできます。
            </li>
            <li>確認画面で、スタッフの照合・期間・基準日・振休/代休の残りを確認して取り込みます。</li>
          </ol>
          <p className="mt-3 text-sm text-slate-700">取り込んだ後は、この画面ではなく「休日管理」でスタッフごとに管理します（1人1ファイルの管理は不要になります）。Excel が必要なときは休日管理の「Excelで出力」で同じ形の表を出せます。</p>
        </Card>
        <Card title="読み取る内容">
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
            <li><b>氏名</b>：ファイル名（「山田　花子(基準日12月1日）.xlsx」の括弧の前）。スタッフの氏名と照合します（空白・全角半角は無視）。</li>
            <li><b>出勤区分</b>：各シート（1年分）の月ごとの「日・曜日・区分」。法定内・法定外・休出・振休・代休・有休・半休・計画年休・特休・欠勤・休業など。読めない区分は取り込まずに表示します。</li>
            <li><b>基準日</b>：有休の付与方式を「基準日方式」に切り替えます（入社6か月後より遅い場合は切り替えません）。</li>
            <li><b>振休・代休の残り</b>：最新のシートの「振休・代休余」を、指定した基準日・期限で「移行」として登録します（同じ基準日では1回だけ）。</li>
            <li>有休の残数は、出勤簿から取り込む「有給台帳 → 取込」を使ってください（二重に登録しないため、この画面では取り込みません）。</li>
            <li>画面で手入力した日、締め済みの月の日は上書きしません。</li>
          </ul>
        </Card>
      </div>
    </>
  );
}
