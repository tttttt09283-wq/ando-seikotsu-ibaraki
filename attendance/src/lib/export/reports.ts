/**
 * 帳票（9種＋給与一覧）の定義とデータの読み込み。読み込みは利用者本人の権限（RLS）で行い、
 * さらに院長は担当院の分だけに絞る。時間は「時間（小数2桁）」、日数は「日」で出す。
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { isHq, managedClinicIds, type Actor } from "@/lib/auth/permissions";
import { ANOMALY_LABELS, ATTENDANCE_STATUS_LABELS, CLOSING_STATUS_LABELS, DAY_TYPE_LABELS, fixedOvertimeExcess } from "@/lib/attendance/labels";
import { isActiveOn, staffName, type AssignmentRow, type ContractRow, type StaffRow } from "@/lib/data/types";
import { EMPLOYMENT_TYPE_LABELS } from "@/lib/validation/schemas";
import { addDays, addMonths, todayJst, WEEKDAY_LABELS, weekdayOf } from "@/lib/time/jst";
import { fetchAll } from "@/lib/data/fetch-all";
import { loadPayrollMonth } from "@/lib/payroll/load";
import { toPayrollTable } from "@/lib/payroll/table";
import { toHours, type ExportCell, type ExportTable } from "./format";

export type ReportId =
  | "monthly_all"
  | "monthly_clinic"
  | "daily_detail"
  | "paid_balance"
  | "paid_history"
  | "credit_balance"
  | "credit_history"
  | "anomalies"
  | "closings"
  | "payroll";

export interface ReportDefinition {
  id: ReportId;
  label: string;
  description: string;
  hqOnly: boolean;
}

export const REPORTS: ReportDefinition[] = [
  { id: "monthly_all", label: "全院月次勤怠一覧", description: "全院のスタッフ別の月間集計（給与計算用）", hqOnly: true },
  { id: "monthly_clinic", label: "院別月次勤怠一覧", description: "院ごとの月間合計と締め状況", hqOnly: false },
  { id: "daily_detail", label: "スタッフ別勤怠明細", description: "スタッフ・日ごとの出退勤、休憩、労働時間、異常", hqOnly: false },
  { id: "paid_balance", label: "有給残数一覧", description: "有給の残数・申請中・直近の付与・年5日の取得状況", hqOnly: true },
  { id: "paid_history", label: "有給付与・取得履歴", description: "対象月の付与・取得・取消・失効・調整", hqOnly: true },
  { id: "credit_balance", label: "祝日勤務休日（振休）残数一覧", description: "振休の残数・申請中・最も近い期限", hqOnly: true },
  { id: "credit_history", label: "祝日勤務休日（振休）付与履歴", description: "対象月の振休の付与・使用・失効・取消", hqOnly: true },
  { id: "anomalies", label: "勤怠異常一覧", description: "打刻漏れ・欠勤・遅刻・早退・休憩不足・再計算待ちなど", hqOnly: false },
  { id: "closings", label: "月次締め状況一覧", description: "院ごとの院長確認・締め・再開の状況と未解決の件数", hqOnly: false },
  { id: "payroll", label: "給与一覧（残業代計算表）", description: "賃金管理：残業・深夜・法定休日・60時間超の割増と支給総額（本部のみ）", hqOnly: true },
];

export const reportById = (id: string) => REPORTS.find((r) => r.id === id);

export interface ReportParams {
  month: string; // YYYY-MM
  clinicId: string | null;
}

interface DailyRow {
  staff_id: string;
  work_date: string;
  home_clinic_id: string | null;
  first_clock_in: string | null;
  last_clock_out: string | null;
  break_minutes: number;
  worked_minutes: number;
  scheduled_minutes: number;
  within_scheduled_minutes: number;
  overtime_non_statutory_minutes: number;
  overtime_statutory_minutes: number;
  weekly_overtime_minutes: number;
  late_night_minutes: number;
  legal_holiday_minutes: number;
  scheduled_holiday_minutes: number;
  late_minutes: number;
  early_leave_minutes: number;
  is_absent: boolean;
  has_missing_punch: boolean;
  anomalies: string[];
  day_type: string;
  status: string;
  needs_recalc: boolean;
}


const monthRange = (month: string) => ({ from: `${month}-01`, to: addDays(`${addMonths(month, 1)}-01`, -1) });
const timeFmt = new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit", hour12: false });
const dateTimeFmt = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
const hhmm = (iso: string | null) => (iso ? timeFmt.format(new Date(iso)) : "");
const ymdhm = (iso: string | null) => (iso ? dateTimeFmt.format(new Date(iso)) : "");
const num = (v: string | number | null | undefined) => (v === null || v === undefined ? 0 : Number(v));

const HOURS = "0.00";
const DAYS = "0.0";

const LEAVE_ENTRY_LABELS: Record<string, string> = { grant: "付与", use: "取得", use_reversal: "取得の取消", expire: "失効", adjust: "調整" };
const CREDIT_ENTRY_LABELS: Record<string, string> = { ...LEAVE_ENTRY_LABELS, use: "使用", use_reversal: "使用の取消", revoke: "付与の取消" };

/** 帳票の対象とする院（本部は全院または指定院、院長は担当院のうち指定院） */
export function scopeClinicIds(actor: Actor, allClinicIds: string[], clinicId: string | null): string[] {
  const allowed = isHq(actor) ? allClinicIds : managedClinicIds(actor).filter((id) => allClinicIds.includes(id));
  return clinicId ? allowed.filter((id) => id === clinicId) : allowed;
}

interface Context {
  supabase: SupabaseClient;
  actor: Actor;
  params: ReportParams;
  clinicIds: string[];
  clinicName: Map<string, string>;
  clinicOrder: Map<string, number>;
  staff: Map<string, StaffRow>;
  primary: (staffId: string, on: string) => string | null;
}

async function loadContext(supabase: SupabaseClient, actor: Actor, params: ReportParams): Promise<Context> {
  const [{ data: clinicData }, staffRows, assignmentRows] = await Promise.all([
    supabase.from("clinics").select("clinic_id, name, display_order").order("display_order"),
    fetchAll<StaffRow>((f, t) => supabase.from("staff_profiles").select("*").order("staff_code").range(f, t)),
    fetchAll<AssignmentRow>((f, t) =>
      supabase.from("staff_clinic_assignments").select("*").eq("assignment_type", "primary").order("valid_from").range(f, t),
    ),
  ]);
  const clinics = (clinicData ?? []) as { clinic_id: string; name: string; display_order: number }[];
  return {
    supabase,
    actor,
    params,
    clinicIds: scopeClinicIds(actor, clinics.map((c) => c.clinic_id), params.clinicId),
    clinicName: new Map(clinics.map((c) => [c.clinic_id, c.name])),
    clinicOrder: new Map(clinics.map((c) => [c.clinic_id, c.display_order])),
    staff: new Map(staffRows.map((s) => [s.staff_id, s])),
    primary: (staffId, on) => assignmentRows.find((a) => a.staff_id === staffId && isActiveOn(a, on))?.clinic_id ?? null,
  };
}

const staffCols = (ctx: Context, staffId: string): ExportCell[] => {
  const s = ctx.staff.get(staffId);
  return [s?.staff_code ?? "", s ? staffName(s) : ""];
};

/** 並び順：院の表示順 → スタッフID → 日付 */
function sortByClinicStaff<T>(ctx: Context, rows: T[], clinic: (r: T) => string | null, staff: (r: T) => string, date?: (r: T) => string) {
  return rows.sort(
    (a, b) =>
      (ctx.clinicOrder.get(clinic(a) ?? "") ?? 999) - (ctx.clinicOrder.get(clinic(b) ?? "") ?? 999) ||
      (ctx.staff.get(staff(a))?.staff_code ?? "").localeCompare(ctx.staff.get(staff(b))?.staff_code ?? "") ||
      (date ? date(a).localeCompare(date(b)) : 0),
  );
}

async function loadDaily(ctx: Context): Promise<DailyRow[]> {
  if (ctx.clinicIds.length === 0) return [];
  const { from, to } = monthRange(ctx.params.month);
  return fetchAll<DailyRow>((f, t) =>
    ctx.supabase
      .from("attendance_daily")
      .select("*")
      .in("home_clinic_id", ctx.clinicIds)
      .gte("work_date", from)
      .lte("work_date", to)
      .order("work_date")
      .order("staff_id")
      .range(f, t),
  );
}

async function loadClosings(ctx: Context) {
  const { data } = await ctx.supabase
    .from("monthly_closings")
    .select("*")
    .in("clinic_id", ctx.clinicIds)
    .eq("year_month", `${ctx.params.month}-01`);
  return new Map(
    ((data ?? []) as { clinic_id: string; status: string; manager_confirmed_at: string | null; closed_at: string | null; reopen_count: number }[]).map(
      (c) => [c.clinic_id, c],
    ),
  );
}

const closingLabel = (status: string | undefined) => CLOSING_STATUS_LABELS[status ?? "open"].label;

// ---- 1. 全院月次勤怠一覧（スタッフ別） ----
async function monthlyAll(ctx: Context): Promise<ExportTable> {
  const { from, to } = monthRange(ctx.params.month);
  const [daily, contracts, leaveUse, creditUse, closings] = await Promise.all([
    loadDaily(ctx),
    fetchAll<ContractRow>((f, t) => ctx.supabase.from("employment_contracts").select("*").range(f, t)),
    fetchAll<{ staff_id: string; days: string }>((f, t) =>
      ctx.supabase.from("leave_ledger_entries").select("staff_id, days").in("entry_type", ["use", "use_reversal"]).gte("effective_date", from).lte("effective_date", to).range(f, t),
    ),
    fetchAll<{ staff_id: string; credited_days: string }>((f, t) =>
      ctx.supabase
        .from("holiday_credit_ledger")
        .select("staff_id, credited_days")
        .in("entry_type", ["use", "use_reversal"])
        .gte("effective_date", from)
        .lte("effective_date", to)
        .range(f, t),
    ),
    loadClosings(ctx),
  ]);
  const groups = new Map<string, DailyRow[]>();
  for (const d of daily) {
    const key = `${d.home_clinic_id}|${d.staff_id}`;
    groups.set(key, [...(groups.get(key) ?? []), d]);
  }
  const entries = sortByClinicStaff(ctx, [...groups.entries()], ([k]) => k.split("|")[0], ([k]) => k.split("|")[1]);
  const sum = (rows: DailyRow[], key: keyof DailyRow) => rows.reduce((s, r) => s + num(r[key] as number), 0);
  const rows = entries.map(([key, list]) => {
    const [clinicId, staffId] = key.split("|");
    const contract = contracts.find((c) => c.staff_id === staffId && isActiveOn(c, to));
    const statutory = sum(list, "overtime_statutory_minutes");
    const fixed = contract?.fixed_overtime_minutes ?? 0;
    return [
      ctx.clinicName.get(clinicId) ?? "",
      ...staffCols(ctx, staffId),
      contract ? EMPLOYMENT_TYPE_LABELS[contract.employment_type] : "",
      list.filter((d) => d.worked_minutes > 0).length,
      toHours(sum(list, "worked_minutes")),
      toHours(sum(list, "scheduled_minutes")),
      toHours(sum(list, "within_scheduled_minutes")),
      toHours(sum(list, "overtime_non_statutory_minutes")),
      toHours(statutory),
      toHours(sum(list, "weekly_overtime_minutes")),
      toHours(fixed),
      toHours(fixedOvertimeExcess(statutory, fixed)),
      toHours(sum(list, "late_night_minutes")),
      toHours(sum(list, "legal_holiday_minutes")),
      toHours(sum(list, "scheduled_holiday_minutes")),
      list.filter((d) => d.late_minutes > 0).length,
      sum(list, "late_minutes"),
      list.filter((d) => d.early_leave_minutes > 0).length,
      sum(list, "early_leave_minutes"),
      list.filter((d) => d.is_absent).length,
      list.filter((d) => d.has_missing_punch).length,
      -leaveUse.filter((e) => e.staff_id === staffId).reduce((s, e) => s + num(e.days), 0),
      -creditUse.filter((e) => e.staff_id === staffId).reduce((s, e) => s + num(e.credited_days), 0),
      closingLabel(closings.get(clinicId)?.status),
    ];
  });
  return {
    title: `全院月次勤怠一覧_${ctx.params.month}`,
    headers: [
      "院", "スタッフID", "氏名", "雇用形態", "出勤日数", "実労働（時間）", "所定労働（時間）", "所定内（時間）", "所定外・法定内（時間）",
      "法定時間外（時間）", "うち週40時間超（時間）", "みなし残業（時間）", "みなし残業の超過（時間）", "深夜（時間）", "法定休日労働（時間）",
      "所定休日労働（時間）", "遅刻回数", "遅刻（分）", "早退回数", "早退（分）", "欠勤日数", "打刻漏れ（日）", "有給取得（日）", "振休使用（日）", "締め状態",
    ],
    rows,
    numberFormats: [, , , , , HOURS, HOURS, HOURS, HOURS, HOURS, HOURS, HOURS, HOURS, HOURS, HOURS, HOURS, , , , , , , DAYS, DAYS],
  };
}

// ---- 2. 院別月次勤怠一覧（院ごとの合計） ----
async function monthlyClinic(ctx: Context): Promise<ExportTable> {
  const [daily, closings] = await Promise.all([loadDaily(ctx), loadClosings(ctx)]);
  const line = (name: string, list: DailyRow[], status: string) => {
    const sum = (key: keyof DailyRow) => list.reduce((s, r) => s + num(r[key] as number), 0);
    return [
      name,
      new Set(list.filter((d) => d.worked_minutes > 0).map((d) => d.staff_id)).size,
      list.filter((d) => d.worked_minutes > 0).length,
      toHours(sum("worked_minutes")),
      toHours(sum("scheduled_minutes")),
      toHours(sum("overtime_non_statutory_minutes")),
      toHours(sum("overtime_statutory_minutes")),
      toHours(sum("late_night_minutes")),
      toHours(sum("legal_holiday_minutes")),
      list.filter((d) => d.late_minutes > 0).length,
      list.filter((d) => d.early_leave_minutes > 0).length,
      list.filter((d) => d.is_absent).length,
      list.filter((d) => d.has_missing_punch).length,
      list.filter((d) => d.status === "open").length,
      status,
    ];
  };
  const rows = ctx.clinicIds.map((id) =>
    line(ctx.clinicName.get(id) ?? "", daily.filter((d) => d.home_clinic_id === id), closingLabel(closings.get(id)?.status)),
  );
  if (ctx.clinicIds.length > 1) rows.push(line("合計", daily, ""));
  return {
    title: `院別月次勤怠一覧_${ctx.params.month}`,
    headers: [
      "院", "勤務人数", "出勤延べ日数", "実労働（時間）", "所定労働（時間）", "所定外・法定内（時間）", "法定時間外（時間）", "深夜（時間）",
      "法定休日労働（時間）", "遅刻（件）", "早退（件）", "欠勤（日）", "打刻漏れ（日）", "院長未確認（日）", "締め状態",
    ],
    rows,
    numberFormats: [, , , HOURS, HOURS, HOURS, HOURS, HOURS, HOURS],
  };
}

// ---- 3. スタッフ別勤怠明細（日ごと） ----
async function dailyDetail(ctx: Context): Promise<ExportTable> {
  const { from, to } = monthRange(ctx.params.month);
  const daily = await loadDaily(ctx);
  const staffIds = [...new Set(daily.map((d) => d.staff_id))];
  const shifts = staffIds.length
    ? await fetchAll<{ staff_id: string; work_date: string; scheduled_start: string | null; scheduled_end: string | null; shift_type: string }>((f, t) =>
        ctx.supabase
          .from("shifts")
          .select("staff_id, work_date, scheduled_start, scheduled_end, shift_type")
          .in("staff_id", staffIds)
          .gte("work_date", from)
          .lte("work_date", to)
          .in("status", ["confirmed", "revised"])
          .order("scheduled_start")
          .range(f, t),
      )
    : [];
  const rows = sortByClinicStaff(ctx, daily, (d) => d.home_clinic_id, (d) => d.staff_id, (d) => d.work_date).map((d) => {
    const mine = shifts.filter((s) => s.staff_id === d.staff_id && s.work_date === d.work_date);
    return [
      ctx.clinicName.get(d.home_clinic_id ?? "") ?? "",
      ...staffCols(ctx, d.staff_id),
      d.work_date,
      WEEKDAY_LABELS[weekdayOf(d.work_date)],
      DAY_TYPE_LABELS[d.day_type] ?? d.day_type,
      mine.map((s) => (s.shift_type === "work" ? `${hhmm(s.scheduled_start)}-${hhmm(s.scheduled_end)}` : "休み")).join(" / "),
      hhmm(d.first_clock_in),
      hhmm(d.last_clock_out),
      toHours(d.break_minutes),
      toHours(d.worked_minutes),
      toHours(d.within_scheduled_minutes),
      toHours(d.overtime_non_statutory_minutes),
      toHours(d.overtime_statutory_minutes),
      toHours(d.late_night_minutes),
      toHours(d.legal_holiday_minutes),
      d.late_minutes,
      d.early_leave_minutes,
      d.is_absent ? "欠勤" : "",
      d.anomalies.map((a) => ANOMALY_LABELS[a]?.label ?? a).join("・"),
      ATTENDANCE_STATUS_LABELS[d.status] ?? d.status,
    ];
  });
  return {
    title: `スタッフ別勤怠明細_${ctx.params.month}`,
    headers: [
      "院", "スタッフID", "氏名", "日付", "曜日", "日区分", "確定シフト", "出勤", "退勤", "休憩（時間）", "実労働（時間）", "所定内（時間）",
      "所定外・法定内（時間）", "法定時間外（時間）", "深夜（時間）", "法定休日労働（時間）", "遅刻（分）", "早退（分）", "欠勤", "異常", "状態",
    ],
    rows,
    numberFormats: [, , , , , , , , , HOURS, HOURS, HOURS, HOURS, HOURS, HOURS, HOURS],
  };
}

/** 残数一覧の基準日：対象月の末日（今月以降は今日） */
const balanceDate = (month: string) => {
  const end = monthRange(month).to;
  const today = todayJst();
  return end < today ? end : today;
};

const inScope = (ctx: Context, staffId: string, on: string) => {
  const clinic = ctx.primary(staffId, on);
  return clinic !== null && ctx.clinicIds.includes(clinic);
};

interface BalanceRow {
  staff_id: string;
  paid_balance: string;
  paid_reserved: string;
  holiday_credit_balance: string;
  holiday_credit_reserved: string;
  holiday_credit_expiring: string | null;
}

// ---- 4. 有給残数一覧 ----
async function paidBalance(ctx: Context): Promise<ExportTable> {
  const on = balanceDate(ctx.params.month);
  const [{ data: balanceData, error }, grants, { data: obligationData }] = await Promise.all([
    ctx.supabase.rpc("leave_balance_list", { p_on: on }),
    fetchAll<{ staff_id: string; grant_date: string; granted_days: string; expiration_date: string }>((f, t) =>
      ctx.supabase.from("leave_grants").select("staff_id, grant_date, granted_days, expiration_date").order("grant_date").range(f, t),
    ),
    ctx.supabase.rpc("annual_leave_obligations", { p_as_of: on }),
  ]);
  if (error) throw new Error(error.message);
  const obligations = (obligationData ?? []) as { staff_id: string; period_end: string; taken_days: string; shortfall: string }[];
  const balances = ((balanceData ?? []) as BalanceRow[]).filter((b) => inScope(ctx, b.staff_id, on));
  const rows = sortByClinicStaff(ctx, balances, (b) => ctx.primary(b.staff_id, on), (b) => b.staff_id).map((b) => {
    const latest = grants.filter((g) => g.staff_id === b.staff_id && g.grant_date <= on).at(-1);
    const ob = obligations.find((o) => o.staff_id === b.staff_id);
    return [
      ctx.clinicName.get(ctx.primary(b.staff_id, on) ?? "") ?? "",
      ...staffCols(ctx, b.staff_id),
      ctx.staff.get(b.staff_id)?.hire_date ?? "",
      num(b.paid_balance),
      num(b.paid_reserved),
      num(b.paid_balance) - num(b.paid_reserved),
      latest?.grant_date ?? "",
      latest ? num(latest.granted_days) : "",
      latest?.expiration_date ?? "",
      ob ? num(ob.taken_days) : "",
      ob ? num(ob.shortfall) : "",
      ob?.period_end ?? "",
    ];
  });
  return {
    title: `有給残数一覧_${on}`,
    headers: [
      "院", "スタッフID", "氏名", "入社日", "有給残（日）", "申請中（日）", "使用可能（日）", "直近の付与日", "付与日数", "有効期限",
      "年5日 取得済み（日）", "年5日 不足（日）", "年5日 期限",
    ],
    rows,
    numberFormats: [, , , , DAYS, DAYS, DAYS, , DAYS, , DAYS, DAYS],
  };
}

// ---- 5. 有給付与・取得履歴 ----
async function paidHistory(ctx: Context): Promise<ExportTable> {
  const { from, to } = monthRange(ctx.params.month);
  const [entries, grants] = await Promise.all([
    fetchAll<{ staff_id: string; leave_grant_id: string; entry_type: string; days: string; effective_date: string; note: string | null; created_at: string }>((f, t) =>
      ctx.supabase
        .from("leave_ledger_entries")
        .select("staff_id, leave_grant_id, entry_type, days, effective_date, note, created_at")
        .gte("effective_date", from)
        .lte("effective_date", to)
        .order("effective_date")
        .order("created_at")
        .range(f, t),
    ),
    fetchAll<{ leave_grant_id: string; grant_date: string; expiration_date: string; grant_type: string }>((f, t) =>
      ctx.supabase.from("leave_grants").select("leave_grant_id, grant_date, expiration_date, grant_type").range(f, t),
    ),
  ]);
  const grantById = new Map(grants.map((g) => [g.leave_grant_id, g]));
  const rows = entries
    .filter((e) => inScope(ctx, e.staff_id, e.effective_date))
    .map((e) => {
      const g = grantById.get(e.leave_grant_id);
      return [
        e.effective_date,
        ctx.clinicName.get(ctx.primary(e.staff_id, e.effective_date) ?? "") ?? "",
        ...staffCols(ctx, e.staff_id),
        LEAVE_ENTRY_LABELS[e.entry_type] ?? e.entry_type,
        num(e.days),
        g?.grant_date ?? "",
        g?.expiration_date ?? "",
        e.note ?? "",
        ymdhm(e.created_at),
      ];
    });
  return {
    title: `有給付与・取得履歴_${ctx.params.month}`,
    headers: ["日付", "院", "スタッフID", "氏名", "区分", "日数（＋付与／−取得）", "対象の付与日", "有効期限", "備考", "記録日時"],
    rows,
    numberFormats: [, , , , , DAYS],
  };
}

// ---- 6. 振休残数一覧 ----
async function creditBalance(ctx: Context): Promise<ExportTable> {
  const on = balanceDate(ctx.params.month);
  const { data, error } = await ctx.supabase.rpc("leave_balance_list", { p_on: on });
  if (error) throw new Error(error.message);
  const balances = ((data ?? []) as BalanceRow[]).filter((b) => inScope(ctx, b.staff_id, on));
  const rows = sortByClinicStaff(ctx, balances, (b) => ctx.primary(b.staff_id, on), (b) => b.staff_id).map((b) => [
    ctx.clinicName.get(ctx.primary(b.staff_id, on) ?? "") ?? "",
    ...staffCols(ctx, b.staff_id),
    num(b.holiday_credit_balance),
    num(b.holiday_credit_reserved),
    num(b.holiday_credit_balance) - num(b.holiday_credit_reserved),
    b.holiday_credit_expiring ?? "",
  ]);
  return {
    title: `振休残数一覧_${on}`,
    headers: ["院", "スタッフID", "氏名", "振休残（日）", "申請中（日）", "使用可能（日）", "最も近い期限"],
    rows,
    numberFormats: [, , , DAYS, DAYS, DAYS],
  };
}

// ---- 7. 振休付与履歴 ----
async function creditHistory(ctx: Context): Promise<ExportTable> {
  const { from, to } = monthRange(ctx.params.month);
  const entries = await fetchAll<{
    staff_id: string;
    entry_type: string;
    credited_days: string;
    effective_date: string;
    source_work_date: string | null;
    expiration_date: string | null;
    bucket_id: string | null;
    note: string | null;
    created_at: string;
  }>((f, t) =>
    ctx.supabase
      .from("holiday_credit_ledger")
      .select("staff_id, entry_type, credited_days, effective_date, source_work_date, expiration_date, bucket_id, note, created_at")
      .gte("effective_date", from)
      .lte("effective_date", to)
      .order("effective_date")
      .order("created_at")
      .range(f, t),
  );
  const rows = entries
    .filter((e) => inScope(ctx, e.staff_id, e.effective_date))
    .map((e) => [
      e.effective_date,
      ctx.clinicName.get(ctx.primary(e.staff_id, e.effective_date) ?? "") ?? "",
      ...staffCols(ctx, e.staff_id),
      CREDIT_ENTRY_LABELS[e.entry_type] ?? e.entry_type,
      num(e.credited_days),
      e.source_work_date ?? "",
      e.expiration_date ?? "",
      e.note ?? "",
      ymdhm(e.created_at),
    ]);
  return {
    title: `振休付与履歴_${ctx.params.month}`,
    headers: ["日付", "院", "スタッフID", "氏名", "区分", "日数（＋付与／−使用）", "祝日勤務日", "期限", "備考", "記録日時"],
    rows,
    numberFormats: [, , , , , DAYS],
  };
}

// ---- 8. 勤怠異常一覧 ----
async function anomalies(ctx: Context): Promise<ExportTable> {
  const daily = await loadDaily(ctx);
  const flagged = daily.filter(
    (d) => d.has_missing_punch || d.is_absent || d.needs_recalc || d.anomalies.length > 0 || d.late_minutes > 0 || d.early_leave_minutes > 0,
  );
  const rows = sortByClinicStaff(ctx, flagged, (d) => d.home_clinic_id, (d) => d.staff_id, (d) => d.work_date).map((d) => {
    const items = [
      ...(d.has_missing_punch ? ["打刻漏れ"] : []),
      ...(d.is_absent ? ["欠勤"] : []),
      ...(d.needs_recalc ? ["再計算待ち"] : []),
      ...d.anomalies.map((a) => ANOMALY_LABELS[a]?.label ?? a),
      ...(d.late_minutes > 0 ? ["遅刻"] : []),
      ...(d.early_leave_minutes > 0 ? ["早退"] : []),
    ];
    const level = d.has_missing_punch || d.needs_recalc || d.anomalies.some((a) => ANOMALY_LABELS[a]?.level === "error") ? "要対応" : "確認";
    return [
      ctx.clinicName.get(d.home_clinic_id ?? "") ?? "",
      ...staffCols(ctx, d.staff_id),
      d.work_date,
      WEEKDAY_LABELS[weekdayOf(d.work_date)],
      level,
      [...new Set(items)].join("・"),
      hhmm(d.first_clock_in),
      hhmm(d.last_clock_out),
      d.late_minutes,
      d.early_leave_minutes,
      ATTENDANCE_STATUS_LABELS[d.status] ?? d.status,
    ];
  });
  return {
    title: `勤怠異常一覧_${ctx.params.month}`,
    headers: ["院", "スタッフID", "氏名", "日付", "曜日", "重要度", "内容", "出勤", "退勤", "遅刻（分）", "早退（分）", "状態"],
    rows,
  };
}

// ---- 9. 月次締め状況一覧 ----
async function closingsReport(ctx: Context): Promise<ExportTable> {
  const month = `${ctx.params.month}-01`;
  const [closings, { data: eventData }, issues] = await Promise.all([
    loadClosings(ctx),
    ctx.supabase.from("monthly_closing_events").select("clinic_id, action, reason, created_at").in("clinic_id", ctx.clinicIds).eq("year_month", month).order("id"),
    Promise.all(
      ctx.clinicIds.map(async (id) => {
        const { data } = await ctx.supabase.rpc("closing_issues", { p_clinic_id: id, p_month: month });
        return [id, (data ?? {}) as Record<string, number>] as const;
      }),
    ),
  ]);
  const events = (eventData ?? []) as { clinic_id: string; action: string; reason: string | null; created_at: string }[];
  const issueMap = new Map(issues);
  const rows = ctx.clinicIds.map((id) => {
    const c = closings.get(id);
    const lastReopen = events.filter((e) => e.clinic_id === id && e.action === "reopen").at(-1);
    const i = issueMap.get(id) ?? {};
    return [
      ctx.clinicName.get(id) ?? "",
      ctx.params.month,
      closingLabel(c?.status),
      ymdhm(c?.manager_confirmed_at ?? null),
      ymdhm(c?.closed_at ?? null),
      c?.reopen_count ?? 0,
      lastReopen ? `${ymdhm(lastReopen.created_at)} ${lastReopen.reason ?? ""}` : "",
      i.missing_punch ?? 0,
      i.needs_recalc ?? 0,
      i.unconfirmed ?? 0,
      i.pending_adjustments ?? 0,
      i.pending_leave ?? 0,
    ];
  });
  return {
    title: `月次締め状況一覧_${ctx.params.month}`,
    headers: [
      "院", "対象月", "状態", "院長確認日時", "締め日時", "再開回数", "最後の再開（日時・理由）", "打刻漏れ（日）", "再計算待ち（日）", "院長未確認（日）",
      "打刻修正の承認待ち（件）", "休暇の承認待ち（件）",
    ],
    rows,
  };
}

// ---- 10. 給与一覧（賃金管理・本部のみ） ----
async function payroll(ctx: Context): Promise<ExportTable> {
  const rows = (await loadPayrollMonth(ctx.supabase, ctx.params.month)).filter((r) => r.clinicId === null || ctx.clinicIds.includes(r.clinicId));
  return toPayrollTable(
    sortByClinicStaff(ctx, rows, (r) => r.clinicId, (r) => r.staff.staff_id),
    ctx.clinicName,
    ctx.params.month,
  );
}

const BUILDERS: Record<ReportId, (ctx: Context) => Promise<ExportTable>> = {
  monthly_all: monthlyAll,
  monthly_clinic: monthlyClinic,
  daily_detail: dailyDetail,
  paid_balance: paidBalance,
  paid_history: paidHistory,
  credit_balance: creditBalance,
  credit_history: creditHistory,
  anomalies,
  closings: closingsReport,
  payroll,
};

/** 帳票を作る（権限は呼び出し側で確認済みであること） */
export async function buildReport(supabase: SupabaseClient, actor: Actor, id: ReportId, params: ReportParams): Promise<ExportTable> {
  const ctx = await loadContext(supabase, actor, params);
  return BUILDERS[id](ctx);
}
