/**
 * 実際の PostgreSQL に対するテスト（npm run test:db で実行。TEST_DATABASE_URL が無ければスキップ）。
 *   - 業務フロー全体（メモリ版と同じシナリオ）
 *   - 初期データがローカル代替モードと一致すること
 *   - 排他制約・CHECK 制約・RLS（DB レベルでの防御）
 *   - 複数接続からの同時予約
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { defineFlowSuite } from "@/test/flow-suite";
import { PgRepo, createPool } from "./pg";
import { SEED_LOCATIONS, SEED_RULES, SEED_SERVICES } from "./seed";
import { createReservation } from "@/lib/services/reservations";
import { NOW, homeService, input, openHome } from "@/test/fixtures";

const url = process.env.TEST_DATABASE_URL;
const seedSql = readFileSync(join(process.cwd(), "supabase/migrations/20261112000100_seed.sql"), "utf8");
const TABLES = [
  "line_webhook_events",
  "audit_logs",
  "notification_logs",
  "consents",
  "line_accounts",
  "reservations",
  "customers",
  "blocked_slots",
  "availability_rules",
  "services",
  "admin_users",
  "locations",
];

describe.skipIf(!url)("PostgreSQL", () => {
  let pool: pg.Pool;
  beforeAll(() => {
    process.env.DATABASE_POOL_MAX = "10";
    pool = createPool(url!);
  });
  afterAll(async () => {
    await pool?.end();
  });

  async function reset() {
    await pool.query(`truncate ${TABLES.map((t) => `public.${t}`).join(", ")} restart identity cascade`);
    await pool.query(seedSql);
    return new PgRepo(pool);
  }

  describe("業務フロー", () => {
    defineFlowSuite(reset);
  });

  describe("DB 固有の防御", () => {
    it("初期データがローカル代替モードの seed.ts と一致する", async () => {
      const repo = await reset();
      const locs = await repo.listLocations();
      for (const l of SEED_LOCATIONS) {
        const db = locs.find((x) => x.id === l.id)!;
        for (const [k, v] of Object.entries(l)) expect(db[k as keyof typeof db], `${l.id}.${k}`).toEqual(v);
      }
      const svcs = await repo.listServices();
      expect(svcs.map((s) => ({ ...s, id: undefined, created_at: undefined, updated_at: undefined }))).toEqual(
        SEED_SERVICES.map((s) => ({ ...s, id: undefined, created_at: undefined, updated_at: undefined })),
      );
      const rules = await repo.listRules("home");
      expect(rules.map((r) => [r.weekday, r.start_time, r.end_time])).toEqual(SEED_RULES.map((r) => [r.weekday, r.start_time, r.end_time]));
    });

    it("排他制約：関数を通さずに重なる予約を直接 INSERT しても DB が拒否する", async () => {
      const repo = await reset();
      await openHome(repo);
      const svc = await homeService(repo);
      const r = await createReservation(repo, input({ service_id: svc.id }), { now: NOW });
      expect(r.ok).toBe(true);
      const existing = (await repo.getReservationByCode((r as { code: string }).code))!;
      await expect(
        pool.query(
          `insert into public.reservations (code, controller, location_id, service_id, customer_id, status, start_at, end_at, block_start_at, block_end_at,
             service_snapshot, line_verify_hash, view_token_hash)
           select 'IW-ZZZZZZ', controller, location_id, service_id, customer_id, 'pending_line', start_at + interval '30 minutes', end_at + interval '30 minutes',
                  block_start_at + interval '30 minutes', block_end_at + interval '30 minutes', service_snapshot, 'x', 'y'
             from public.reservations where id = $1`,
          [existing.id],
        ),
      ).rejects.toThrow(/reservations_no_overlap/);
    });

    it("CHECK 制約：受付開始の前提・料金未承認の公開・承認者なしの確定・LINE未受信の確定を拒否", async () => {
      await reset();
      await expect(pool.query("update public.locations set booking_enabled = true where id = 'home'")).rejects.toThrow(/locations_gate/);
      await expect(pool.query("update public.locations set company_approved = true, booking_enabled = true where id = 'ibaraki'")).rejects.toThrow(/locations_gate/);
      await expect(pool.query("update public.services set is_published = true where location_id = 'home'")).rejects.toThrow(/services_publish/);
      await expect(
        pool.query("insert into public.services (location_id, controller, name, duration_minutes) values ('ibaraki', 'iwanaga_private', 'x', 60)"),
      ).rejects.toThrow(/foreign key/);
      const repo = new PgRepo(pool);
      await openHome(repo);
      const svc = await homeService(repo);
      const r = await createReservation(repo, input({ service_id: svc.id }), { now: NOW });
      const res = (await repo.getReservationByCode((r as { code: string }).code))!;
      await expect(pool.query("update public.reservations set status = 'confirmed' where id = $1", [res.id])).rejects.toThrow(/reservations_confirm_requires/);
      await expect(
        pool.query("update public.reservations set status = 'pending_review' where id = $1", [res.id]),
      ).rejects.toThrow(/reservations_confirm_requires_line/);
    });

    it("監査ログは追記のみ（更新・削除できない）", async () => {
      const repo = await reset();
      await repo.addAudit({ actor_type: "system", actor_id: null, controller: null, location_id: null, reservation_id: null, action: "t", from_status: null, to_status: null, detail: {} });
      await expect(pool.query("update public.audit_logs set action = 'x'")).rejects.toThrow(/append-only/);
      await expect(pool.query("delete from public.audit_logs")).rejects.toThrow(/append-only/);
    });

    it("RLS：公開キー（anon）からは予約・顧客・拠点を読めない。管理者は許可された管理主体の行だけ読める", async () => {
      const repo = await reset();
      await openHome(repo);
      const svc = await homeService(repo);
      await createReservation(repo, input({ service_id: svc.id }), { now: NOW });
      const authId = "11111111-1111-4111-8111-111111111111";
      const workplaceAuthId = "22222222-2222-4222-8222-222222222222";
      await pool.query(
        `insert into public.admin_users (auth_user_id, email, role, allowed_controllers) values
           ($1, 'owner@example.com', 'owner', array['iwanaga_private','enejoy_hand']),
           ($2, 'company@example.com', 'staff', array['enejoy_hand'])`,
        [authId, workplaceAuthId],
      );
      const client = await pool.connect();
      try {
        await client.query("begin");
        await client.query("set local role anon");
        await expect(client.query("select * from public.reservations")).rejects.toThrow(/permission denied/);
        await client.query("rollback");

        await client.query("begin");
        await client.query("set local role anon");
        await expect(client.query("select * from public.customers")).rejects.toThrow(/permission denied/);
        await client.query("rollback");

        await client.query("begin");
        await client.query("set local role anon");
        await expect(client.query("select public.create_reservation_hold('{}','{}','[]',null)")).rejects.toThrow(/permission denied/);
        await client.query("rollback");

        const countAs = async (sub: string | null, table: string) => {
          await client.query("begin");
          await client.query("set local role authenticated");
          await client.query("select set_config('request.jwt.claim.sub', $1, true)", [sub ?? ""]);
          const r = await client.query(`select count(*)::int as n from public.${table}`);
          await client.query("rollback");
          return r.rows[0].n as number;
        };
        expect(await countAs(authId, "reservations")).toBe(1);
        expect(await countAs(workplaceAuthId, "reservations")).toBe(0); // 勤務先担当者は自宅院の予約を読めない
        expect(await countAs(workplaceAuthId, "customers")).toBe(0);
        expect(await countAs(null, "reservations")).toBe(0); // admin_users に無いログインユーザー
        expect(await countAs("33333333-3333-4333-8333-333333333333", "locations")).toBe(0);

        await client.query("begin");
        await client.query("set local role authenticated");
        await client.query("select set_config('request.jwt.claim.sub', $1, true)", [authId]);
        await expect(client.query("update public.reservations set status = 'confirmed'")).rejects.toThrow(/permission denied/);
        await client.query("rollback");
      } finally {
        client.release();
      }
    });

    it("複数接続から同じ枠へ同時に20件送信しても仮予約は1件だけ", async () => {
      const repo = await reset();
      await openHome(repo);
      const svc = await homeService(repo);
      const results = await Promise.all(
        Array.from({ length: 20 }, (_, i) => createReservation(repo, input({ service_id: svc.id, phone: `0907777${String(i).padStart(4, "0")}` }), { now: NOW })),
      );
      expect(results.filter((r) => r.ok)).toHaveLength(1);
      const { rows } = await pool.query("select count(*)::int as n from public.reservations where status = 'pending_line'");
      expect(rows[0].n).toBe(1);
    });
  });
});
