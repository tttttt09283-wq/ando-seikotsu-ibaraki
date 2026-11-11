import { describe, expect, it } from "vitest";
import { IDS, signIn, sql, uniq } from "../support/db";

describe("顧客の登録・編集・検索", () => {
  it("顧客番号を省略すると自動採番される", async () => {
    const staff = await signIn("staff");
    const { data, error } = await staff
      .from("customers")
      .insert({ organization_id: IDS.orgs.demo, store_id: IDS.stores.hq, family_name: "採番", given_name: "テスト" })
      .select("customer_code, contact_status")
      .single();
    expect(error).toBeNull();
    expect(data!.customer_code).toMatch(/^C\d{6}$/);
    expect(data!.contact_status).toBe("unknown");
  });

  it("同じ組織で顧客番号が重複すると登録できない", async () => {
    const staff = await signIn("staff");
    const code = uniq("DUP");
    const base = { organization_id: IDS.orgs.demo, store_id: IDS.stores.hq, family_name: "重複", customer_code: code };
    expect((await staff.from("customers").insert(base)).error).toBeNull();
    expect((await staff.from("customers").insert(base)).error?.code).toBe("23505");
  });

  it("別組織なら同じ顧客番号を使える", async () => {
    const code = uniq("SAME");
    const staff = await signIn("staff");
    const other = await signIn("otherAdmin");
    expect((await staff.from("customers").insert({ organization_id: IDS.orgs.demo, store_id: IDS.stores.hq, family_name: "A", customer_code: code })).error).toBeNull();
    expect(
      (await other.from("customers").insert({ organization_id: IDS.orgs.other, store_id: IDS.stores.otherMain, family_name: "B", customer_code: code })).error,
    ).toBeNull();
  });

  it("不正な電話番号・メールアドレスは登録できない", async () => {
    const staff = await signIn("staff");
    const base = { organization_id: IDS.orgs.demo, store_id: IDS.stores.hq, family_name: "検証" };
    expect((await staff.from("customers").insert({ ...base, phone: "<script>" })).error?.code).toBe("23514");
    expect((await staff.from("customers").insert({ ...base, email: "not-an-email" })).error?.code).toBe("23514");
  });

  it("編集すると監査ログに変更列名のみ記録される（値は残さない）", async () => {
    const staff = await signIn("staff");
    const { data: c } = await staff
      .from("customers")
      .insert({ organization_id: IDS.orgs.demo, store_id: IDS.stores.hq, family_name: "編集前", phone: "090-0000-1111" })
      .select("id")
      .single();
    const { error } = await staff.from("customers").update({ family_name: "編集後", phone: "090-0000-2222" }).eq("id", c!.id);
    expect(error).toBeNull();
    const { rows } = await sql().query(
      "select actor_user_id, changes from audit_logs where entity_id = $1 and action = 'customers.update'",
      [c!.id],
    );
    expect(rows[0].actor_user_id).toBe(IDS.users.staff);
    expect(rows[0].changes.fields).toEqual(["family_name", "phone"]);
    expect(JSON.stringify(rows[0].changes)).not.toMatch(/編集後|2222/);
  });

  it("氏名・かな・顧客番号・電話番号（ハイフン無し）で部分一致検索できる", async () => {
    const staff = await signIn("staff");
    const code = uniq("SR");
    await staff.from("customers").insert({
      organization_id: IDS.orgs.demo,
      store_id: IDS.stores.hq,
      customer_code: code,
      family_name: "検索",
      given_name: "花子",
      family_name_kana: "けんさく",
      given_name_kana: "はなこ",
      phone: "090-0000-7777",
    });
    for (const q of ["検索花子", "けんさく", code.toLowerCase(), "09000007777", "7777"]) {
      const { data } = await staff.from("customers").select("customer_code").ilike("search_text", `%${q.toLowerCase()}%`);
      expect(data?.map((d) => d.customer_code), q).toContain(code);
    }
  });

  it("来店を記録すると初回・最終来店日が更新される", async () => {
    const staff = await signIn("staff");
    const { data: c } = await staff
      .from("customers")
      .insert({ organization_id: IDS.orgs.demo, store_id: IDS.stores.hq, family_name: "来店" })
      .select("id")
      .single();
    for (const d of ["2026-10-01", "2026-11-05", "2026-10-20"]) {
      await staff.from("visits").insert({ organization_id: IDS.orgs.demo, store_id: IDS.stores.hq, customer_id: c!.id, visited_on: d });
    }
    const { data } = await staff.from("customers").select("first_visit_on, last_visit_on").eq("id", c!.id).single();
    expect(data).toEqual({ first_visit_on: "2026-10-01", last_visit_on: "2026-11-05" });
  });
});
