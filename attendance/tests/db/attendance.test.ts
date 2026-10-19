import { afterAll, describe, expect, it } from "vitest";
import { closePool, withTx, type TestTx } from "./helpers";

afterAll(closePool);

interface Daily {
  worked_minutes: number;
  break_minutes: number;
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

async function setup(tx: TestTx) {
  const ibaraki = await tx.clinicId("IBARAKI");
  const korien = await tx.clinicId("KORIEN");
  const hq = await tx.createUser("hq@example.com", [{ role: "hq_admin" }]);
  const manager = await tx.createUser("mgr@example.com", [{ role: "clinic_manager", clinicId: ibaraki }]);
  const staff = await tx.createStaff("1001", ibaraki);
  return { ibaraki, korien, hq, manager, staff };
}

/** 打刻を直接記録する（時刻を指定するため。端末経由と同じく打刻原本に追記される） */
async function punch(tx: TestTx, staff: string, clinic: string, type: string, jst: string) {
  await tx.sql(
    `insert into public.raw_punch_events (staff_id, clinic_id, home_clinic_id, punch_type, punched_at, source)
     values ($1, $2, app.staff_primary_clinic_id($1, ($4::timestamp)::date), $3, ($4::timestamp at time zone 'Asia/Tokyo'), 'adjustment')`,
    [staff, clinic, type, jst],
  );
}

async function day(tx: TestTx, staff: string, clinic: string, date: string, start: string, end: string, breaks: [string, string][] = []) {
  await punch(tx, staff, clinic, "clock_in", `${date} ${start}`);
  for (const [b1, b2] of breaks) {
    await punch(tx, staff, clinic, "break_start", `${b1.includes(" ") ? b1 : `${date} ${b1}`}`);
    await punch(tx, staff, clinic, "break_end", `${b2.includes(" ") ? b2 : `${date} ${b2}`}`);
  }
  await punch(tx, staff, clinic, "clock_out", end.includes(" ") ? end : `${date} ${end}`);
}

const recalc = (tx: TestTx, staff: string, from: string, to = from) =>
  tx.sql("select app.recalc_attendance($1, $2::date, $3::date)", [staff, from, to]);

const daily = async (tx: TestTx, staff: string, date: string) =>
  (await tx.sql<Daily>("select * from public.attendance_daily where staff_id = $1 and work_date = $2", [staff, date]))[0];

async function confirmShift(tx: TestTx, manager: string, staff: string, clinic: string, date: string, start: string, end: string, breakMinutes: number) {
  await tx.as(manager).sql("select public.save_shifts($1)", [
    JSON.stringify([{ staff_id: staff, clinic_id: clinic, work_date: date, shift_type: "work", start, end, break_minutes: breakMinutes }]),
  ]);
  await tx.as(manager).sql("select public.confirm_shifts($1, $2::date, $2::date)", [clinic, date]);
}

describe("日々の勤怠計算", () => {
  it("9:00〜20:00・休憩3時間は実働8時間で時間外なし", async () => {
    await withTx(async (tx) => {
      const { ibaraki, manager, staff } = await setup(tx);
      await confirmShift(tx, manager, staff, ibaraki, "2026-10-05", "09:00", "20:00", 180);
      await day(tx, staff, ibaraki, "2026-10-05", "09:00", "20:00", [["12:30", "15:30"]]);
      await recalc(tx, staff, "2026-10-05");
      expect(await daily(tx, staff, "2026-10-05")).toMatchObject({
        worked_minutes: 480,
        break_minutes: 180,
        scheduled_minutes: 480,
        within_scheduled_minutes: 480,
        overtime_statutory_minutes: 0,
        late_minutes: 0,
        early_leave_minutes: 0,
        has_missing_punch: false,
        day_type: "workday",
      });
    });
  });

  it("1日8時間を超えた分は法定時間外、遅刻・早退はシフトと比較する", async () => {
    await withTx(async (tx) => {
      const { ibaraki, manager, staff } = await setup(tx);
      await confirmShift(tx, manager, staff, ibaraki, "2026-10-05", "09:00", "18:00", 60);
      await confirmShift(tx, manager, staff, ibaraki, "2026-10-06", "09:00", "18:00", 60);
      await day(tx, staff, ibaraki, "2026-10-05", "09:00", "20:30", [["12:00", "13:00"]]);
      await day(tx, staff, ibaraki, "2026-10-06", "09:10", "17:45", [["12:00", "13:00"]]);
      await recalc(tx, staff, "2026-10-05", "2026-10-06");
      expect(await daily(tx, staff, "2026-10-05")).toMatchObject({ worked_minutes: 630, overtime_statutory_minutes: 150, within_scheduled_minutes: 480 });
      expect(await daily(tx, staff, "2026-10-06")).toMatchObject({ worked_minutes: 455, late_minutes: 10, early_leave_minutes: 15, overtime_statutory_minutes: 0 });
    });
  });

  it("22時〜翌5時の実労働を深夜として集計し、日跨ぎは出勤日に含める", async () => {
    await withTx(async (tx) => {
      const { ibaraki, staff } = await setup(tx);
      await day(tx, staff, ibaraki, "2026-10-05", "18:00", "2026-10-06 02:00", [["22:00", "23:00"]]);
      await recalc(tx, staff, "2026-10-05", "2026-10-06");
      expect(await daily(tx, staff, "2026-10-05")).toMatchObject({ worked_minutes: 420, late_night_minutes: 180 });
      expect(await daily(tx, staff, "2026-10-06")).toBeUndefined();
    });
  });

  it("週40時間を超えた日の分を週の法定時間外にする（日曜始まり）", async () => {
    await withTx(async (tx) => {
      const { ibaraki, staff } = await setup(tx);
      // 2026-10-05（月）〜 10-10（土）に毎日8時間
      for (const d of ["05", "06", "07", "08", "09", "10"]) await day(tx, staff, ibaraki, `2026-10-${d}`, "09:00", "18:00", [["12:00", "13:00"]]);
      await recalc(tx, staff, "2026-10-05", "2026-10-10");
      expect(await daily(tx, staff, "2026-10-09")).toMatchObject({ overtime_statutory_minutes: 0, weekly_overtime_minutes: 0 });
      expect(await daily(tx, staff, "2026-10-10")).toMatchObject({
        worked_minutes: 480,
        overtime_statutory_minutes: 480,
        weekly_overtime_minutes: 480,
        within_scheduled_minutes: 0,
        overtime_non_statutory_minutes: 0,
      });
    });
  });

  it("院の法定休日の労働は法定休日労働として集計し、時間外には含めない。未登録の間は判定しない", async () => {
    await withTx(async (tx) => {
      const { ibaraki, hq, staff } = await setup(tx);
      await day(tx, staff, ibaraki, "2026-10-04", "09:00", "19:00", [["12:00", "13:00"]]); // 日曜・9時間
      await recalc(tx, staff, "2026-10-04");
      expect(await daily(tx, staff, "2026-10-04")).toMatchObject({ legal_holiday_minutes: 0, overtime_statutory_minutes: 60 });

      await tx.as(hq).sql("select public.set_clinic_legal_holiday($1, 0::smallint, '日曜を法定休日に')", [ibaraki]);
      await recalc(tx, staff, "2026-10-04");
      expect(await daily(tx, staff, "2026-10-04")).toMatchObject({
        day_type: "legal_holiday",
        legal_holiday_minutes: 540,
        overtime_statutory_minutes: 0,
      });
    });
  });

  it("シフトのない日の勤務は所定休日労働・シフト外勤務として扱う", async () => {
    await withTx(async (tx) => {
      const { ibaraki, staff } = await setup(tx);
      await day(tx, staff, ibaraki, "2026-10-07", "09:00", "13:00");
      await recalc(tx, staff, "2026-10-07");
      const d = await daily(tx, staff, "2026-10-07");
      expect(d).toMatchObject({ day_type: "scheduled_holiday", scheduled_holiday_minutes: 240, overtime_non_statutory_minutes: 240 });
      expect(d.anomalies).toContain("unscheduled_work");
    });
  });

  it("退勤の打刻漏れ・休憩不足・欠勤を検出する", async () => {
    await withTx(async (tx) => {
      const { ibaraki, manager, staff } = await setup(tx);
      await punch(tx, staff, ibaraki, "clock_in", "2026-10-05 09:00");
      await day(tx, staff, ibaraki, "2026-10-06", "09:00", "18:00", [["12:00", "12:30"]]);
      await confirmShift(tx, manager, staff, ibaraki, "2026-10-07", "09:00", "18:00", 60);
      await recalc(tx, staff, "2026-10-05", "2026-10-07");
      expect(await daily(tx, staff, "2026-10-05")).toMatchObject({ has_missing_punch: true, worked_minutes: 0 });
      expect((await daily(tx, staff, "2026-10-05")).anomalies).toContain("missing_clock_out");
      expect((await daily(tx, staff, "2026-10-06")).anomalies).toContain("break_shortage");
      expect(await daily(tx, staff, "2026-10-07")).toMatchObject({ is_absent: true });
    });
  });
});

describe("打刻修正（申請・承認）", () => {
  it("院長が申請し本部が承認すると、原本に取消・追加が追記され、勤怠が再計算される", async () => {
    await withTx(async (tx) => {
      const { ibaraki, hq, manager, staff } = await setup(tx);
      await punch(tx, staff, ibaraki, "clock_in", "2026-10-05 09:30");
      await recalc(tx, staff, "2026-10-05");
      expect((await daily(tx, staff, "2026-10-05")).has_missing_punch).toBe(true);
      const [original] = await tx.sql<{ event_id: string }>("select event_id from public.raw_punch_events where staff_id = $1", [staff]);

      const [{ id: addId }] = await tx
        .as(manager)
        .sql<{ id: string }>(
          "select public.request_attendance_adjustment($1, '2026-10-05', $2, 'add', null, 'clock_out', '2026-10-05 18:00+09', '退勤の打刻忘れ') as id",
          [staff, ibaraki],
        );
      const [{ id: replaceId }] = await tx
        .as(manager)
        .sql<{ id: string }>(
          "select public.request_attendance_adjustment($1, '2026-10-05', $2, 'replace', $3, null, '2026-10-05 09:00+09', '出勤時刻の押し間違い') as id",
          [staff, ibaraki, original.event_id],
        );
      await expect(tx.as(manager).sql("select public.approve_attendance_adjustment($1)", [addId])).rejects.toThrow(/本部のみ/);
      await tx.as(hq).sql("select public.approve_attendance_adjustment($1)", [addId]);
      await tx.as(hq).sql("select public.approve_attendance_adjustment($1)", [replaceId]);

      expect(await daily(tx, staff, "2026-10-05")).toMatchObject({ has_missing_punch: false, worked_minutes: 540 });
      // 原本の元の打刻は残り、取消レコード＋新しい打刻が追記されている
      const rows = await tx.sql<{ punch_type: string; is_void: boolean; source: string }>(
        "select punch_type::text, is_void, source from public.raw_punch_events where staff_id = $1 order by created_at, is_void desc",
        [staff],
      );
      expect(rows).toHaveLength(4);
      expect(rows.filter((r) => r.is_void)).toHaveLength(1);
      const [log] = await tx.sql<{ n: number }>("select count(*)::int as n from public.approval_logs where target_table = 'attendance_adjustment_requests'");
      expect(log.n).toBe(4); // 申請2件＋承認2件
    });
  });

  it("同じ申請を二重に承認しても1回しか反映されない", async () => {
    await withTx(async (tx) => {
      const { ibaraki, hq, manager, staff } = await setup(tx);
      const [{ id }] = await tx
        .as(manager)
        .sql<{ id: string }>(
          "select public.request_attendance_adjustment($1, '2026-10-05', $2, 'add', null, 'clock_in', '2026-10-05 09:00+09', '打刻忘れ') as id",
          [staff, ibaraki],
        );
      await tx.as(hq).sql("select public.approve_attendance_adjustment($1)", [id]);
      await expect(tx.as(hq).sql("select public.approve_attendance_adjustment($1)", [id])).rejects.toThrow(/処理済み/);
      const [{ n }] = await tx.sql<{ n: number }>("select count(*)::int as n from public.raw_punch_events where staff_id = $1", [staff]);
      expect(n).toBe(1);
    });
  });

  it("担当外の院長・一般スタッフは修正申請できない", async () => {
    await withTx(async (tx) => {
      const { ibaraki, korien, staff } = await setup(tx);
      const other = await tx.createUser("mgr-korien@example.com", [{ role: "clinic_manager", clinicId: korien }]);
      const staffUser = await tx.createUser("staff@example.com", [{ role: "staff" }]);
      for (const user of [other, staffUser]) {
        await expect(
          tx
            .as(user)
            .sql("select public.request_attendance_adjustment($1, '2026-10-05', $2, 'add', null, 'clock_in', '2026-10-05 09:00+09', 'x')", [staff, ibaraki]),
        ).rejects.toThrow(/担当外/);
      }
    });
  });
});

describe("院長確認と再計算", () => {
  it("院長確認後にシフトを変えると再計算待ちになり、再計算で値が変われば確認が取り消される", async () => {
    await withTx(async (tx) => {
      const { ibaraki, manager, staff } = await setup(tx);
      await confirmShift(tx, manager, staff, ibaraki, "2026-10-05", "09:00", "18:00", 60);
      await day(tx, staff, ibaraki, "2026-10-05", "09:00", "18:00", [["12:00", "13:00"]]);
      await recalc(tx, staff, "2026-10-05");
      const [{ r }] = await tx.as(manager).sql<{ r: { confirmed: number } }>("select public.confirm_attendance($1, '2026-10-01', '2026-10-31') as r", [ibaraki]);
      expect(r.confirmed).toBe(1);
      expect((await daily(tx, staff, "2026-10-05")).status).toBe("manager_confirmed");

      const [shift] = await tx.sql<{ shift_id: string; version: number }>("select shift_id, version from public.shifts where staff_id = $1", [staff]);
      await tx
        .as(manager)
        .sql("select public.save_shifts($1, '開始時刻の訂正')", [
          JSON.stringify([{ shift_id: shift.shift_id, expected_version: shift.version, shift_type: "work", start: "08:30", end: "18:00", break_minutes: 60 }]),
        ]);
      // シフト変更だけでは確定済みの勤怠は書き換わらない
      expect(await daily(tx, staff, "2026-10-05")).toMatchObject({ status: "manager_confirmed", needs_recalc: true, late_minutes: 0 });

      await tx.as(manager).sql("select public.recalc_attendance($1, '2026-10-05', '2026-10-05')", [ibaraki]);
      const after = await daily(tx, staff, "2026-10-05");
      expect(after).toMatchObject({ status: "open", needs_recalc: false, late_minutes: 30 });
      expect(after.anomalies).toContain("changed_after_confirm");
    });
  });

  it("打刻漏れのある日は院長確認できない", async () => {
    await withTx(async (tx) => {
      const { ibaraki, manager, staff } = await setup(tx);
      await punch(tx, staff, ibaraki, "clock_in", "2026-10-05 09:00");
      await recalc(tx, staff, "2026-10-05");
      const [{ r }] = await tx.as(manager).sql<{ r: { confirmed: number; skipped: number } }>("select public.confirm_attendance($1, '2026-10-01', '2026-10-31') as r", [ibaraki]);
      expect(r).toEqual({ confirmed: 0, skipped: 1 });
    });
  });

  it("締め済みの月の勤怠は再計算しても変わらない", async () => {
    await withTx(async (tx) => {
      const { ibaraki, staff } = await setup(tx);
      await day(tx, staff, ibaraki, "2026-09-07", "09:00", "18:00", [["12:00", "13:00"]]);
      await recalc(tx, staff, "2026-09-07");
      await tx.sql("insert into public.monthly_closings (clinic_id, year_month, status) values ($1, '2026-09-01', 'closed')", [ibaraki]);
      await punch(tx, staff, ibaraki, "clock_in", "2026-09-08 09:00");
      await recalc(tx, staff, "2026-09-07", "2026-09-08");
      expect(await daily(tx, staff, "2026-09-08")).toBeUndefined();
      expect((await daily(tx, staff, "2026-09-07")).worked_minutes).toBe(480);
    });
  });
});
