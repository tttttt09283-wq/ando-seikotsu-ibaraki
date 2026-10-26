import { requireManager } from "@/lib/auth/session";
import { createSupabaseServer } from "@/lib/supabase/server";
import { ActionForm } from "@/components/ActionForm";
import { Badge, Card, EmptyState, Input, PageHeader, Table, Td } from "@/components/ui";
import { selectableClinics } from "@/lib/shifts/load";
import Link from "next/link";
import { CLOSING_STATUS_LABELS, hm } from "@/lib/attendance/labels";
import { summarizeMonth, type MonthlyDailyRow } from "@/lib/attendance/monthly";
import { isActiveOn, staffName, type ContractRow, type StaffRow } from "@/lib/data/types";
import { addMonths, isValidMonth, monthDates, todayJst } from "@/lib/time/jst";
import { AttendanceToolbar } from "../AttendanceToolbar";
import { confirmAttendance, recalcAttendance } from "../actions";
import { confirmMonth, unconfirmMonth } from "@/app/(app)/hq/closings/actions";

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
  const rows = (dailyData ?? []) as MonthlyDailyRow[];
  const [{ data: closingData }, { data: issueData }] = await Promise.all([
    supabase.from("monthly_closings").select("status, manager_confirmed_at, closed_at").eq("clinic_id", clinicId).eq("year_month", from).maybeSingle(),
    supabase.rpc("closing_issues", { p_clinic_id: clinicId, p_month: from }),
  ]);
  const closingStatus = (closingData as { status: string } | null)?.status ?? "open";
  const issues = (issueData ?? {}) as Record<string, number>;
  const monthEnded = month < todayJst().slice(0, 7);
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
    // みなし残業は月末時点の勤務条件で判定
    const contract = contracts.find((c) => c.staff_id === s.staff_id && isActiveOn(c, to));
    const mine = rows.filter((r) => r.staff_id === s.staff_id);
    return { staff: s, ...summarizeMonth(mine, contract ? contract.fixed_overtime_minutes : null, todayJst()) };
  });

  return (
    <>
      <PageHeader title={`月次集計：${clinic.name}`} description="主所属スタッフの勤怠（応援先での勤務を含む）。月が終わったら内容を確認して「月次の院長確認」を行い、本部が締めます。" />
      <AttendanceToolbar current="/manager/attendance/monthly" clinics={clinics} clinicId={clinicId} month={month} />
      <Card title="月次の院長確認・締め" className="mb-4">
        <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
          <Badge tone={CLOSING_STATUS_LABELS[closingStatus].tone}>{CLOSING_STATUS_LABELS[closingStatus].label}</Badge>
          <span>打刻漏れ {issues.missing_punch ?? 0}日</span>
          <span>再計算待ち {issues.needs_recalc ?? 0}日</span>
          <span>未確認 {issues.unconfirmed ?? 0}日</span>
          <span>打刻修正の承認待ち {issues.pending_adjustments ?? 0}件</span>
          <span>休暇の承認待ち {issues.pending_leave ?? 0}件</span>
        </div>
        {!monthEnded ? (
          <p className="text-sm text-slate-600">月が終わってから院長確認できます。</p>
        ) : closingStatus === "open" ? (
          <ActionForm
            action={confirmMonth}
            submitLabel="この月を院長確認して本部へ"
            className="flex flex-wrap items-center gap-3"
            confirmMessage="この月の勤怠を確認済みにして本部に締めを依頼します。よろしいですか？"
          >
            <input type="hidden" name="clinic_id" value={clinicId} />
            <input type="hidden" name="month" value={month} />
            <Input name="reason" maxLength={500} placeholder="未解決の事項が残る場合はその理由（例：9/8 の退勤は本人確認済み）" className="w-[28rem]" aria-label="確認の理由" />
          </ActionForm>
        ) : closingStatus === "manager_confirmed" ? (
          <ActionForm action={unconfirmMonth} submitLabel="院長確認を取り消す" tone="secondary" className="flex items-center gap-3">
            <input type="hidden" name="clinic_id" value={clinicId} />
            <input type="hidden" name="month" value={month} />
          </ActionForm>
        ) : (
          <p className="text-sm text-slate-600">
            {closingStatus === "closed" ? "本部が締めました。修正が必要な場合は本部に再開を依頼してください。" : "本部が締めを再開中です。修正後に本部が再度締めます。"}
          </p>
        )}
      </Card>
      <div className="mb-4 flex flex-wrap gap-4">
        <ActionForm action={recalcAttendance} submitLabel="この月を再計算" tone="secondary" className="flex items-center gap-3">
          <input type="hidden" name="clinic_id" value={clinicId} />
          <input type="hidden" name="from" value={from} />
          <input type="hidden" name="to" value={to} />
        </ActionForm>
        <ActionForm
          action={confirmAttendance}
          submitLabel="問題のない日を確認済みにする"
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
                  <Link href={`/manager/attendance/monthly/${r.staff.staff_id}?clinic=${clinicId}&month=${month}`} className="font-medium text-brand-700 underline">
                    {staffName(r.staff)}
                  </Link>
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
        スタッフ名を押すと、その人の1か月の詳細（日ごとのシフト・打刻・労働時間）を表示します。
        法定時間外＝1日8時間超＋週40時間超（法定休日の労働は除く）。みなし超過＝法定時間外 − みなし残業時間（月）。深夜・休日の割増は別途計算します。
      </p>
    </>
  );
}
