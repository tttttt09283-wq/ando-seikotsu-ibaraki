import { afterAll, describe, expect, it } from "vitest";
import { closePool, withTx } from "./helpers";

afterAll(closePool);

describe("店舗マスタ", () => {
  it("初期7院が登録されている", async () => {
    await withTx(async (tx) => {
      const rows = await tx.sql<{ name: string }>("select name from public.clinics order by display_order");
      expect(rows.map((r) => r.name)).toEqual(["枚方本院", "田口山院", "津田院", "交野院", "茨木院", "大和田院", "香里園院"]);
    });
  });

  it("店舗名を変更しても clinic_id は変わらず、名称履歴が残る", async () => {
    await withTx(async (tx) => {
      const ibaraki = await tx.clinicId("IBARAKI");
      const hq = await tx.createUser("hq@example.com", [{ role: "hq_admin" }]);
      const staff = await tx.createStaff("1001", ibaraki);
      await tx.as(hq).sql("update public.clinics set name = 'あんど茨木駅前院' where clinic_id = $1", [ibaraki]);

      const [assignment] = await tx.sql<{ name: string }>(
        `select c.name from public.staff_clinic_assignments a join public.clinics c using (clinic_id) where a.staff_id = $1`,
        [staff],
      );
      expect(assignment.name).toBe("あんど茨木駅前院");

      const history = await tx.sql<{ name: string; closed: boolean }>(
        "select name, valid_to is not null as closed from public.clinic_name_history where clinic_id = $1 order by valid_from, valid_to nulls last",
        [ibaraki],
      );
      expect(history).toEqual([
        { name: "茨木院", closed: true },
        { name: "あんど茨木駅前院", closed: false },
      ]);
    });
  });

  it("店舗は削除できず、休止・閉鎖は理由付きで状態変更する", async () => {
    await withTx(async (tx) => {
      const tsuda = await tx.clinicId("TSUDA");
      const hq = await tx.createUser("hq@example.com", [{ role: "hq_admin" }]);
      await expect(tx.as(hq).sql("delete from public.clinics where clinic_id = $1", [tsuda])).rejects.toThrow(
        /permission denied/,
      );
      await expect(tx.sql("delete from public.clinics where clinic_id = $1", [tsuda])).rejects.toThrow(/削除できません/);

      await expect(
        tx.as(hq).sql("select public.set_clinic_status($1, 'closed', '2026-12-31', '')", [tsuda]),
      ).rejects.toThrow(/理由/);
      await tx.as(hq).sql("select public.set_clinic_status($1, 'closed', '2026-12-31', '移転統合のため')", [tsuda]);
      const [clinic] = await tx.sql<{ status: string; closed_on: string }>(
        "select status, closed_on::text from public.clinics where clinic_id = $1",
        [tsuda],
      );
      expect(clinic).toEqual({ status: "closed", closed_on: "2026-12-31" });

      const [log] = await tx.sql<{ reason: string }>(
        "select reason from public.audit_logs where table_name = 'clinics' and record_id = $1 and action = 'update'",
        [tsuda],
      );
      expect(log.reason).toBe("移転統合のため");
    });
  });

  it("院長は店舗を追加・変更できない", async () => {
    await withTx(async (tx) => {
      const ibaraki = await tx.clinicId("IBARAKI");
      const manager = await tx.createUser("mgr@example.com", [{ role: "clinic_manager", clinicId: ibaraki }]);
      await expect(
        tx.as(manager).sql("insert into public.clinics (clinic_code, name) values ('NEW', '新院')"),
      ).rejects.toThrow(/row-level security/);
      await expect(
        tx.as(manager).sql("select public.set_clinic_status($1, 'suspended', '2026-11-01', 'test')", [ibaraki]),
      ).rejects.toThrow(/本部のみ/);
    });
  });
});

describe("ロール付与", () => {
  it("本部事務は院長・スタッフのみ付与でき、本部・管理者ロールは付与できない", async () => {
    await withTx(async (tx) => {
      const ibaraki = await tx.clinicId("IBARAKI");
      const hq = await tx.createUser("hq@example.com", [{ role: "hq_admin" }]);
      const target = await tx.createUser("new@example.com");
      const me = tx.as(hq);
      await me.sql("insert into public.user_roles (user_id, role, clinic_id) values ($1, 'clinic_manager', $2)", [target, ibaraki]);
      await expect(
        me.sql("insert into public.user_roles (user_id, role) values ($1, 'hq_admin')", [target]),
      ).rejects.toThrow(/row-level security/);
      await expect(
        me.sql("insert into public.user_roles (user_id, role) values ($1, 'super_admin')", [target]),
      ).rejects.toThrow(/row-level security/);
    });
  });

  it("システム管理者は本部ロールを付与できる", async () => {
    await withTx(async (tx) => {
      const admin = await tx.createUser("admin@example.com", [{ role: "super_admin" }]);
      const target = await tx.createUser("new@example.com");
      await tx.as(admin).sql("insert into public.user_roles (user_id, role) values ($1, 'hq_admin')", [target]);
      const roles = await tx.as(target).sql<{ role: string }>("select role from public.my_roles()");
      expect(roles).toEqual([{ role: "hq_admin" }]);
    });
  });

  it("院長ロールには院の指定が必須で、同じ院・期間の重複付与はできない", async () => {
    await withTx(async (tx) => {
      const ibaraki = await tx.clinicId("IBARAKI");
      const user = await tx.createUser("mgr@example.com", [{ role: "clinic_manager", clinicId: ibaraki }]);
      await expect(
        tx.sql("insert into public.user_roles (user_id, role) values ($1, 'clinic_manager')", [user]),
      ).rejects.toThrow(/user_roles_clinic_scope/);
      await expect(
        tx.sql("insert into public.user_roles (user_id, role, clinic_id) values ($1, 'clinic_manager', $2)", [user, ibaraki]),
      ).rejects.toThrow(/user_roles_no_overlap/);
    });
  });

  it("院長・スタッフは他人のロールを参照できない", async () => {
    await withTx(async (tx) => {
      const ibaraki = await tx.clinicId("IBARAKI");
      const manager = await tx.createUser("mgr@example.com", [{ role: "clinic_manager", clinicId: ibaraki }]);
      await tx.createUser("other@example.com", [{ role: "staff" }]);
      const rows = await tx.as(manager).sql<{ user_id: string }>("select user_id from public.user_roles");
      expect(rows.map((r) => r.user_id)).toEqual([manager]);
    });
  });
});

describe("監査ログ", () => {
  it("監査ログは変更・削除できず、院長は閲覧できない", async () => {
    await withTx(async (tx) => {
      const ibaraki = await tx.clinicId("IBARAKI");
      const manager = await tx.createUser("mgr@example.com", [{ role: "clinic_manager", clinicId: ibaraki }]);
      await tx.createStaff("1001", ibaraki);
      await expect(tx.sql("update public.audit_logs set reason = 'x'")).rejects.toThrow(/追記専用/);
      await expect(tx.sql("delete from public.audit_logs")).rejects.toThrow(/追記専用/);
      expect(await tx.as(manager).sql("select * from public.audit_logs")).toHaveLength(0);
    });
  });
});

describe("アカウントの保護", () => {
  it("本部事務はシステム管理者・他の本部事務のアカウントを停止できない", async () => {
    await withTx(async (tx) => {
      const hq = await tx.createUser("hq@example.com", [{ role: "hq_admin" }]);
      const admin = await tx.createUser("admin@example.com", [{ role: "super_admin" }]);
      const otherHq = await tx.createUser("hq2@example.com", [{ role: "hq_admin" }]);
      const ibaraki = await tx.clinicId("IBARAKI");
      const manager = await tx.createUser("mgr@example.com", [{ role: "clinic_manager", clinicId: ibaraki }]);

      const me = tx.as(hq);
      expect(await me.sql("update public.app_accounts set disabled = true where user_id = $1 returning user_id", [admin])).toHaveLength(0);
      expect(await me.sql("update public.app_accounts set disabled = true where user_id = $1 returning user_id", [otherHq])).toHaveLength(0);
      expect(await me.sql("update public.app_accounts set disabled = true where user_id = $1 returning user_id", [manager])).toHaveLength(1);
      // 停止された院長はロールが無効になる
      expect(await tx.as(manager).sql("select * from public.my_roles()")).toHaveLength(0);
    });
  });
});

describe("スタッフ情報の更新RPC", () => {
  it("本部は基本情報と個人情報を同時に更新でき、院長は更新できない", async () => {
    await withTx(async (tx) => {
      const ibaraki = await tx.clinicId("IBARAKI");
      const hq = await tx.createUser("hq@example.com", [{ role: "hq_admin" }]);
      const manager = await tx.createUser("mgr@example.com", [{ role: "clinic_manager", clinicId: ibaraki }]);
      const staff = await tx.createStaff("1001", ibaraki);
      const profile = { family_name: "安藤", given_name: "次郎", hire_date: "2024-04-01", status: "on_leave" };

      await expect(
        tx.as(manager).sql("select public.update_staff($1, $2, $3)", [staff, profile, { phone: "000" }]),
      ).rejects.toThrow(/本部のみ/);

      await tx.as(hq).sql("select public.update_staff($1, $2, $3)", [staff, profile, { phone: "06-1111-2222" }]);
      const [row] = await tx.sql<{ given_name: string; status: string; phone: string }>(
        "select p.given_name, p.status, d.phone from public.staff_profiles p join public.staff_private_details d using (staff_id) where staff_id = $1",
        [staff],
      );
      expect(row).toEqual({ given_name: "次郎", status: "on_leave", phone: "06-1111-2222" });
    });
  });
});
