import { afterAll, describe, expect, it } from "vitest";
import { IDS, signIn, sql, uniq } from "../support/db";

async function customerOf(storeId: string) {
  const { rows } = await sql().query(
    "select id, store_id from customers where store_id = $1 and deleted_at is null order by customer_code limit 1",
    [storeId],
  );
  return rows[0] as { id: string; store_id: string };
}

describe("権限外操作ができない", () => {
  it("駅前店スタッフは本店の顧客を閲覧できない", async () => {
    const staff2 = await signIn("staff2");
    const { data } = await staff2.from("customers").select("store_id");
    expect(data?.length).toBeGreaterThan(0);
    expect(data?.every((c) => c.store_id === IDS.stores.eki)).toBe(true);
  });

  it("連絡同意の状態（contact_status）は直接更新できない（記録経由のみ）", async () => {
    const staff = await signIn("staff");
    const c = await customerOf(IDS.stores.hq);
    const { error } = await staff.from("customers").update({ contact_status: "allowed" } as never).eq("id", c.id);
    expect(error?.code).toBe("42501");
  });

  it("Staff は顧客を削除（匿名化）できず、組織管理者はできる", async () => {
    const admin = await signIn("admin");
    const { data: created } = await admin
      .from("customers")
      .insert({ organization_id: IDS.orgs.demo, store_id: IDS.stores.hq, family_name: "削除テスト", phone: "090-0000-0000" })
      .select("id")
      .single();
    const staff = await signIn("staff");
    const denied = await staff.rpc("anonymize_customer", { p_customer: created!.id });
    expect(denied.error).not.toBeNull();

    const ok = await admin.rpc("anonymize_customer", { p_customer: created!.id });
    expect(ok.error).toBeNull();
    const { rows } = await sql().query("select family_name, phone, anonymized_at from customers where id = $1", [created!.id]);
    expect(rows[0]).toMatchObject({ family_name: "削除済み", phone: null });
    expect(rows[0].anonymized_at).not.toBeNull();
    const { data: visible } = await admin.from("customers").select("id").eq("id", created!.id);
    expect(visible).toEqual([]);
  });

  it("Staff はテーブルの行を物理削除できない", async () => {
    const staff = await signIn("staff");
    const c = await customerOf(IDS.stores.hq);
    const { error } = await staff.from("customers").delete().eq("id", c.id);
    expect(error?.code).toBe("42501");
  });

  it("Staff はフォロー条件を作成できない。店舗責任者は自店舗のみ作成できる", async () => {
    const base = { organization_id: IDS.orgs.demo, name: "権限テスト", rule_type: "days_since_last_visit" as const, offset_days: 10 };
    const staff = await signIn("staff");
    expect((await staff.from("followup_rules").insert({ ...base, store_id: IDS.stores.hq })).error?.code).toBe("42501");

    const manager = await signIn("manager");
    expect((await manager.from("followup_rules").insert({ ...base, store_id: IDS.stores.hq })).error).toBeNull();
    expect((await manager.from("followup_rules").insert({ ...base, store_id: IDS.stores.eki })).error?.code).toBe("42501");
    expect((await manager.from("followup_rules").insert({ ...base, store_id: null })).error?.code).toBe("42501");
  });

  it("Staff はテンプレートを編集できない（更新件数0）", async () => {
    const staff = await signIn("staff");
    const { data: t } = await staff.from("message_templates").select("id, body").is("store_id", null).limit(1).single();
    const { data } = await staff.from("message_templates").update({ body: "改ざん" }).eq("id", t!.id).select("id");
    expect(data ?? []).toEqual([]);
  });

  it("Staff はスタッフを追加できない。店舗責任者は自店舗のスタッフのみ追加できる", async () => {
    const staff = await signIn("staff");
    const r1 = await staff
      .from("memberships")
      .insert({ user_id: IDS.users.staff2, organization_id: IDS.orgs.demo, store_id: IDS.stores.hq, role: "staff" });
    expect(r1.error?.code).toBe("42501");

    const manager = await signIn("manager");
    const asManager = await manager
      .from("memberships")
      .insert({ user_id: IDS.users.staff2, organization_id: IDS.orgs.demo, store_id: IDS.stores.hq, role: "store_manager" });
    expect(asManager.error?.code).toBe("42501");
    const otherStore = await manager
      .from("memberships")
      .insert({ user_id: IDS.users.staff, organization_id: IDS.orgs.demo, store_id: IDS.stores.eki, role: "staff" });
    expect(otherStore.error?.code).toBe("42501");
    const ok = await manager
      .from("memberships")
      .insert({ user_id: IDS.users.staff2, organization_id: IDS.orgs.demo, store_id: IDS.stores.hq, role: "staff" })
      .select("id")
      .single();
    expect(ok.error).toBeNull();
    await sql().query("delete from memberships where id = $1", [ok.data!.id]);
  });

  it("自分のロールを組織管理者に昇格できない", async () => {
    const manager = await signIn("manager");
    const { error } = await manager
      .from("memberships")
      .insert({ user_id: IDS.users.manager, organization_id: IDS.orgs.demo, store_id: null, role: "org_admin" });
    expect(error?.code).toBe("42501");
    const { error: updErr } = await manager.from("memberships").update({ role: "org_admin" } as never).eq("user_id", IDS.users.manager);
    expect(updErr?.code).toBe("42501");
  });

  it("監査ログは組織管理者のみ閲覧できる", async () => {
    const staff = await signIn("staff");
    expect((await staff.from("audit_logs").select("id").limit(1)).data).toEqual([]);
    const admin = await signIn("admin");
    expect((await admin.from("audit_logs").select("id").limit(1)).data?.length).toBe(1);
  });

  it("監査ログは改ざん・削除できない", async () => {
    const admin = await signIn("admin");
    expect((await admin.from("audit_logs").delete().gt("id", 0)).error?.code).toBe("42501");
    expect((await admin.from("audit_logs").update({ action: "x" }).gt("id", 0)).error?.code).toBe("42501");
  });

  it("Staff は他のスタッフにタスクを割り当てられないが、自分には割り当てられる", async () => {
    const c = await customerOf(IDS.stores.hq);
    const { rows } = await sql().query(
      `insert into followup_tasks (organization_id, store_id, customer_id, title, due_on)
       values ($1, $2, $3, '権限テスト', current_date) returning id`,
      [IDS.orgs.demo, IDS.stores.hq, c.id],
    );
    const staff = await signIn("staff");
    const denied = await staff.from("followup_tasks").update({ assigned_to: IDS.users.manager }).eq("id", rows[0].id);
    expect(denied.error?.code).toBe("42501");
    const ok = await staff.from("followup_tasks").update({ assigned_to: IDS.users.staff }).eq("id", rows[0].id).select("assigned_to");
    expect(ok.data?.[0].assigned_to).toBe(IDS.users.staff);
    await sql().query("delete from followup_tasks where id = $1", [rows[0].id]);
  });

  it("ユーザーはルール由来のタスクを直接作成できない（抽出ジョブのみ）", async () => {
    const c = await customerOf(IDS.stores.hq);
    const { rows } = await sql().query("select id from followup_rules where organization_id = $1 limit 1", [IDS.orgs.demo]);
    const staff = await signIn("staff");
    const { error } = await staff.from("followup_tasks").insert({
      organization_id: IDS.orgs.demo,
      store_id: IDS.stores.hq,
      customer_id: c.id,
      title: "x",
      due_on: "2026-11-11",
      rule_id: rows[0].id,
      period_key: "lv:2026-01-01",
    } as never);
    expect(error?.code).toBe("42501");
  });

  it("担当者は、その店舗に所属するスタッフのみ設定できる", async () => {
    const admin = await signIn("admin");
    const { error } = await admin.from("customers").insert({
      organization_id: IDS.orgs.demo,
      store_id: IDS.stores.hq,
      family_name: "担当テスト",
      assigned_staff_id: IDS.users.staff2, // 駅前店のスタッフ
    });
    expect(error?.message).toMatch(/所属していません/);
  });
});

describe("組織設定による閲覧範囲・停止", () => {
  afterAll(async () => {
    await sql().query(
      `update organizations set status = 'active', settings = settings || '{"staff_visibility":"store"}' where id = $1`,
      [IDS.orgs.demo],
    );
  });

  it("「担当顧客のみ」設定では Staff は担当顧客だけ見える", async () => {
    await sql().query(`update organizations set settings = settings || '{"staff_visibility":"assigned"}' where id = $1`, [IDS.orgs.demo]);
    const staff = await signIn("staff");
    const { data } = await staff.from("customers").select("assigned_staff_id");
    expect(data?.length).toBeGreaterThan(0);
    expect(data?.every((c) => c.assigned_staff_id === IDS.users.staff)).toBe(true);

    const manager = await signIn("manager");
    const { data: mgrData } = await manager.from("customers").select("assigned_staff_id");
    expect(mgrData?.some((c) => c.assigned_staff_id !== IDS.users.manager)).toBe(true);
  });

  it("停止中の組織ではメンバーも顧客データを閲覧できない", async () => {
    await sql().query("update organizations set status = 'suspended' where id = $1", [IDS.orgs.demo]);
    const admin = await signIn("admin");
    expect((await admin.from("customers").select("id")).data).toEqual([]);
    const code = uniq();
    expect(
      (await admin.from("customers").insert({ organization_id: IDS.orgs.demo, store_id: IDS.stores.hq, family_name: "x", customer_code: code })).error
        ?.code,
    ).toBe("42501");
  });
});
