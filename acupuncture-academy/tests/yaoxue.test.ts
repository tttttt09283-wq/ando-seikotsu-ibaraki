import { test } from "node:test";
import assert from "node:assert/strict";
import { pointMap, points } from "@/data/points";
import {
  allTableCodes,
  briefPoints,
  derivedCategories,
  extraLuo,
  extraXi,
  fiveShuTable,
  huiTable,
  lowerHeTable,
  shuMuTable,
  sizongTable,
  yuanLuoXiTable,
} from "@/data/yaoxue";
import { lessonRevision, lessonRevisions, changelog, contentVersion } from "@/data/changelog";
import { allLessons } from "@/data/curriculum";

const YIN = ["LU", "SP", "HT", "KI", "PC", "LR"];
const count = (cat: string) => points.reduce((n, p) => n + p.categories.filter((c) => c.category === cat).length, 0);

test("分類表に出てくる経穴はすべて辞典にある", () => {
  for (const code of allTableCodes()) assert.ok(pointMap[code], `${code} が辞典にない`);
});

test("簡易エントリのコードは重複しない", () => {
  const codes = briefPoints.map((b) => b.code);
  assert.equal(new Set(codes).size, codes.length);
});

test("五兪穴：12経×5穴、すべて自経の経穴", () => {
  assert.equal(fiveShuTable.length, 12);
  for (const r of fiveShuTable) for (const c of r.codes) assert.equal(c.replace(/\d+$/, ""), r.meridian, c);
  assert.equal(count("五兪穴"), 60);
});

test("陰経では原穴＝兪穴、陽経では原穴≠兪穴", () => {
  for (const r of yuanLuoXiTable) {
    const shu = fiveShuTable.find((f) => f.meridian === r.meridian)!.codes[2];
    if (YIN.includes(r.meridian)) assert.equal(r.yuan, shu, r.meridian);
    else assert.notEqual(r.yuan, shu, r.meridian);
    for (const c of [r.yuan, r.luo, r.xi]) assert.equal(c.replace(/\d+$/, ""), r.meridian, c);
  }
});

test("要穴の数：原穴12・絡穴15・郄穴16・背部兪穴12・募穴12・八会穴8・下合穴6・八脈交会穴8・四総穴4", () => {
  assert.equal(count("原穴"), 12);
  assert.equal(count("絡穴"), 12 + extraLuo.length);
  assert.equal(count("絡穴"), 15);
  assert.equal(count("郄穴"), 12 + extraXi.length);
  assert.equal(count("郄穴"), 16);
  assert.equal(count("背部兪穴"), 12);
  assert.equal(count("募穴"), 12);
  assert.equal(count("八会穴"), 8);
  assert.equal(count("下合穴"), 6);
  assert.equal(count("八脈交会穴"), 8);
  assert.equal(count("四総穴"), 4);
});

test("背部兪穴はすべて膀胱経、下合穴はすべて足の三陽経", () => {
  for (const r of shuMuTable) assert.ok(r.shu.startsWith("BL"), r.shu);
  for (const r of lowerHeTable) assert.ok(/^(ST|GB|BL)\d/.test(r.code), r.code);
  assert.equal(new Set(huiTable.map((h) => h.code)).size, 8);
  assert.equal(sizongTable.length, 4);
});

test("代表的な要穴の分類（教科書の典型例）", () => {
  const has = (code: string, cat: string, detail?: string) =>
    assert.ok(derivedCategories(code).some((c) => c.category === cat && (!detail || c.detail.includes(detail))), `${code} ${cat} ${detail ?? ""}`);
  has("LU9", "原穴");
  has("LU9", "八会穴", "脈会");
  has("GB34", "下合穴", "胆");
  has("GB34", "八会穴", "筋会");
  has("ST36", "五兪穴", "合穴（土穴）");
  has("LR2", "五兪穴", "滎穴（火穴）");
  has("LU5", "五兪穴", "合穴（水穴）");
  has("SI3", "五兪穴", "兪穴（木穴）");
  has("CV12", "募穴", "胃");
  has("CV12", "八会穴", "腑会");
  has("BL17", "八会穴", "血会");
  has("GB39", "八会穴", "髄会");
  has("SP21", "絡穴", "脾の大絡");
  has("KI9", "郄穴", "陰維脈");
});

test("講義の版：すべての講義に版があり、更新履歴は新しい順", () => {
  for (const l of allLessons) assert.ok(lessonRevision(l.id).revision >= 1, l.id);
  for (const id of Object.keys(lessonRevisions)) assert.ok(allLessons.some((l) => l.id === id), `存在しない講義 ${id}`);
  const dates = changelog.map((c) => c.date);
  assert.deepEqual([...dates].sort().reverse(), dates);
  assert.equal(contentVersion, dates[0]);
  for (const c of changelog) for (const id of c.lessonIds ?? []) assert.ok(lessonRevision(id).revision > 1, `${id} は更新履歴にあるのに版が1`);
});
