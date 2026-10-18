import { afterAll, describe, expect, it } from "vitest";
import { closePool, withTx, type TestTx } from "./helpers";

afterAll(closePool);

/** 茨木院・香里園院の2院、それぞれの院長とスタッフを用意する */
async function twoClinics(tx: TestTx) {
  const ibaraki = await tx.clinicId("IBARAKI");
  const korien = await tx.clinicId("KORIEN");
  const ibarakiManager = await tx.createUser("mgr-ibaraki@example.com", [{ role: "clinic_manager", clinicId: ibaraki }]);
  const korienManager = await tx.createUser("mgr-korien@example.com", [{ role: "clinic_manager", clinicId: korien }]);
  const ibarakiStaff = await tx.createStaff("1001", ibaraki);
  const korienStaff = await tx.createStaff("2001", korien);
  return { ibaraki, korien, ibarakiManager, korienManager, ibarakiStaff, korienStaff };
}

describe("必須テスト17：院長は他院スタッフの個人情報を取得できない", () => {
  it("担当外の院に主所属するスタッフの個人情報は0件になる", async () => {
    await withTx(async (tx) => {
      const { ibarakiManager, korienStaff } = await twoClinics(tx);
      const rows = await tx.as(ibarakiManager).sql("select * from public.staff_private_details where staff_id = $1", [
        korienStaff,
      ]);
      expect(rows).toHaveLength(0);
    });
  });

  it("全件取得しても自院主所属スタッフの個人情報しか返らない", async () => {
    await withTx(async (tx) => {
      const { ibarakiManager, ibarakiStaff } = await twoClinics(tx);
      const rows = await tx.as(ibarakiManager).sql<{ staff_id: string }>("select staff_id from public.staff_private_details");
      expect(rows.map((r) => r.staff_id)).toEqual([ibarakiStaff]);
    });
  });

  it("他院スタッフの基本情報・所属・雇用契約も取得できない", async () => {
    await withTx(async (tx) => {
      const { ibarakiManager, korienStaff } = await twoClinics(tx);
      await tx.sql(
        `insert into public.employment_contracts (staff_id, valid_from, employment_type, weekly_scheduled_days, weekly_scheduled_minutes, daily_scheduled_minutes)
         values ($1, '2024-04-01', 'full_time', 5, 2400, 480)`,
        [korienStaff],
      );
      const me = tx.as(ibarakiManager);
      expect(await me.sql("select * from public.staff_profiles where staff_id = $1", [korienStaff])).toHaveLength(0);
      expect(await me.sql("select * from public.staff_clinic_assignments where staff_id = $1", [korienStaff])).toHaveLength(0);
      expect(await me.sql("select * from public.employment_contracts where staff_id = $1", [korienStaff])).toHaveLength(0);
    });
  });

  it("応援登録された他院スタッフは基本情報のみ見え、個人情報・雇用契約は見えない", async () => {
    await withTx(async (tx) => {
      const { ibaraki, ibarakiManager, korienStaff } = await twoClinics(tx);
      await tx.addSupport(korienStaff, ibaraki);
      await tx.sql(
        `insert into public.employment_contracts (staff_id, valid_from, employment_type, weekly_scheduled_days, weekly_scheduled_minutes, daily_scheduled_minutes)
         values ($1, '2024-04-01', 'part_time', 3, 1200, 400)`,
        [korienStaff],
      );
      const me = tx.as(ibarakiManager);
      expect(await me.sql("select staff_code from public.staff_profiles where staff_id = $1", [korienStaff])).toEqual([
        { staff_code: "2001" },
      ]);
      expect(await me.sql("select * from public.staff_private_details where staff_id = $1", [korienStaff])).toHaveLength(0);
      expect(await me.sql("select * from public.employment_contracts where staff_id = $1", [korienStaff])).toHaveLength(0);
    });
  });

  it("院長は担当院に主所属するスタッフの個人情報を取得できる", async () => {
    await withTx(async (tx) => {
      const { ibarakiManager, ibarakiStaff } = await twoClinics(tx);
      const rows = await tx.as(ibarakiManager).sql("select phone from public.staff_private_details where staff_id = $1", [
        ibarakiStaff,
      ]);
      expect(rows).toEqual([{ phone: "090-0000-0000" }]);
    });
  });

  it("院長兼務の場合は両院のスタッフの個人情報を取得できる", async () => {
    await withTx(async (tx) => {
      const { ibaraki, korien, ibarakiStaff, korienStaff } = await twoClinics(tx);
      const dual = await tx.createUser("mgr-dual@example.com", [
        { role: "clinic_manager", clinicId: ibaraki },
        { role: "clinic_manager", clinicId: korien },
      ]);
      const rows = await tx.as(dual).sql<{ staff_id: string }>("select staff_id from public.staff_private_details");
      expect(rows.map((r) => r.staff_id).sort()).toEqual([ibarakiStaff, korienStaff].sort());
    });
  });

  it("異動後は旧所属院の院長が個人情報を取得できなくなり、新所属院の院長が取得できる", async () => {
    await withTx(async (tx) => {
      const { korien, ibarakiManager, korienManager, ibarakiStaff } = await twoClinics(tx);
      const hq = await tx.createUser("hq@example.com", [{ role: "hq_admin" }]);
      const [{ today }] = await tx.sql<{ today: string }>("select app.today_jst()::text as today");
      await tx.as(hq).sql("select public.transfer_staff($1, $2, $3::date, '人員配置の変更')", [ibarakiStaff, korien, today]);

      const query = "select * from public.staff_private_details where staff_id = $1";
      expect(await tx.as(ibarakiManager).sql(query, [ibarakiStaff])).toHaveLength(0);
      expect(await tx.as(korienManager).sql(query, [ibarakiStaff])).toHaveLength(1);
      // 旧所属院の院長も、前月分の確認のため基本情報は一定期間参照できる
      expect(await tx.as(ibarakiManager).sql("select * from public.staff_profiles where staff_id = $1", [ibarakiStaff])).toHaveLength(1);
    });
  });

  it("期限切れ・無効化された院長ロールでは取得できない", async () => {
    await withTx(async (tx) => {
      const { ibaraki, ibarakiStaff } = await twoClinics(tx);
      const expired = await tx.createUser("mgr-expired@example.com", [
        { role: "clinic_manager", clinicId: ibaraki, validFrom: "2024-01-01", validTo: "2024-12-31" },
      ]);
      const disabled = await tx.createUser(
        "mgr-disabled@example.com",
        [{ role: "clinic_manager", clinicId: ibaraki }],
        { disabled: true },
      );
      const query = "select * from public.staff_private_details where staff_id = $1";
      expect(await tx.as(expired).sql(query, [ibarakiStaff])).toHaveLength(0);
      expect(await tx.as(disabled).sql(query, [ibarakiStaff])).toHaveLength(0);
    });
  });
});

describe("スタッフ本人・本部・未ログインのアクセス", () => {
  it("一般スタッフは自分の情報だけ取得できる", async () => {
    await withTx(async (tx) => {
      const { ibaraki, ibarakiStaff } = await twoClinics(tx);
      const staffUser = await tx.createUser("staff@example.com", [{ role: "staff" }]);
      const self = await tx.createStaff("1002", ibaraki, { authUserId: staffUser });
      const me = tx.as(staffUser);
      const profiles = await me.sql<{ staff_id: string }>("select staff_id from public.staff_profiles");
      expect(profiles.map((r) => r.staff_id)).toEqual([self]);
      expect(await me.sql("select * from public.staff_private_details where staff_id = $1", [ibarakiStaff])).toHaveLength(0);
    });
  });

  it("本部は全院のスタッフの個人情報を取得できる", async () => {
    await withTx(async (tx) => {
      const { ibarakiStaff, korienStaff } = await twoClinics(tx);
      const hq = await tx.createUser("hq@example.com", [{ role: "hq_admin" }]);
      const rows = await tx.as(hq).sql<{ staff_id: string }>("select staff_id from public.staff_private_details");
      expect(rows.map((r) => r.staff_id).sort()).toEqual([ibarakiStaff, korienStaff].sort());
    });
  });

  it("未ログイン（anon）はどのテーブルも参照できない", async () => {
    await withTx(async (tx) => {
      await twoClinics(tx);
      for (const table of ["clinics", "staff_profiles", "staff_private_details", "user_roles", "audit_logs"]) {
        await expect(tx.as(null).sql(`select * from public.${table}`)).rejects.toThrow(/permission denied/);
      }
    });
  });
});

describe("マスタの書き込み権限", () => {
  it("院長はスタッフ登録・個人情報の更新ができない", async () => {
    await withTx(async (tx) => {
      const { ibaraki, ibarakiManager, ibarakiStaff } = await twoClinics(tx);
      const me = tx.as(ibarakiManager);
      await expect(
        me.sql("select public.create_staff('3001', '山田', '太郎', null, null, '2026-10-01', $1)", [ibaraki]),
      ).rejects.toThrow(/本部のみ/);
      await expect(
        me.sql("insert into public.staff_profiles (staff_code, family_name, given_name, hire_date) values ('3002', 'a', 'b', '2026-10-01')"),
      ).rejects.toThrow(/row-level security/);
      // UPDATE は RLS で対象0件になり、値は変わらない
      await me.sql("update public.staff_private_details set phone = '000' where staff_id = $1", [ibarakiStaff]);
      const [row] = await tx.sql<{ phone: string }>("select phone from public.staff_private_details where staff_id = $1", [
        ibarakiStaff,
      ]);
      expect(row.phone).toBe("090-0000-0000");
    });
  });

  it("本部はスタッフを登録でき、監査ログが残る", async () => {
    await withTx(async (tx) => {
      const ibaraki = await tx.clinicId("IBARAKI");
      const hq = await tx.createUser("hq@example.com", [{ role: "hq_admin" }]);
      const [{ staff_id }] = await tx
        .as(hq)
        .sql<{ staff_id: string }>(
          "select public.create_staff('3001', '山田', '太郎', 'ヤマダ', 'タロウ', '2026-10-01', $1, '{\"phone\":\"06-0000-0000\"}') as staff_id",
          [ibaraki],
        );
      const [primary] = await tx.sql<{ clinic_id: string }>("select app.staff_primary_clinic_id($1, '2026-10-01') as clinic_id", [
        staff_id,
      ]);
      expect(primary.clinic_id).toBe(ibaraki);
      const logs = await tx
        .as(hq)
        .sql<{ table_name: string; actor_user_id: string }>(
          "select table_name, actor_user_id from public.audit_logs where record_id = $1 order by id",
          [staff_id],
        );
      expect(logs.map((l) => l.table_name)).toEqual(["staff_profiles", "staff_private_details"]);
      expect(logs.every((l) => l.actor_user_id === hq)).toBe(true);
    });
  });

  it("スタッフは物理削除できない", async () => {
    await withTx(async (tx) => {
      const { ibarakiStaff } = await twoClinics(tx);
      await expect(tx.sql("delete from public.staff_profiles where staff_id = $1", [ibarakiStaff])).rejects.toThrow(
        /削除できません/,
      );
    });
  });

  it("主所属は同じ期間に2院持てない", async () => {
    await withTx(async (tx) => {
      const { korien, ibarakiStaff } = await twoClinics(tx);
      await expect(
        tx.sql(
          "insert into public.staff_clinic_assignments (staff_id, clinic_id, assignment_type, valid_from) values ($1, $2, 'primary', '2025-01-01')",
          [ibarakiStaff, korien],
        ),
      ).rejects.toThrow(/assignment_primary_no_overlap/);
    });
  });
});
