import { afterAll, describe, expect, it } from "vitest";
import { closePool, withTx } from "./helpers";

afterAll(closePool);

const monthly = { valid_from: "2026-04-01", pay_type: "monthly", basic_wage: 250000, monthly_hours: 151, overtime_threshold_hours: 191, fixed_overtime_allowance: 30000, commute_type: "monthly", commute_amount: 10000 };

describe("賃金管理（本部のみ）", () => {
  it("賃金は本部だけが登録・参照でき、院長・スタッフ本人は見られない", async () => {
    await withTx(async (tx) => {
      const ibaraki = await tx.clinicId("IBARAKI");
      const hq = await tx.createUser("hq@example.com", [{ role: "hq_admin" }]);
      const manager = await tx.createUser("mgr@example.com", [{ role: "clinic_manager", clinicId: ibaraki }]);
      const staffUser = await tx.createUser("staff@example.com", [{ role: "staff" }]);
      const staff = await tx.createStaff("1001", ibaraki, { authUserId: staffUser });

      await tx.as(hq).sql("select public.save_wage_setting($1, $2)", [staff, JSON.stringify(monthly)]);
      await tx.as(hq).sql("select public.save_payroll_input($1, '2026-09-01', $2)", [staff, JSON.stringify({ side_job_pay: 5000, year_end_adjustment: -1200 })]);
      expect(await tx.as(hq).sql("select basic_wage, monthly_hours::text from public.staff_wage_settings")).toEqual([{ basic_wage: 250000, monthly_hours: "151.0" }]);

      for (const user of [manager, staffUser]) {
        expect(await tx.as(user).sql("select * from public.staff_wage_settings")).toEqual([]);
        expect(await tx.as(user).sql("select * from public.payroll_inputs")).toEqual([]);
        await expect(tx.as(user).sql("select public.save_wage_setting($1, $2)", [staff, JSON.stringify(monthly)])).rejects.toThrow(/本部のみ/);
        await expect(tx.as(user).sql("select public.save_payroll_input($1, '2026-09-01', '{}')", [staff])).rejects.toThrow(/本部のみ/);
      }
      // 監査ログは本部だけが見られる
      expect(await tx.as(manager).sql("select * from public.audit_logs where table_name = 'staff_wage_settings'")).toEqual([]);
      expect(await tx.as(hq).sql("select action from public.audit_logs where table_name = 'staff_wage_settings'")).toEqual([{ action: "insert" }]);
    });
  });

  it("同じ適用開始月は上書き、別の月は履歴として残る。月給は基礎賃金と月の所定時間が必須", async () => {
    await withTx(async (tx) => {
      const hq = await tx.createUser("hq@example.com", [{ role: "hq_admin" }]);
      const staff = await tx.createStaff("1001", await tx.clinicId("IBARAKI"));
      await tx.as(hq).sql("select public.save_wage_setting($1, $2)", [staff, JSON.stringify(monthly)]);
      await tx.as(hq).sql("select public.save_wage_setting($1, $2)", [staff, JSON.stringify({ ...monthly, basic_wage: 255000 })]);
      await tx.as(hq).sql("select public.save_wage_setting($1, $2)", [staff, JSON.stringify({ ...monthly, valid_from: "2026-10-15", basic_wage: 260000 })]);
      expect(await tx.sql("select valid_from::text, basic_wage from public.staff_wage_settings order by valid_from")).toEqual([
        { valid_from: "2026-04-01", basic_wage: 255000 },
        { valid_from: "2026-10-01", basic_wage: 260000 },
      ]);
      await expect(
        tx.as(hq).sql("select public.save_wage_setting($1, $2)", [staff, JSON.stringify({ valid_from: "2026-11-01", pay_type: "monthly", basic_wage: 1 })]),
      ).rejects.toThrow(/staff_wage_settings_shape/);
    });
  });
});
