import Link from "next/link";
import { addDays, addMonths, WEEKDAY_LABELS, weekdayOf } from "@/lib/time/jst";

const TABS = [
  { href: "/manager/attendance", label: "日次確認" },
  { href: "/manager/attendance/monthly", label: "月次集計" },
  { href: "/manager/attendance/adjustments", label: "打刻修正" },
] as const;

/** 勤怠画面共通：院の切り替え、日付・年月の移動、表示切り替え */
export function AttendanceToolbar({
  current,
  clinics,
  clinicId,
  date,
  month,
}: {
  current: (typeof TABS)[number]["href"];
  clinics: { clinic_id: string; name: string }[];
  clinicId: string;
  date?: string;
  month?: string;
}) {
  const q = (p: { date?: string; month?: string }) => {
    const params = new URLSearchParams({ clinic: clinicId });
    if (p.date ?? date) params.set("date", (p.date ?? date) as string);
    if (p.month ?? month) params.set("month", (p.month ?? month) as string);
    return `?${params.toString()}`;
  };
  return (
    <div className="mb-6 space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <form method="get" className="flex items-center gap-2">
          <select name="clinic" defaultValue={clinicId} aria-label="院" className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm">
            {clinics.map((c) => (
              <option key={c.clinic_id} value={c.clinic_id}>
                {c.name}
              </option>
            ))}
          </select>
          {date && <input type="date" name="date" defaultValue={date} aria-label="日付" className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm" />}
          {month && <input type="hidden" name="month" value={month} />}
          <button type="submit" className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50">
            表示
          </button>
        </form>
        {date && (
          <div className="flex items-center gap-2 text-sm">
            <Link href={`${current}${q({ date: addDays(date, -1) })}`} className="rounded-md border border-slate-300 bg-white px-3 py-2 hover:bg-slate-50">
              ← 前日
            </Link>
            <span className="px-2 text-lg font-bold">
              {date.replaceAll("-", "/")}（{WEEKDAY_LABELS[weekdayOf(date)]}）
            </span>
            <Link href={`${current}${q({ date: addDays(date, 1) })}`} className="rounded-md border border-slate-300 bg-white px-3 py-2 hover:bg-slate-50">
              翌日 →
            </Link>
          </div>
        )}
        {month && (
          <div className="flex items-center gap-2 text-sm">
            <Link href={`${current}${q({ month: addMonths(month, -1) })}`} className="rounded-md border border-slate-300 bg-white px-3 py-2 hover:bg-slate-50">
              ← 前月
            </Link>
            <span className="px-2 text-lg font-bold">
              {month.slice(0, 4)}年{Number(month.slice(5))}月
            </span>
            <Link href={`${current}${q({ month: addMonths(month, 1) })}`} className="rounded-md border border-slate-300 bg-white px-3 py-2 hover:bg-slate-50">
              翌月 →
            </Link>
          </div>
        )}
      </div>
      <nav className="flex flex-wrap gap-1 border-b border-slate-200 text-sm">
        {TABS.map((tab) => (
          <Link
            key={tab.href}
            href={`${tab.href}?clinic=${clinicId}`}
            className={`-mb-px border-b-2 px-4 py-2 ${tab.href === current ? "border-brand-600 font-bold text-brand-700" : "border-transparent text-slate-600 hover:text-navy-900"}`}
          >
            {tab.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
