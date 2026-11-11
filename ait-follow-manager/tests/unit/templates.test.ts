import { describe, expect, it } from "vitest";
import { copyName, findUnknownVariables, renderTemplate } from "@/lib/templates";

describe("テンプレート", () => {
  it("差し込み変数を置換する", () => {
    expect(renderTemplate("{{顧客名}}様 {{店舗名}}より", { 顧客名: "テスト 太郎", 店舗名: "本店" })).toBe("テスト 太郎様 本店より");
  });

  it("空白入りの書式も置換し、未定義の変数は残す", () => {
    expect(renderTemplate("{{ 顧客名 }} {{不明}}", { 顧客名: "A" })).toBe("A {{不明}}");
  });

  it("HTML として解釈しない（そのまま文字列として残る）", () => {
    expect(renderTemplate("<b>{{顧客名}}</b>", { 顧客名: "<script>alert(1)</script>" })).toBe("<b><script>alert(1)</script></b>");
  });

  it("未知の変数を検出する", () => {
    expect(findUnknownVariables("{{顧客名}} {{誕生日}} {{誕生日}}")).toEqual(["誕生日"]);
  });

  it("複製名は60文字以内", () => {
    expect(copyName("お礼")).toBe("お礼（コピー）");
    expect(copyName("あ".repeat(60))).toHaveLength(60);
  });
});
