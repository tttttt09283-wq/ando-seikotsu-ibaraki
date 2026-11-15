import { describe, expect, it } from "vitest";
import { normalizeHeading, parseManual } from "@/lib/importer";
import { RULES, SECTIONS } from "@/lib/import-config";
import { fakeExport } from "./fixtures";

describe("原文の分解", () => {
  it("見出しの記号を外して照合する", () => {
    expect(normalizeHeading("• ブラザー制度（フォローアップ）")).toBe("ブラザー制度（フォローアップ）");
    expect(normalizeHeading("⸻【頻度調整】")).toBe("頻度調整");
    expect(normalizeHeading("【院内会議】 ")).toBe("院内会議");
  });

  it("48項目に分け、章の見出し・区切り線は本文に入れない", () => {
    const r = parseManual(fakeExport());
    expect(r.sections).toHaveLength(SECTIONS.length);
    expect(r.missingSections).toEqual([]);
    for (const s of r.sections) {
      expect(s.text).not.toMatch(/⸻/);
      expect(s.text).not.toMatch(/^1\. 接客/m);
      expect(s.text.startsWith("行動")).toBe(true);
    }
  });

  it("ルールは書き出しが一致する行と続きの行を、そのまま取り出す", () => {
    const r = parseManual(fakeExport());
    for (const rule of r.rules) {
      expect(rule.missing).toEqual([]);
      const lines = rule.text.split("\n");
      expect(lines).toHaveLength(RULES.find((x) => x.code === rule.code)!.starts.length * 2);
      expect(lines[1]).toBe("（続きの行）");
    }
  });

  it("見つからない項目は知らせる", () => {
    const r = parseManual("挨拶、笑顔\n行動\n• x");
    expect(r.sections).toHaveLength(1);
    expect(r.missingSections).toHaveLength(SECTIONS.length - 1);
    expect(r.rules.find((x) => x.code === "RULE-SVC-001")!.missing).toHaveLength(3);
  });
});
