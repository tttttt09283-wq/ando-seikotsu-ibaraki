import { describe, expect, it } from "vitest";
import { IDS, signIn } from "../support/db";

describe("テンプレートの編集・コピー", () => {
  it("組織作成時に5カテゴリの初期テンプレートが用意されている", async () => {
    const staff = await signIn("staff");
    const { data } = await staff.from("message_templates").select("category").eq("organization_id", IDS.orgs.demo);
    expect([...new Set(data?.map((t) => t.category))]).toEqual(
      expect.arrayContaining(["thanks_first_visit", "condition_check", "next_appointment", "lapsed", "seasonal"]),
    );
  });

  it("組織管理者が編集すると版数が上がる", async () => {
    const admin = await signIn("admin");
    const { data: t } = await admin.from("message_templates").insert({
      organization_id: IDS.orgs.demo, category: "other", name: "編集テスト", body: "本文1",
    }).select("id, version").single();
    expect(t!.version).toBe(1);
    const { data: u } = await admin.from("message_templates").update({ body: "本文2" }).eq("id", t!.id).select("version, body").single();
    expect(u).toEqual({ version: 2, body: "本文2" });
  });

  it("テンプレートを複製できる（元のテンプレートは変わらない）", async () => {
    const manager = await signIn("manager");
    const { data: src } = await manager
      .from("message_templates").select("id, category, name, body").eq("category", "seasonal").is("store_id", null).limit(1).single();
    const { data: copy, error } = await manager.from("message_templates").insert({
      organization_id: IDS.orgs.demo, store_id: IDS.stores.hq, category: src!.category, name: `${src!.name}（コピー）`, body: src!.body,
    }).select("id, body, store_id").single();
    expect(error).toBeNull();
    expect(copy!.body).toBe(src!.body);
    expect(copy!.id).not.toBe(src!.id);
  });

  it("店舗責任者は組織共通テンプレートを編集できない（自店舗用は可）", async () => {
    const manager = await signIn("manager");
    const { data: shared } = await manager.from("message_templates").select("id").is("store_id", null).limit(1).single();
    const { data } = await manager.from("message_templates").update({ body: "x" }).eq("id", shared!.id).select("id");
    expect(data ?? []).toEqual([]);
  });

  it("他店舗用のテンプレートは見えない", async () => {
    const admin = await signIn("admin");
    await admin.from("message_templates").insert({
      organization_id: IDS.orgs.demo, store_id: IDS.stores.eki, category: "other", name: "駅前専用", body: "駅前",
    });
    const staff = await signIn("staff");
    const { data } = await staff.from("message_templates").select("name").eq("name", "駅前専用");
    expect(data).toEqual([]);
  });
});
