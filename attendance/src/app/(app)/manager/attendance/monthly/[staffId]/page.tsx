import Link from "next/link";
import { notFound } from "next/navigation";
import { requireManager } from "@/lib/auth/session";
import { isHq } from "@/lib/auth/permissions";
import { createSupabaseServer } from "@/lib/supabase/server";
import { Badge, Card, EmptyState, PageHeader, Table, Td } from "@/components/ui";
import { selectableClinics } from "@/lib/shifts/load";
import { shiftLabel, toShiftView, type ShiftRow } from "@/lib/shifts/model";
import { ANOMALY_LABELS, ATTENDANCE_STATUS_LABELS, DAY_TYPE_LABELS, hm, PUNCH_TYPE_LABELS } from "@/lib/attendance/labels";
import { summarizeMonth, type MonthlyDailyRow } from "@/lib/attendance/monthly";
import { groupPunchesByDay } from "@/lib/attendance/punches";
import { DAY_CODE_LABELS, type DayCode } from "@/lib/holiday/codes";
import { LEAVE_TYPE_LABELS, LEAVE_UNIT_LABELS } from "@/lib/validation/schemas";
import { isActiveOn, staffName, type ContractRow, type StaffRow } from "@/lib/data/types";
import { addDays, addMonths, isValidMonth, monthDates, todayJst, WEEKDAY_LABELS, weekdayOf } from "@/lib/time/jst";

interface DailyRow extends MonthlyDailyRow {
  home_clinic_id: string | null;
  break_minutes: number;
  anomalies: string[];
  day_type: string;
}

interface PunchRow {
  event_id: string;
  clinic_id: string;
  punch_type: string;
  punched_at: string;
  source: string;
  is_void: boolean;
  void_of_event_id: string | null;
  is_delayed_submission: boolean;
}

interface LeaveRow {
  leave_type: keyof typeof LEAVE_TYPE_LABELS;
  start_date: string;
  end_date: string;
  unit: keyof typeof LEAVE_UNIT_LABELS;
  status: string;
}

const timeFmt = new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit", hour12: false });

/**
 * 個人の月次詳細：1人1か月の日ごとのシフト・打刻・労働時間・休暇・注意事項と、月の合計。
 * 院長は主所属スタッフ（RLS で見られる範囲）、本部は全員。休日管理の区分は本部のみ表示される。
 */
export default async function StaffMonthlyPage({
  params,
  searchParams,
}: {
  params: Promise<{ staffId: string }>;
  searchParams: Promise<{ clinic?: string; month?: string }>;
}) {
  const actor = await requireManager();
  const { staffId } = await params;
  const query = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(staffId)) notFound();
  const supabase = await createSupabaseServer();
  const clinics = await selectableClinics(supabase, actor);
  const clinicId = clinics.find((c) => c.clinic_id === query.clinic)?.clinic_id ?? clinics[0]?.clinic_id;
  if (!clinicId) return <EmptyState>担当している院がありません</EmptyState>;
  const month = query.month && isValidMonth(query.month) ? query.month : todayJst().slice(0, 7);
  const dates = monthDates(month);
  const from = dates[0];
  const to = dates[dates.length - 1];
  const today = todayJst();

  const { data: staffData } = await supabase.from("staff_profiles").select("staff_id, staff_code, family_name, given_name").eq("staff_id", staffId).maybeSingle();
  const staff = staffData as StaffRow | null;
  if (!staff) notFound();

  const windowStart = new Date(`${addDays(from, -1)}T00:00:00+09:00`).toISOString();
  const windowEnd = new Date(`${addDays(to, 1)}T12:00:00+09:00`).toISOString();
  const [{ data: dailyData }, { data: punchData }, { data: shiftData }, { data: leaveData }, { data: contractData }, { data: dayRecordData }, { data: listData }] =
    await Promise.all([
      supabase.from("attendance_daily").select("*").eq("staff_id", staffId).gte("work_date", from).lte("work_date", to),
      supabase
        .from("raw_punch_events")
        .select("event_id, clinic_id, punch_type, punched_at, source, is_void, void_of_event_id, is_delayed_submission")
        .eq("staff_id", staffId)
        .gte("punched_at", windowStart)
        .lt("punched_at", windowEnd)
        .order("punched_at"),
      supabase.from("shifts").select("*").eq("staff_id", staffId).gte("work_date", from).lte("work_date", to).in("status", ["confirmed", "revised"]),
      supabase
        .from("leave_requests")
        .select("leave_type, start_date, end_date, unit, status")
        .eq("staff_id", staffId)
        .lte("start_date", to)
        .gte("end_date", from)
        .in("status", ["pending", "manager_approved", "approved"]),
      supabase.from("employment_contracts").select("*").eq("staff_id", staffId),
      isHq(actor)
        ? supabase.from("staff_day_records").select("work_date, code").eq("staff_id", staffId).gte("work_date", from).lte("work_date", to)
        : Promise.resolve({ data: [] }),
      supabase.from("attendance_daily").select("staff_id").eq("home_clinic_id", clinicId).gte("work_date", from).lte("work_date", to),
    ]);

  const daily = new Map(((dailyData ?? []) as DailyRow[]).map((d) => [d.work_date, d]));
  const allPunches = (punchData ?? []) as PunchRow[];
  const voided = new Set(allPunches.filter((p) => p.is_void).map((p) => p.void_of_event_id));
  const punchesByDay = groupPunchesByDay(
    allPunches.filter((p) => !p.is_void),
    dates,
  );
  const shifts = ((shiftData ?? []) as ShiftRow[]).map(toShiftView);
  const leaves = (leaveData ?? []) as LeaveRow[];
  const dayCodes = new Map(((dayRecordData ?? []) as { work_date: string; code: DayCode }[]).map((r) => [r.work_date, r.code]));
  const contract = ((contractData ?? []) as ContractRow[]).find((c) => isActiveOn(c, to));
  const total = summarizeMonth([...daily.values()], contract ? contract.fixed_overtime_minutes : null, today);
  const leaveDays = leaves
    .filter((l) => l.status === "approved")
    .reduce((acc, l) => acc + dates.filter((d) => d >= l.start_date && d <= l.end_date).length * (l.unit === "full" ? 1 : l.unit === "hour" ? 0 : 0.5), 0);
  const clinicName = new Map(clinics.map((c) => [c.clinic_id, c.name]));

  // 同じ院・同じ月のスタッフ（前後の人へ移動するため）
  const listIds = [...new Set(((listData ?? []) as { staff_id: string }[]).map((r) => r.staff_id))];
  const { data: listStaffData } = listIds.length
    ? await supabase.from("staff_profiles").select("staff_id, staff_code, family_name, given_name").in("staff_id", listIds)
    : { data: [] };
  const listStaff = ((listStaffData ?? []) as StaffRow[]).sort((a, b) => a.staff_code.localeCompare(b.staff_code));
  const pos = listStaff.findIndex((s) => s.staff_id === staffId);
  const prev = pos > 0 ? listStaff[pos - 1] : null;
  const next = pos >= 0 && pos < listStaff.length - 1 ? listStaff[pos + 1] : null;
  const href = (id: string, m = month) => `/manager/attendance/monthly/${id}?clinic=${clinicId}&month=${m}`;

  const stats: [string, string, string?][] = [
    ["出勤日数", `${total.days}日`],
    ["実労働", hm(total.worked)],
    ["法定時間外", hm(total.statutory), total.statutory > 0 ? "font-bold" : ""],
    ["みなし残業", total.hasContract ? hm(total.fixed) : "契約未登録"],
    ["みなし超過", hm(total.excess), total.excess > 0 ? "text-rose-700 font-bold" : ""],
    ["所定外（法定内）", hm(total.nonStatutory)],
    ["深夜", hm(total.night)],
    ["法定休日", hm(total.legal)],
    ["所定休日", hm(total.scheduledHoliday)],
    ["遅刻", total.lateCount ? `${total.lateCount}回・${total.lateMinutes}分` : "—"],
    ["早退", total.earlyCount ? `${total.earlyCount}回・${total.earlyMinutes}分` : "—"],
    ["欠勤", total.absent ? `${total.absent}日` : "—"],
    ["休暇（承認済み）", leaveDays ? `${leaveDays}日` : "—"],
  ];

  return (
    <>
      <PageHeader
        title={`個人の月次：${staffName(staff)}（${staff.staff_code}）`}
        description="日ごとのシフト・打刻・労働時間と月の合計です。打刻の修正は日付を押して日次確認の画面から申請します。"
        actions={
          <Link href={`/manager/attendance/monthly?clinic=${clinicId}&month=${month}`} className="text-sm text-brand-700 underline">
            月次集計（一覧）へ戻る
          </Link>
        }
      />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 text-sm">
        <div className="flex items-center gap-2">
          <Link href={href(staffId, addMonths(month, -1))} className="rounded-md border border-slate-300 bg-white px-3 py-2 hover:bg-slate-50">
            ← 前月
          </Link>
          <span className="px-2 text-lg font-bold">
            {month.slice(0, 4)}年{Number(month.slice(5))}月
          </span>
          <Link href={href(staffId, addMonths(month, 1))} className="rounded-md border border-slate-300 bg-white px-3 py-2 hover:bg-slate-50">
            翌月 →
          </Link>
        </div>
        <div className="flex items-center gap-2">
          {prev && (
            <Link href={href(prev.staff_id)} className="rounded-md border border-slate-300 bg-white px-3 py-2 hover:bg-slate-50">
              ← {staffName(prev)}
            </Link>
          )}
          {next && (
            <Link href={href(next.staff_id)} className="rounded-md border border-slate-300 bg-white px-3 py-2 hover:bg-slate-50">
              {staffName(next)} →
            </Link>
          )}
        </div>
      </div>

      <Card title="この月の合計" className="mb-6">
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {stats.map(([label, value, cls]) => (
            <div key={label} className="rounded-md bg-slate-50 px-3 py-2">
              <dt className="text-xs text-slate-500">{label}</dt>
              <dd className={`text-base ${cls ?? ""}`}>{value}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-3 flex flex-wrap gap-2">
          {total.missing > 0 && <Badge tone="red">打刻漏れ {total.missing}日</Badge>}
          {total.recalc > 0 && <Badge tone="red">再計算要 {total.recalc}日</Badge>}
          {total.unconfirmed > 0 && <Badge tone="yellow">未確認 {total.unconfirmed}日</Badge>}
        </div>
      </Card>

      <Card title="日ごとの勤怠">
        <Table head={["日付", "区分", "シフト", "打刻", "実働 / 休憩", "法定外 / 深夜", "遅刻 / 早退", "休暇", "状態・注意"]}>
          {dates.map((date) => {
            const d = daily.get(date);
            const wd = weekdayOf(date);
            const punches = punchesByDay.get(date) ?? [];
            const myShifts = shifts.filter((s) => s.workDate === date);
            const myLeaves = leaves.filter((l) => date >= l.start_date && date <= l.end_date);
            const code = dayCodes.get(date);
            const future = date > today;
            return (
              <tr key={date} className={`align-top ${wd === 0 || wd === 6 ? "bg-slate-50/60" : ""}`}>
                <Td>
                  <Link href={`/manager/attendance?clinic=${clinicId}&date=${date}`} className="text-brand-700 underline">
                    {Number(date.slice(8))}日
                  </Link>
                  <span className={`ml-1 ${wd === 0 ? "text-rose-600" : wd === 6 ? "text-sky-600" : "text-slate-500"}`}>（{WEEKDAY_LABELS[wd]}）</span>
                </Td>
                <Td>
                  {code ? <Badge tone="blue">{DAY_CODE_LABELS[code]}</Badge> : d && d.day_type !== "workday" ? <Badge tone="blue">{DAY_TYPE_LABELS[d.day_type]}</Badge> : null}
                </Td>
                <Td>
                  {myShifts.length ? (
                    myShifts.map((s) => (
                      <div key={s.shiftId}>
                        {shiftLabel(s)}
                        {s.clinicId !== clinicId && <span className="ml-1 text-xs text-slate-500">（{clinicName.get(s.clinicId) ?? "他院"}）</span>}
                      </div>
                    ))
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </Td>
                <Td>
                  {punches.length === 0 ? (
                    <span className="text-slate-400">{future ? "" : "打刻なし"}</span>
                  ) : (
                    <ul className="space-y-0.5 text-xs">
                      {punches.map((p) => (
                        <li key={p.event_id} className={voided.has(p.event_id) ? "text-slate-400 line-through" : ""}>
                          {timeFmt.format(new Date(p.punched_at))} {PUNCH_TYPE_LABELS[p.punch_type]}
                          {p.source === "adjustment" && <span className="ml-1 text-sky-700">（修正）</span>}
                          {p.is_delayed_submission && <span className="ml-1 text-amber-700">（遅延）</span>}
                          {p.clinic_id !== clinicId && <span className="ml-1 text-slate-500">（{clinicName.get(p.clinic_id) ?? "他院"}）</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                </Td>
                <Td>{d && d.worked_minutes > 0 ? `${hm(d.worked_minutes)} / ${hm(d.break_minutes)}` : "—"}</Td>
                <Td>
                  {d && (d.overtime_statutory_minutes > 0 || d.late_night_minutes > 0 || d.legal_holiday_minutes > 0) ? (
                    <>
                      <span className={d.overtime_statutory_minutes > 0 ? "font-bold text-rose-700" : ""}>{hm(d.overtime_statutory_minutes)}</span> / {hm(d.late_night_minutes)}
                      {d.legal_holiday_minutes > 0 && <div className="text-xs text-rose-700">法定休日 {hm(d.legal_holiday_minutes)}</div>}
                    </>
                  ) : (
                    "—"
                  )}
                </Td>
                <Td>{d && (d.late_minutes > 0 || d.early_leave_minutes > 0) ? `${d.late_minutes}分 / ${d.early_leave_minutes}分` : "—"}</Td>
                <Td>
                  {myLeaves.map((l, i) => (
                    <div key={i} className="text-xs">
                      {LEAVE_TYPE_LABELS[l.leave_type]}（{LEAVE_UNIT_LABELS[l.unit]}）
                      {l.status !== "approved" && <span className="ml-1 text-amber-700">承認待ち</span>}
                    </div>
                  ))}
                </Td>
                <Td className="whitespace-normal">
                  {d ? (
                    <div className="flex max-w-56 flex-wrap gap-1">
                      <Badge tone={d.status === "open" ? "gray" : "green"}>{ATTENDANCE_STATUS_LABELS[d.status]}</Badge>
                      {d.is_absent && <Badge tone="red">欠勤</Badge>}
                      {d.needs_recalc && <Badge tone="red">再計算要</Badge>}
                      {d.anomalies.map((a) => (
                        <Badge key={a} tone={ANOMALY_LABELS[a]?.level === "error" ? "red" : "yellow"}>
                          {ANOMALY_LABELS[a]?.label ?? a}
                        </Badge>
                      ))}
                    </div>
                  ) : null}
                </Td>
              </tr>
            );
          })}
        </Table>
      </Card>
      <p className="mt-2 text-xs text-slate-500">
        取り消し線＝修正により取り消された打刻。法定時間外＝1日8時間超＋週40時間超（法定休日の労働は除く）。応援先での勤務も含みます。
        {isHq(actor) ? "「区分」は休日管理の区分（本部のみ表示）です。" : ""}
      </p>
    </>
  );
}
