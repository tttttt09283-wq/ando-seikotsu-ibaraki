import { describe, expect, it } from "vitest";
import { sumSummary, summaryByClinic, todayStatuses, type SummaryRow } from "@/lib/dashboard/today";

const at = (hm: string) => new Date(`2026-10-19T${hm}:00+09:00`).toISOString();
const shift = (staffId: string, start: string, end: string, clinicId = "c1") => ({ staffId, clinicId, start: at(start), end: at(end) });
const punch = (staffId: string, punchType: string, hm: string) => ({ staffId, punchType, punchedAt: at(hm) });

describe("当日の出勤状況", () => {
  const now = new Date(at("10:00"));

  it("出勤予定・出勤済・未打刻・退勤済を判定し、遅刻・早退を検出する", () => {
    const result = todayStatuses(
      [shift("a", "09:00", "18:00"), shift("b", "09:00", "18:00"), shift("c", "11:00", "20:00"), shift("d", "09:00", "10:00"), shift("e", "09:55", "18:00")],
      [punch("a", "clock_in", "08:55"), punch("b", "clock_in", "09:12"), punch("d", "clock_in", "08:58"), punch("d", "clock_out", "09:40")],
      now,
    );
    const byId = Object.fromEntries(result.map((r) => [r.staffId, r]));
    expect(byId.a).toMatchObject({ state: "working", late: false });
    expect(byId.b).toMatchObject({ state: "working", late: true });
    expect(byId.c).toMatchObject({ state: "scheduled", late: false });
    expect(byId.d).toMatchObject({ state: "left", earlyLeave: true });
    // 開始から10分未満は未打刻にしない
    expect(byId.e.state).toBe("scheduled");
    expect(todayStatuses([shift("f", "09:00", "18:00")], [], now)[0].state).toBe("missing");
  });

  it("同じ人の複数シフト（応援で2院）は最初のシフトの院で1行にまとめる", () => {
    const result = todayStatuses([shift("a", "14:00", "19:00", "c2"), shift("a", "09:00", "13:00", "c1")], [punch("a", "clock_in", "09:00")], now);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ clinicId: "c1", state: "working" });
  });
});

describe("期間の勤怠集計", () => {
  const row = (clinic: string | null, staff: string, worked: number, ot: number, workDays = 1): SummaryRow => ({
    home_clinic_id: clinic,
    staff_id: staff,
    work_days: workDays,
    worked_minutes: worked,
    scheduled_minutes: worked,
    overtime_non_statutory_minutes: 0,
    overtime_statutory_minutes: ot,
    late_night_minutes: 0,
    legal_holiday_minutes: 0,
    late_count: 1,
    early_leave_count: 0,
    absent_count: 0,
    missing_punch_count: 0,
    unconfirmed_days: 0,
    needs_recalc_days: 0,
  });

  it("院ごと・全体に合計する（勤務実績の無い人は人数に数えない）", () => {
    const rows = [row("c1", "a", 960, 60, 2), row("c1", "b", 0, 0, 0), row("c2", "c", 480, 0)];
    const byClinic = summaryByClinic(rows);
    expect(byClinic.get("c1")).toMatchObject({ staff_count: 1, worked_minutes: 960, overtime_statutory_minutes: 60, late_count: 2 });
    expect(byClinic.get("c2")).toMatchObject({ staff_count: 1, worked_minutes: 480 });
    expect(sumSummary(rows)).toMatchObject({ staff_count: 2, worked_minutes: 1440, work_days: 3 });
  });
});
