// node --test test/*.test.js で実行（架空のデータ）
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const ctx = {};
vm.runInNewContext(readFileSync(new URL("../petty-cash-logic.js", import.meta.url), "utf8"), ctx);
const P = ctx.PettyCash;
const plain = (v) => JSON.parse(JSON.stringify(v));

const entries = [
  { id: 1, entry_date: "2026-10-01", kind: "in", amount: 100000, source: "register", item: "売上から補充" },
  { id: 3, entry_date: "2026-11-05", kind: "out", amount: 1200, category: "消耗品", item: "ティッシュ, ゴミ袋", has_receipt: true, created_by_name: "架空 太郎" },
  { id: 2, entry_date: "2026-10-20", kind: "out", amount: 3000, category: "交通費", item: "電車", has_receipt: false },
  { id: 4, entry_date: "2026-11-10", kind: "out", amount: 800, category: "消耗品", item: "洗剤", has_receipt: false },
  { id: 5, entry_date: "2026-12-01", kind: "in", amount: 5000, item: "補充" },
];

test("期間の残高：期間より前は繰越にまとめる", () => {
  const L = P.pettyLedger(entries, "2026-11-01", "2026-11-30");
  assert.equal(L.carry, 97000);
  assert.deepEqual(L.rows.map((r) => [r.id, r.balance]), [[3, 95800], [4, 95000]]);
  assert.deepEqual([L.inSum, L.outSum, L.end], [0, 2000, 95000]);
  assert.deepEqual(plain(L.byCat), { 消耗品: 2000 });
});

test("CSV：繰越・明細・合計・分類別、カンマは引用符で囲む", () => {
  const rows = P.pettyCsvRows(entries, "2026-10-01", "2026-11-30", "香里園");
  assert.deepEqual(plain(rows[0]).slice(0, 7), ["2026-10-01", "繰越", "前期からの繰越", "", "", "", 0]);
  assert.equal(rows[1][3], "補充（売上から）");
  assert.equal(rows[2][7], "なし"); // 10/20 電車：レシートなし
  const total = rows.find((r) => r[1] === "合計");
  assert.deepEqual(plain(total).slice(4, 7), [100000, 5000, 95000]);
  const csv = P.toCsv(P.HEADERS, rows);
  assert.match(csv, /"ティッシュ, ゴミ袋"/);
  assert.equal(csv.split("\r\n")[0], P.HEADERS.join(","));
  assert.match(csv, /分類別の出金/);
});
