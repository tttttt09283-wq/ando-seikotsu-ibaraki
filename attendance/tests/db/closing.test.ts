import { afterAll, describe, expect, it } from "vitest";
import { closePool, withTx, type TestTx } from "./helpers";

afterAll(closePool);

const MONTH = "2026-09-01";

async function setup(tx: TestTx) {
  const ibaraki = await tx.clinicId("IBARAKI");
  const korien = await tx.clinicId("KORIEN");
  const hq = await tx.createUser("hq@example.com", [{ role: "hq_admin" }]);
  const manager = await tx.createUser("mgr@example.com", [{ role: "clinic_manager", clinicId: ibaraki }]);
  const korienManager = await tx.createUser("mgr-korien@example.com", [{ role: "clinic_manager", clinicId: korien }]);
  const staff = await tx.createStaff("1001", ibaraki);
  return { ibaraki, korien, hq, manager, korienManager, staff };
}

async function punch(tx: TestTx, staff: string, clinic: string, type: string, jst: string) {
  await tx.sql(
    `insert into public.raw_punch_events (staff_id, clinic_id, home_clinic_id, punch_type, punched_at, source)
     values ($1, $2, app.staff_primary_clinic_id($1, ($4::timestamp)::date), $3, ($4::timestamp at time zone 'Asia/Tokyo'), 'adjustment')`,
    [staff, clinic, type, jst],
  );
}

/** 9/7 は通常勤務、9/8 は退勤の打刻漏れ */
async function septemberAttendance(tx: TestTx, staff: string, clinic: string) {
  await punch(tx, staff, clinic, "clock_in", "2026-09-07 09:00");
  await punch(tx, staff, clinic, "clock_out", "2026-09-07 17:00");
  await punch(tx, staff, clinic, "clock_in", "2026-09-08 09:00");
  await tx.sql("select app.recalc_attendance($1, '2026-09-01', '2026-09-30')", [staff]);
}

const closingStatus = async (tx: TestTx, clinic: string) =>
  (await tx.sql<{ status: string }>("select status::text from public.monthly_closings where clinic_id = $1 and year_month = $2", [clinic, MONTH]))[0]
    ?.status;

const attendanceStatuses = async (tx: TestTx, staff: string) =>
  (
    await tx.sql<{ status: string }>(
      "select status::text from public.attendance_daily where staff_id = $1 and work_date between '2026-09-01' and '2026-09-30' order by work_date",
      [staff],
    )
  ).map((r) => r.status);

describe("月次締め", () => {
  it("必須テスト15：月次締め後は一般操作で勤怠を変更できず、本部が理由付きで再開すると修正・再締めできる", async () => {
    await withTx(async (tx) => {
      const { ibaraki, hq, manager, staff } = await setup(tx);
      await septemberAttendance(tx, staff, ibaraki);

      // 院長確認：打刻漏れが残っていると理由が必須
      await expect(tx.as(manager).sql("select public.manager_confirm_month($1, $2)", [ibaraki, MONTH])).rejects.toThrow(/打刻漏れ1件/);
      await tx.as(manager).sql("select public.manager_confirm_month($1, $2, '9/8は退勤後に本人へ確認済み、翌月に修正予定')", [ibaraki, MONTH]);
      expect(await closingStatus(tx, ibaraki)).toBe("manager_confirmed");

      // 本部の締め（院長は締められない）
      await expect(tx.as(manager).sql("select public.close_month($1, $2)", [ibaraki, MONTH])).rejects.toThrow(/本部のみ/);
      await tx.as(hq).sql("select public.close_month($1, $2)", [ibaraki, MONTH]);
      expect(await closingStatus(tx, ibaraki)).toBe("closed");
      expect(await attendanceStatuses(tx, staff)).toEqual(["closed", "closed"]);

      // 一般操作はすべて拒否される
      await expect(
        tx
          .as(manager)
          .sql("select public.request_attendance_adjustment($1, '2026-09-08', $2, 'add', null, 'clock_out', '2026-09-08 18:00+09', '打刻漏れ')", [
            staff,
            ibaraki,
          ]),
      ).rejects.toThrow(/締め済み/);
      await expect(
        tx.as(manager).sql("select public.save_shifts($1)", [
          JSON.stringify([{ staff_id: staff, clinic_id: ibaraki, work_date: "2026-09-10", shift_type: "work", start: "09:00", end: "18:00", break_minutes: 60 }]),
        ]),
      ).rejects.toThrow(/締め済み/);
      await expect(
        tx.as(manager).sql("select public.request_leave($1, 'other', '2026-09-15', '2026-09-15', 'full', null, null)", [staff]),
      ).rejects.toThrow(/締め/);
      // RPC を経由しない書き込み（所有者権限でも）もトリガーで拒否
      await expect(
        tx.sql("update public.attendance_daily set worked_minutes = 600 where staff_id = $1 and work_date = '2026-09-07'", [staff]),
      ).rejects.toThrow(/締め済み/);
      // 遅れて届いた打刻は原本に残るが、締め済みの勤怠には反映しない
      await punch(tx, staff, ibaraki, "clock_out", "2026-09-08 18:00");
      await tx.sql("select app.recalc_attendance($1, '2026-09-01', '2026-09-30')", [staff]);
      const [sep8] = await tx.sql<{ has_missing_punch: boolean }>(
        "select has_missing_punch from public.attendance_daily where staff_id = $1 and work_date = '2026-09-08'",
        [staff],
      );
      expect(sep8.has_missing_punch).toBe(true);

      // 再開は本部のみ・理由必須
      await expect(tx.as(manager).sql("select public.reopen_month($1, $2, '修正')", [ibaraki, MONTH])).rejects.toThrow(/本部のみ/);
      await expect(tx.as(hq).sql("select public.reopen_month($1, $2, ' ')", [ibaraki, MONTH])).rejects.toThrow(/理由/);
      await tx.as(hq).sql("select public.reopen_month($1, $2, '9/8の退勤打刻が遅れて届いたため')", [ibaraki, MONTH]);
      expect(await closingStatus(tx, ibaraki)).toBe("reopened");
      expect(await attendanceStatuses(tx, staff)).toEqual(["manager_confirmed", "manager_confirmed"]);

      // 再開中は再計算・修正ができ、再締めできる
      await tx.sql("select app.recalc_attendance($1, '2026-09-01', '2026-09-30')", [staff]);
      const [fixed] = await tx.sql<{ has_missing_punch: boolean; worked_minutes: number }>(
        "select has_missing_punch, worked_minutes from public.attendance_daily where staff_id = $1 and work_date = '2026-09-08'",
        [staff],
      );
      expect(fixed).toMatchObject({ has_missing_punch: false, worked_minutes: 540 });
      await tx.as(hq).sql("select public.close_month($1, $2)", [ibaraki, MONTH]);
      expect(await closingStatus(tx, ibaraki)).toBe("closed");

      // 履歴：院長確認 → 締め → 再開（理由付き）→ 再締め。締め時点の集計を保存
      const events = await tx.sql<{ action: string; reason: string | null; snapshot: { staff?: { worked: number }[] } | null }>(
        "select action, reason, snapshot from public.monthly_closing_events where clinic_id = $1 order by id",
        [ibaraki],
      );
      expect(events.map((e) => e.action)).toEqual(["manager_confirm", "close", "reopen", "reclose"]);
      expect(events[2].reason).toContain("遅れて届いた");
      expect(events[1].snapshot?.staff?.[0].worked).toBe(480);
      expect(events[3].snapshot?.staff?.[0].worked).toBe(1020);
      // 履歴は書き換えられない
      await expect(tx.sql("delete from public.monthly_closing_events")).rejects.toThrow();
      const [{ reopen_count }] = await tx.sql<{ reopen_count: number }>(
        "select reopen_count from public.monthly_closings where clinic_id = $1 and year_month = $2",
        [ibaraki, MONTH],
      );
      expect(reopen_count).toBe(1);
    });
  });

  it("院長確認前・月の途中は締められない。承認待ちの打刻修正があると締められない", async () => {
    await withTx(async (tx) => {
      const { ibaraki, hq, manager, staff } = await setup(tx);
      await septemberAttendance(tx, staff, ibaraki);
      await expect(tx.as(hq).sql("select public.close_month($1, $2)", [ibaraki, MONTH])).rejects.toThrow(/院長確認/);
      await expect(tx.as(manager).sql("select public.manager_confirm_month($1, '2026-10-01', 'x')", [ibaraki])).rejects.toThrow(/月が終わって/);
      await expect(tx.as(hq).sql("select public.close_month($1, '2026-10-01')", [ibaraki])).rejects.toThrow(/月が終わって/);

      await tx
        .as(manager)
        .sql("select public.request_attendance_adjustment($1, '2026-09-08', $2, 'add', null, 'clock_out', '2026-09-08 18:00+09', '打刻漏れ')", [
          staff,
          ibaraki,
        ]);
      await tx.as(manager).sql("select public.manager_confirm_month($1, $2, '本部の承認待ち')", [ibaraki, MONTH]);
      await expect(tx.as(hq).sql("select public.close_month($1, $2)", [ibaraki, MONTH])).rejects.toThrow(/打刻修正の承認待ちが1件/);

      // 院長確認の取消
      await tx.as(manager).sql("select public.manager_unconfirm_month($1, $2)", [ibaraki, MONTH]);
      expect(await closingStatus(tx, ibaraki)).toBe("open");
    });
  });

  it("全院一括の締め：締められる院だけ締め、締められない院は理由を返す", async () => {
    await withTx(async (tx) => {
      const { ibaraki, korien, hq, manager, staff } = await setup(tx);
      await punch(tx, staff, ibaraki, "clock_in", "2026-09-07 09:00");
      await punch(tx, staff, ibaraki, "clock_out", "2026-09-07 17:00");
      await tx.sql("select app.recalc_attendance($1, '2026-09-01', '2026-09-30')", [staff]);
      await tx.as(manager).sql("select public.manager_confirm_month($1, $2)", [ibaraki, MONTH]);

      const [{ result }] = await tx
        .as(hq)
        .sql<{ result: { batch_id: string; closed: number; failed: { clinic_id: string; message: string }[] } }>(
          "select public.close_months_bulk($1, $2::uuid[]) as result",
          [MONTH, [ibaraki, korien]],
        );
      expect(result.closed).toBe(1);
      expect(result.failed).toEqual([expect.objectContaining({ clinic_id: korien, message: expect.stringMatching(/院長確認/) })]);
      expect(await closingStatus(tx, ibaraki)).toBe("closed");
      const [event] = await tx.sql<{ batch_id: string }>("select batch_id from public.monthly_closing_events where action = 'close'");
      expect(event.batch_id).toBe(result.batch_id);
    });
  });

  it("院長は担当外の院の月次確認・確認状況の参照ができない", async () => {
    await withTx(async (tx) => {
      const { korien, korienManager, manager } = await setup(tx);
      await expect(tx.as(manager).sql("select public.manager_confirm_month($1, $2, 'x')", [korien, MONTH])).rejects.toThrow(/担当外/);
      await tx.as(korienManager).sql("select public.manager_confirm_month($1, $2)", [korien, MONTH]);
      expect(await tx.as(manager).sql("select * from public.monthly_closing_events")).toEqual([]);
      expect(await tx.as(korienManager).sql("select * from public.monthly_closing_events")).toHaveLength(1);
    });
  });

  it("帳票の出力を監査ログに記録する（院長・本部のみ）", async () => {
    await withTx(async (tx) => {
      const { hq } = await setup(tx);
      const staffUser = await tx.createUser("staff@example.com", [{ role: "staff" }]);
      await tx.as(hq).sql("select public.log_export('monthly_all', $1, 12)", [JSON.stringify({ month: "2026-09" })]);
      const [log] = await tx.sql<{ action: string; table_name: string; after: { rows: number; month: string } }>(
        "select action, table_name, after from public.audit_logs where action = 'export'",
      );
      expect(log).toMatchObject({ table_name: "monthly_all", after: { rows: 12, month: "2026-09" } });
      await expect(tx.as(staffUser).sql("select public.log_export('monthly_all', '{}', 1)")).rejects.toThrow(/権限/);
    });
  });
});
