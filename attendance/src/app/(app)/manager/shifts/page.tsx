import { requireManager } from "@/lib/auth/session";
import { createSupabaseServer } from "@/lib/supabase/server";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { loadShiftMonth, resolveSelection, selectableClinics } from "@/lib/shifts/load";
import { dayWarnings, missingDates, noStaffDates, weeklyWarnings, type ShiftWarning } from "@/lib/shifts/warnings";
import { ShiftToolbar } from "./ShiftToolbar";
import { ShiftGrid, type GridData } from "./ShiftGrid";

/**
 * シフト作成（スタッフ別一覧）。行＝スタッフ、列＝日付。
 * 欄を選んでパターン・時刻・休みを一括で入れる。下書き → 確定でスタッフに公開。
 */
export default async function ShiftsPage({ searchParams }: { searchParams: Promise<{ clinic?: string; month?: string }> }) {
  const actor = await requireManager();
  const supabase = await createSupabaseServer();
  const clinics = await selectableClinics(supabase, actor);
  const { clinicId, month } = resolveSelection(clinics, await searchParams);
  if (!clinicId) {
    return (
      <>
        <PageHeader title="シフト作成" />
        <EmptyState>担当している院がありません</EmptyState>
      </>
    );
  }
  const data = await loadShiftMonth(supabase, actor, clinicId, month);
  if (!data) return <EmptyState>院が見つかりません</EmptyState>;

  const warnings: ShiftWarning[] = [];
  const cellWarnings: Record<string, ShiftWarning[]> = {};
  const missing: Record<string, true> = {};
  for (const st of data.staff) {
    const mine = data.shifts.filter((s) => s.staffId === st.staffId);
    for (const day of data.days) {
      const w = dayWarnings(st.staffId, mine.filter((s) => s.workDate === day.date), day, clinicId);
      if (w.length) cellWarnings[`${st.staffId}|${day.date}`] = w;
      warnings.push(...w);
    }
    warnings.push(...weeklyWarnings(st.staffId, mine, data.dates));
    for (const date of missingDates(mine, data.days, (d) => st.primaryDates.has(d))) missing[`${st.staffId}|${date}`] = true;
  }
  const noStaff = noStaffDates(data.shifts, data.days);

  const grid: GridData = {
    clinicId,
    month,
    closed: data.closed,
    days: data.days,
    staff: data.staff.map((s) => ({ ...s, assignedDates: [...s.assignedDates], primaryDates: [...s.primaryDates] })),
    shifts: data.shifts,
    templates: data.templates.filter((t) => t.is_active),
    cellWarnings,
    missing,
    noStaffDates: noStaff,
  };

  const staffName = new Map(data.staff.map((s) => [s.staffId, s.name]));
  const missingCount = Object.keys(missing).length;
  const listed = warnings.filter((w) => w.level !== "info");

  return (
    <>
      <PageHeader title={`シフト作成：${data.clinic.name}`} description="欄をクリックして選択し、下のパネルからまとめて入力します。確定するまで下書きはスタッフに公開されません。" />
      <ShiftToolbar
        current="/manager/shifts"
        clinics={clinics}
        clinicId={clinicId}
        month={month}
        closed={data.closed}
        draftCount={data.shifts.filter((s) => s.status === "draft").length}
        showActions
      />

      {data.staff.length === 0 ? (
        <EmptyState>この月にこの院へ所属・応援登録されているスタッフがいません（スタッフの所属は本部が登録します）</EmptyState>
      ) : (
        <ShiftGrid data={grid} />
      )}

      <Card title="チェック結果" className="mt-6">
        <ul className="space-y-1 text-sm">
          {missingCount > 0 && <li className="text-amber-700">⚠ シフト未作成：{missingCount}欄（診療日に勤務・休みが入っていない主所属スタッフ）</li>}
          {noStaff.length > 0 && <li className="text-amber-700">⚠ 出勤者がいない診療日：{noStaff.map((d) => d.slice(8)).join("、")}日</li>}
          {listed.slice(0, 50).map((w, i) => (
            <li key={i} className={w.level === "error" ? "text-rose-700" : "text-amber-700"}>
              {w.level === "error" ? "✖" : "⚠"} {w.date && !w.message.includes(w.date) ? `${w.date.slice(5)} ` : ""}
              {w.staffId ? `${staffName.get(w.staffId)}：` : ""}
              {w.message}
            </li>
          ))}
          {listed.length > 50 && <li className="text-slate-500">ほか {listed.length - 50}件</li>}
          {missingCount === 0 && noStaff.length === 0 && listed.length === 0 && <li className="text-emerald-700">問題は見つかりませんでした</li>}
        </ul>
        <p className="mt-3 text-xs text-slate-500">
          警告があっても保存はできます。勤務時間の重複（他院の応援勤務を含む）・所属の無いスタッフへの登録は保存時にエラーになります。
        </p>
      </Card>
    </>
  );
}
