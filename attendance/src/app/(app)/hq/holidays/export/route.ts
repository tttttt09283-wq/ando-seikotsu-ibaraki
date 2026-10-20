import { NextResponse, type NextRequest } from "next/server";
import { getActor } from "@/lib/auth/session";
import { isHq } from "@/lib/auth/permissions";
import { createSupabaseServer } from "@/lib/supabase/server";
import { staffName, type StaffRow } from "@/lib/data/types";
import { buildCalendar, countCodes, defaultFromMonth, type CalendarInput } from "@/lib/holiday/calendar";
import { DAY_CODES, type DayCode } from "@/lib/holiday/codes";
import { buildHolidayWorkbook } from "@/lib/holiday/export";
import { addDays, addMonths, isValidMonth, todayJst } from "@/lib/time/jst";

/** 休日管理カレンダー（1人・12か月）を、今の勤怠管理表と同じ配置の Excel で出力する。本部のみ */
export async function GET(request: NextRequest) {
  const actor = await getActor();
  if (!actor || !isHq(actor)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const staffId = request.nextUrl.searchParams.get("staff") ?? "";
  const fromParam = request.nextUrl.searchParams.get("from") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(staffId)) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  const supabase = await createSupabaseServer();
  const [{ data: staffData }, { data: settingData }] = await Promise.all([
    supabase.from("staff_profiles").select("*").eq("staff_id", staffId).maybeSingle(),
    supabase.from("staff_leave_settings").select("grant_basis, first_base_date").eq("staff_id", staffId).maybeSingle(),
  ]);
  const staff = staffData as StaffRow | null;
  if (!staff) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const setting = settingData as { grant_basis: string; first_base_date: string | null } | null;
  const firstBase = setting?.grant_basis === "base_date" ? setting.first_base_date : null;
  const fromMonth = isValidMonth(fromParam) ? fromParam : defaultFromMonth(todayJst(), firstBase);
  const from = `${fromMonth}-01`;
  const to = addDays(`${addMonths(fromMonth, 12)}-01`, -1);

  const { data: recordData } = await supabase
    .from("staff_day_records")
    .select("work_date, code, source")
    .eq("staff_id", staffId)
    .gte("work_date", from)
    .lte("work_date", to);
  const months = buildCalendar({
    fromMonth,
    records: (recordData ?? []) as CalendarInput["records"],
    shifts: [],
    attendance: [],
    leaves: [],
    closedMonths: [],
  });
  const counts = countCodes(months);
  const half = (c: DayCode) => counts[c] * 0.5;
  const summary = [
    { label: "有休使用（計画年休含む）", value: counts.paid + counts.planned_paid + half("paid_half") },
    { label: "休日出勤", value: counts.holiday_work + half("half_work") },
    { label: "振休・代休の使用", value: counts.furikyu + counts.daikyu + half("furikyu_half") + half("daikyu_half") },
    ...DAY_CODES.filter((c) => ["legal_holiday", "non_legal_holiday", "pay_conversion", "special_paid", "special_unpaid", "absence", "suspension", "late", "early"].includes(c.code)).map(
      (c) => ({ label: c.label, value: counts[c.code] }),
    ),
  ];
  const body = await buildHolidayWorkbook({
    staffName: staffName(staff),
    staffCode: staff.staff_code,
    hireDate: staff.hire_date,
    firstBaseDate: firstBase,
    months,
    summary,
  });
  await supabase.rpc("log_export", { p_report: "holiday_calendar", p_params: { staff_id: staffId, from: fromMonth }, p_rows: (recordData ?? []).length });
  const fileName = `${staff.family_name}${staff.given_name}(勤怠管理表 ${fromMonth}~).xlsx`;
  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="holiday.xlsx"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "Cache-Control": "no-store",
    },
  });
}
