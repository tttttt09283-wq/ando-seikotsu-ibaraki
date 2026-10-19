import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { closePool, withTx, type TestTx } from "./helpers";

afterAll(closePool);

async function setup(tx: TestTx) {
  const ibaraki = await tx.clinicId("IBARAKI");
  const korien = await tx.clinicId("KORIEN");
  const hq = await tx.createUser("hq@example.com", [{ role: "hq_admin" }]);
  const manager = await tx.createUser("mgr@example.com", [{ role: "clinic_manager", clinicId: ibaraki }]);
  const staff = await tx.createStaff("1001", ibaraki, { hireDate: "2024-04-01" });
  return { ibaraki, korien, hq, manager, staff };
}

const balance = async (tx: TestTx, userId: string, staffId: string, type: "paid" | "holiday_credit", on = "2026-11-15") => {
  const rows = await tx
    .as(userId)
    .sql<{ leave_type: string; balance: string; reserved: string; available: string }>("select * from public.leave_balances($1, $2::date)", [staffId, on]);
  const r = rows.find((x) => x.leave_type === type)!;
  return { balance: Number(r.balance), reserved: Number(r.reserved), available: Number(r.available) };
};

async function grantPaid(tx: TestTx, hq: string, staff: string, date = "2026-10-01", days = 10) {
  const [{ id }] = await tx.as(hq).sql<{ id: string }>("select public.grant_paid_leave($1, $2::date, $3, 'statutory') as id", [staff, date, days]);
  return id;
}

async function requestLeave(tx: TestTx, userId: string, staff: string, type: string, start: string, end = start, unit = "full") {
  const [{ id }] = await tx
    .as(userId)
    .sql<{ id: string }>("select public.request_leave($1, $2::public.leave_type, $3::date, $4::date, $5::public.leave_unit) as id", [staff, type, start, end, unit]);
  return id;
}

async function approveBoth(tx: TestTx, manager: string, hq: string, requestId: string) {
  await tx.as(manager).sql("select public.approve_leave_manager($1)", [requestId]);
  await tx.as(hq).sql("select public.approve_leave_final($1)", [requestId]);
}

describe("有給休暇", () => {
  it("必須テスト13：取得（最終承認）後に残数が正しく減り、申請中は予約として差し引かれる", async () => {
    await withTx(async (tx) => {
      const { hq, manager, staff } = await setup(tx);
      await grantPaid(tx, hq, staff);
      expect(await balance(tx, hq, staff, "paid")).toEqual({ balance: 10, reserved: 0, available: 10 });

      const id = await requestLeave(tx, manager, staff, "paid", "2026-11-16", "2026-11-17");
      expect(await balance(tx, hq, staff, "paid")).toEqual({ balance: 10, reserved: 2, available: 8 });

      await tx.as(manager).sql("select public.approve_leave_manager($1)", [id]);
      expect((await balance(tx, hq, staff, "paid")).balance).toBe(10); // 一次承認では減らない
      await tx.as(hq).sql("select public.approve_leave_final($1)", [id]);
      expect(await balance(tx, hq, staff, "paid")).toEqual({ balance: 8, reserved: 0, available: 8 });

      const half = await requestLeave(tx, manager, staff, "paid", "2026-11-20", "2026-11-20", "am");
      await approveBoth(tx, manager, hq, half);
      expect((await balance(tx, hq, staff, "paid")).balance).toBe(7.5);
    });
  });

  it("必須テスト14：承認済みの休暇を取り消すと残数が戻り、二重に取り消しても二重返還されない", async () => {
    await withTx(async (tx) => {
      const { hq, manager, staff } = await setup(tx);
      await grantPaid(tx, hq, staff);
      const id = await requestLeave(tx, manager, staff, "paid", "2026-11-16", "2026-11-18");
      await approveBoth(tx, manager, hq, id);
      expect((await balance(tx, hq, staff, "paid")).balance).toBe(7);

      await expect(tx.as(manager).sql("select public.cancel_leave($1, '体調回復')", [id])).rejects.toThrow(/本部のみ/);
      await tx.as(hq).sql("select public.cancel_leave($1, '予定変更のため')", [id]);
      expect((await balance(tx, hq, staff, "paid")).balance).toBe(10);
      await expect(tx.as(hq).sql("select public.cancel_leave($1, '二重操作')", [id])).rejects.toThrow(/既に取消/);
      expect((await balance(tx, hq, staff, "paid")).balance).toBe(10);
      // 同じ使用エントリの二重返還は DB の一意制約でも防がれる
      const [use] = await tx.sql<{ entry_id: string; leave_grant_id: string }>(
        "select entry_id, leave_grant_id from public.leave_ledger_entries where entry_type = 'use' limit 1",
      );
      await expect(
        tx.sql(
          "insert into public.leave_ledger_entries (staff_id, leave_grant_id, entry_type, days, effective_date, reversal_of_entry_id) values ($1, $2, 'use_reversal', 1, '2026-11-16', $3)",
          [staff, use.leave_grant_id, use.entry_id],
        ),
      ).rejects.toThrow(/reversal_of_entry_id/);
    });
  });

  it("承認前の申請を取り消すと予約が解除される", async () => {
    await withTx(async (tx) => {
      const { hq, manager, staff } = await setup(tx);
      await grantPaid(tx, hq, staff);
      const id = await requestLeave(tx, manager, staff, "paid", "2026-11-16");
      await tx.as(manager).sql("select public.cancel_leave($1, '申請誤り')", [id]);
      expect(await balance(tx, hq, staff, "paid")).toEqual({ balance: 10, reserved: 0, available: 10 });
    });
  });

  it("残数不足・同じ日の重複申請は受け付けない", async () => {
    await withTx(async (tx) => {
      const { hq, manager, staff } = await setup(tx);
      await grantPaid(tx, hq, staff, "2026-10-01", 2);
      await requestLeave(tx, manager, staff, "paid", "2026-11-16");
      await expect(requestLeave(tx, manager, staff, "paid", "2026-11-16")).rejects.toThrow(/既にあります/);
      await expect(requestLeave(tx, manager, staff, "paid", "2026-11-17", "2026-11-18")).rejects.toThrow(/残数が不足/);
    });
  });

  it("期限の近い付与から消化し、期限切れの付与は失効処理で台帳に記録される", async () => {
    await withTx(async (tx) => {
      const { hq, manager, staff } = await setup(tx);
      const older = await grantPaid(tx, hq, staff, "2024-10-01", 10); // 2026-09-30 まで
      const newer = await grantPaid(tx, hq, staff, "2025-10-01", 11); // 2027-09-30 まで
      const id = await requestLeave(tx, manager, staff, "paid", "2026-09-29");
      await approveBoth(tx, manager, hq, id);
      const used = await tx.sql<{ leave_grant_id: string }>("select leave_grant_id from public.leave_ledger_entries where entry_type = 'use'");
      expect(used.map((u) => u.leave_grant_id)).toEqual([older]);

      const [{ n }] = await tx.as(hq).sql<{ n: string }>("select public.expire_paid_leave('2026-10-01') as n");
      expect(Number(n)).toBe(9);
      const [g] = await tx.sql<{ expired_days: string; used_days: string }>("select expired_days, used_days from public.leave_grants where leave_grant_id = $1", [older]);
      expect(g).toEqual({ expired_days: "9.00", used_days: "1.00" });
      expect((await balance(tx, hq, staff, "paid", "2026-10-01")).balance).toBe(11);
      expect(newer).toBeTruthy();
      expect(await tx.as(hq).sql("select * from public.check_leave_ledger_consistency()")).toHaveLength(0);
    });
  });

  it("最終承認で勤務シフトが取り消され、休暇シフトが確定で登録される", async () => {
    await withTx(async (tx) => {
      const { ibaraki, hq, manager, staff } = await setup(tx);
      await grantPaid(tx, hq, staff);
      await tx.as(manager).sql("select public.save_shifts($1)", [
        JSON.stringify([{ staff_id: staff, clinic_id: ibaraki, work_date: "2026-11-16", shift_type: "work", start: "09:00", end: "18:00", break_minutes: 60 }]),
      ]);
      const id = await requestLeave(tx, manager, staff, "paid", "2026-11-16");
      await approveBoth(tx, manager, hq, id);
      const shifts = await tx.sql<{ shift_type: string; status: string }>(
        "select shift_type::text, status::text from public.shifts where staff_id = $1 order by created_at",
        [staff],
      );
      expect(shifts).toEqual([
        { shift_type: "work", status: "cancelled" },
        { shift_type: "paid_leave", status: "confirmed" },
      ]);
    });
  });

  it("院長は最終承認できず、他院の院長は一次承認もできない。本部以外は付与できない", async () => {
    await withTx(async (tx) => {
      const { korien, hq, manager, staff } = await setup(tx);
      await grantPaid(tx, hq, staff);
      const other = await tx.createUser("mgr-korien@example.com", [{ role: "clinic_manager", clinicId: korien }]);
      const id = await requestLeave(tx, manager, staff, "paid", "2026-11-16");
      await expect(tx.as(other).sql("select public.approve_leave_manager($1)", [id])).rejects.toThrow(/権限/);
      await tx.as(manager).sql("select public.approve_leave_manager($1)", [id]);
      await expect(tx.as(manager).sql("select public.approve_leave_final($1)", [id])).rejects.toThrow(/本部のみ/);
      await expect(tx.as(manager).sql("select public.grant_paid_leave($1, '2026-10-01', 10, 'manual')", [staff])).rejects.toThrow(/本部のみ/);
      expect(await tx.as(other).sql("select * from public.leave_grants")).toHaveLength(0);
    });
  });

  it("時間単位年休は労使協定の設定がなければ申請できない", async () => {
    await withTx(async (tx) => {
      const { hq, manager, staff } = await setup(tx);
      await grantPaid(tx, hq, staff);
      await expect(
        tx.as(manager).sql("select public.request_leave($1, 'paid', '2026-11-16', '2026-11-16', 'hour', 120)", [staff]),
      ).rejects.toThrow(/労使協定/);
    });
  });

  it("年5日取得義務：10日以上付与された人の取得日数と不足日数を出す", async () => {
    await withTx(async (tx) => {
      const { hq, manager, staff } = await setup(tx);
      await grantPaid(tx, hq, staff, "2026-10-01", 10);
      const id = await requestLeave(tx, manager, staff, "paid", "2026-11-16", "2026-11-17");
      await approveBoth(tx, manager, hq, id);
      const [row] = await tx.as(hq).sql<{ taken_days: string; shortfall: string }>("select * from public.annual_leave_obligations('2026-11-30')");
      expect(row).toMatchObject({ taken_days: "2.00", shortfall: "3.00" });
    });
  });
});

describe("祝日勤務の振休", () => {
  /** 2026-10-12（スポーツの日）に勤務し、院長確認まで済ませる */
  async function workOnHoliday(tx: TestTx, manager: string, ibaraki: string, staff: string) {
    for (const [type, time] of [
      ["clock_in", "09:00"],
      ["clock_out", "18:00"],
    ]) {
      await tx.sql(
        `insert into public.raw_punch_events (staff_id, clinic_id, home_clinic_id, punch_type, punched_at, source)
         values ($1, $2, $2, $3, ('2026-10-12 ' || $4)::timestamp at time zone 'Asia/Tokyo', 'adjustment')`,
        [staff, ibaraki, type, time],
      );
    }
    await tx.sql("select app.recalc_attendance($1, '2026-10-12', '2026-10-12')", [staff]);
    await tx.as(manager).sql("select public.confirm_attendance($1, '2026-10-01', '2026-10-31')", [ibaraki]);
  }

  const setEligible = (tx: TestTx, hq: string, staff: string, eligible: boolean) =>
    tx.as(hq).sql("select public.set_holiday_credit_eligibility($1, $2, '2026-04-01', '就業規則に基づく設定')", [staff, eligible]);

  const generate = async (tx: TestTx, manager: string, ibaraki: string) =>
    (await tx.as(manager).sql<{ n: number }>("select public.generate_holiday_credit_candidates($1, '2026-10-01', '2026-10-31') as n", [ibaraki]))[0].n;

  async function candidateOf(tx: TestTx, staff: string) {
    const [r] = await tx.sql<{ request_id: string; status: string }>("select request_id, status::text from public.holiday_credit_requests where staff_id = $1", [staff]);
    return r;
  }

  it("必須テスト8：付与対象のスタッフが祝日に勤務すると付与候補が生成される", async () => {
    await withTx(async (tx) => {
      const { ibaraki, hq, manager, staff } = await setup(tx);
      await setEligible(tx, hq, staff, true);
      await workOnHoliday(tx, manager, ibaraki, staff);
      expect(await generate(tx, manager, ibaraki)).toBe(1);
      expect((await candidateOf(tx, staff)).status).toBe("candidate");
      expect(await generate(tx, manager, ibaraki)).toBe(0); // 同じ実績から重複して候補を作らない
    });
  });

  it("必須テスト9：付与対象外（未設定・OFF）のスタッフには候補が生成されない", async () => {
    await withTx(async (tx) => {
      const { ibaraki, hq, manager, staff } = await setup(tx);
      const other = await tx.createStaff("1002", ibaraki);
      await setEligible(tx, hq, other, false); // 完全週休2日制などで個別設定 OFF
      await workOnHoliday(tx, manager, ibaraki, staff); // staff は未設定
      await workOnHoliday(tx, manager, ibaraki, other);
      expect(await generate(tx, manager, ibaraki)).toBe(0);
    });
  });

  it("院長確認前の勤怠からは候補を作らない", async () => {
    await withTx(async (tx) => {
      const { ibaraki, hq, manager, staff } = await setup(tx);
      await setEligible(tx, hq, staff, true);
      await tx.sql(
        `insert into public.raw_punch_events (staff_id, clinic_id, home_clinic_id, punch_type, punched_at, source) values
         ($1, $2, $2, 'clock_in', '2026-10-12 09:00+09', 'adjustment'), ($1, $2, $2, 'clock_out', '2026-10-12 18:00+09', 'adjustment')`,
        [staff, ibaraki],
      );
      await tx.sql("select app.recalc_attendance($1, '2026-10-12', '2026-10-12')", [staff]);
      expect(await generate(tx, manager, ibaraki)).toBe(0);
    });
  });

  it("必須テスト10・11：本部承認前は残数が増えず、承認後に1日だけ付与される（期限はその月末）", async () => {
    await withTx(async (tx) => {
      const { ibaraki, hq, manager, staff } = await setup(tx);
      await setEligible(tx, hq, staff, true);
      await workOnHoliday(tx, manager, ibaraki, staff);
      await generate(tx, manager, ibaraki);
      const { request_id } = await candidateOf(tx, staff);
      expect((await balance(tx, hq, staff, "holiday_credit", "2026-10-20")).balance).toBe(0);

      await expect(tx.as(manager).sql("select public.submit_holiday_credit($1, '')", [request_id])).rejects.toThrow(/理由/);
      await tx.as(manager).sql("select public.submit_holiday_credit($1, '患者予約が多く当日は休めなかった')", [request_id]);
      expect((await balance(tx, hq, staff, "holiday_credit", "2026-10-20")).balance).toBe(0); // 承認待ちでも増えない
      await expect(tx.as(manager).sql("select public.approve_holiday_credit($1)", [request_id])).rejects.toThrow(/本部のみ/);

      await tx.as(hq).sql("select public.approve_holiday_credit($1)", [request_id]);
      expect((await balance(tx, hq, staff, "holiday_credit", "2026-10-20")).balance).toBe(1);
      const [grant] = await tx.sql<{ expiration_date: string; credited_days: string }>(
        "select expiration_date::text, credited_days from public.holiday_credit_ledger where entry_type = 'grant'",
      );
      expect(grant).toEqual({ expiration_date: "2026-10-31", credited_days: "1.00" });
    });
  });

  it("必須テスト12：同じ祝日勤務を二重に承認しても二重付与されない", async () => {
    await withTx(async (tx) => {
      const { ibaraki, hq, manager, staff } = await setup(tx);
      await setEligible(tx, hq, staff, true);
      await workOnHoliday(tx, manager, ibaraki, staff);
      await generate(tx, manager, ibaraki);
      const { request_id } = await candidateOf(tx, staff);
      await tx.as(manager).sql("select public.submit_holiday_credit($1, '当日は人手不足')", [request_id]);
      await tx.as(hq).sql("select public.approve_holiday_credit($1)", [request_id]);
      await expect(tx.as(hq).sql("select public.approve_holiday_credit($1)", [request_id])).rejects.toThrow(/承認待ちではありません/);

      // 同じ勤務実績に別の申請を作って承認しようとしても、DB の一意制約で付与できない
      const [att] = await tx.sql<{ attendance_id: string; row_version: number }>("select attendance_id, row_version from public.attendance_daily where staff_id = $1 and work_date = '2026-10-12'", [staff]);
      await expect(
        tx.sql(
          `insert into public.holiday_credit_requests (staff_id, credit_type, source_work_date, source_attendance_id, source_row_version, source_worked_minutes, status)
           values ($1, 'company_holiday_work_leave', '2026-10-12', $2, $3, 540, 'pending')`,
          [staff, att.attendance_id, att.row_version],
        ),
      ).rejects.toThrow(/holiday_credit_requests_active_unique/);
      await expect(
        tx.sql(
          `insert into public.holiday_credit_ledger (staff_id, entry_type, source_work_date, source_attendance_id, credit_type, credited_days, effective_date)
           values ($1, 'grant', '2026-10-12', $2, 'company_holiday_work_leave', 1, '2026-10-12')`,
          [staff, att.attendance_id],
        ),
      ).rejects.toThrow(/holiday_credit_ledger_one_grant/);
      expect((await balance(tx, hq, staff, "holiday_credit", "2026-10-20")).balance).toBe(1);
    });
  });

  it("必須テスト18：付与後に祝日勤務の実績が修正・取消されると、不整合として検出され、本部が取り消せる", async () => {
    await withTx(async (tx) => {
      const { ibaraki, hq, manager, staff } = await setup(tx);
      await setEligible(tx, hq, staff, true);
      await workOnHoliday(tx, manager, ibaraki, staff);
      await generate(tx, manager, ibaraki);
      const { request_id } = await candidateOf(tx, staff);
      await tx.as(manager).sql("select public.submit_holiday_credit($1, '当日は人手不足')", [request_id]);
      await tx.as(hq).sql("select public.approve_holiday_credit($1)", [request_id]);
      expect(await tx.as(hq).sql("select * from public.holiday_credit_inconsistencies()")).toHaveLength(0);

      // 打刻修正で出勤・退勤を取り消す（実は勤務していなかった）
      const events = await tx.sql<{ event_id: string }>("select event_id from public.raw_punch_events where staff_id = $1", [staff]);
      for (const e of events) {
        const [{ id }] = await tx
          .as(manager)
          .sql<{ id: string }>("select public.request_attendance_adjustment($1, '2026-10-12', $2, 'void', $3, null, null, '誤打刻') as id", [staff, ibaraki, e.event_id]);
        await tx.as(hq).sql("select public.approve_attendance_adjustment($1)", [id]);
      }
      const issues = await tx.as(hq).sql<{ request_id: string; issue: string }>("select request_id, issue from public.holiday_credit_inconsistencies()");
      expect(issues).toEqual([{ request_id, issue: "no_work" }]);

      await tx.as(hq).sql("select public.revoke_holiday_credit($1, '勤務実績の取消に伴い付与を取消')", [request_id]);
      expect((await balance(tx, hq, staff, "holiday_credit", "2026-10-20")).balance).toBe(0);
      expect(await tx.as(hq).sql("select * from public.holiday_credit_inconsistencies()")).toHaveLength(0);
      // 履歴は残る
      const ledger = await tx.sql<{ entry_type: string }>("select entry_type::text from public.holiday_credit_ledger order by created_at");
      expect(ledger.map((l) => l.entry_type)).toEqual(["grant", "revoke"]);
    });
  });

  it("振休を休暇申請で使うと残数が減り、期限は本部が変更でき、期限切れは失効処理で記録される", async () => {
    await withTx(async (tx) => {
      const { ibaraki, hq, manager, staff } = await setup(tx);
      await setEligible(tx, hq, staff, true);
      await workOnHoliday(tx, manager, ibaraki, staff);
      await generate(tx, manager, ibaraki);
      const { request_id } = await candidateOf(tx, staff);
      await tx.as(manager).sql("select public.submit_holiday_credit($1, '当日は人手不足')", [request_id]);
      const [{ id: grantId }] = await tx.as(hq).sql<{ id: string }>("select public.approve_holiday_credit($1) as id", [request_id]);

      const leave = await requestLeave(tx, manager, staff, "holiday_credit", "2026-10-28");
      await approveBoth(tx, manager, hq, leave);
      expect((await balance(tx, hq, staff, "holiday_credit", "2026-10-28")).balance).toBe(0);

      await tx.as(hq).sql("select public.cancel_leave($1, '取得日の変更')", [leave]);
      await expect(tx.as(manager).sql("select public.set_holiday_credit_expiration($1, '2026-11-30', '繁忙のため延長')", [grantId])).rejects.toThrow(/本部のみ/);
      await tx.as(hq).sql("select public.set_holiday_credit_expiration($1, '2026-11-30', '繁忙のため延長')", [grantId]);
      expect((await balance(tx, hq, staff, "holiday_credit", "2026-11-20")).balance).toBe(1);

      const [{ n }] = await tx.as(hq).sql<{ n: string }>("select public.expire_holiday_credits('2026-12-01') as n");
      expect(Number(n)).toBe(1);
      await expect(tx.sql("update public.holiday_credit_ledger set credited_days = 5 where holiday_credit_id = $1", [grantId])).rejects.toThrow(/追記専用/);
    });
  });

  it("ポリシーが無効な区分は正式付与できない", async () => {
    await withTx(async (tx) => {
      const { ibaraki, hq, manager, staff } = await setup(tx);
      await setEligible(tx, hq, staff, true);
      await workOnHoliday(tx, manager, ibaraki, staff);
      await generate(tx, manager, ibaraki);
      const { request_id } = await candidateOf(tx, staff);
      await tx.as(manager).sql("select public.submit_holiday_credit($1, '当日は人手不足')", [request_id]);
      await tx.as(hq).sql("update public.holiday_credit_policies set is_active = false where credit_type = 'company_holiday_work_leave'");
      await expect(tx.as(hq).sql("select public.approve_holiday_credit($1)", [request_id])).rejects.toThrow(/正式付与できません/);
    });
  });
});

describe("共用端末からの休暇申請", () => {
  it("本人確認したトークンで申請でき、トークンは1回で失効する", async () => {
    await withTx(async (tx) => {
      const { ibaraki, hq, staff } = await setup(tx);
      await grantPaid(tx, hq, staff);
      const [{ r }] = await tx.as(hq).sql<{ r: { code: string } }>("select public.issue_kiosk_registration($1, 'tab') as r", [ibaraki]);
      const [{ d }] = await tx.as(null).sql<{ d: { secret: string } }>("select public.kiosk_register_device($1) as d", [r.code]);
      await tx.as(hq).sql("select public.set_kiosk_pin($1, '482916')", [staff]);
      const [{ a }] = await tx.as(null).sql<{ a: { session_token: string } }>("select public.kiosk_authenticate($1, '1001', '482916') as a", [d.secret]);

      const [{ b }] = await tx.as(null).sql<{ b: { paid: string } }>("select public.kiosk_leave_balances($1, $2) as b", [d.secret, a.session_token]);
      expect(Number(b.paid)).toBe(10);
      const req = async () =>
        (await tx.as(null).sql<{ x: { ok: boolean; error?: string } }>(
          "select public.kiosk_request_leave($1, $2, 'paid', '2026-11-20', '2026-11-20', 'full', '私用') as x",
          [d.secret, a.session_token],
        ))[0].x;
      expect(await req()).toMatchObject({ ok: true });
      expect(await req()).toEqual({ ok: false, error: "session_invalid" });
      const [row] = await tx.sql<{ requested_via: string; status: string }>("select requested_via, status::text from public.leave_requests");
      expect(row).toEqual({ requested_via: "kiosk", status: "pending" });
      expect(randomUUID()).toBeTruthy();
    });
  });
});

describe("祝日の半日勤務（0.5日）", () => {
  it("祝日の実労働が4時間以下なら振休は0.5日付与される", async () => {
    await withTx(async (tx) => {
      const { ibaraki, hq, manager, staff } = await setup(tx);
      await tx.as(hq).sql("select public.set_holiday_credit_eligibility($1, true, '2026-04-01', '対象')", [staff]);
      await tx.sql(
        `insert into public.raw_punch_events (staff_id, clinic_id, home_clinic_id, punch_type, punched_at, source) values
         ($1, $2, $2, 'clock_in', '2026-10-12 09:00+09', 'adjustment'), ($1, $2, $2, 'clock_out', '2026-10-12 13:00+09', 'adjustment')`,
        [staff, ibaraki],
      );
      await tx.sql("select app.recalc_attendance($1, '2026-10-12', '2026-10-12')", [staff]);
      await tx.as(manager).sql("select public.confirm_attendance($1, '2026-10-01', '2026-10-31')", [ibaraki]);
      await tx.as(manager).sql("select public.generate_holiday_credit_candidates($1, '2026-10-01', '2026-10-31')", [ibaraki]);
      const [r] = await tx.sql<{ request_id: string; credited_days: string }>("select request_id, credited_days from public.holiday_credit_requests");
      expect(r.credited_days).toBe("0.5");
      await tx.as(manager).sql("select public.submit_holiday_credit($1, '午前のみ勤務')", [r.request_id]);
      await tx.as(hq).sql("select public.approve_holiday_credit($1)", [r.request_id]);
      expect((await balance(tx, hq, staff, "holiday_credit", "2026-10-20")).balance).toBe(0.5);
    });
  });
});

describe("有給残数の取込（Excel）", () => {
  const rows = (taken: number) => [
    { row: 2, staff_code: "1001", grant_date: "2025-10-01", granted_days: 11, taken_days: taken },
    { row: 3, staff_code: "1001", grant_date: "2024-10-01", granted_days: 10, taken_days: 10, expiration_date: "2026-09-30" },
  ];

  it("未登録の付与は移行として登録し、取り込み直すと差分だけ調整する（同じデータなら変化なし）", async () => {
    await withTx(async (tx) => {
      const { hq, staff } = await setup(tx);
      const imp = async (r: unknown[]) =>
        (await tx.as(hq).sql<{ r: Record<string, number> }>("select public.import_paid_leave($1, '有給管理.xlsx') as r", [JSON.stringify(r)]))[0].r;

      expect(await imp(rows(3))).toEqual({ created: 2, adjusted: 0, unchanged: 0 });
      expect((await balance(tx, hq, staff, "paid", "2026-10-19")).balance).toBe(8);
      expect(await imp(rows(3))).toEqual({ created: 0, adjusted: 0, unchanged: 2 });
      expect(await imp(rows(5))).toEqual({ created: 0, adjusted: 1, unchanged: 1 }); // 最新データで取得が2日増えた
      expect((await balance(tx, hq, staff, "paid", "2026-10-19")).balance).toBe(6);

      const [obl] = await tx.as(hq).sql<{ taken_days: string }>("select * from public.annual_leave_obligations('2026-09-01')");
      expect(Number(obl.taken_days)).toBe(3); // 取込時の取得済み日数を年5日の集計に含める
      expect(await tx.as(hq).sql("select * from public.check_leave_ledger_consistency()")).toHaveLength(0);
    });
  });

  it("1行でも誤りがあれば全件取り込まない。院長は取り込めない", async () => {
    await withTx(async (tx) => {
      const { hq, manager, staff } = await setup(tx);
      const bad = [...rows(3), { row: 4, staff_code: "9999", grant_date: "2025-10-01", granted_days: 10, taken_days: 0 }];
      await expect(tx.as(hq).sql("select public.import_paid_leave($1, 'x.xlsx')", [JSON.stringify(bad)])).rejects.toThrow(/4行目/);
      expect(await tx.sql("select * from public.leave_grants where staff_id = $1", [staff])).toHaveLength(0);
      await expect(tx.as(manager).sql("select public.import_paid_leave($1, 'x.xlsx')", [JSON.stringify(rows(0))])).rejects.toThrow(/本部のみ/);
    });
  });
});

describe("有給残数の取込（月末残数形式）", () => {
  it("残数を推定した付与に登録し、最新月で取り込み直すと差分だけ調整する", async () => {
    await withTx(async (tx) => {
      const { hq, staff } = await setup(tx); // 入社 2024-04-01
      const plan = [
        { grant_date: "2024-10-01", days: 7, expiration_date: "2026-09-30" },
        { grant_date: "2025-10-01", days: 11, expiration_date: "2027-09-30" },
      ];
      const imp = async (asOf: string, remaining: number) =>
        (await tx
          .as(hq)
          .sql<{ r: Record<string, number> }>("select public.import_paid_leave_snapshot($1, $2::date, '出勤簿.xlsx') as r", [
            JSON.stringify([{ row: 5, staff_id: staff, remaining_days: remaining, plan }]),
            asOf,
          ]))[0].r;

      expect(await imp("2026-06-30", 18)).toEqual({ created: 1, adjusted: 0, unchanged: 0 });
      expect((await balance(tx, hq, staff, "paid", "2026-06-30")).balance).toBe(18);
      expect(await imp("2026-06-30", 18)).toEqual({ created: 0, adjusted: 0, unchanged: 1 });
      // 翌月の表で残が 15.5 日に減った → 期限の近い付与から 2.5 日を調整
      expect(await imp("2026-07-31", 15.5)).toEqual({ created: 0, adjusted: 1, unchanged: 0 });
      const grants = await tx.sql<{ grant_date: string; remaining: string }>(
        "select grant_date::text, app.leave_grant_remaining(leave_grant_id) as remaining from public.leave_grants where staff_id = $1 order by grant_date",
        [staff],
      );
      expect(grants).toEqual([
        { grant_date: "2024-10-01", remaining: "4.50" },
        { grant_date: "2025-10-01", remaining: "11.00" },
      ]);
      expect(await tx.as(hq).sql("select * from public.check_leave_ledger_consistency()")).toHaveLength(0);
    });
  });

  it("振り分けの合計が残数と合わなければ取り込まない", async () => {
    await withTx(async (tx) => {
      const { hq, staff } = await setup(tx);
      await expect(
        tx.as(hq).sql("select public.import_paid_leave_snapshot($1, '2026-06-30', 'x')", [
          JSON.stringify([{ row: 5, staff_id: staff, remaining_days: 18, plan: [{ grant_date: "2025-10-01", days: 11, expiration_date: "2027-09-30" }] }]),
        ]),
      ).rejects.toThrow(/一致しません/);
    });
  });
});
