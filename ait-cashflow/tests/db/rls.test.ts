import { beforeAll, describe, expect, it } from "vitest";
import { addUser, as, createDb, type Db } from "./harness";

// 他企業のデータへのアクセス拒否・権限ごとの書き込み可否・データの整合性を、実際の Postgres（PGlite）で確かめる

const A = "00000000-0000-4000-8000-00000000000a"; // 企業Aのオーナー
const B = "00000000-0000-4000-8000-00000000000b"; // 企業Bのオーナー
const C = "00000000-0000-4000-8000-00000000000c"; // 企業Aの経理担当
const D = "00000000-0000-4000-8000-00000000000d"; // 企業Aの閲覧専用

let db: Db;
let orgA: string;
let orgB: string;
let accA1: string;
let accA2: string;
let accB: string;

const one = async <T,>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows[0];
const count = async (sql: string, params: unknown[] = []) => (await db.query<{ n: number }>(`select count(*)::int as n from (${sql}) x`, params)).rows[0].n;

beforeAll(async () => {
  db = await createDb();
  await addUser(db, A, "a@example.com");
  await addUser(db, B, "b@example.com");
  await addUser(db, C, "c@example.com");
  await addUser(db, D, "d@example.com");
  orgA = await as(db, A, async () => (await one<{ id: string }>("select public.create_organization('企業A') as id")).id);
  orgB = await as(db, B, async () => (await one<{ id: string }>("select public.create_organization('企業B') as id")).id);
  await as(db, A, async () => {
    await db.query("select public.add_member_by_email($1, 'C@example.com', 'accountant')", [orgA]);
    await db.query("select public.add_member_by_email($1, 'd@example.com', 'viewer')", [orgA]);
    accA1 = (await one<{ id: string }>("insert into bank_accounts (organization_id, name) values ($1, 'A普通') returning id", [orgA])).id;
    accA2 = (await one<{ id: string }>("insert into bank_accounts (organization_id, name) values ($1, 'A定期') returning id", [orgA])).id;
    await db.query(
      "insert into cash_transactions (organization_id, bank_account_id, direction, category, amount_jpy, planned_date) values ($1, $2, 'out', 'rent', 200000, '2026-10-31')",
      [orgA, accA1],
    );
  });
  accB = await as(db, B, async () => (await one<{ id: string }>("insert into bank_accounts (organization_id, name) values ($1, 'B普通') returning id", [orgB])).id);
});

describe("他企業のデータ", () => {
  it("他企業の企業情報・口座・取引・監査ログは見えない", async () => {
    await as(db, B, async () => {
      expect(await count("select * from organizations")).toBe(1);
      expect(await count("select * from bank_accounts where organization_id = $1", [orgA])).toBe(0);
      expect(await count("select * from cash_transactions")).toBe(0);
      expect(await count("select * from audit_logs where organization_id = $1", [orgA])).toBe(0);
      expect(await count("select * from organization_members where organization_id = $1", [orgA])).toBe(0);
    });
  });

  it("他企業に登録・変更・削除できない", async () => {
    await as(db, B, async () => {
      await expect(db.query("insert into branches (organization_id, name) values ($1, '侵入')", [orgA])).rejects.toThrow(/row-level security/);
      const upd = await db.query("update bank_accounts set name = '改ざん' where id = $1", [accA1]);
      expect(upd.affectedRows).toBe(0);
      const del = await db.query("delete from cash_transactions where organization_id = $1", [orgA]);
      expect(del.affectedRows).toBe(0);
      await expect(db.query("select public.add_member_by_email($1, 'b@example.com', 'owner')", [orgA])).rejects.toThrow(/オーナーだけ/);
    });
    await as(db, A, async () => expect((await one<{ name: string }>("select name from bank_accounts where id = $1", [accA1])).name).toBe("A普通"));
  });

  it("自社の取引に他企業の口座を指定できない（複合外部キー）", async () => {
    await as(db, B, async () => {
      await expect(
        db.query(
          "insert into cash_transactions (organization_id, bank_account_id, direction, category, amount_jpy, planned_date) values ($1, $2, 'in', 'sales', 1000, '2026-11-01')",
          [orgB, accA1],
        ),
      ).rejects.toThrow(/foreign key/);
    });
  });

  it("データを別の企業へ移せない", async () => {
    await as(db, A, async () => {
      await expect(db.query("update bank_accounts set organization_id = $1 where id = $2", [orgB, accA1])).rejects.toThrow();
    });
  });

  it("ログインしていない人は何も読めない", async () => {
    await as(db, null, async () => {
      await expect(db.query("select * from cash_transactions")).rejects.toThrow(/permission denied/);
      await expect(db.query("select public.create_organization('x')")).rejects.toThrow(/permission denied/);
    });
  });
});

describe("権限", () => {
  it("閲覧専用は読めるが、登録・変更・削除はできない", async () => {
    await as(db, D, async () => {
      expect(await count("select * from cash_transactions")).toBe(1);
      await expect(
        db.query("insert into branches (organization_id, name) values ($1, '閲覧者の店')", [orgA]),
      ).rejects.toThrow(/row-level security/);
      expect((await db.query("update cash_transactions set amount_jpy = 1")).affectedRows).toBe(0);
      expect((await db.query("delete from bank_accounts")).affectedRows).toBe(0);
      expect(await count("select * from audit_logs")).toBe(0);
    });
  });

  it("経理担当は取引を登録できるが、メンバー追加・企業設定の変更はできない", async () => {
    await as(db, C, async () => {
      await db.query(
        "insert into cash_transactions (organization_id, bank_account_id, direction, category, amount_jpy, confirmed_date, status) values ($1, $2, 'in', 'sales', 50000, '2026-10-15', 'confirmed')",
        [orgA, accA1],
      );
      await expect(db.query("select public.add_member_by_email($1, 'b@example.com', 'viewer')", [orgA])).rejects.toThrow(/オーナーだけ/);
      expect((await db.query("update organizations set min_balance_jpy = 1")).affectedRows).toBe(0);
      expect((await db.query("update organization_members set role = 'owner' where user_id = $1", [C])).affectedRows).toBe(0);
      expect(await count("select * from audit_logs where table_name = 'cash_transactions'")).toBeGreaterThanOrEqual(2);
      await expect(db.query("insert into audit_logs (organization_id, action, table_name) values ($1, 'insert', 'x')", [orgA])).rejects.toThrow(/permission denied/);
    });
  });

  it("最後のオーナーは外せない・降格できない", async () => {
    await as(db, A, async () => {
      await expect(db.query("update organization_members set role = 'viewer' where user_id = $1 and organization_id = $2", [A, orgA])).rejects.toThrow(/最後のオーナー/);
      await expect(db.query("delete from organization_members where user_id = $1 and organization_id = $2", [A, orgA])).rejects.toThrow(/最後のオーナー/);
    });
  });

  it("変更はすべて監査ログに残る（誰が・何を・変更前後）", async () => {
    await as(db, A, async () => {
      await db.query("update bank_accounts set min_balance_jpy = 300000 where id = $1", [accA1]);
      const log = await one<{ actor_id: string; before: { min_balance_jpy: number }; after: { min_balance_jpy: number } }>(
        "select actor_id, before, after from audit_logs where table_name = 'bank_accounts' and action = 'update' order by id desc limit 1",
      );
      expect(log.actor_id).toBe(A);
      expect(log.before.min_balance_jpy).toBe(0);
      expect(log.after.min_balance_jpy).toBe(300000);
    });
  });
});

describe("データの整合性", () => {
  it("振替は別口座の同額の出金と入金の組でしか登録できない", async () => {
    await as(db, A, async () => {
      const g = "11111111-1111-4111-8111-111111111111";
      await expect(
        db.query(
          "insert into cash_transactions (organization_id, bank_account_id, direction, category, amount_jpy, planned_date, transfer_group_id) values ($1, $2, 'out', 'transfer', 100000, '2026-11-01', $3)",
          [orgA, accA1, g],
        ),
      ).rejects.toThrow(/口座間振替/);
      await db.query(
        `insert into cash_transactions (organization_id, bank_account_id, direction, category, amount_jpy, planned_date, transfer_group_id) values
         ($1, $2, 'out', 'transfer', 100000, '2026-11-01', $4), ($1, $3, 'in', 'transfer', 100000, '2026-11-01', $4)`,
        [orgA, accA1, accA2, g],
      );
      expect(await count("select * from cash_transactions where transfer_group_id = $1", [g])).toBe(2);
      // 片方だけ確定にはできない
      await expect(db.query("update cash_transactions set status = 'confirmed', confirmed_date = '2026-11-01' where transfer_group_id = $1 and direction = 'out'", [g])).rejects.toThrow(/口座間振替/);
      await db.query("update cash_transactions set status = 'confirmed', confirmed_date = '2026-11-01' where transfer_group_id = $1", [g]);
    });
  });

  it("状態と日付・カテゴリと向きの組み合わせを検証する", async () => {
    await as(db, A, async () => {
      const ins = (cols: string) => db.query(`insert into cash_transactions (organization_id, bank_account_id, direction, category, amount_jpy, ${cols}`, [orgA, accA1]);
      await expect(ins("status) values ($1, $2, 'in', 'sales', 1000, 'confirmed')")).rejects.toThrow(/check constraint/);
      await expect(ins("planned_date) values ($1, $2, 'in', 'rent', 1000, '2026-11-01')")).rejects.toThrow(/check constraint/);
      await expect(ins("planned_date) values ($1, $2, 'out', 'rent', 0, '2026-11-01')")).rejects.toThrow(/check constraint/);
    });
  });

  it("CSV明細の同じ重複防止キー・繰返しの同じ回は2度登録できない", async () => {
    await as(db, A, async () => {
      const ins = () =>
        db.query(
          "insert into cash_transactions (organization_id, bank_account_id, direction, category, amount_jpy, status, confirmed_date, dedupe_key) values ($1, $2, 'in', 'sales', 3000, 'confirmed', '2026-10-01', 'k1')",
          [orgA, accA1],
        );
      await ins();
      await expect(ins()).rejects.toThrow(/duplicate key/);
      const rule = (
        await one<{ id: string }>(
          "insert into recurring_rules (organization_id, bank_account_id, direction, category, amount_jpy, frequency, day_of_month, start_date) values ($1, $2, 'out', 'rent', 200000, 'monthly', 31, '2026-01-01') returning id",
          [orgA, accA1],
        )
      ).id;
      const occ = () =>
        db.query(
          "insert into cash_transactions (organization_id, bank_account_id, direction, category, amount_jpy, planned_date, recurring_rule_id, occurrence_date) values ($1, $2, 'out', 'rent', 200000, '2026-11-30', $3, '2026-11-30')",
          [orgA, accA1, rule],
        );
      await occ();
      await expect(occ()).rejects.toThrow(/duplicate key/);
    });
  });

  it("企業を作ると標準のシナリオ（保守・標準・楽観）とアラート設定ができる", async () => {
    await as(db, A, async () => {
      const kinds = (await db.query<{ kind: string }>("select kind from forecast_scenarios where organization_id = $1 order by kind", [orgA])).rows.map((r) => r.kind);
      expect(kinds).toEqual(["conservative", "optimistic", "standard"]);
      expect(await count("select * from alert_rules where organization_id = $1", [orgA])).toBe(4);
    });
  });

  it("口座番号は下4桁の数字しか保存できない", async () => {
    await as(db, A, async () => {
      await expect(db.query("update bank_accounts set number_last4 = '1234567' where id = $1", [accA1])).rejects.toThrow(/check constraint/);
      await db.query("update bank_accounts set number_last4 = '4567' where id = $1", [accA1]);
    });
  });

  it("企業Bのオーナーは自社の口座を使える", async () => {
    await as(db, B, async () => expect(await count("select * from bank_accounts where id = $1", [accB])).toBe(1));
  });
});
