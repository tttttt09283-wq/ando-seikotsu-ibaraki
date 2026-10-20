import Link from "next/link";
import { requireHq } from "@/lib/auth/session";
import { createSupabaseServer } from "@/lib/supabase/server";
import { ActionForm } from "@/components/ActionForm";
import { Card, EmptyState, Field, Input, PageHeader, Select } from "@/components/ui";
import { isActiveOn, staffName, type AssignmentRow, type ClinicRow, type StaffRow } from "@/lib/data/types";
import { buildCalendar, countCodes, defaultFromMonth, periodMonths, type CalendarInput } from "@/lib/holiday/calendar";
import { DAY_CODES, type DayCode } from "@/lib/holiday/codes";
import { addDays, addMonths, isValidMonth, todayJst, WEEKDAY_LABELS } from "@/lib/time/jst";
import { HolidayCalendar } from "./HolidayCalendar";
import { classifyOffDays, saveLeaveSettings } from "./actions";

interface Settings {
  grant_basis: "hire_date" | "base_date";
  first_base_date: string | null;
  carryover_max: string;
}

interface Balance {
  staff_id: string;
  paid_balance: string;
  paid_reserved: string;
  holiday_credit_balance: string;
  holiday_credit_reserved: string;
  holiday_credit_expiring: string | null;
}

const SUMMARY: { label: string; codes: DayCode[]; half?: DayCode[] }[] = [
  { label: "法定内（法定休日）", codes: ["legal_holiday"] },
  { label: "法定外（所定休日）", codes: ["non_legal_holiday"], half: ["half_non_legal"] },
  { label: "有休（計画年休を含む）", codes: ["paid", "planned_paid"], half: ["paid_half"] },
  { label: "休日出勤", codes: ["holiday_work"], half: ["half_work"] },
  { label: "振休・代休の使用", codes: ["furikyu", "daikyu"], half: ["furikyu_half", "daikyu_half"] },
  { label: "給与変換", codes: ["pay_conversion"] },
  { label: "特休（有給）", codes: ["special_paid"] },
  { label: "特休（無給）", codes: ["special_unpaid"] },
  { label: "欠勤", codes: ["absence"] },
  { label: "休業", codes: ["suspension"] },
  { label: "遅刻 / 早退", codes: ["late", "early"] },
];

/**
 * 休日管理（本部のみ）：スタッフごとに1年分の出勤区分（法定内・法定外・休出・振休・代休・有休・特休 など）を管理する。
 * 今の勤怠管理表（1人1ファイル）と同じ見え方。法定内・法定外は勤怠の法定休日の計算に使う。
 */
export default async function HolidayManagementPage({
  searchParams,
}: {
  searchParams: Promise<{ clinic?: string; staff?: string; from?: string }>;
}) {
  await requireHq();
  const params = await searchParams;
  const supabase = await createSupabaseServer();
  const today = todayJst();

  const [{ data: clinicData }, { data: staffData }, { data: assignmentData }] = await Promise.all([
    supabase.from("clinics").select("clinic_id, name").order("display_order"),
    supabase.from("staff_profiles").select("*").neq("status", "retired").order("staff_code"),
    supabase.from("staff_clinic_assignments").select("*").eq("assignment_type", "primary"),
  ]);
  const clinics = (clinicData ?? []) as Pick<ClinicRow, "clinic_id" | "name">[];
  const assignments = ((assignmentData ?? []) as AssignmentRow[]).filter((a) => isActiveOn(a, today));
  const clinicId = clinics.find((c) => c.clinic_id === params.clinic)?.clinic_id ?? null;
  const staffList = ((staffData ?? []) as StaffRow[]).filter(
    (s) => !clinicId || assignments.some((a) => a.staff_id === s.staff_id && a.clinic_id === clinicId),
  );
  const staff = staffList.find((s) => s.staff_id === params.staff) ?? null;

  const header = (
    <>
      <PageHeader
        title="休日管理"
        description="スタッフごとの1年分の出勤区分（法定内・法定外・休出・振休・代休・有休・特休など）を管理します。本部のみが閲覧・変更できます。"
        actions={
          <Link href="/hq/holidays/import" className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white">
            勤怠管理表（Excel）を取り込む
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
          <select name="staff" defaultValue={staff?.staff_id ?? ""} className="rounded-md border border-slate-300 bg-white px-3 py-2">
            <option value="">選択してください</option>
            {staffList.map((s) => (
              <option key={s.staff_id} value={s.staff_id}>
                {s.staff_code} {staffName(s)}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="rounded-md bg-navy-900 px-4 py-2 font-medium text-white">
          表示
        </button>
      </form>
    </>
  );
  if (!staff) return (
    <>
      {header}
      <EmptyState>スタッフを選んでください</EmptyState>
    </>
  );

  const { data: settingData } = await supabase.from("staff_leave_settings").select("*").eq("staff_id", staff.staff_id).maybeSingle();
  const settings = settingData as Settings | null;
  const firstBase = settings?.grant_basis === "base_date" ? settings.first_base_date : null;
  const fromMonth = params.from && isValidMonth(params.from) ? params.from : defaultFromMonth(today, firstBase);
  const months = periodMonths(fromMonth);
  const from = `${fromMonth}-01`;
  const to = addDays(`${addMonths(fromMonth, 12)}-01`, -1);
  const homeClinic = assignments.find((a) => a.staff_id === staff.staff_id)?.clinic_id ?? null;

  const [{ data: recordData }, { data: shiftData }, { data: attendanceData }, { data: leaveData }, { data: closingData }, { data: balanceData }] =
    await Promise.all([
      supabase.from("staff_day_records").select("work_date, code, source").eq("staff_id", staff.staff_id).gte("work_date", from).lte("work_date", to),
      supabase
        .from("shifts")
        .select("work_date, shift_type")
        .eq("staff_id", staff.staff_id)
        .gte("work_date", from)
        .lte("work_date", to)
        .in("status", ["confirmed", "revised"]),
      supabase
        .from("attendance_daily")
        .select("work_date, worked_minutes, day_type, is_absent, late_minutes, early_leave_minutes")
        .eq("staff_id", staff.staff_id)
        .gte("work_date", from)
        .lte("work_date", to),
      supabase
        .from("leave_requests")
        .select("start_date, end_date, leave_type, unit")
        .eq("staff_id", staff.staff_id)
        .eq("status", "approved")
        .lte("start_date", to)
        .gte("end_date", from),
      homeClinic
        ? supabase.from("monthly_closings").select("year_month").eq("clinic_id", homeClinic).eq("status", "closed").gte("year_month", from).lte("year_month", to)
        : Promise.resolve({ data: [] }),
      supabase.rpc("leave_balance_list", { p_on: today }),
    ]);
  const calendar = buildCalendar({
    fromMonth,
    records: (recordData ?? []) as { work_date: string; code: DayCode; source: string }[],
    shifts: (shiftData ?? []) as { work_date: string; shift_type: string }[],
    attendance: (attendanceData ?? []) as CalendarInput["attendance"],
    leaves: (leaveData ?? []) as { start_date: string; end_date: string; leave_type: string; unit: string }[],
    closedMonths: ((closingData ?? []) as { year_month: string }[]).map((c) => c.year_month.slice(0, 7)),
  });
  const counts = countCodes(calendar);
  const balance = ((balanceData ?? []) as Balance[]).find((b) => b.staff_id === staff.staff_id);
  const sum = (codes: DayCode[], half: DayCode[] = []) => codes.reduce((s, c) => s + counts[c], 0) + half.reduce((s, c) => s + counts[c], 0) * 0.5;
  const q = (p: Record<string, string>) => `?${new URLSearchParams({ ...(clinicId ? { clinic: clinicId } : {}), staff: staff.staff_id, from: fromMonth, ...p })}`;

  return (
    <>
      {header}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">
            {staffName(staff)} <span className="text-sm font-normal text-slate-500">{staff.staff_code}・入社 {staff.hire_date}</span>
          </h2>
          <p className="text-sm text-slate-600">
            {months[0].replace("-", "年")}月〜{months[11].replace("-", "年")}月
            {firstBase && `（基準日 ${firstBase.slice(5).replace("-", "月")}日）`}
          </p>
        </div>
        <div className="flex items-center gap-3 text-sm text-brand-700">
          <Link className="underline" href={q({ from: addMonths(fromMonth, -12) })}>
            前の1年
          </Link>
          <Link className="underline" href={q({ from: addMonths(fromMonth, 12) })}>
            次の1年
          </Link>
          <a className="rounded-md border border-slate-300 px-3 py-1.5 text-slate-700 hover:bg-slate-50" href={`/hq/holidays/export${q({})}`}>
            Excelで出力
          </a>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
        <HolidayCalendar staffId={staff.staff_id} months={calendar} />
        <div className="space-y-4">
          <Card title="この1年の集計">
            <dl className="space-y-1 text-sm">
              {SUMMARY.map((s) => (
                <div key={s.label} className="flex justify-between">
                  <dt className="text-slate-600">{s.label}</dt>
                  <dd className="font-medium">{sum(s.codes, s.half)}日</dd>
                </div>
              ))}
            </dl>
          </Card>
          <Card title={`残数（${today}時点）`}>
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-600">有休</dt>
                <dd className="font-medium">
                  {Number(balance?.paid_balance ?? 0)}日{Number(balance?.paid_reserved ?? 0) > 0 && `（申請中 ${Number(balance?.paid_reserved)}日）`}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-600">振休・代休</dt>
                <dd className="font-medium">
                  {Number(balance?.holiday_credit_balance ?? 0)}日
                  {balance?.holiday_credit_expiring && <span className="ml-1 text-xs text-slate-500">（期限 {balance.holiday_credit_expiring}）</span>}
                </dd>
              </div>
            </dl>
            <Link href={`/hq/leave/${staff.staff_id}`} className="mt-2 inline-block text-sm text-brand-700 underline">
              有休・振休の台帳を見る
            </Link>
          </Card>
          <Card title="休みを一括で区分">
            <ActionForm action={classifyOffDays} submitLabel="区分する" className="space-y-3" resetOnSuccess={false}>
              <input type="hidden" name="staff_id" value={staff.staff_id} />
              <p className="text-xs text-slate-600">確定シフトの「休み」で区分の無い日を、選んだ曜日は「法定内」、それ以外は「法定外」にします。</p>
              <div className="flex gap-2">
                <Field label="から">
                  <Input type="month" name="from_month" defaultValue={fromMonth} required />
                </Field>
                <Field label="まで">
                  <Input type="month" name="to_month" defaultValue={months[11]} required />
                </Field>
              </div>
              <Field label="法定内（法定休日）の曜日">
                <Select name="legal_weekday" defaultValue="0">
                  {WEEKDAY_LABELS.map((w, i) => (
                    <option key={w} value={i}>
                      {w}曜日
                    </option>
                  ))}
                </Select>
              </Field>
            </ActionForm>
          </Card>
          <Card title="有休の付与方式">
            <ActionForm action={saveLeaveSettings} submitLabel="保存" className="space-y-3" resetOnSuccess={false}>
              <input type="hidden" name="staff_id" value={staff.staff_id} />
              <Field label="方式">
                <Select name="grant_basis" defaultValue={settings?.grant_basis ?? "hire_date"}>
                  <option value="hire_date">入社日基準（入社6か月後、以後1年ごと）</option>
                  <option value="base_date">基準日方式（毎年同じ日に付与）</option>
                </Select>
              </Field>
              <Field label="最初の付与日（基準日方式）" hint="入社6か月後以前の日。以後毎年この月日に付与">
                <Input type="date" name="first_base_date" defaultValue={settings?.first_base_date ?? ""} />
              </Field>
              <Field label="繰越の上限（日）">
                <Input type="number" name="carryover_max" step="0.5" min="0" max="40" defaultValue={Number(settings?.carryover_max ?? 20)} />
              </Field>
            </ActionForm>
          </Card>
          <Card title="区分の一覧">
            <ul className="space-y-1 text-xs text-slate-600">
              {DAY_CODES.map((c) => (
                <li key={c.code}>
                  <span className="font-medium text-slate-800">{c.label}</span>：{c.description}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
