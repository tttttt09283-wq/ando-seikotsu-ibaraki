import { afterAll, describe, expect, it } from "vitest";
import { closePool, withTx, type TestTx } from "./helpers";

afterAll(closePool);

interface ContractRow {
  employment_type: string;
  valid_from: string;
  valid_to: string | null;
  weekly_scheduled_days: string;
  daily_scheduled_minutes: number;
  fixed_overtime_minutes: number;
}

async function setup(tx: TestTx) {
  const ibaraki = await tx.clinicId("IBARAKI");
  const hq = await tx.createUser("hq@example.com", [{ role: "hq_admin" }]);
  const manager = await tx.createUser("mgr@example.com", [{ role: "clinic_manager", clinicId: ibaraki }]);
  const staff = await tx.createStaff("1001", ibaraki);
  return { ibaraki, hq, manager, staff };
}

const setContract = (
  tx: TestTx,
  userId: string,
  staffId: string,
  validFrom: string,
  type: string,
  fixedOvertime: number | null,
  reason = "入社時の契約",
) =>
  tx
    .as(userId)
    .sql("select public.set_employment_contract($1, $2::date, $3, 5, 2400, 480, $4, 2400, $5)", [
      staffId,
      validFrom,
      type,
      fixedOvertime,
      reason,
    ]);

const contracts = (tx: TestTx, staffId: string) =>
  tx.sql<ContractRow>(
    `select employment_type, valid_from::text, valid_to::text, weekly_scheduled_days::text, daily_scheduled_minutes, fixed_overtime_minutes
       from public.employment_contracts where staff_id = $1 order by valid_from`,
    [staffId],
  );

describe("勤務条件（週5日・1日8時間・みなし残業）", () => {
  it("正社員はみなし残業の標準が月24時間、それ以外は0時間", async () => {
    await withTx(async (tx) => {
      const { hq, staff, ibaraki } = await setup(tx);
      const partTimer = await tx.createStaff("1002", ibaraki);
      await setContract(tx, hq, staff, "2026-10-01", "full_time", null);
      await setContract(tx, hq, partTimer, "2026-10-01", "part_time", null);
      expect((await contracts(tx, staff))[0]).toMatchObject({
        weekly_scheduled_days: "5.0",
        daily_scheduled_minutes: 480,
        fixed_overtime_minutes: 1440,
      });
      expect((await contracts(tx, partTimer))[0].fixed_overtime_minutes).toBe(0);
    });
  });

  it("本部はスタッフごとにみなし時間を変更でき、変更前の期間は旧条件のまま残る", async () => {
    await withTx(async (tx) => {
      const { hq, staff } = await setup(tx);
      await setContract(tx, hq, staff, "2026-04-01", "full_time", null);
      await setContract(tx, hq, staff, "2026-11-01", "full_time", 1800, "役職手当の見直し（みなし30時間）");
      expect(await contracts(tx, staff)).toEqual([
        expect.objectContaining({ valid_from: "2026-04-01", valid_to: "2026-10-31", fixed_overtime_minutes: 1440 }),
        expect.objectContaining({ valid_from: "2026-11-01", valid_to: null, fixed_overtime_minutes: 1800 }),
      ]);
      const [log] = await tx.sql<{ reason: string }>(
        "select reason from public.audit_logs where table_name = 'employment_contracts' and action = 'insert' order by id desc limit 1",
      );
      expect(log.reason).toBe("役職手当の見直し（みなし30時間）");
    });
  });

  it("同じ適用開始日で登録すると訂正になり、契約は増えない", async () => {
    await withTx(async (tx) => {
      const { hq, staff } = await setup(tx);
      await setContract(tx, hq, staff, "2026-10-01", "full_time", null);
      await setContract(tx, hq, staff, "2026-10-01", "full_time", 1200, "入力誤りの訂正");
      const rows = await contracts(tx, staff);
      expect(rows).toHaveLength(1);
      expect(rows[0].fixed_overtime_minutes).toBe(1200);
    });
  });

  it("院長は勤務条件を変更できず、理由のない変更や過去への割り込みは拒否される", async () => {
    await withTx(async (tx) => {
      const { hq, manager, staff } = await setup(tx);
      await expect(setContract(tx, manager, staff, "2026-10-01", "full_time", 0)).rejects.toThrow(/本部のみ/);
      await expect(setContract(tx, hq, staff, "2026-10-01", "full_time", null, " ")).rejects.toThrow(/理由/);
      await setContract(tx, hq, staff, "2026-10-01", "full_time", null);
      await expect(setContract(tx, hq, staff, "2026-09-01", "full_time", null)).rejects.toThrow(/より後に開始する/);
    });
  });

  it("主所属院の院長は勤務条件を参照できる", async () => {
    await withTx(async (tx) => {
      const { hq, manager, staff } = await setup(tx);
      await setContract(tx, hq, staff, "2026-10-01", "full_time", null);
      const rows = await tx.as(manager).sql("select fixed_overtime_minutes from public.employment_contracts where staff_id = $1", [staff]);
      expect(rows).toEqual([{ fixed_overtime_minutes: 1440 }]);
    });
  });
});
