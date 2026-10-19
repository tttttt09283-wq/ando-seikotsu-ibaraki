import Link from "next/link";
import { ActionForm } from "@/components/ActionForm";
import { Badge } from "@/components/ui";
import { addMonths } from "@/lib/time/jst";
import { confirmMonth, copyPreviousMonth } from "./actions";

const TABS = [
  { href: "/manager/shifts", label: "スタッフ別一覧" },
  { href: "/manager/shifts/calendar", label: "月間カレンダー" },
  { href: "/manager/shifts/templates", label: "勤務パターン" },
  { href: "/manager/shifts/history", label: "変更履歴" },
] as const;

/** シフト画面共通：院・年月の切り替え、表示切り替え、前月コピー・確定 */
export function ShiftToolbar({
  current,
  clinics,
  clinicId,
  month,
  closed,
  draftCount = 0,
  showActions = false,
}: {
  current: (typeof TABS)[number]["href"];
  clinics: { clinic_id: string; name: string }[];
  clinicId: string;
  month: string;
  closed: boolean;
  draftCount?: number;
  showActions?: boolean;
}) {
  const query = (params: { clinic?: string; month?: string }) =>
    `?clinic=${params.clinic ?? clinicId}&month=${params.month ?? month}`;
  const [y, m] = month.split("-");

  return (
    <div className="mb-6 space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <form method="get" className="flex items-center gap-2">
          <select
            name="clinic"
            defaultValue={clinicId}
            aria-label="院"
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            {clinics.map((c) => (
              <option key={c.clinic_id} value={c.clinic_id}>
                {c.name}
              </option>
            ))}
          </select>
          <input type="hidden" name="month" value={month} />
          <button type="submit" className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50">
            切替
          </button>
        </form>
        <div className="flex items-center gap-2 text-sm">
          <Link href={`${current}${query({ month: addMonths(month, -1) })}`} className="rounded-md border border-slate-300 bg-white px-3 py-2 hover:bg-slate-50">
            ← 前月
          </Link>
          <span className="px-2 text-lg font-bold">
            {y}年{Number(m)}月
          </span>
          <Link href={`${current}${query({ month: addMonths(month, 1) })}`} className="rounded-md border border-slate-300 bg-white px-3 py-2 hover:bg-slate-50">
            翌月 →
          </Link>
        </div>
        {closed && <Badge tone="gray">締め済み（変更不可）</Badge>}
        {!closed && draftCount > 0 && <Badge tone="yellow">下書き {draftCount}件（未確定）</Badge>}
      </div>

      <nav className="flex flex-wrap gap-1 border-b border-slate-200 text-sm">
        {TABS.map((tab) => (
          <Link
            key={tab.href}
            href={`${tab.href}${query({})}`}
            className={`-mb-px border-b-2 px-4 py-2 ${tab.href === current ? "border-brand-600 font-bold text-brand-700" : "border-transparent text-slate-600 hover:text-navy-900"}`}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      {showActions && !closed && (
        <div className="flex flex-wrap items-start gap-6">
          <ActionForm
            action={copyPreviousMonth}
            submitLabel="前月をコピー"
            tone="secondary"
            className="flex items-center gap-3"
            confirmMessage="前月の同じ曜日（第n○曜日）のシフトを、まだシフトが無い日に下書きでコピーします。よろしいですか？"
          >
            <input type="hidden" name="clinic_id" value={clinicId} />
            <input type="hidden" name="month" value={month} />
          </ActionForm>
          <ActionForm
            action={confirmMonth}
            submitLabel={`${Number(m)}月の下書きを確定`}
            className="flex items-center gap-3"
            confirmMessage="この月の下書きシフトをすべて確定し、スタッフに公開します。確定後の変更には理由の入力が必要です。よろしいですか？"
          >
            <input type="hidden" name="clinic_id" value={clinicId} />
            <input type="hidden" name="month" value={month} />
          </ActionForm>
        </div>
      )}
    </div>
  );
}
