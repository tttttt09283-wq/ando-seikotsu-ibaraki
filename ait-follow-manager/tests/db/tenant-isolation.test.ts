import { describe, expect, it } from "vitest";
import { anonClient, IDS, signIn, sql } from "../support/db";

const TENANT_TABLES = [
  "customers",
  "visits",
  "appointments",
  "consent_records",
  "customer_notes",
  "customer_tags",
  "tags",
  "followup_rules",
  "followup_tasks",
  "message_templates",
  "contact_logs",
  "import_jobs",
  "stores",
  "memberships",
  "audit_logs",
] as const;

describe("他組織のデータへアクセスできない", () => {
  it.each(TENANT_TABLES)("他社の管理者は %s の demo 組織データを1件も取得できない", async (table) => {
    const other = await signIn("otherAdmin");
    const { data, error } = await other.from(table).select("organization_id").eq("organization_id", IDS.orgs.demo);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("他社の組織そのものも見えない", async () => {
    const other = await signIn("otherAdmin");
    const { data } = await other.from("organizations").select("id");
    expect(data?.map((o) => o.id)).toEqual([IDS.orgs.other]);
  });

  it("demo のスタッフは他社の顧客を取得できない", async () => {
    const staff = await signIn("staff");
    const { data } = await staff.from("customers").select("id, organization_id");
    expect(data?.length).toBeGreaterThan(0);
    expect(data?.every((c) => c.organization_id === IDS.orgs.demo)).toBe(true);
  });

  it("他社の顧客 ID を直接指定しても取得・更新できない", async () => {
    const { rows } = await sql().query("select id from customers where organization_id = $1 limit 1", [IDS.orgs.demo]);
    const other = await signIn("otherAdmin");
    const read = await other.from("customers").select("id").eq("id", rows[0].id);
    expect(read.data).toEqual([]);
    const upd = await other.from("customers").update({ family_name: "改ざん" }).eq("id", rows[0].id).select("id");
    expect(upd.data ?? []).toEqual([]);
    const after = await sql().query("select family_name from customers where id = $1", [rows[0].id]);
    expect(after.rows[0].family_name).not.toBe("改ざん");
  });

  it("他社の組織・店舗に顧客を登録できない", async () => {
    const other = await signIn("otherAdmin");
    const { error } = await other
      .from("customers")
      .insert({ organization_id: IDS.orgs.demo, store_id: IDS.stores.hq, family_name: "侵入" });
    expect(error?.code).toBe("42501");
  });

  it("自社の組織IDと他社の店舗IDを組み合わせても登録できない（複合外部キー）", async () => {
    const other = await signIn("otherAdmin");
    const { error } = await other
      .from("customers")
      .insert({ organization_id: IDS.orgs.other, store_id: IDS.stores.hq, family_name: "侵入" });
    expect(error).not.toBeNull();
  });

  it("他社の顧客に来店記録・連絡記録・同意記録を追加できない", async () => {
    const { rows } = await sql().query("select id from customers where organization_id = $1 limit 1", [IDS.orgs.demo]);
    const other = await signIn("otherAdmin");
    const v = await other.from("visits").insert({
      organization_id: IDS.orgs.demo,
      store_id: IDS.stores.hq,
      customer_id: rows[0].id,
      visited_on: "2026-11-01",
    });
    expect(v.error).not.toBeNull();
    const c = await other.from("consent_records").insert({
      organization_id: IDS.orgs.demo,
      customer_id: rows[0].id,
      status: "unsubscribed",
      recorded_by: IDS.users.otherAdmin,
    });
    expect(c.error).not.toBeNull();
  });

  it("未ログイン（anon）はどのテーブルも読めない", async () => {
    const anon = anonClient();
    for (const table of [...TENANT_TABLES, "organizations", "users"] as const) {
      const { data } = await anon.from(table).select("*").limit(1);
      expect(data ?? []).toEqual([]);
    }
  });

  it("Platform Admin は顧客情報を閲覧できず、組織の件数のみ取得できる", async () => {
    const platform = await signIn("platform");
    const { data: customers } = await platform.from("customers").select("id");
    expect(customers).toEqual([]);
    const { data: summaries, error } = await platform.rpc("platform_org_summaries");
    expect(error).toBeNull();
    const demo = summaries?.find((s) => s.id === IDS.orgs.demo);
    expect(demo?.customer_count).toBeGreaterThan(0);
    expect(Object.keys(demo ?? {})).not.toContain("family_name");
  });

  it("Platform Admin 以外は組織一覧関数を実行できない", async () => {
    const admin = await signIn("admin");
    const { error } = await admin.rpc("platform_org_summaries");
    expect(error?.code).toBe("42501");
  });

  it("public スキーマの全テーブルで RLS が有効（force）になっている", async () => {
    const { rows } = await sql().query(`
      select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and not (c.relrowsecurity and c.relforcerowsecurity)`);
    expect(rows).toEqual([]);
  });

  it("anon には public スキーマのテーブル権限が無い", async () => {
    const { rows } = await sql().query(`
      select table_name, privilege_type from information_schema.role_table_grants
      where grantee = 'anon' and table_schema = 'public'`);
    expect(rows).toEqual([]);
  });
});
