import { requireManager } from "@/lib/auth/session";
import { createSupabaseServer } from "@/lib/supabase/server";
import { ActionForm } from "@/components/ActionForm";
import { Badge, Card, EmptyState, Field, Input, PageHeader, Select, Table, Td } from "@/components/ui";
import { selectableClinics } from "@/lib/shifts/load";
import { shiftLabel, toShiftView, type ShiftRow } from "@/lib/shifts/model";
import { ANOMALY_LABELS, ATTENDANCE_STATUS_LABELS, DAY_TYPE_LABELS, hm, PUNCH_TYPE_LABELS } from "@/lib/attendance/labels";
import { isActiveOn, staffName, type AssignmentRow, type StaffRow } from "@/lib/data/types";
import { addDays, formatJstDateTime, isValidDateString, todayJst } from "@/lib/time/jst";
import { AttendanceToolbar } from "./AttendanceToolbar";
import { confirmAttendance, recalcAttendance, requestAdjustment } from "./actions";

interface DailyRow {
  attendance_id: string;
  staff_id: string;
  home_clinic_id: string | null;
  worked_minutes: number;
  break_minutes: number;
  scheduled_minutes: number;
  overtime_statutory_minutes: number;
  overtime_non_statutory_minutes: number;
  late_night_minutes: number;
  legal_holiday_minutes: number;
  late_minutes: number;
  early_leave_minutes: number;
  is_absent: boolean;
  has_missing_punch: boolean;
  anomalies: string[];
  day_type: string;
  legal_holiday_configured: boolean;
  status: string;
  needs_recalc: boolean;
}

interface PunchRow {
  event_id: string;
  staff_id: string;
  clinic_id: string;
  punch_type: string;
  punched_at: string;
  source: string;
  is_void: boolean;
  void_of_event_id: string | null;
  is_delayed_submission: boolean;
}

/**
 * その日の勤務の打刻だけを返す。翌日（正午まで）の打刻は、日跨ぎの勤務が終わっていない場合だけ含め、
 * 翌日の出勤打刻以降（翌日の勤務）は含めない。
 */
function punchesOfDay(sorted: PunchRow[], nextDayStart: number): PunchRow[] {
  const sameDay = sorted.filter((p) => Date.parse(p.punched_at) < nextDayStart);
  if (sameDay.length === 0 || sameDay[sameDay.length - 1].punch_type === "clock_out") return sameDay;
  const out = [...sameDay];
  for (const p of sorted.filter((x) => Date.parse(x.punched_at) >= nextDayStart)) {
    if (p.punch_type === "clock_in") break;
    out.push(p);
    if (p.punch_type === "clock_out") break;
  }
  return out;
}

const timeFmt = new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit", hour12: false });

/**
 * 日次勤怠確認（院長）：打刻原本と計算結果を並べて確認し、打刻漏れは修正申請、問題なければ院長確認。
 * 計算は DB で行い、打刻原本・承認済みの実績は画面から直接書き換えられない。
 */
export default async function AttendanceDailyPage({ searchParams }: { searchParams: Promise<{ clinic?: string; date?: string }> }) {
  const actor = await requireManager();
  const params = await searchParams;
  const supabase = await createSupabaseServer();
  const clinics = await selectableClinics(supabase, actor);
  const clinicId = clinics.find((c) => c.clinic_id === params.clinic)?.clinic_id ?? clinics[0]?.clinic_id;
  if (!clinicId) return <EmptyState>担当している院がありません</EmptyState>;
  const today = todayJst();
  const date = params.date && isValidDateString(params.date) ? params.date : today;
  const clinic = clinics.find((c) => c.clinic_id === clinicId) as { clinic_id: string; name: string };

  const { data: assignmentData } = await supabase.from("staff_clinic_assignments").select("*").eq("clinic_id", clinicId);
  const assignments = ((assignmentData ?? []) as AssignmentRow[]).filter((a) => isActiveOn(a, date));
  // 応援でこの院に打刻した人も含める
  const { data: segData } = await supabase.from("attendance_segments").select("staff_id").eq("clinic_id", clinicId).eq("work_date", date);
  const staffIds = [...new Set([...assignments.map((a) => a.staff_id), ...((segData ?? []) as { staff_id: string }[]).map((s) => s.staff_id)])];

  const windowStart = new Date(`${date}T00:00:00+09:00`).toISOString();
  const windowEnd = new Date(`${addDays(date, 1)}T12:00:00+09:00`).toISOString();
  const nextDayStart = Date.parse(`${addDays(date, 1)}T00:00:00+09:00`);
  const [{ data: staffData }, { data: dailyData }, { data: punchData }, { data: shiftData }] = staffIds.length
    ? await Promise.all([
        supabase.from("staff_profiles").select("staff_id, staff_code, family_name, given_name").in("staff_id", staffIds),
        supabase.from("attendance_daily").select("*").in("staff_id", staffIds).eq("work_date", date),
        supabase
          .from("raw_punch_events")
          .select("event_id, staff_id, clinic_id, punch_type, punched_at, source, is_void, void_of_event_id, is_delayed_submission")
          .in("staff_id", staffIds)
          .gte("punched_at", windowStart)
          .lt("punched_at", windowEnd)
          .order("punched_at"),
        supabase.from("shifts").select("*").in("staff_id", staffIds).eq("work_date", date).in("status", ["confirmed", "revised"]),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }];

  const staff = ((staffData ?? []) as StaffRow[]).sort((a, b) => a.staff_code.localeCompare(b.staff_code));
  const daily = new Map(((dailyData ?? []) as DailyRow[]).map((d) => [d.staff_id, d]));
  const punches = (punchData ?? []) as PunchRow[];
  const voided = new Set(punches.filter((p) => p.is_void).map((p) => p.void_of_event_id));
  const shifts = ((shiftData ?? []) as ShiftRow[]).map(toShiftView);
  const primaryIds = new Set(assignments.filter((a) => a.assignment_type === "primary").map((a) => a.staff_id));
  const needsRecalc = [...daily.values()].some((d) => d.needs_recalc);
  const legalMissing = [...daily.values()].some((d) => !d.legal_holiday_configured);

  return (
    <>
      <PageHeader title={`日次勤怠確認：${clinic.name}`} description="打刻は共用端末の記録（サーバー時刻）です。打刻漏れ・誤りは「打刻修正」から申請し、本部の承認後に反映されます。" />
      <AttendanceToolbar current="/manager/attendance" clinics={clinics} clinicId={clinicId} date={date} />

      <div className="mb-4 flex flex-wrap items-center gap-4">
        <ActionForm action={recalcAttendance} submitLabel="この日を再計算" tone="secondary" className="flex items-center gap-3">
          <input type="hidden" name="clinic_id" value={clinicId} />
          <input type="hidden" name="from" value={date} />
          <input type="hidden" name="to" value={date} />
        </ActionForm>
        {date < today && (
          <ActionForm
            action={confirmAttendance}
            submitLabel="この日を院長確認"
            className="flex items-center gap-3"
            confirmMessage="この日の勤怠（主所属スタッフ）を院長確認済みにします。よろしいですか？"
          >
            <input type="hidden" name="clinic_id" value={clinicId} />
            <input type="hidden" name="from" value={date} />
            <input type="hidden" name="to" value={date} />
          </ActionForm>
        )}
        {needsRecalc && <Badge tone="red">シフト変更により再計算が必要な勤怠があります</Badge>}
        {legalMissing && <Badge tone="yellow">法定休日が未登録のため、法定休日労働は判定していません</Badge>}
      </div>

      <Card>
        {staff.length === 0 ? (
          <EmptyState>この日に所属・応援登録のあるスタッフはいません</EmptyState>
        ) : (
          <Table head={["スタッフ", "確定シフト", "打刻（原本）", "実働 / 休憩", "法定外 / 深夜", "遅刻 / 早退", "状態・異常", "打刻修正"]}>
            {staff.map((s) => {
              const d = daily.get(s.staff_id);
              const mine = punchesOfDay(punches.filter((p) => p.staff_id === s.staff_id && !p.is_void), nextDayStart);
              const myShifts = shifts.filter((sh) => sh.staffId === s.staff_id);
              return (
                <tr key={s.staff_id} className="align-top">
                  <Td>
                    <div className="font-medium">{staffName(s)}</div>
                    <div className="text-xs text-slate-500">
                      {s.staff_code}
                      {!primaryIds.has(s.staff_id) && "（応援）"}
                    </div>
                  </Td>
                  <Td>{myShifts.length ? myShifts.map((sh) => <div key={sh.shiftId}>{shiftLabel(sh)}</div>) : <span className="text-slate-400">なし</span>}</Td>
                  <Td>
                    {mine.length === 0 && <span className="text-slate-400">打刻なし</span>}
                    <ul className="space-y-0.5 text-xs">
                      {mine.map((p) => (
                        <li key={p.event_id} className={voided.has(p.event_id) ? "text-slate-400 line-through" : ""}>
                          {timeFmt.format(new Date(p.punched_at))} {PUNCH_TYPE_LABELS[p.punch_type]}
                          {p.source === "adjustment" && <span className="ml-1 text-sky-700">（修正）</span>}
                          {p.is_delayed_submission && <span className="ml-1 text-amber-700">（遅延）</span>}
                          {p.clinic_id !== clinicId && <span className="ml-1 text-slate-500">（他院）</span>}
                        </li>
                      ))}
                    </ul>
                  </Td>
                  <Td>{d ? `${hm(d.worked_minutes)} / ${hm(d.break_minutes)}` : "—"}</Td>
                  <Td>
                    {d ? (
                      <>
                        <span className={d.overtime_statutory_minutes > 0 ? "font-bold text-rose-700" : ""}>{hm(d.overtime_statutory_minutes)}</span> / {hm(d.late_night_minutes)}
                        {d.legal_holiday_minutes > 0 && <div className="text-xs text-rose-700">法定休日 {hm(d.legal_holiday_minutes)}</div>}
                      </>
                    ) : (
                      "—"
                    )}
                  </Td>
                  <Td>{d ? `${d.late_minutes}分 / ${d.early_leave_minutes}分` : "—"}</Td>
                  <Td className="whitespace-normal">
                    {d ? (
                      <div className="flex max-w-56 flex-wrap gap-1">
                        <Badge tone={d.status === "manager_confirmed" ? "green" : "gray"}>{ATTENDANCE_STATUS_LABELS[d.status]}</Badge>
                        {d.day_type !== "workday" && <Badge tone="blue">{DAY_TYPE_LABELS[d.day_type]}</Badge>}
                        {d.is_absent && <Badge tone="red">欠勤</Badge>}
                        {d.needs_recalc && <Badge tone="red">再計算要</Badge>}
                        {d.anomalies.map((a) => (
                          <Badge key={a} tone={ANOMALY_LABELS[a]?.level === "error" ? "red" : "yellow"}>
                            {ANOMALY_LABELS[a]?.label ?? a}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <span className="text-slate-400">記録なし</span>
                    )}
                  </Td>
                  <Td>
                    <details>
                      <summary className="cursor-pointer text-sm text-brand-700">修正を申請</summary>
                      <ActionForm action={requestAdjustment} submitLabel="申請" className="mt-2 w-72 space-y-2">
                        <input type="hidden" name="clinic_id" value={clinicId} />
                        <input type="hidden" name="staff_id" value={s.staff_id} />
                        <input type="hidden" name="work_date" value={date} />
                        <Field label="修正の種類">
                          <Select name="change_type" defaultValue="add">
                            <option value="add">打刻を追加（打刻漏れ）</option>
                            <option value="replace">打刻の時刻を訂正</option>
                            <option value="void">打刻を取り消し（誤打刻）</option>
                          </Select>
                        </Field>
                        <Field label="追加する打刻（追加の場合）">
                          <Select name="punch_type" defaultValue="clock_out">
                            <option value="">—</option>
                            {Object.entries(PUNCH_TYPE_LABELS).map(([v, l]) => (
                              <option key={v} value={v}>
                                {l}
                              </option>
                            ))}
                          </Select>
                        </Field>
                        <Field label="対象の打刻（訂正・取り消しの場合）">
                          <Select name="target_event_id" defaultValue="">
                            <option value="">—</option>
                            {mine
                              .filter((p) => !voided.has(p.event_id))
                              .map((p) => (
                                <option key={p.event_id} value={p.event_id}>
                                  {timeFmt.format(new Date(p.punched_at))} {PUNCH_TYPE_LABELS[p.punch_type]}
                                </option>
                              ))}
                          </Select>
                        </Field>
                        <div className="flex items-end gap-2">
                          <Field label="正しい時刻">
                            <Input name="time" type="time" />
                          </Field>
                          <label className="mb-2 flex items-center gap-1 text-xs">
                            <input type="checkbox" name="next_day" /> 翌日
                          </label>
                        </div>
                        <Field label="理由">
                          <Input name="reason" placeholder="例：退勤の打刻忘れ" required />
                        </Field>
                      </ActionForm>
                    </details>
                  </Td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>
      <p className="mt-2 text-xs text-slate-500">
        取り消し線＝修正により取り消された打刻。最終更新 {formatJstDateTime(new Date())}
      </p>
    </>
  );
}
