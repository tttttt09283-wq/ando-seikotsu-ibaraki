import { requireManager } from "@/lib/auth/session";
import { isHq } from "@/lib/auth/permissions";
import { createSupabaseServer } from "@/lib/supabase/server";
import { Card, PageHeader } from "@/components/ui";
import { selectableClinics } from "@/lib/shifts/load";
import { EXPORT_FORMATS } from "@/lib/export/format";
import { REPORTS } from "@/lib/export/reports";
import { addMonths, isValidMonth, todayJst } from "@/lib/time/jst";

/**
 * 出力センター：9種の帳票を CSV（UTF-8・Shift_JIS）または Excel で出力する。
 * 本部はすべての帳票を全院分、院長は勤怠の帳票を担当院の分だけ出力できる。
 */
export default async function ExportsPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const actor = await requireManager();
  const params = await searchParams;
  const supabase = await createSupabaseServer();
  const clinics = await selectableClinics(supabase, actor);
  const hq = isHq(actor);
  const lastMonth = addMonths(todayJst().slice(0, 7), -1);
  const month = params.month && isValidMonth(params.month) ? params.month : lastMonth;
  const reports = REPORTS.filter((r) => hq || !r.hqOnly);

  return (
    <>
      <PageHeader
        title="帳票の出力"
        description="帳票を選んで出力します。Excel で開く場合は「Excel（.xlsx）」か「CSV（Shift_JIS）」、給与ソフトなどに取り込む場合は指定の文字コードを選んでください。出力した記録は監査ログに残ります。"
      />
      <Card>
        <form method="get" action="/exports/download" className="space-y-5 text-sm">
          <fieldset>
            <legend className="mb-2 font-medium text-slate-700">帳票</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {reports.map((r, i) => (
                <label key={r.id} className="flex cursor-pointer gap-2 rounded-md border border-slate-200 p-3 hover:bg-slate-50 has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50">
                  <input type="radio" name="report" value={r.id} defaultChecked={i === 0} className="mt-1" />
                  <span>
                    <span className="block font-medium">{r.label}</span>
                    <span className="text-xs text-slate-600">{r.description}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="flex flex-wrap items-end gap-4">
            <label>
              <span className="mb-1 block font-medium text-slate-700">対象月</span>
              <input type="month" name="month" defaultValue={month} required className="rounded-md border border-slate-300 px-3 py-2" />
            </label>
            <label>
              <span className="mb-1 block font-medium text-slate-700">院</span>
              <select name="clinic" defaultValue="" className="rounded-md border border-slate-300 bg-white px-3 py-2">
                <option value="">{hq ? "全院" : "担当院すべて"}</option>
                {clinics.map((c) => (
                  <option key={c.clinic_id} value={c.clinic_id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="mb-1 block font-medium text-slate-700">形式</span>
              <select name="format" defaultValue="xlsx" className="rounded-md border border-slate-300 bg-white px-3 py-2">
                {Object.entries(EXPORT_FORMATS).map(([key, f]) => (
                  <option key={key} value={key}>
                    {f.label}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="rounded-md bg-brand-600 px-4 py-2 font-medium text-white">
              出力する
            </button>
          </div>
        </form>
      </Card>
      <Card title="出力についての注意" className="mt-6">
        <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
          <li>時間は「時間（小数2桁）」で出力します（例：7時間30分 → 7.5）。遅刻・早退は分です。</li>
          <li>勤怠は主所属院ごとに集計します（応援勤務は主所属院に計上）。締め前の月は確定値ではありません。</li>
          <li>有給・振休の残数一覧は、対象月の末日（今月は今日）時点の残数です。</li>
          <li>CSV（Shift_JIS）では、Shift_JIS に無い一部の文字（絵文字など）は「?」になります。氏名に特殊な文字がある場合は UTF-8 か Excel を選んでください。</li>
          <li>「=」「+」「-」「@」で始まる文字は、Excel で数式として動かないよう先頭に「&apos;」を付けて出力します。</li>
          <li>帳票には個人情報が含まれます。共有フォルダ・メールでの扱いに注意してください。</li>
        </ul>
      </Card>
    </>
  );
}
