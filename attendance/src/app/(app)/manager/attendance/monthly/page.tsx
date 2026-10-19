import { requireManager } from "@/lib/auth/session";
import { createSupabaseServer } from "@/lib/supabase/server";
import { ActionForm } from "@/components/ActionForm";
import { Badge, Card, EmptyState, PageHeader, Table, Td } from "@/components/ui";
import { selectableClinics } from "@/lib/shifts/load";
import { fixedOvertimeExcess, hm } from "@/lib/attendance/labels";
import { isActiveOn, staffName, type ContractRow, type StaffRow } from "@/lib/data/types";
import { addMonths, isValidMonth, monthDates, todayJst } from "@/lib/time/jst";
import { AttendanceToolbar } from "../AttendanceToolbar";
import { confirmAttendance, recalcAttendance } from "../actions";

interface DailyRow {
  staff_id: string;
  work_date: string;
  worked_minutes: number;
  overtime_statutory_minutes: number;
  overtime_non_statutory_minutes: number;
  late_night_minutes: number;
  legal_holiday_minutes: number;
  scheduled_holiday_minutes: number;
  late_minutes: number;
  early_leave_minutes: number;
  is_absent: boolean;
  has_missing_punch: boolean;
  needs_recalc: boolean;
  status: string;
}

/**
 * 月次集計（主所属スタッフ）。法定時間外のうち、みなし残業（固定残業）を超えた分は別途支給が必要。
 * 応援先での勤務も主所属院の集計に含まれる。
 */
export default async function AttendanceMonthlyPage({ searchParams }: { searchParams: Promise<{ clinic?: string; month?: string }> }) {
  const actor = await requireManager();
  const params = await searchParams;
  const supabase = await createSupabaseServer();
  const clinics = await selectableClinics(supabase, actor);
  const clinicId = clinics.find((c) => c.clinic_id === params.clinic)?.clinic_id ?? clinics[0]?.clinic_id;
  if (!clinicId) return <EmptyState>担当している院がありません</EmptyState>;
  const month = params.month && isValidMonth(params.month) ? params.month : todayJst().slice(0, 7);
  const dates = monthDates(month);
  const from = dates[0];
  const to = dates[dates.length - 1];
  const clinic = clinics.find((c) => c.clinic_id === clinicId) as { name: string };

  const { data: dailyData } = await supabase
    .from("attendance_daily")
    .select("*")
    .eq("home_clinic_id", clinicId)
    .gte("work_date", from)
    .lte("work_date", to);
  const rows = (dailyData ?? []) as DailyRow[];
  const staffIds = [...new Set(rows.map((r) => r.staff_id))];
  const [{ data: staffData }, { data: contractData }] = staffIds.length
    ? await Promise.all([
        supabase.from("staff_profiles").select("staff_id, staff_code, family_name, given_name").in("staff_id", staffIds),
        supabase.from("employment_contracts").select("*").in("staff_id", staffIds),
      ])
    : [{ data: [] }, { data: [] }];
  const staff = ((staffData ?? []) as StaffRow[]).sort((a, b) => a.staff_code.localeCompare(b.staff_code));
  const contracts = (contractData ?? []) as ContractRow[];

  const summary = staff.map((s) => {
    const mine = rows.filter((r) => r.staff_id === s.staff_id);
    const sum = (k: keyof DailyRow) => mine.reduce((acc, r) => acc + (r[k] as number), 0);
    // みなし残業は月末時点の勤務条件で判定
    const contract = contracts.find((c) => c.staff_id === s.staff_id && isActiveOn(c, to));
    const statutory = sum("overtime_statutory_minutes");
    const fixed = contract?.fixed_overtime_minutes ?? 0;
    return {
      staff: s,
      days: mine.filter((r) => r.worked_minutes > 0).length,
      worked: sum("worked_minutes"),
      statutory,
      nonStatutory: sum("overtime_non_statutory_minutes"),
      fixed,
      excess: fixedOvertimeExcess(statutory, fixed),
      night: sum("late_night_minutes"),
      legal: sum("legal_holiday_minutes"),
      scheduledHoliday: sum("scheduled_holiday_minutes"),
      lateCount: mine.filter((r) => r.late_minutes > 0).length,
      lateMinutes: sum("late_minutes"),
      earlyCount: mine.filter((r) => r.early_leave_minutes > 0).length,
      absent: mine.filter((r) => r.is_absent).length,
      missing: mine.filter((r) => r.has_missing_punch).length,
      unconfirmed: mine.filter((r) => r.status === "open" && r.work_date < todayJst()).length,
      recalc: mine.filter((r) => r.needs_recalc).length,
      hasContract: Boolean(contract),
    };
  });

  return (
    <>
      <PageHeader title={`月次集計：${clinic.name}`} description="主所属スタッフの勤怠（応援先での勤務を含む）。月次締めは本部が行います（フェーズ6）。" />
      <AttendanceToolbar current="/manager/attendance/monthly" clinics={clinics} clinicId={clinicId} month={month} />
      <div className="mb-4 flex flex-wrap gap-4">
        <ActionForm action={recalcAttendance} submitLabel="この月を再計算" tone="secondary" className="flex items-center gap-3">
          <input type="hidden" name="clinic_id" value={clinicId} />
          <input type="hidden" name="from" value={from} />
          <input type="hidden" name="to" value={to} />
        </ActionForm>
        <ActionForm
          action={confirmAttendance}
          submitLabel="この月を院長確認"
          className="flex items-center gap-3"
          confirmMessage="この月の勤怠（昨日まで）を院長確認済みにします。打刻漏れ・再計算待ちの日は確認されません。よろしいですか？"
        >
          <input type="hidden" name="clinic_id" value={clinicId} />
          <input type="hidden" name="from" value={from} />
          <input type="hidden" name="to" value={to} />
        </ActionForm>
      </div>
      <Card>
        {summary.length === 0 ? (
          <EmptyState>この月の勤怠記録はありません（{addMonths(month, 0)}）</EmptyState>
        ) : (
          <Table
            head={["スタッフ", "出勤日数", "実労働", "法定時間外", "みなし残業", "みなし超過", "所定外（法定内）", "深夜", "法定休日", "所定休日", "遅刻", "早退", "欠勤", "要対応"]}
          >
            {summary.map((r) => (
              <tr key={r.staff.staff_id}>
                <Td>
                  <div className="font-medium">{staffName(r.staff)}</div>
                  <div className="text-xs text-slate-500">{r.staff.staff_code}</div>
                </Td>
                <Td>{r.days}日</Td>
                <Td>{hm(r.worked)}</Td>
                <Td className={r.statutory > 0 ? "font-bold" : ""}>{hm(r.statutory)}</Td>
                <Td>{r.hasContract ? hm(r.fixed) : <span className="text-amber-700">契約未登録</span>}</Td>
                <Td className={r.excess > 0 ? "font-bold text-rose-700" : ""}>{hm(r.excess)}</Td>
                <Td>{hm(r.nonStatutory)}</Td>
                <Td>{hm(r.night)}</Td>
                <Td>{hm(r.legal)}</Td>
                <Td>{hm(r.scheduledHoliday)}</Td>
                <Td>{r.lateCount ? `${r.lateCount}回（${r.lateMinutes}分）` : "—"}</Td>
                <Td>{r.earlyCount ? `${r.earlyCount}回` : "—"}</Td>
                <Td>{r.absent ? `${r.absent}日` : "—"}</Td>
                <Td className="whitespace-normal">
                  <div className="flex flex-wrap gap-1">
                    {r.missing > 0 && <Badge tone="red">打刻漏れ {r.missing}</Badge>}
                    {r.recalc > 0 && <Badge tone="red">再計算要 {r.recalc}</Badge>}
                    {r.unconfirmed > 0 && <Badge tone="yellow">未確認 {r.unconfirmed}</Badge>}
                  </div>
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
      <p className="mt-2 text-xs text-slate-500">
        法定時間外＝1日8時間超＋週40時間超（法定休日の労働は除く）。みなし超過＝法定時間外 − みなし残業時間（月）。深夜・休日の割増は別途計算します。
      </p>
    </>
  );
}
