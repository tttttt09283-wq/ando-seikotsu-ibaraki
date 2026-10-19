import { afterAll, describe, expect, it } from "vitest";
import { closePool, withTx, type TestTx } from "./helpers";

afterAll(closePool);

// 午前・午後の2枠（整骨院に多い中休みあり）。水曜・日曜は定休日、土曜は午前のみ、祝日は午前のみ
const STANDARD_WEEK = [
  ...[1, 2, 4, 5].flatMap((d) => [
    { day_of_week: d, open: "09:00", close: "12:30" },
    { day_of_week: d, open: "15:00", close: "20:00" },
  ]),
  { day_of_week: 6, open: "09:00", close: "14:00" },
  { day_of_week: 7, open: "09:00", close: "12:00" },
];

async function setup(tx: TestTx) {
  const ibaraki = await tx.clinicId("IBARAKI");
  const korien = await tx.clinicId("KORIEN");
  const hq = await tx.createUser("hq@example.com", [{ role: "hq_admin" }]);
  const manager = await tx.createUser("mgr@example.com", [{ role: "clinic_manager", clinicId: ibaraki }]);
  await tx.as(hq).sql("select public.set_clinic_business_hours($1, '2026-10-01', $2)", [ibaraki, JSON.stringify(STANDARD_WEEK)]);
  return { ibaraki, korien, hq, manager };
}

const hoursOn = (tx: TestTx, userId: string, clinicId: string, date: string) =>
  tx
    .as(userId)
    .sql<{ open_time: string; close_time: string; source: string }>(
      "select open_time::text, close_time::text, source from public.clinic_hours_on($1, $2::date)",
      [clinicId, date],
    );

describe("院ごとの診療時間", () => {
  it("曜日ごとの診療枠を返し、枠の無い曜日は定休日（0件）になる", async () => {
    await withTx(async (tx) => {
      const { ibaraki, manager } = await setup(tx);
      // 2026-10-19 は月曜
      expect(await hoursOn(tx, manager, ibaraki, "2026-10-19")).toEqual([
        { open_time: "09:00:00", close_time: "12:30:00", source: "weekday" },
        { open_time: "15:00:00", close_time: "20:00:00", source: "weekday" },
      ]);
      expect(await hoursOn(tx, manager, ibaraki, "2026-10-21")).toEqual([]); // 水曜＝定休日
    });
  });

  it("祝日は曜日より祝日の診療時間を優先する", async () => {
    await withTx(async (tx) => {
      const { ibaraki, manager } = await setup(tx);
      // 2026-11-23（月）勤労感謝の日
      expect(await hoursOn(tx, manager, ibaraki, "2026-11-23")).toEqual([
        { open_time: "09:00:00", close_time: "12:00:00", source: "holiday" },
      ]);
    });
  });

  it("院長は担当院の臨時休診・特別診療を登録でき、通常の診療時間より優先される", async () => {
    await withTx(async (tx) => {
      const { ibaraki, manager } = await setup(tx);
      await tx
        .as(manager)
        .sql(
          "insert into public.clinic_calendar_exceptions (clinic_id, target_date, is_closed, reason) values ($1, '2026-10-19', true, '設備点検')",
          [ibaraki],
        );
      await tx
        .as(manager)
        .sql(
          `insert into public.clinic_calendar_exceptions (clinic_id, target_date, is_closed, slots, reason)
           values ($1, '2026-10-21', false, '[{"open":"10:00","close":"16:00"}]', '振替診療')`,
          [ibaraki],
        );
      expect(await hoursOn(tx, manager, ibaraki, "2026-10-19")).toEqual([]);
      expect(await hoursOn(tx, manager, ibaraki, "2026-10-21")).toEqual([
        { open_time: "10:00:00", close_time: "16:00:00", source: "exception" },
      ]);
    });
  });

  it("院長は担当外の院の休診日を登録できず、通常の診療時間も変更できない", async () => {
    await withTx(async (tx) => {
      const { korien, ibaraki, manager } = await setup(tx);
      await expect(
        tx
          .as(manager)
          .sql(
            "insert into public.clinic_calendar_exceptions (clinic_id, target_date, is_closed, reason) values ($1, '2026-10-19', true, 'x')",
            [korien],
          ),
      ).rejects.toThrow(/row-level security/);
      await expect(
        tx.as(manager).sql("select public.set_clinic_business_hours($1, '2026-11-01', '[]')", [ibaraki]),
      ).rejects.toThrow(/本部のみ/);
    });
  });

  it("休診日には診療枠を持てず、営業日には枠が必要", async () => {
    await withTx(async (tx) => {
      const { ibaraki } = await setup(tx);
      await expect(
        tx.sql(
          `insert into public.clinic_calendar_exceptions (clinic_id, target_date, is_closed, slots, reason)
           values ($1, '2026-10-19', true, '[{"open":"09:00","close":"12:00"}]', 'x')`,
          [ibaraki],
        ),
      ).rejects.toThrow(/calendar_exception_slots/);
      await expect(
        tx.sql(
          "insert into public.clinic_calendar_exceptions (clinic_id, target_date, is_closed, reason) values ($1, '2026-10-21', false, 'x')",
          [ibaraki],
        ),
      ).rejects.toThrow(/calendar_exception_slots/);
    });
  });

  it("診療時間を変更しても、変更前の日付は旧時間のまま参照できる", async () => {
    await withTx(async (tx) => {
      const { ibaraki, hq, manager } = await setup(tx);
      const newWeek = [1, 2, 3, 4, 5, 6].map((d) => ({ day_of_week: d, open: "10:00", close: "19:00" }));
      await tx.as(hq).sql("select public.set_clinic_business_hours($1, '2026-11-01', $2)", [ibaraki, JSON.stringify(newWeek)]);

      expect(await hoursOn(tx, manager, ibaraki, "2026-10-26")).toHaveLength(2); // 変更前の月曜：2枠
      expect(await hoursOn(tx, manager, ibaraki, "2026-11-02")).toEqual([
        { open_time: "10:00:00", close_time: "19:00:00", source: "weekday" },
      ]);
      expect(await hoursOn(tx, manager, ibaraki, "2026-11-04")).toHaveLength(1); // 水曜も診療に変更
      expect(await hoursOn(tx, manager, ibaraki, "2026-11-23")).toEqual([]); // 新パターンに祝日枠なし＝休診

      await expect(
        tx.as(hq).sql("select public.set_clinic_business_hours($1, '2026-10-15', '[]')", [ibaraki]),
      ).rejects.toThrow(/より後の日付で登録済み/);
    });
  });

  it("他院の診療時間は独立している", async () => {
    await withTx(async (tx) => {
      const { korien, manager } = await setup(tx);
      expect(await hoursOn(tx, manager, korien, "2026-10-19")).toEqual([]);
    });
  });
});

describe("勤務条件の既定値", () => {
  it("所定労働時間は1日8時間、みなし残業は既定で0", async () => {
    await withTx(async (tx) => {
      const ibaraki = await tx.clinicId("IBARAKI");
      const staff = await tx.createStaff("1001", ibaraki);
      const [contract] = await tx.sql<{ daily_scheduled_minutes: number; fixed_overtime_minutes: number }>(
        `insert into public.employment_contracts (staff_id, valid_from, employment_type, weekly_scheduled_days, weekly_scheduled_minutes)
         values ($1, '2026-10-01', 'full_time', 5, 2400) returning daily_scheduled_minutes, fixed_overtime_minutes`,
        [staff],
      );
      expect(contract).toEqual({ daily_scheduled_minutes: 480, fixed_overtime_minutes: 0 });
    });
  });
});
