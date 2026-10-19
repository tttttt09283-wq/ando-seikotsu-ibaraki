import Link from "next/link";
import { requireHq } from "@/lib/auth/session";
import { createSupabaseServer } from "@/lib/supabase/server";
import { Badge, Card, EmptyState, PageHeader, Table, Td } from "@/components/ui";
import { CLINIC_STATUS_LABELS, isActiveOn, staffName, type AssignmentRow, type ClinicRow, type ContractRow, type StaffRow } from "@/lib/data/types";
import { CLOSING_STATUS_LABELS, fixedOvertimeExcess, hm } from "@/lib/attendance/labels";
import { emptyTotals, sumSummary, summaryByClinic, todayStatuses, type SummaryRow, type SummaryTotals } from "@/lib/dashboard/today";
import { addDays, addMonths, isValidDateString, todayJst } from "@/lib/time/jst";

interface ShiftLite {
  staff_id: string;
  clinic_id: string;
  scheduled_start: string;
  scheduled_end: string;
}

interface PunchLite {
  event_id: string;
  staff_id: string;
  punch_type: string;
  punched_at: string;
  is_void: boolean;
  void_of_event_id: string | null;
}

interface BalanceRow {
  staff_id: string;
  paid_balance: string;
  paid_reserved: string;
  holiday_credit_balance: string;
  holiday_credit_reserved: string;
  holiday_credit_expiring: string | null;
}

interface ClosingRow {
  clinic_id: string;
  year_month: string;
  status: string;
}

const timeFmt = new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit", hour12: false });
const days = (v: string | number) => `${Number(v)}日`;

/** 期間の既定：今月1日〜今月末 */
function defaultPeriod(today: string) {
  const month = today.slice(0, 7);
  return { from: `${month}-01`, to: addDays(`${addMonths(month, 1)}-01`, -1) };
}

/** 期間に含まれる月（YYYY-MM-01） */
function monthsBetween(from: string, to: string) {
  const out: string[] = [];
  for (let m = from.slice(0, 7); m <= to.slice(0, 7); m = addMonths(m, 1)) out.push(`${m}-01`);
  return out;
}

/**
 * 本部の統合ダッシュボード：全院の当日の出勤状況、承認待ち、期間の勤怠集計、月次締め、有給・振休の残数。
 * 院・スタッフ・期間で絞り込める。数値はすべて DB の集計（RLS が効く）から作る。
 */
export default async function HqDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ clinic?: string; staff?: string; from?: string; to?: string }>;
}) {
  await requireHq();
  const params = await searchParams;
  const supabase = await createSupabaseServer();
  const now = new Date();
  const today = todayJst(now);
  const period = defaultPeriod(today);
  let from = params.from && isValidDateString(params.from) ? params.from : period.from;
  let to = params.to && isValidDateString(params.to) ? params.to : period.to;
  if (to < from) [from, to] = [to, from];
  const tooLong = addDays(from, 92) < to;
  if (tooLong) to = addDays(from, 92);

  const windowStart = new Date(`${today}T00:00:00+09:00`).toISOString();
  const windowEnd = new Date(`${addDays(today, 1)}T12:00:00+09:00`).toISOString();

  const [
    { data: clinicData },
    { data: assignmentData },
    { data: staffData },
    { data: contractData },
    { data: shiftData },
    { data: punchData },
    { data: adjustmentData },
    { data: leaveData },
    { data: creditData },
    { data: summaryData, error: summaryError },
    { data: closingData },
    { data: balanceData },
  ] = await Promise.all([
    supabase.from("clinics").select("*").order("display_order"),
    supabase.from("staff_clinic_assignments").select("staff_id, clinic_id, assignment_type, valid_from, valid_to"),
    supabase.from("staff_profiles").select("staff_id, staff_code, family_name, given_name, status").neq("status", "retired").order("staff_code"),
    supabase.from("employment_contracts").select("*"),
    supabase
      .from("shifts")
      .select("staff_id, clinic_id, scheduled_start, scheduled_end")
      .eq("work_date", today)
      .eq("shift_type", "work")
      .in("status", ["confirmed", "revised"]),
    supabase
      .from("raw_punch_events")
      .select("event_id, staff_id, punch_type, punched_at, is_void, void_of_event_id")
      .gte("punched_at", windowStart)
      .lt("punched_at", windowEnd),
    supabase.from("attendance_adjustment_requests").select("clinic_id").eq("status", "manager_approved"),
    supabase.from("leave_requests").select("home_clinic_id, status").in("status", ["pending", "manager_approved"]),
    supabase.from("holiday_credit_requests").select("home_clinic_id, status").in("status", ["candidate", "pending"]),
    supabase.rpc("attendance_summary", { p_from: from, p_to: to }),
    supabase.from("monthly_closings").select("clinic_id, year_month, status").gte("year_month", `${from.slice(0, 7)}-01`).lte("year_month", to),
    supabase.rpc("leave_balance_list", { p_on: today }),
  ]);

  const clinics = (clinicData ?? []) as ClinicRow[];
  const clinicName = new Map(clinics.map((c) => [c.clinic_id, c.name]));
  const clinicId = clinics.find((c) => c.clinic_id === params.clinic)?.clinic_id ?? null;
  const allStaff = (staffData ?? []) as (StaffRow & { status: string })[];
  const activeIds = new Set(allStaff.filter((s) => s.status === "active").map((s) => s.staff_id));
  const assignments = ((assignmentData ?? []) as AssignmentRow[]).filter((a) => isActiveOn(a, today));
  const primaryClinic = new Map(assignments.filter((a) => a.assignment_type === "primary").map((a) => [a.staff_id, a.clinic_id]));
  const staffInScope = allStaff.filter((s) => !clinicId || primaryClinic.get(s.staff_id) === clinicId);
  const staffId = staffInScope.find((s) => s.staff_id === params.staff)?.staff_id ?? null;
  const staffById = new Map(allStaff.map((s) => [s.staff_id, s]));
  const visibleClinics = clinics.filter((c) => !clinicId || c.clinic_id === clinicId);

  // ---- 当日の出勤状況 ----
  const punches = (punchData ?? []) as PunchLite[];
  const voided = new Set(punches.filter((p) => p.is_void).map((p) => p.void_of_event_id));
  const statuses = todayStatuses(
    ((shiftData ?? []) as ShiftLite[]).map((s) => ({ staffId: s.staff_id, clinicId: s.clinic_id, start: s.scheduled_start, end: s.scheduled_end })),
    punches.filter((p) => !p.is_void && !voided.has(p.event_id)).map((p) => ({ staffId: p.staff_id, punchType: p.punch_type, punchedAt: p.punched_at })),
    now,
  ).filter((s) => !staffId || s.staffId === staffId);
  const missing = statuses.filter((s) => s.state === "missing" && (!clinicId || s.clinicId === clinicId));

  // ---- 承認待ち ----
  const count = <T,>(rows: T[] | null, key: keyof T, cid: string, pred: (r: T) => boolean = () => true) =>
    (rows ?? []).filter((r) => r[key] === cid && pred(r)).length;
  const adjustments = (adjustmentData ?? []) as { clinic_id: string }[];
  const leaves = (leaveData ?? []) as { home_clinic_id: string; status: string }[];
  const credits = (creditData ?? []) as { home_clinic_id: string; status: string }[];

  // ---- 期間の集計 ----
  const summaryRows = ((summaryData ?? []) as SummaryRow[]).filter(
    (r) => (!clinicId || r.home_clinic_id === clinicId) && (!staffId || r.staff_id === staffId),
  );
  const byClinic = summaryByClinic(summaryRows);
  const total = sumSummary(summaryRows);
  const contracts = (contractData ?? []) as ContractRow[];
  const singleMonth = from.slice(0, 7) === to.slice(0, 7) && from.endsWith("-01") && to === defaultPeriod(`${from.slice(0, 7)}-01`).to;
  const showStaff = Boolean(clinicId || staffId);

  // ---- 月次締め ----
  const closings = (closingData ?? []) as ClosingRow[];
  const months = monthsBetween(from, to);

  // ---- 残数 ----
  const balances = ((balanceData ?? []) as BalanceRow[])
    .filter((b) => staffInScope.some((s) => s.staff_id === b.staff_id) && (!staffId || b.staff_id === staffId))
    .sort((a, b) => (staffById.get(a.staff_id)?.staff_code ?? "").localeCompare(staffById.get(b.staff_id)?.staff_code ?? ""));

  const query = (p: Record<string, string | null>) => {
    const q = new URLSearchParams();
    const merged = { clinic: clinicId, staff: staffId, from, to, ...p };
    for (const [k, v] of Object.entries(merged)) if (v) q.set(k, v);
    return `?${q.toString()}`;
  };

  const totalsCells = (t: SummaryTotals, fixed?: number) => (
    <>
      <Td>{t.work_days}日</Td>
      <Td>{hm(t.worked_minutes)}</Td>
      <Td>{hm(t.overtime_non_statutory_minutes)}</Td>
      <Td className={t.overtime_statutory_minutes > 0 ? "font-bold text-rose-700" : ""}>{hm(t.overtime_statutory_minutes)}</Td>
      {fixed !== undefined && (
        <Td className={fixedOvertimeExcess(t.overtime_statutory_minutes, fixed) > 0 ? "font-bold text-rose-700" : "text-slate-500"}>
          {singleMonth ? `${hm(fixedOvertimeExcess(t.overtime_statutory_minutes, fixed))}（みなし${hm(fixed)}）` : "—"}
        </Td>
      )}
      <Td>{hm(t.late_night_minutes)}</Td>
      <Td>{hm(t.legal_holiday_minutes)}</Td>
      <Td>
        {t.late_count}回 / {t.early_leave_count}回
      </Td>
      <Td className={t.absent_count ? "text-rose-700" : ""}>{t.absent_count}日</Td>
      <Td className={t.missing_punch_count ? "font-bold text-rose-700" : ""}>{t.missing_punch_count}件</Td>
      <Td className={t.unconfirmed_days ? "text-amber-700" : ""}>
        {t.unconfirmed_days}日{t.needs_recalc_days > 0 && <Badge tone="red">再計算要 {t.needs_recalc_days}</Badge>}
      </Td>
    </>
  );

  return (
    <>
      <PageHeader
        title="本部ダッシュボード"
        description={`${today} ${timeFmt.format(now)} 時点。全院の出勤状況・承認待ち・勤怠集計・残数を確認できます。`}
        actions={
          <Link href="/hq/approvals" className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white">
            承認待ちを一括承認
          </Link>
        }
      />

      <form method="get" className="mb-6 flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-4 text-sm">
        <label>
          <span className="mb-1 block font-medium text-slate-700">院</span>
          <select name="clinic" defaultValue={clinicId ?? ""} className="rounded-md border border-slate-300 bg-white px-3 py-2">
            <option value="">全院</option>
            {clinics.map((c) => (
              <option key={c.clinic_id} value={c.clinic_id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="mb-1 block font-medium text-slate-700">スタッフ</span>
          <select name="staff" defaultValue={staffId ?? ""} className="rounded-md border border-slate-300 bg-white px-3 py-2">
            <option value="">すべて</option>
            {staffInScope.map((s) => (
              <option key={s.staff_id} value={s.staff_id}>
                {s.staff_code} {staffName(s)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="mb-1 block font-medium text-slate-700">期間</span>
          <span className="flex items-center gap-1">
            <input type="date" name="from" defaultValue={from} aria-label="期間の開始" className="rounded-md border border-slate-300 px-2 py-1.5" />〜
            <input type="date" name="to" defaultValue={to} aria-label="期間の終了" className="rounded-md border border-slate-300 px-2 py-1.5" />
          </span>
        </label>
        <button type="submit" className="rounded-md bg-navy-900 px-4 py-2 font-medium text-white">
          表示
        </button>
        <span className="flex gap-2 text-brand-700">
          <Link className="underline" href={query({ from: `${addMonths(from.slice(0, 7), -1)}-01`, to: addDays(`${from.slice(0, 7)}-01`, -1) })}>
            前月
          </Link>
          <Link className="underline" href={query(defaultPeriod(today))}>
            今月
          </Link>
        </span>
        {tooLong && <span className="text-amber-700">期間は最大93日です（終了日を {to} にしました）</span>}
      </form>

      <div className="space-y-6">
        <Card title={`本日（${today}）の出勤状況`}>
          <Table head={["院", "状態", "スタッフ（主所属 / 応援）", "出勤予定", "出勤済", "退勤済", "未打刻", "遅刻", "早退"]}>
            {visibleClinics.map((c) => {
              const mine = statuses.filter((s) => s.clinicId === c.clinic_id);
              const here = assignments.filter((a) => a.clinic_id === c.clinic_id && activeIds.has(a.staff_id));
              const n = (state: string) => mine.filter((s) => s.state === state).length;
              return (
                <tr key={c.clinic_id}>
                  <Td className="font-medium">
                    <Link href={`/manager/attendance?clinic=${c.clinic_id}&date=${today}`} className="text-brand-700 underline">
                      {c.name}
                    </Link>
                  </Td>
                  <Td>
                    <Badge tone={c.status === "active" ? "green" : "gray"}>{CLINIC_STATUS_LABELS[c.status]}</Badge>
                  </Td>
                  <Td>
                    {here.filter((a) => a.assignment_type === "primary").length}名 / {here.filter((a) => a.assignment_type === "support").length}名
                  </Td>
                  <Td>{mine.length}名</Td>
                  <Td>{n("working")}名</Td>
                  <Td>{n("left")}名</Td>
                  <Td className={n("missing") ? "font-bold text-rose-700" : ""}>{n("missing")}名</Td>
                  <Td className={mine.some((s) => s.late) ? "text-amber-700" : ""}>{mine.filter((s) => s.late).length}名</Td>
                  <Td className={mine.some((s) => s.earlyLeave) ? "text-amber-700" : ""}>{mine.filter((s) => s.earlyLeave).length}名</Td>
                </tr>
              );
            })}
          </Table>
          {missing.length > 0 && (
            <div className="mt-3 rounded-md bg-rose-50 p-3 text-sm text-rose-800">
              <span className="font-medium">未打刻（シフト開始から10分以上経過）：</span>
              {missing
                .map((s) => {
                  const st = staffById.get(s.staffId);
                  return `${clinicName.get(s.clinicId) ?? ""} ${st ? staffName(st) : "—"}`;
                })
                .join("、")}
            </div>
          )}
          <p className="mt-2 text-xs text-slate-500">出勤予定は確定シフト（勤務）がある人。遅刻・早退は当日の打刻とシフトの比較です（確定値は日次勤怠の計算結果を参照）。</p>
        </Card>

        <Card title="承認待ち">
          <Table head={["院", "打刻修正（本部承認待ち）", "休暇（院長承認待ち）", "休暇（本部承認待ち）", "振休（未報告の候補）", "振休（本部承認待ち）"]}>
            {visibleClinics.map((c) => (
              <tr key={c.clinic_id}>
                <Td className="font-medium">{c.name}</Td>
                <Td className={count(adjustments, "clinic_id", c.clinic_id) ? "font-bold text-brand-700" : ""}>{count(adjustments, "clinic_id", c.clinic_id)}件</Td>
                <Td>{count(leaves, "home_clinic_id", c.clinic_id, (r) => r.status === "pending")}件</Td>
                <Td className={count(leaves, "home_clinic_id", c.clinic_id, (r) => r.status === "manager_approved") ? "font-bold text-brand-700" : ""}>
                  {count(leaves, "home_clinic_id", c.clinic_id, (r) => r.status === "manager_approved")}件
                </Td>
                <Td>{count(credits, "home_clinic_id", c.clinic_id, (r) => r.status === "candidate")}件</Td>
                <Td className={count(credits, "home_clinic_id", c.clinic_id, (r) => r.status === "pending") ? "font-bold text-brand-700" : ""}>
                  {count(credits, "home_clinic_id", c.clinic_id, (r) => r.status === "pending")}件
                </Td>
              </tr>
            ))}
          </Table>
          <Link href="/hq/approvals" className="mt-3 inline-block text-sm text-brand-700 underline">
            本部承認待ちを確認して一括承認する
          </Link>
        </Card>

        <Card title={`勤怠集計（${from}〜${to}）`}>
          {summaryError ? (
            <p className="text-sm text-rose-700">集計できませんでした：{summaryError.message}</p>
          ) : (
            <Table
              head={[
                showStaff ? "スタッフ" : "院",
                ...(showStaff ? [] : ["勤務人数"]),
                "出勤日数",
                "実働",
                "所定外（法定内）",
                "法定時間外",
                ...(showStaff ? ["みなし残業の超過"] : []),
                "深夜",
                "法定休日",
                "遅刻 / 早退",
                "欠勤",
                "打刻漏れ",
                "未確認（過去日）",
              ]}
            >
              {showStaff
                ? summaryRows
                    .sort((a, b) => (staffById.get(a.staff_id)?.staff_code ?? "").localeCompare(staffById.get(b.staff_id)?.staff_code ?? ""))
                    .map((r) => {
                      const st = staffById.get(r.staff_id);
                      const contract = contracts.find((c) => c.staff_id === r.staff_id && isActiveOn(c, to));
                      return (
                        <tr key={r.staff_id}>
                          <Td>
                            <Link href={query({ staff: r.staff_id })} className="font-medium text-brand-700 underline">
                              {st ? staffName(st) : "—"}
                            </Link>
                            <div className="text-xs text-slate-500">{st?.staff_code}</div>
                          </Td>
                          {totalsCells({ ...emptyTotals(), ...sumSummary([r]) }, contract?.fixed_overtime_minutes ?? 0)}
                        </tr>
                      );
                    })
                : visibleClinics.map((c) => {
                    const t = byClinic.get(c.clinic_id) ?? emptyTotals();
                    return (
                      <tr key={c.clinic_id}>
                        <Td>
                          <Link href={query({ clinic: c.clinic_id, staff: null })} className="font-medium text-brand-700 underline">
                            {c.name}
                          </Link>
                        </Td>
                        <Td>{t.staff_count}名</Td>
                        {totalsCells(t)}
                      </tr>
                    );
                  })}
              {!showStaff && (
                <tr className="bg-slate-50 font-bold">
                  <Td>全院合計</Td>
                  <Td>{total.staff_count}名</Td>
                  {totalsCells(total)}
                </tr>
              )}
            </Table>
          )}
          {showStaff && summaryRows.length === 0 && <EmptyState>この期間の勤怠はありません</EmptyState>}
          <p className="mt-2 text-xs text-slate-500">
            主所属院ごとの集計です（応援勤務は主所属院に計上）。法定時間外は1日8時間・週40時間を超えた分。みなし残業の超過は1か月単位で表示します。
          </p>
        </Card>

        <Card title="月次締め状況">
          <Table head={["院", ...months.map((m) => m.slice(0, 7))]}>
            {visibleClinics.map((c) => (
              <tr key={c.clinic_id}>
                <Td className="font-medium">{c.name}</Td>
                {months.map((m) => {
                  const s = closings.find((x) => x.clinic_id === c.clinic_id && x.year_month === m)?.status ?? "open";
                  return (
                    <Td key={m}>
                      <Badge tone={CLOSING_STATUS_LABELS[s].tone}>{CLOSING_STATUS_LABELS[s].label}</Badge>
                    </Td>
                  );
                })}
              </tr>
            ))}
          </Table>
        </Card>

        <Card title={`有給・振休の残数（${today}時点）`}>
          {balances.length === 0 ? (
            <EmptyState>対象のスタッフがいません</EmptyState>
          ) : (
            <Table head={["院", "スタッフ", "有給残", "有給 申請中", "振休残", "振休 申請中", "振休の最も近い期限"]}>
              {balances.map((b) => {
                const st = staffById.get(b.staff_id);
                const cid = primaryClinic.get(b.staff_id);
                const expiringSoon = b.holiday_credit_expiring !== null && b.holiday_credit_expiring <= addDays(today, 7);
                return (
                  <tr key={b.staff_id}>
                    <Td>{cid ? clinicName.get(cid) : "—"}</Td>
                    <Td>
                      <Link href={`/hq/leave/${b.staff_id}`} className="text-brand-700 underline">
                        {st ? staffName(st) : "—"}
                      </Link>
                      <span className="ml-2 text-xs text-slate-500">{st?.staff_code}</span>
                    </Td>
                    <Td className="font-medium">{days(b.paid_balance)}</Td>
                    <Td>{Number(b.paid_reserved) ? days(b.paid_reserved) : "—"}</Td>
                    <Td className="font-medium">{days(b.holiday_credit_balance)}</Td>
                    <Td>{Number(b.holiday_credit_reserved) ? days(b.holiday_credit_reserved) : "—"}</Td>
                    <Td className={expiringSoon ? "font-bold text-rose-700" : ""}>{b.holiday_credit_expiring ?? "—"}</Td>
                  </tr>
                );
              })}
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
