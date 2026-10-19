import { afterAll, describe, expect, it } from "vitest";
import { closePool, withTx, type TestTx } from "./helpers";

afterAll(closePool);

interface ShiftRow {
  shift_id: string;
  status: string;
  version: number;
  start_jst: string | null;
  end_jst: string | null;
}

async function setup(tx: TestTx) {
  const ibaraki = await tx.clinicId("IBARAKI");
  const korien = await tx.clinicId("KORIEN");
  const hq = await tx.createUser("hq@example.com", [{ role: "hq_admin" }]);
  const manager = await tx.createUser("mgr-ibaraki@example.com", [{ role: "clinic_manager", clinicId: ibaraki }]);
  const korienManager = await tx.createUser("mgr-korien@example.com", [{ role: "clinic_manager", clinicId: korien }]);
  const staffUser = await tx.createUser("staff@example.com", [{ role: "staff" }]);
  const staff = await tx.createStaff("1001", ibaraki, { authUserId: staffUser });
  const korienStaff = await tx.createStaff("2001", korien);
  return { ibaraki, korien, hq, manager, korienManager, staffUser, staff, korienStaff };
}

const work = (staffId: string, clinicId: string, date: string, start = "09:00", end = "18:00", breakMinutes = 60) => ({
  staff_id: staffId,
  clinic_id: clinicId,
  work_date: date,
  shift_type: "work",
  start,
  end,
  break_minutes: breakMinutes,
});

const save = (tx: TestTx, userId: string, items: unknown[], reason: string | null = null) =>
  tx.as(userId).sql<{ n: number }>("select public.save_shifts($1, $2) as n", [JSON.stringify(items), reason]);

const shiftsOf = (tx: TestTx, staffId: string) =>
  tx.sql<ShiftRow>(
    `select shift_id, status::text, version,
            to_char(scheduled_start at time zone 'Asia/Tokyo', 'YYYY-MM-DD HH24:MI') as start_jst,
            to_char(scheduled_end at time zone 'Asia/Tokyo', 'YYYY-MM-DD HH24:MI') as end_jst
       from public.shifts where staff_id = $1 and status <> 'cancelled' order by work_date, scheduled_start`,
    [staffId],
  );

describe("必須テスト1：一般スタッフはシフトを編集できない", () => {
  it("シフト作成・変更・確定・取消のRPCはすべて拒否される", async () => {
    await withTx(async (tx) => {
      const { ibaraki, manager, staffUser, staff } = await setup(tx);
      await expect(save(tx, staffUser, [work(staff, ibaraki, "2026-11-02")])).rejects.toThrow(/担当外の院/);

      await save(tx, manager, [work(staff, ibaraki, "2026-11-02")]);
      const [shift] = await shiftsOf(tx, staff);
      await expect(
        save(tx, staffUser, [{ shift_id: shift.shift_id, expected_version: shift.version, shift_type: "work", start: "10:00", end: "19:00" }]),
      ).rejects.toThrow(/担当外の院/);
      await expect(
        tx.as(staffUser).sql("select public.confirm_shifts($1, '2026-11-01', '2026-11-30')", [ibaraki]),
      ).rejects.toThrow(/担当外の院/);
      await expect(
        tx.as(staffUser).sql("select public.cancel_shifts($1, 'x')", [JSON.stringify([{ shift_id: shift.shift_id, expected_version: 1 }])]),
      ).rejects.toThrow(/担当外の院/);
    });
  });

  it("テーブルへの直接の書き込み・削除も権限がない", async () => {
    await withTx(async (tx) => {
      const { ibaraki, manager, staffUser, staff } = await setup(tx);
      await save(tx, manager, [work(staff, ibaraki, "2026-11-02")]);
      for (const userId of [staffUser, manager]) {
        await expect(tx.as(userId).sql("update public.shifts set note = 'x'")).rejects.toThrow(/permission denied/);
        await expect(tx.as(userId).sql("delete from public.shifts")).rejects.toThrow(/permission denied/);
        await expect(
          tx.as(userId).sql("insert into public.shifts (staff_id, clinic_id, work_date, shift_type) values ($1, $2, '2026-11-03', 'scheduled_holiday')", [
            staff,
            ibaraki,
          ]),
        ).rejects.toThrow(/permission denied/);
      }
    });
  });

  it("スタッフ本人は確定済みの自分のシフトだけ参照できる", async () => {
    await withTx(async (tx) => {
      const { ibaraki, manager, staffUser, staff } = await setup(tx);
      await save(tx, manager, [work(staff, ibaraki, "2026-11-02"), work(staff, ibaraki, "2026-12-01")]);
      await tx.as(manager).sql("select public.confirm_shifts($1, '2026-11-01', '2026-11-30')", [ibaraki]);
      const rows = await tx.as(staffUser).sql<{ work_date: string }>("select work_date::text from public.shifts");
      expect(rows).toEqual([{ work_date: "2026-11-02" }]);
    });
  });
});

describe("必須テスト2：院長は担当外の院のシフトを編集できない", () => {
  it("担当外の院のシフト作成・変更・確定は拒否され、参照もできない", async () => {
    await withTx(async (tx) => {
      const { korien, manager, korienManager, korienStaff } = await setup(tx);
      await expect(save(tx, manager, [work(korienStaff, korien, "2026-11-02")])).rejects.toThrow(/担当外の院/);

      await save(tx, korienManager, [work(korienStaff, korien, "2026-11-02")]);
      const [shift] = await shiftsOf(tx, korienStaff);
      await expect(
        save(tx, manager, [{ shift_id: shift.shift_id, expected_version: shift.version, shift_type: "work", start: "10:00", end: "19:00" }]),
      ).rejects.toThrow(/担当外の院/);
      await expect(
        tx.as(manager).sql("select public.confirm_shifts($1, '2026-11-01', '2026-11-30')", [korien]),
      ).rejects.toThrow(/担当外の院/);
      expect(await tx.as(manager).sql("select * from public.shifts")).toHaveLength(0);
    });
  });

  it("所属・応援登録のないスタッフのシフトは作れない（応援登録すれば作れる）", async () => {
    await withTx(async (tx) => {
      const { ibaraki, manager, korienStaff } = await setup(tx);
      await expect(save(tx, manager, [work(korienStaff, ibaraki, "2026-11-02")])).rejects.toThrow(/所属・応援登録がありません/);
      await tx.addSupport(korienStaff, ibaraki, "2026-11-01", "2026-11-30");
      await save(tx, manager, [work(korienStaff, ibaraki, "2026-11-02")]);
      expect(await shiftsOf(tx, korienStaff)).toHaveLength(1);
    });
  });
});

describe("必須テスト3・4：院長は担当院の確定シフトを編集でき、変更前後が保存される", () => {
  it("確定シフトは理由付きで変更でき、状態が revised になり改訂ログに前後が残る", async () => {
    await withTx(async (tx) => {
      const { ibaraki, manager, staff } = await setup(tx);
      await save(tx, manager, [work(staff, ibaraki, "2026-11-02")]);
      expect((await tx.as(manager).sql<{ n: number }>("select public.confirm_shifts($1, '2026-11-01', '2026-11-30') as n", [ibaraki]))[0].n).toBe(1);
      const [confirmed] = await shiftsOf(tx, staff);
      expect(confirmed.status).toBe("confirmed");

      const change = { shift_id: confirmed.shift_id, expected_version: confirmed.version, shift_type: "work", start: "11:00", end: "20:00", break_minutes: 60 };
      await expect(save(tx, manager, [change])).rejects.toThrow(/理由を入力/);
      await save(tx, manager, [change], "患者予約の増加に対応");

      const [revised] = await shiftsOf(tx, staff);
      expect(revised).toMatchObject({ status: "revised", start_jst: "2026-11-02 11:00", end_jst: "2026-11-02 20:00" });

      const logs = await tx
        .as(manager)
        .sql<{ action: string; reason: string | null; before: { start: string } | null; after: { start: string; status: string } }>(
          "select action, reason, before, after from public.shift_revision_logs where shift_id = $1 order by id",
          [confirmed.shift_id],
        );
      expect(logs.map((l) => l.action)).toEqual(["create", "confirm", "update"]);
      expect(logs[2]).toMatchObject({
        reason: "患者予約の増加に対応",
        before: expect.objectContaining({ start: "2026-11-02 09:00" }),
        after: expect.objectContaining({ start: "2026-11-02 11:00", status: "revised" }),
      });
    });
  });

  it("確定シフトの取消も理由必須で、取消の履歴が残る", async () => {
    await withTx(async (tx) => {
      const { ibaraki, manager, staff } = await setup(tx);
      await save(tx, manager, [work(staff, ibaraki, "2026-11-02")]);
      await tx.as(manager).sql("select public.confirm_shifts($1, '2026-11-01', '2026-11-30')", [ibaraki]);
      const [s] = await shiftsOf(tx, staff);
      const items = JSON.stringify([{ shift_id: s.shift_id, expected_version: s.version }]);
      await expect(tx.as(manager).sql("select public.cancel_shifts($1, null)", [items])).rejects.toThrow(/理由/);
      await tx.as(manager).sql("select public.cancel_shifts($1, '院の臨時休診')", [items]);
      expect(await shiftsOf(tx, staff)).toHaveLength(0);
      const [log] = await tx.sql<{ action: string; reason: string }>(
        "select action, reason from public.shift_revision_logs where shift_id = $1 order by id desc limit 1",
        [s.shift_id],
      );
      expect(log).toEqual({ action: "cancel", reason: "院の臨時休診" });
    });
  });

  it("改訂ログは変更・削除できない", async () => {
    await withTx(async (tx) => {
      const { ibaraki, manager, staff } = await setup(tx);
      await save(tx, manager, [work(staff, ibaraki, "2026-11-02")]);
      await expect(tx.sql("update public.shift_revision_logs set reason = 'x'")).rejects.toThrow(/追記専用/);
      await expect(tx.sql("delete from public.shift_revision_logs")).rejects.toThrow(/追記専用/);
    });
  });

  it("当日以前のシフト変更には勤怠の再計算フラグが付く", async () => {
    await withTx(async (tx) => {
      const { ibaraki, manager, staff } = await setup(tx);
      const [{ today }] = await tx.sql<{ today: string }>("select app.today_jst()::text as today");
      await save(tx, manager, [work(staff, ibaraki, today), work(staff, ibaraki, "2099-01-05")]);
      const rows = await tx.sql<{ work_date: string; requires_recalc: boolean }>(
        "select work_date::text, requires_recalc from public.shift_revision_logs order by work_date",
      );
      expect(rows).toEqual([
        { work_date: today, requires_recalc: true },
        { work_date: "2099-01-05", requires_recalc: false },
      ]);
    });
  });
});

describe("シフトの整合性", () => {
  it("翌日にまたがる勤務を登録できる", async () => {
    await withTx(async (tx) => {
      const { ibaraki, manager, staff } = await setup(tx);
      await save(tx, manager, [work(staff, ibaraki, "2026-11-02", "18:00", "02:00", 60)]);
      expect((await shiftsOf(tx, staff))[0]).toMatchObject({ start_jst: "2026-11-02 18:00", end_jst: "2026-11-03 02:00" });
    });
  });

  it("同じスタッフの勤務時間の重複は院をまたいでも拒否される", async () => {
    await withTx(async (tx) => {
      const { ibaraki, korien, manager, korienManager, staff } = await setup(tx);
      await tx.addSupport(staff, korien);
      await save(tx, manager, [work(staff, ibaraki, "2026-11-02", "09:00", "13:00", 0)]);
      await expect(save(tx, korienManager, [work(staff, korien, "2026-11-02", "12:00", "18:00", 0)])).rejects.toThrow(
        /他のシフト（他院を含む）と重なっています/,
      );
      // 時間が重ならなければ午前・午後で別の院に入れる（応援勤務）
      await save(tx, korienManager, [work(staff, korien, "2026-11-02", "14:00", "18:00", 0)]);
      expect(await shiftsOf(tx, staff)).toHaveLength(2);
    });
  });

  it("他の人が先に更新したシフトは上書きできない（楽観ロック）", async () => {
    await withTx(async (tx) => {
      const { ibaraki, manager, hq, staff } = await setup(tx);
      await save(tx, manager, [work(staff, ibaraki, "2026-11-02")]);
      const [s] = await shiftsOf(tx, staff);
      await save(tx, hq, [{ shift_id: s.shift_id, expected_version: s.version, shift_type: "work", start: "10:00", end: "19:00", break_minutes: 60 }]);
      await expect(
        save(tx, manager, [{ shift_id: s.shift_id, expected_version: s.version, shift_type: "work", start: "08:00", end: "17:00", break_minutes: 60 }]),
      ).rejects.toThrow(/他の人が先に更新しました/);
    });
  });

  it("一括登録は1件でも失敗すると全件取り消される", async () => {
    await withTx(async (tx) => {
      const { ibaraki, manager, staff, korienStaff } = await setup(tx);
      await expect(save(tx, manager, [work(staff, ibaraki, "2026-11-02"), work(korienStaff, ibaraki, "2026-11-02")])).rejects.toThrow();
      expect(await shiftsOf(tx, staff)).toHaveLength(0);
    });
  });

  it("休みは1日1件、休憩は勤務時間内", async () => {
    await withTx(async (tx) => {
      const { ibaraki, manager, staff } = await setup(tx);
      const dayOff = { staff_id: staff, clinic_id: ibaraki, work_date: "2026-11-04", shift_type: "scheduled_holiday" };
      await save(tx, manager, [dayOff]);
      await expect(save(tx, manager, [dayOff])).rejects.toThrow(/休み・休暇が既に登録/);
      await expect(save(tx, manager, [work(staff, ibaraki, "2026-11-05", "09:00", "10:00", 60)])).rejects.toThrow(/shifts_break_within/);
    });
  });

  it("締め済みの月のシフトは本部でも変更できない", async () => {
    await withTx(async (tx) => {
      const { ibaraki, manager, hq, staff } = await setup(tx);
      await save(tx, manager, [work(staff, ibaraki, "2026-10-05")]);
      await tx.sql("insert into public.monthly_closings (clinic_id, year_month, status) values ($1, '2026-10-01', 'closed')", [ibaraki]);
      const [s] = await shiftsOf(tx, staff);
      const change = [{ shift_id: s.shift_id, expected_version: s.version, shift_type: "work", start: "10:00", end: "19:00", break_minutes: 60 }];
      await expect(save(tx, hq, change, "修正")).rejects.toThrow(/締め済み/);
      await expect(save(tx, manager, [work(staff, ibaraki, "2026-10-06")])).rejects.toThrow(/締め済み/);
      // 再開されれば変更できる
      await tx.sql("update public.monthly_closings set status = 'reopened' where clinic_id = $1", [ibaraki]);
      await save(tx, hq, change, "締め再開後の修正");
    });
  });
});

describe("勤務パターン", () => {
  it("院長は担当院のパターンを作れるが、全院共通パターンと他院のパターンは作れない", async () => {
    await withTx(async (tx) => {
      const { ibaraki, korien, manager } = await setup(tx);
      await tx
        .as(manager)
        .sql("insert into public.shift_templates (clinic_id, name, start_time, end_time, break_minutes) values ($1, '茨木通し', '09:00', '20:30', 180)", [ibaraki]);
      for (const clinicId of [null, korien]) {
        await expect(
          tx.as(manager).sql("insert into public.shift_templates (clinic_id, name, start_time, end_time) values ($1, 'x', '09:00', '18:00')", [clinicId]),
        ).rejects.toThrow(/row-level security/);
      }
      const names = await tx.as(manager).sql<{ name: string }>("select name from public.shift_templates order by display_order, name");
      expect(names.map((n) => n.name)).toContain("茨木通し");
      expect(names.map((n) => n.name)).toContain("通し");
    });
  });
});

describe("画面用の参照", () => {
  it("期間の診療枠と、変更者名つきの履歴を取得できる（担当外は拒否）", async () => {
    await withTx(async (tx) => {
      const { ibaraki, korien, hq, manager, staff } = await setup(tx);
      await tx.as(hq).sql("select public.set_clinic_business_hours($1, '2026-10-01', $2)", [
        ibaraki,
        JSON.stringify([{ day_of_week: 1, open: "09:00", close: "12:00" }]),
      ]);
      const hours = await tx
        .as(manager)
        .sql<{ target_date: string }>("select target_date::text from public.clinic_hours_between($1, '2026-11-01', '2026-11-30')", [ibaraki]);
      expect(hours.map((h) => h.target_date)).toEqual(["2026-11-02", "2026-11-09", "2026-11-16", "2026-11-30"]); // 11/23 は祝日（祝日枠なし）

      await save(tx, manager, [work(staff, ibaraki, "2026-11-02")]);
      const history = await tx
        .as(manager)
        .sql<{ action: string; changed_by_name: string }>("select action, changed_by_name from public.shift_history($1, '2026-11-01', '2026-11-30')", [ibaraki]);
      expect(history).toEqual([{ action: "create", changed_by_name: "mgr-ibaraki@example.com" }]);
      await expect(tx.as(manager).sql("select * from public.shift_history($1, '2026-11-01', '2026-11-30')", [korien])).rejects.toThrow(/担当外/);
    });
  });
});
