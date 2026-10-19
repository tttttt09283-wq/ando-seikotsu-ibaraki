import { afterAll, describe, expect, it } from "vitest";
import { closePool, withTx, type TestTx } from "./helpers";

afterAll(closePool);

async function setup(tx: TestTx) {
  const ibaraki = await tx.clinicId("IBARAKI");
  const korien = await tx.clinicId("KORIEN");
  const hq = await tx.createUser("hq@example.com", [{ role: "hq_admin" }]);
  const ibarakiManager = await tx.createUser("mgr-ibaraki@example.com", [{ role: "clinic_manager", clinicId: ibaraki }]);
  const korienManager = await tx.createUser("mgr-korien@example.com", [{ role: "clinic_manager", clinicId: korien }]);
  const staffA = await tx.createStaff("1001", ibaraki);
  const staffB = await tx.createStaff("1002", korien);
  return { ibaraki, korien, hq, ibarakiManager, korienManager, staffA, staffB };
}

async function punch(tx: TestTx, staff: string, clinic: string, type: string, jst: string) {
  await tx.sql(
    `insert into public.raw_punch_events (staff_id, clinic_id, home_clinic_id, punch_type, punched_at, source)
     values ($1, $2, app.staff_primary_clinic_id($1, ($4::timestamp)::date), $3, ($4::timestamp at time zone 'Asia/Tokyo'), 'adjustment')`,
    [staff, clinic, type, jst],
  );
}

/** 9:00〜(end) 勤務・休憩1時間 */
async function workDay(tx: TestTx, staff: string, clinic: string, date: string, end: string) {
  await punch(tx, staff, clinic, "clock_in", `${date} 09:00`);
  await punch(tx, staff, clinic, "break_start", `${date} 12:00`);
  await punch(tx, staff, clinic, "break_end", `${date} 13:00`);
  await punch(tx, staff, clinic, "clock_out", `${date} ${end}`);
  await tx.sql("select app.recalc_attendance($1, $2::date, $2::date)", [staff, date]);
}

interface Summary {
  home_clinic_id: string;
  staff_id: string;
  work_days: number;
  worked_minutes: number;
  overtime_statutory_minutes: number;
}

describe("本部の統合ダッシュボード", () => {
  it("必須テスト16：本部は全院の勤怠を集計でき、院長は担当院のみ集計できる", async () => {
    await withTx(async (tx) => {
      const { ibaraki, korien, hq, ibarakiManager, staffA, staffB } = await setup(tx);
      await workDay(tx, staffA, ibaraki, "2026-10-05", "18:00"); // 8時間
      await workDay(tx, staffA, ibaraki, "2026-10-06", "19:00"); // 9時間（法定外1時間）
      await workDay(tx, staffB, korien, "2026-10-05", "18:00");

      const all = await tx.as(hq).sql<Summary>("select * from public.attendance_summary('2026-10-01', '2026-10-31')");
      const byStaff = new Map(all.map((r) => [r.staff_id, r]));
      expect(byStaff.get(staffA)).toMatchObject({ home_clinic_id: ibaraki, work_days: 2, worked_minutes: 1020, overtime_statutory_minutes: 60 });
      expect(byStaff.get(staffB)).toMatchObject({ home_clinic_id: korien, work_days: 1, worked_minutes: 480, overtime_statutory_minutes: 0 });

      const mine = await tx.as(ibarakiManager).sql<Summary>("select * from public.attendance_summary('2026-10-01', '2026-10-31')");
      expect(mine.map((r) => r.staff_id)).toEqual([staffA]);
    });
  });

  it("集計期間は93日以内", async () => {
    await withTx(async (tx) => {
      const { hq } = await setup(tx);
      await expect(tx.as(hq).sql("select * from public.attendance_summary('2026-01-01', '2026-12-31')")).rejects.toThrow(/93日以内/);
    });
  });
});

describe("一括承認", () => {
  async function requestAdd(tx: TestTx, manager: string, staff: string, clinic: string) {
    await punch(tx, staff, clinic, "clock_in", "2026-10-05 09:00");
    const [{ id }] = await tx
      .as(manager)
      .sql<{ id: string }>(
        "select public.request_attendance_adjustment($1, '2026-10-05', $2, 'add', null, 'clock_out', '2026-10-05 18:00+09', '退勤の打刻忘れ') as id",
        [staff, clinic],
      );
    return id;
  }

  it("複数院の打刻修正をまとめて承認し、承認履歴は1件ずつ同じ batch_id で残る", async () => {
    await withTx(async (tx) => {
      const { ibaraki, korien, hq, ibarakiManager, korienManager, staffA, staffB } = await setup(tx);
      const idA = await requestAdd(tx, ibarakiManager, staffA, ibaraki);
      const idB = await requestAdd(tx, korienManager, staffB, korien);

      const [{ result }] = await tx
        .as(hq)
        .sql<{ result: { batch_id: string; approved: number; failed: unknown[] } }>(
          "select public.bulk_approve('attendance_adjustment', $1::uuid[], '一括確認') as result",
          [[idA, idB]],
        );
      expect(result).toMatchObject({ approved: 2, failed: [] });

      const statuses = await tx.sql<{ status: string }>(
        "select status::text from public.attendance_adjustment_requests where request_id = any($1::uuid[])",
        [[idA, idB]],
      );
      expect(statuses.map((s) => s.status)).toEqual(["approved", "approved"]);

      const logs = await tx.sql<{ target_id: string; clinic_id: string; batch_id: string; comment: string }>(
        "select target_id, clinic_id, batch_id, comment from public.approval_logs where step = 'hq' and action = 'approve' order by clinic_id",
      );
      expect(logs).toHaveLength(2);
      expect(new Set(logs.map((l) => l.target_id))).toEqual(new Set([idA, idB]));
      expect(new Set(logs.map((l) => l.clinic_id))).toEqual(new Set([ibaraki, korien]));
      expect(logs.every((l) => l.batch_id === result.batch_id && l.comment === "一括確認")).toBe(true);

      // 勤怠にも反映される
      const [daily] = await tx.sql<{ worked_minutes: number }>(
        "select worked_minutes from public.attendance_daily where staff_id = $1 and work_date = '2026-10-05'",
        [staffB],
      );
      expect(daily.worked_minutes).toBe(540);

      // 個別承認の履歴には batch_id が付かない
      const idC = await requestAdd(tx, ibarakiManager, await tx.createStaff("1003", ibaraki), ibaraki);
      await tx.as(hq).sql("select public.approve_attendance_adjustment($1)", [idC]);
      const [single] = await tx.sql<{ batch_id: string | null }>("select batch_id from public.approval_logs where target_id = $1", [idC]);
      expect(single.batch_id).toBeNull();
    });
  });

  it("処理できない申請はその1件だけ失敗として返し、残りは承認する", async () => {
    await withTx(async (tx) => {
      const { ibaraki, korien, hq, ibarakiManager, korienManager, staffA, staffB } = await setup(tx);
      const idA = await requestAdd(tx, ibarakiManager, staffA, ibaraki);
      const idB = await requestAdd(tx, korienManager, staffB, korien);
      await tx.as(hq).sql("select public.reject_attendance_adjustment($1, '重複')", [idA]);

      const [{ result }] = await tx
        .as(hq)
        .sql<{ result: { approved: number; failed: { id: string; message: string }[] } }>(
          "select public.bulk_approve('attendance_adjustment', $1::uuid[]) as result",
          [[idA, idB]],
        );
      expect(result.approved).toBe(1);
      expect(result.failed).toEqual([{ id: idA, message: expect.stringMatching(/処理済み/) }]);
      const [b] = await tx.sql<{ status: string }>("select status::text from public.attendance_adjustment_requests where request_id = $1", [idB]);
      expect(b.status).toBe("approved");
    });
  });

  it("院長は一括承認できない", async () => {
    await withTx(async (tx) => {
      const { ibaraki, ibarakiManager, staffA } = await setup(tx);
      const id = await requestAdd(tx, ibarakiManager, staffA, ibaraki);
      await expect(
        tx.as(ibarakiManager).sql("select public.bulk_approve('attendance_adjustment', $1::uuid[])", [[id]]),
      ).rejects.toThrow(/本部のみ/);
    });
  });
});

describe("残数一覧", () => {
  it("本部は全院のスタッフの残数を見られ、院長は担当院のスタッフのみ", async () => {
    await withTx(async (tx) => {
      const { hq, ibarakiManager, staffA, staffB } = await setup(tx);
      await tx.as(hq).sql("select public.import_paid_leave($1, 'test')", [
        JSON.stringify([{ row: 2, staff_code: "1002", grant_date: "2025-10-01", granted_days: 11, taken_days: 3, expiration_date: null }]),
      ]);
      const all = await tx.as(hq).sql<{ staff_id: string; paid_balance: string }>("select * from public.leave_balance_list('2026-10-19')");
      const byStaff = new Map(all.map((r) => [r.staff_id, Number(r.paid_balance)]));
      expect(byStaff.get(staffB)).toBe(8);
      expect(byStaff.get(staffA)).toBe(0);
      const mine = await tx.as(ibarakiManager).sql<{ staff_id: string }>("select staff_id from public.leave_balance_list()");
      expect(mine.map((r) => r.staff_id)).toEqual([staffA]);
    });
  });
});

describe("一括承認（休暇・振休）", () => {
  it("存在しない申請は個別の失敗として返る（休暇・振休とも承認処理を呼び出せる）", async () => {
    await withTx(async (tx) => {
      const { hq } = await setup(tx);
      const missing = "00000000-0000-4000-8000-000000000000";
      for (const kind of ["leave", "holiday_credit"]) {
        const [{ result }] = await tx
          .as(hq)
          .sql<{ result: { approved: number; failed: { id: string; message: string }[] } }>("select public.bulk_approve($1, $2::uuid[]) as result", [
            kind,
            [missing],
          ]);
        expect(result.approved).toBe(0);
        expect(result.failed).toEqual([{ id: missing, message: expect.stringMatching(/見つかりません/) }]);
      }
      await expect(tx.as(hq).sql("select public.bulk_approve('shift', $1::uuid[])", [[missing]])).rejects.toThrow(/種類/);
    });
  });
});
