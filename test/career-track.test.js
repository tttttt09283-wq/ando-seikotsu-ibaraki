import test from "node:test";
import assert from "node:assert/strict";
import {
  trackGradeFor, canChooseTrack, parseTracks, parseKdi, kdiFor, validateKdi, defaultPayTable, parsePayTable, payRows, validatePayTable, monthlyPay, DEFAULT_KDI,
} from "../lib/career-track.js";
import { DEFAULT_ITEMS, itemsFor, scoreMonth, parseDist, DEFAULT_DIST, distFor, DIST_HEADER } from "../lib/evaluation.js";

test("コース：G3から分かれ、スペシャルは S1〜S3 の項目で評価する", () => {
  assert.equal(trackGradeFor("G3", "special"), "S1");
  assert.equal(trackGradeFor("G4", "special"), "S2");
  assert.equal(trackGradeFor("G5", "special"), "S3");
  assert.equal(trackGradeFor("G4", "management"), "G4");
  assert.equal(trackGradeFor("G2", "special"), "G2"); // G2以下は共通
  assert.equal(canChooseTrack("G3"), true);
  assert.equal(canChooseTrack("G2"), false);
  const t = parseTracks([["氏名key", "氏名", "コース"], ["大皿悠梨乃", "大皿 悠梨乃", "スペシャル"], ["奥田貴明", "奥田 貴明", "マネジメント"]]);
  assert.equal(t.get("大皿悠梨乃").track, "special");
  assert.equal(t.get("奥田貴明").track, "management");
});

test("配分：マネジメント＝定量40・定性40・KDI20、スペシャル＝定量60・定性20・KDI20", () => {
  const m = distFor(DEFAULT_DIST, "G4"), sp = distFor(DEFAULT_DIST, "S2");
  assert.deepEqual([m.num, m.beh + m.basic, m.kdi], [40, 40, 20]);
  assert.deepEqual([sp.num, sp.beh + sp.basic, sp.kdi], [60, 20, 20]);
  // KDI列が無い古い配分シートでも、G3〜G6は新しい初期値になる。G2は保存した値＋KDI20
  const old = parseDist([["区分", "名前", "数値%", "行動%", "基本%", "必須ライン", "部門の点数"], ["クラス", "G4", 55, 30, 15, 3, ""], ["クラス", "G2", 50, 35, 15, 3, ""]]);
  assert.deepEqual([old.grades.G4.num, old.grades.G4.kdi], [40, 20]);
  assert.deepEqual([old.grades.G2.num, old.grades.G2.kdi], [50, 20]);
  // KDI列があれば、その値を使う
  const now = parseDist([DIST_HEADER, ["クラス", "G4", 50, 25, 10, 3, "", 15]]);
  assert.deepEqual([now.grades.G4.num, now.grades.G4.kdi], [50, 15]);
});

test("個人KDI：個人の設定が無ければコースの標準、達成率で採点して定量・定性・KDIの率を出す", () => {
  const personal = parseKdi([["氏名key"], ["定井彪雅", "定井 彪雅", "kdi_a", "物販の提案", 20, "件", "以上"]]);
  assert.equal(kdiFor(personal, "定井彪雅", "G2").personal, true);
  assert.equal(kdiFor(personal, "大皿悠梨乃", "S2").items[0].id, DEFAULT_KDI.special[0].id);
  assert.equal(kdiFor(personal, "大皿悠梨乃", "G4").items[0].id, DEFAULT_KDI.management[0].id);

  const kdi = kdiFor(new Map(), "x", "S1").items;
  const items = itemsFor(DEFAULT_ITEMS, "S1", [], DEFAULT_DIST, kdi);
  const sum = (k) => Math.round(items.filter((it) => it.kind === k).reduce((a, it) => a + it.points, 0) * 1e6) / 1e6;
  assert.equal(sum("KDI"), 20);
  assert.equal(sum("数値"), 60);
  // KDIを全部半分だけ達成、それ以外は満点 → KDIの率50%、総合90%
  const values = {}, scores = {};
  for (const it of items) {
    if (it.kind === "KDI") values[it.id] = it.target / 2;
    else if (it.kind === "数値") values[it.id] = it.target;
    else scores[it.id] = 5;
  }
  const r = scoreMonth(items, values, scores);
  assert.equal(r.rates.kdi, 50);
  assert.equal(r.rates.quant, 100);
  assert.equal(r.rates.qual, 100);
  assert.equal(r.total, 90);
  assert.throws(() => validateKdi([{ label: "面談", target: 0 }]), /目標/);
  assert.equal(validateKdi([{ label: "面談", target: "2", unit: "回" }])[0].target, 2);
});

test("コース別給与：基本給は同じで、手当で マネジメント＞スペシャル", () => {
  const ladder = [["等級", "役職", "固定支給目安", "基本給", "役職手当", "資格手当", "固定残業代"], ["G4", "院長", 350000, 230000, 60000, 30000, 30000]];
  const t = defaultPayTable(ladder);
  assert.equal(t.G4.special, 30000);
  const m = monthlyPay(t, "G4", "management"), sp = monthlyPay(t, "G4", "special");
  assert.equal(m.base, sp.base);
  assert.ok(m.total > sp.total);
  assert.equal(m.total, 350000);
  assert.equal(monthlyPay(t, "G6", "special"), null); // GM相当のスペシャルは無い
  assert.deepEqual(parsePayTable(payRows(t), ladder), t);
  assert.throws(() => validatePayTable({ ...t, G4: { ...t.G4, special: 70000 } }), /マネジメント＞スペシャル/);
});
