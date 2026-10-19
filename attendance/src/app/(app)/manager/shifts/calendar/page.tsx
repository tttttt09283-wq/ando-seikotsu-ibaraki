import { requireManager } from "@/lib/auth/session";
import { createSupabaseServer } from "@/lib/supabase/server";
import { EmptyState, PageHeader } from "@/components/ui";
import { loadShiftMonth, resolveSelection, selectableClinics } from "@/lib/shifts/load";
import { shiftLabel } from "@/lib/shifts/model";
import { WEEKDAY_LABELS } from "@/lib/time/jst";
import { ShiftToolbar } from "../ShiftToolbar";

/** 月間カレンダー：日ごとに出勤者と勤務時間を一覧する（編集は「スタッフ別一覧」から） */
export default async function ShiftCalendarPage({ searchParams }: { searchParams: Promise<{ clinic?: string; month?: string }> }) {
  const actor = await requireManager();
  const supabase = await createSupabaseServer();
  const clinics = await selectableClinics(supabase, actor);
  const { clinicId, month } = resolveSelection(clinics, await searchParams);
  if (!clinicId) return <EmptyState>担当している院がありません</EmptyState>;
  const data = await loadShiftMonth(supabase, actor, clinicId, month);
  if (!data) return <EmptyState>院が見つかりません</EmptyState>;

  const staffName = new Map(data.staff.map((s) => [s.staffId, s.name]));
  // 日曜始まりのカレンダー。前月末の空白を埋める
  const leading = data.days[0].weekday;
  const cells: ((typeof data.days)[number] | null)[] = [...Array(leading).fill(null), ...data.days];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <>
      <PageHeader title={`月間カレンダー：${data.clinic.name}`} />
      <ShiftToolbar current="/manager/shifts/calendar" clinics={clinics} clinicId={clinicId} month={month} closed={data.closed} />
      <div className="overflow-x-auto">
        <div className="grid min-w-[56rem] grid-cols-7 gap-px rounded-lg border border-slate-200 bg-slate-200 text-xs">
          {WEEKDAY_LABELS.map((w, i) => (
            <div key={w} className={`bg-slate-50 px-2 py-1 text-center font-medium ${i === 0 ? "text-rose-600" : i === 6 ? "text-sky-700" : ""}`}>
              {w}
            </div>
          ))}
          {cells.map((d, i) => {
            if (!d) return <div key={`blank-${i}`} className="bg-slate-50" />;
            const dayShifts = data.shifts
              .filter((s) => s.workDate === d.date)
              .sort((a, b) => (a.start ?? "99").localeCompare(b.start ?? "99"));
            const workers = dayShifts.filter((s) => s.type === "work");
            const closed = d.slots.length === 0;
            return (
              <div key={d.date} className={`min-h-28 p-1.5 ${closed ? "bg-slate-50" : "bg-white"}`}>
                <div className="mb-1 flex items-baseline justify-between">
                  <span className={`font-bold ${d.holidayName || d.weekday === 0 ? "text-rose-600" : d.weekday === 6 ? "text-sky-700" : ""}`}>
                    {Number(d.date.slice(8))}
                  </span>
                  <span className="text-[10px] text-slate-500">{closed ? "休診" : `${workers.length}人`}</span>
                </div>
                {d.holidayName && <div className="mb-1 text-[10px] text-rose-600">{d.holidayName}</div>}
                <ul className="space-y-0.5">
                  {dayShifts.map((s) => (
                    <li key={s.shiftId} className={`truncate ${s.type === "work" ? "" : "text-slate-400"} ${s.status === "draft" ? "italic" : ""}`}>
                      {staffName.get(s.staffId)} {shiftLabel(s)}
                    </li>
                  ))}
                </ul>
                {!closed && workers.length === 0 && <div className="text-[10px] text-amber-600">⚠ 出勤者なし</div>}
              </div>
            );
          })}
        </div>
      </div>
      <p className="mt-2 text-xs text-slate-500">斜体＝下書き（未確定）。編集は「スタッフ別一覧」から行います。</p>
    </>
  );
}
