// 実際のマニュアル書き出しでの確認（原文はリポジトリに置かない。手元のファイルを MANUAL_SOURCE_TXT で渡したときだけ動く）
import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { parseManual } from "@/lib/importer";

const file = process.env.MANUAL_SOURCE_TXT;

describe.skipIf(!file)("実際のマニュアル書き出し", () => {
  it("48項目と17ルールがすべて見つかり、文言はそのまま", () => {
    const raw = fs.readFileSync(file!, "utf8");
    const r = parseManual(raw);
    expect(r.missingSections).toEqual([]);
    expect(r.duplicateHeadings).toEqual(["フリーパス説明"]); // 本文中の小見出し【フリーパス説明】は本文として残る
    expect(r.sections).toHaveLength(48);
    for (const rule of r.rules) expect(rule.missing, rule.code).toEqual([]);
    const flat = raw.replace(/\r/g, "");
    for (const s of r.sections) for (const line of s.text.split("\n")) expect(flat.includes(line), line).toBe(true);
    for (const rule of r.rules) for (const line of rule.text.split("\n")) expect(flat.includes(line), line).toBe(true);
    if (process.env.SHOW) for (const rule of r.rules) console.log(`--- ${rule.code}\n${rule.text}`);
    if (process.env.SHOW) console.log(r.sections.map((s) => `${s.ref} ${s.heading} ${s.text.length}`).join("\n"));
  });
});
