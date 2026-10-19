import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import type { Actor } from "@/lib/auth/permissions";
import { buildReport, REPORTS, scopeClinicIds } from "@/lib/export/reports";

type Row = Record<string, unknown>;

/** テスト用の Supabase クライアント：表のデータに eq / in / gte / lte / order / range を適用して返す */
function fakeSupabase(tables: Record<string, Row[]>, rpcs: Record<string, (args: Row) => unknown> = {}) {
  const query = (rows: Row[]) => {
    let result = [...rows];
    const builder = {
      select: () => builder,
      eq: (k: string, v: unknown) => ((result = result.filter((r) => r[k] === v)), builder),
      neq: (k: string, v: unknown) => ((result = result.filter((r) => r[k] !== v)), builder),
      in: (k: string, vs: unknown[]) => ((result = result.filter((r) => vs.includes(r[k]))), builder),
      gte: (k: string, v: string) => ((result = result.filter((r) => String(r[k]) >= v)), builder),
      lte: (k: string, v: string) => ((result = result.filter((r) => String(r[k]) <= v)), builder),
      order: (k: string) => ((result = [...result].sort((a, b) => String(a[k] ?? "").localeCompare(String(b[k] ?? "")))), builder),
      range: (from: number, to: number) => ((result = result.slice(from, to + 1)), builder),
      maybeSingle: () => Promise.resolve({ data: result[0] ?? null, error: null }),
      then: (resolve: (v: { data: Row[]; error: null }) => unknown) => resolve({ data: result, error: null }),
    };
    return builder;
  };
  return {
    from: (name: string) => query(tables[name] ?? []),
    rpc: (name: string, args: Row) => Promise.resolve({ data: rpcs[name]?.(args) ?? [], error: null }),
  } as unknown as SupabaseClient;
}

const IBARAKI = "c-ibaraki";
const KORIEN = "c-korien";
const hq: Actor = { userId: "u1", email: "hq@example.com", displayName: "本部", roles: [{ role: "hq_admin", clinicId: null }] };
const manager: Actor = {
  userId: "u2",
  email: "m@example.com",
  displayName: "院長",
  roles: [{ role: "clinic_manager", clinicId: IBARAKI }],
};

const day = (staff: string, clinic: string, date: string, extra: Row = {}): Row => ({
  staff_id: staff,
  home_clinic_id: clinic,
  work_date: date,
  first_clock_in: `${date}T00:00:00Z`,
  last_clock_out: `${date}T09:00:00Z`,
  break_minutes: 60,
  worked_minutes: 480,
  scheduled_minutes: 480,
  within_scheduled_minutes: 480,
  overtime_non_statutory_minutes: 0,
  overtime_statutory_minutes: 0,
  weekly_overtime_minutes: 0,
  late_night_minutes: 0,
  legal_holiday_minutes: 0,
  scheduled_holiday_minutes: 0,
  late_minutes: 0,
  early_leave_minutes: 0,
  is_absent: false,
  has_missing_punch: false,
  anomalies: [],
  day_type: "workday",
  status: "closed",
  needs_recalc: false,
  ...extra,
});

const tables = {
  clinics: [
    { clinic_id: IBARAKI, name: "茨木院", display_order: 5 },
    { clinic_id: KORIEN, name: "香里園院", display_order: 7 },
  ],
  staff_profiles: [
    { staff_id: "s1", staff_code: "1001", family_name: "安藤", given_name: "太郎", hire_date: "2024-04-01" },
    { staff_id: "s2", staff_code: "1002", family_name: "山田", given_name: "花子", hire_date: "2024-04-01" },
  ],
  staff_clinic_assignments: [
    { staff_id: "s1", clinic_id: IBARAKI, assignment_type: "primary", valid_from: "2024-04-01", valid_to: null },
    { staff_id: "s2", clinic_id: KORIEN, assignment_type: "primary", valid_from: "2024-04-01", valid_to: null },
  ],
  employment_contracts: [
    { staff_id: "s1", valid_from: "2024-04-01", valid_to: null, employment_type: "full_time", fixed_overtime_minutes: 60 },
  ],
  attendance_daily: [
    day("s1", IBARAKI, "2026-09-07", { worked_minutes: 600, overtime_statutory_minutes: 120 }),
    day("s1", IBARAKI, "2026-09-08", { has_missing_punch: true, worked_minutes: 0, anomalies: ["missing_clock_out"] }),
    day("s2", KORIEN, "2026-09-07", { late_minutes: 15 }),
    day("s1", IBARAKI, "2026-10-01"), // 対象月外
  ],
  leave_ledger_entries: [
    { staff_id: "s1", leave_grant_id: "g1", entry_type: "use", days: "-1", effective_date: "2026-09-10", note: null, created_at: "2026-09-01T00:00:00Z" },
    { staff_id: "s1", leave_grant_id: "g1", entry_type: "use", days: "-1", effective_date: "2026-10-10", note: null, created_at: "2026-10-01T00:00:00Z" },
  ],
  holiday_credit_ledger: [],
  monthly_closings: [{ clinic_id: IBARAKI, year_month: "2026-09-01", status: "closed", manager_confirmed_at: null, closed_at: null, reopen_count: 0 }],
  shifts: [],
};

describe("帳票", () => {
  it("9種の帳票を定義し、有給・振休・全院一覧は本部のみ", () => {
    expect(REPORTS).toHaveLength(9);
    expect(REPORTS.filter((r) => !r.hqOnly).map((r) => r.id)).toEqual(["monthly_clinic", "daily_detail", "anomalies", "closings"]);
  });

  it("院長は担当院だけ、本部は全院または指定院が対象", () => {
    expect(scopeClinicIds(hq, [IBARAKI, KORIEN], null)).toEqual([IBARAKI, KORIEN]);
    expect(scopeClinicIds(hq, [IBARAKI, KORIEN], KORIEN)).toEqual([KORIEN]);
    expect(scopeClinicIds(manager, [IBARAKI, KORIEN], null)).toEqual([IBARAKI]);
    expect(scopeClinicIds(manager, [IBARAKI, KORIEN], KORIEN)).toEqual([]);
  });

  it("全院月次勤怠一覧：スタッフ別に対象月だけを集計し、みなし残業の超過・有給取得・締め状態を出す", async () => {
    const t = await buildReport(fakeSupabase(tables), hq, "monthly_all", { month: "2026-09", clinicId: null });
    const col = (name: string) => t.headers.indexOf(name);
    expect(t.title).toBe("全院月次勤怠一覧_2026-09");
    expect(t.rows).toHaveLength(2);
    const [s1, s2] = t.rows;
    expect(s1.slice(0, 5)).toEqual(["茨木院", "1001", "安藤 太郎", "正社員", 1]);
    expect(s1[col("実労働（時間）")]).toBe(10);
    expect(s1[col("法定時間外（時間）")]).toBe(2);
    expect(s1[col("みなし残業の超過（時間）")]).toBe(1);
    expect(s1[col("打刻漏れ（日）")]).toBe(1);
    expect(s1[col("有給取得（日）")]).toBe(1);
    expect(s1[col("締め状態")]).toBe("締め済み");
    expect(s2.slice(0, 3)).toEqual(["香里園院", "1002", "山田 花子"]);
    expect(s2[col("遅刻（分）")]).toBe(15);
    expect(s2[col("締め状態")]).toBe("未締め");
  });

  it("院別月次勤怠一覧：院ごとの合計と全体の合計行", async () => {
    const t = await buildReport(fakeSupabase(tables), hq, "monthly_clinic", { month: "2026-09", clinicId: null });
    expect(t.rows.map((r) => [r[0], r[1], r[3]])).toEqual([
      ["茨木院", 1, 10],
      ["香里園院", 1, 8],
      ["合計", 2, 18],
    ]);
  });

  it("院長の出力は担当院の分だけ（勤怠明細・異常一覧）", async () => {
    const detail = await buildReport(fakeSupabase(tables), manager, "daily_detail", { month: "2026-09", clinicId: null });
    expect(detail.rows.map((r) => [r[0], r[3]])).toEqual([
      ["茨木院", "2026-09-07"],
      ["茨木院", "2026-09-08"],
    ]);
    const anomalies = await buildReport(fakeSupabase(tables), manager, "anomalies", { month: "2026-09", clinicId: null });
    expect(anomalies.rows).toEqual([["茨木院", "1001", "安藤 太郎", "2026-09-08", "火", "要対応", "打刻漏れ・退勤打刻なし", "09:00", "18:00", 0, 0, "締め済み"]]);
  });

  it("月次締め状況一覧：未解決の件数を院ごとに出す", async () => {
    const t = await buildReport(
      fakeSupabase({ ...tables, monthly_closing_events: [] }, { closing_issues: (a) => (a.p_clinic_id === IBARAKI ? { missing_punch: 1 } : {}) }),
      hq,
      "closings",
      { month: "2026-09", clinicId: null },
    );
    expect(t.rows.map((r) => [r[0], r[2], r[7]])).toEqual([
      ["茨木院", "締め済み", 1],
      ["香里園院", "未締め", 0],
    ]);
  });
});
