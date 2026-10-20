import { afterAll, describe, expect, it } from "vitest";
import { closePool, withTx, type TestTx } from "./helpers";

afterAll(closePool);

async function setup(tx: TestTx) {
  const ibaraki = await tx.clinicId("IBARAKI");
  const hq = await tx.createUser("hq@example.com", [{ role: "hq_admin" }]);
  const manager = await tx.createUser("mgr@example.com", [{ role: "clinic_manager", clinicId: ibaraki }]);
  const staff = await tx.createStaff("1001", ibaraki, { hireDate: "2023-10-26" });
  await tx.sql(
    "insert into public.staff_holiday_credit_eligibility (staff_id, eligible, valid_from, reason) values ($1, true, '2023-10-26', '正社員')",
    [staff],
  );
  return { ibaraki, hq, manager, staff };
}

async function workDay(tx: TestTx, staff: string, clinic: string, date: string, start = "09:00", end = "18:00") {
  for (const [type, time] of [
    ["clock_in", start],
    ["break_start", "12:00"],
    ["break_end", "13:00"],
    ["clock_out", end],
  ]) {
    await tx.sql(
      `insert into public.raw_punch_events (staff_id, clinic_id, home_clinic_id, punch_type, punched_at, source)
       values ($1, $2, $2, $3, ($4::timestamp at time zone 'Asia/Tokyo'), 'adjustment')`,
      [staff, clinic, type, `${date} ${time}`],
    );
  }
  await tx.sql("select app.recalc_attendance($1, $2::date, $2::date)", [staff, date]);
}

const daily = async (tx: TestTx, staff: string, date: string) =>
  (
    await tx.sql<{ day_type: string; legal_holiday_minutes: number; overtime_statutory_minutes: number; legal_holiday_configured: boolean }>(
      "select day_type, legal_holiday_minutes, overtime_statutory_minutes, legal_holiday_configured from public.attendance_daily where staff_id = $1 and work_date = $2",
      [staff, date],
    )
  )[0];

describe("休日管理（本部のみ）", () => {
  it("区分は本部だけが登録・参照でき、院長・スタッフは見られない", async () => {
    await withTx(async (tx) => {
      const { hq, manager, staff } = await setup(tx);
      await tx.as(hq).sql("select public.set_staff_day_records($1, $2)", [
        staff,
        JSON.stringify([{ date: "2026-09-06", code: "legal_holiday" }, { date: "2026-09-09", code: "non_legal_holiday" }]),
      ]);
      expect(await tx.as(hq).sql("select work_date::text, code from public.staff_day_records order by work_date")).toEqual([
        { work_date: "2026-09-06", code: "legal_holiday" },
        { work_date: "2026-09-09", code: "non_legal_holiday" },
      ]);
      expect(await tx.as(manager).sql("select * from public.staff_day_records")).toEqual([]);
      await expect(
        tx.as(manager).sql("select public.set_staff_day_records($1, $2)", [staff, JSON.stringify([{ date: "2026-09-07", code: "paid" }])]),
      ).rejects.toThrow(/本部のみ/);
      await expect(tx.as(manager).sql("insert into public.staff_day_records (staff_id, work_date, code) values ($1, '2026-09-07', 'paid')", [staff])).rejects.toThrow();
      // 削除（code を空にする）も監査ログに残る
      await tx.as(hq).sql("select public.set_staff_day_records($1, $2)", [staff, JSON.stringify([{ date: "2026-09-09", code: null }])]);
      const logs = await tx.sql<{ action: string }>("select action from public.audit_logs where table_name = 'staff_day_records' order by id");
      expect(logs.map((l) => l.action)).toEqual(["insert", "insert", "delete"]);
    });
  });

  it("「法定内」の日の勤務は法定休日労働、「法定外」の日の勤務は所定休日労働として計算し直す", async () => {
    await withTx(async (tx) => {
      const { ibaraki, hq, staff } = await setup(tx);
      await workDay(tx, staff, ibaraki, "2026-09-06");
      await workDay(tx, staff, ibaraki, "2026-09-09");
      expect(await daily(tx, staff, "2026-09-06")).toMatchObject({ legal_holiday_minutes: 0, legal_holiday_configured: false });

      await tx.as(hq).sql("select public.set_staff_day_records($1, $2)", [
        staff,
        JSON.stringify([{ date: "2026-09-06", code: "legal_holiday" }, { date: "2026-09-09", code: "non_legal_holiday" }]),
      ]);
      expect(await daily(tx, staff, "2026-09-06")).toMatchObject({ day_type: "legal_holiday", legal_holiday_minutes: 480, legal_holiday_configured: true });
      expect(await daily(tx, staff, "2026-09-09")).toMatchObject({ day_type: "scheduled_holiday", legal_holiday_minutes: 0 });
    });
  });

  it("締め済みの月の区分は変更できない", async () => {
    await withTx(async (tx) => {
      const { ibaraki, hq, manager, staff } = await setup(tx);
      await tx.as(manager).sql("select public.manager_confirm_month($1, '2026-09-01')", [ibaraki]);
      await tx.as(hq).sql("select public.close_month($1, '2026-09-01')", [ibaraki]);
      await expect(
        tx.as(hq).sql("select public.set_staff_day_records($1, $2)", [staff, JSON.stringify([{ date: "2026-09-06", code: "legal_holiday" }])]),
      ).rejects.toThrow(/締め済み/);
    });
  });
});

describe("代休（休日出勤）", () => {
  it("休日出勤から代休の候補を作り、本部承認で付与。期限は勤務日から1か月。「給与変換」の日は対象外", async () => {
    await withTx(async (tx) => {
      const { ibaraki, hq, manager, staff } = await setup(tx);
      await tx.as(hq).sql("select public.set_staff_day_records($1, $2)", [
        staff,
        JSON.stringify([
          { date: "2026-09-06", code: "legal_holiday" },
          { date: "2026-09-13", code: "legal_holiday" },
          { date: "2026-09-20", code: "pay_conversion" },
        ]),
      ]);
      await workDay(tx, staff, ibaraki, "2026-09-06");
      await workDay(tx, staff, ibaraki, "2026-09-13", "11:00", "14:00"); // 2時間 → 0.5日
      await workDay(tx, staff, ibaraki, "2026-09-20");
      await workDay(tx, staff, ibaraki, "2026-09-07"); // 通常の勤務日（シフトなしの勤務なので所定休日扱いだが「休み」の区分は無い）
      await tx.sql("update public.attendance_daily set status = 'manager_confirmed' where staff_id = $1", [staff]);

      await tx.as(manager).sql("select public.generate_holiday_credit_candidates($1, '2026-09-01', '2026-09-30')", [ibaraki]);
      const candidates = await tx.sql<{ request_id: string; source_work_date: string; credit_type: string; credited_days: string }>(
        "select request_id, source_work_date::text, credit_type, credited_days from public.holiday_credit_requests where credit_type = 'compensatory_day_off' order by source_work_date",
      );
      // 9/20 は給与変換のため対象外。9/7 はシフトなし勤務（所定休日扱い）のため代休の対象
      expect(candidates.map((c) => [c.source_work_date, Number(c.credited_days)])).toEqual([
        ["2026-09-06", 1],
        ["2026-09-07", 1],
        ["2026-09-13", 0.5],
      ]);

      await tx.as(manager).sql("select public.submit_holiday_credit($1, '当日休めなかったため')", [candidates[0].request_id]);
      await tx.as(hq).sql("select public.approve_holiday_credit($1)", [candidates[0].request_id]);
      const [grant] = await tx.sql<{ expiration_date: string; credited_days: string }>(
        "select expiration_date::text, credited_days from public.holiday_credit_ledger where request_id = $1",
        [candidates[0].request_id],
      );
      expect(grant).toEqual({ expiration_date: "2026-10-06", credited_days: "1.00" });

      // 付与後に区分を「給与変換」に変えると不整合として検出
      await tx.as(hq).sql("select public.set_staff_day_records($1, $2)", [staff, JSON.stringify([{ date: "2026-09-06", code: "pay_conversion" }])]);
      const issues = await tx.as(hq).sql<{ issue: string }>("select issue from public.holiday_credit_inconsistencies()");
      expect(issues.map((i) => i.issue)).toContain("not_holiday");
    });
  });
});

describe("有休の付与方式", () => {
  it("基準日方式に切り替えられ、最初の付与日は入社6か月後より後にできない", async () => {
    await withTx(async (tx) => {
      const { hq, manager, staff } = await setup(tx);
      await expect(tx.as(hq).sql("select public.set_staff_leave_settings($1, 'base_date', '2024-12-01')", [staff])).rejects.toThrow(/入社6か月後/);
      await tx.as(hq).sql("select public.set_staff_leave_settings($1, 'base_date', '2023-12-01')", [staff]);
      expect(await tx.as(hq).sql("select grant_basis, first_base_date::text from public.staff_leave_settings")).toEqual([
        { grant_basis: "base_date", first_base_date: "2023-12-01" },
      ]);
      await expect(tx.as(manager).sql("select public.set_staff_leave_settings($1, 'hire_date', null)", [staff])).rejects.toThrow(/本部のみ/);
      expect(await tx.as(manager).sql("select * from public.staff_leave_settings")).toEqual([]);
    });
  });
});

describe("勤怠管理表（1人1ファイル）の取込", () => {
  it("区分・基準日・振休/代休の残りを取り込み、取り込み直しても同じ結果。手入力の日は上書きしない", async () => {
    await withTx(async (tx) => {
      const { hq, staff } = await setup(tx);
      await tx.as(hq).sql("select public.set_staff_day_records($1, $2)", [staff, JSON.stringify([{ date: "2025-01-05", code: "paid" }])]);
      const records = JSON.stringify([
        { date: "2025-01-04", code: "legal_holiday" },
        { date: "2025-01-05", code: "non_legal_holiday" },
        { date: "2025-01-06", code: "furikyu" },
      ]);
      const run = () =>
        tx
          .as(hq)
          .sql<{ r: { imported: number; changed: number; kept_manual: number; balance_created: boolean } }>(
            "select public.import_staff_holiday_file($1, $2, '2023-12-01', 1.5, '2026-10-20', '2026-11-30', '岩永.xlsx') as r",
            [staff, records],
          );
      const [{ r: first }] = await run();
      expect(first).toEqual({ imported: 2, changed: 2, kept_manual: 1, skipped_closed: 0, balance_created: true });
      const [{ r: second }] = await run();
      expect(second).toMatchObject({ imported: 2, changed: 0, balance_created: false });

      expect(await tx.sql("select work_date::text, code, source from public.staff_day_records order by work_date")).toEqual([
        { work_date: "2025-01-04", code: "legal_holiday", source: "import" },
        { work_date: "2025-01-05", code: "paid", source: "manual" },
        { work_date: "2025-01-06", code: "furikyu", source: "import" },
      ]);
      const [setting] = await tx.sql<{ grant_basis: string }>("select grant_basis from public.staff_leave_settings where staff_id = $1", [staff]);
      expect(setting.grant_basis).toBe("base_date");
      const [{ balance }] = await tx.as(hq).sql<{ balance: string }>(
        "select holiday_credit_balance as balance from public.leave_balance_list('2026-10-20') where staff_id = $1",
        [staff],
      );
      expect(Number(balance)).toBe(1.5);
    });
  });
});

describe("法定休日の判定済みの表示", () => {
  it("その週に休日管理の区分があれば、区分の無い勤務日も判定済みになる", async () => {
    await withTx(async (tx) => {
      const { ibaraki, hq, staff } = await setup(tx);
      await workDay(tx, staff, ibaraki, "2026-09-08");
      await workDay(tx, staff, ibaraki, "2026-09-15");
      await tx.as(hq).sql("select public.set_staff_day_records($1, $2)", [staff, JSON.stringify([{ date: "2026-09-06", code: "legal_holiday" }])]);
      expect(await daily(tx, staff, "2026-09-08")).toMatchObject({ legal_holiday_configured: true });
      expect(await daily(tx, staff, "2026-09-15")).toMatchObject({ legal_holiday_configured: false }); // 区分の無い週
    });
  });
});
