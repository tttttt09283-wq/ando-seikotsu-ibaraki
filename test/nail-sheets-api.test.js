import test from "node:test";
import assert from "node:assert/strict";
import { parseIds, pickAnalysisSheets, MAX_SHEETS } from "../lib/nail-sheets-api.js";

test("読み込むのは「分析表」を含むシートだけ（原本は除く）", () => {
  assert.deepEqual(pickAnalysisSheets(["分析表", "分析表(2025)", "分析表（2026）", "分析表原本", "継続表", "日別表"]), ["分析表", "分析表(2025)", "分析表（2026）"]);
});

test("スプレッドシートIDは形の正しいものだけ・重複なし・上限まで", () => {
  const id = "1Uy3UytDSV4Gsv_EZXGmeorrpWRltJD7nqZBX4TgeYGA";
  assert.deepEqual(parseIds(`${id}, ${id},../etc,short,a'b`), [id]);
  const many = Array.from({ length: 30 }, (_, i) => `${id.slice(0, 30)}${String(i).padStart(3, "0")}`).join(",");
  assert.equal(parseIds(many).length, MAX_SHEETS);
});
