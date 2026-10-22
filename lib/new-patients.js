// 「あんど新規集客」シート（院ごとのタブ・新患1人1行）から、スタッフ別・院別・月別の新患実績を集計する
//
//   新患対応数 … 「初回施術担当者」がその人の行数（症状に 爪/つめ/ツメ を含む行は除く。シートの集計表と同じ）
//   初回成約数 … 「自費加入」に○、または「成約金額」が入っている行
//   初回売上   … 「初回窓口金額」＋「成約金額」
//   通院数     … 「通院」に○
//   巻き爪     … 症状に 爪/つめ/ツメ を含む行は新患の数から外し、別に「巻き爪の件数・売上」として数える
// 「自費加入」「通院」の列をまだ記入していない月（その院・その月に1件も記入が無い）は、
// 成約率・継続率を 0% ではなく「未記入」として扱う（10月から記入を始めた院があるため）
// 列の位置はタブごとに違うので、2行目付近の見出し名で探す。

import { normName, canonClinic } from "./incentive-calc.js";

const HEADER_KEYS = {
  date: "来院日", staff: "初回施術担当者", firstPay: "初回窓口金額", contract: "成約金額",
  selfPay: "自費加入", cont: "通院", symptom: "症状",
};
const CIRCLE = /[○◯〇]/;
const NAIL = /爪|つめ|ツメ/;

function findHeader(rows) {
  for (let r = 0; r < Math.min(rows.length, 6); r++) {
    const row = (rows[r] || []).map(normName);
    const col = {};
    for (const [k, label] of Object.entries(HEADER_KEYS)) col[k] = row.findIndex((h) => h.startsWith(label));
    if (col.date >= 0 && col.staff >= 0) return { row: r, col };
  }
  return null;
}

// シートの日付: 数値（シリアル値）・"2026/10/1"・"2026-10-01" のどれでも読む
export function parseSheetDate(v) {
  if (typeof v === "number" && v > 30000 && v < 80000) {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000);
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
  }
  const m = String(v ?? "").match(/(\d{4})\s*[/\-年.]\s*(\d{1,2})/);
  return m ? { year: Number(m[1]), month: Number(m[2]) } : null;
}

const money = (v) => {
  if (v === null || v === undefined || v === "") return 0;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[¥,円\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

// 「岩永　拓己」「岩永」などの記入を、スタッフ一覧の人に結びつける（フルネーム一致 → 名字が1人だけ一致）
export function makeStaffMatcher(people) {
  const byKey = new Map(people.map((p) => [p.key, p]));
  const surnames = people.map((p) => ({ p, s: normName(String(p.name).split(/[\s　]+/)[0]) })).filter((x) => x.s);
  const cache = new Map();
  return (raw) => {
    const n = normName(raw);
    if (!n) return null;
    if (cache.has(n)) return cache.get(n);
    let hit = byKey.get(n) || null;
    if (!hit) {
      const c = surnames.filter((x) => n === x.s || n.startsWith(x.s));
      if (c.length === 1) hit = c[0].p;
    }
    cache.set(n, hit);
    return hit;
  };
}

const emptyStat = () => ({ count: 0, closed: 0, firstPay: 0, contract: 0, continued: 0, closeBase: 0, contBase: 0, nailCount: 0, nailSales: 0 });

// sheets: { タブ名: 2次元配列 } → { byPerson: Map(key → {月: stat}), byClinic: Map(院 → {月: stat}), unmatched: [名前] }
export function parseNewPatients(sheets, people) {
  const match = makeStaffMatcher(people);
  const byPerson = new Map(), byClinic = new Map();
  const unmatched = new Set();
  const add = (map, key, month, row) => {
    if (!map.has(key)) map.set(key, {});
    const m = map.get(key);
    const s = m[month] || (m[month] = emptyStat());
    s.count++; s.firstPay += row.firstPay; s.contract += row.contract;
    if (row.closeKnown) { s.closeBase++; s.closed += row.closed ? 1 : 0; }
    if (row.contKnown) { s.contBase++; s.continued += row.continued ? 1 : 0; }
  };
  for (const [title, rows] of Object.entries(sheets)) {
    const h = findHeader(rows || []);
    if (!h) continue;
    const clinic = canonClinic(title);
    // 1回目：院・月ごとに「自費加入」「通院」の記入があるかを調べる
    const filled = {}; // 月 → { close, cont }
    for (let r = h.row + 1; r < rows.length; r++) {
      const row = rows[r] || [];
      const d = parseSheetDate(row[h.col.date]);
      if (!d) continue;
      const month = `${d.year}-${String(d.month).padStart(2, "0")}`;
      const f = filled[month] || (filled[month] = { close: false, cont: false });
      const val = (k) => (h.col[k] >= 0 ? String(row[h.col[k]] ?? "").trim() : "");
      if (val("selfPay") || money(h.col.contract >= 0 ? row[h.col.contract] : 0) > 0) f.close = true;
      if (val("cont")) f.cont = true;
    }
    for (let r = h.row + 1; r < rows.length; r++) {
      const row = rows[r] || [];
      const d = parseSheetDate(row[h.col.date]);
      const staffRaw = row[h.col.staff];
      if (!d || !normName(staffRaw)) continue;
      const get = (k) => (h.col[k] >= 0 ? row[h.col[k]] : null);
      if (h.col.symptom >= 0 && NAIL.test(String(row[h.col.symptom] ?? ""))) {
        const month = `${d.year}-${String(d.month).padStart(2, "0")}`;
        const p = match(staffRaw);
        const sales = money(get("firstPay")) + money(get("contract"));
        for (const [map, key] of [[byClinic, clinic], ...(p ? [[byPerson, p.key]] : [])]) {
          if (!map.has(key)) map.set(key, {});
          const st = map.get(key)[month] || (map.get(key)[month] = emptyStat());
          st.nailCount++; st.nailSales += sales;
        }
        continue;
      }
      const contract = money(get("contract"));
      const rec = {
        closed: CIRCLE.test(String(get("selfPay") ?? "")) || contract > 0,
        firstPay: money(get("firstPay")), contract,
        continued: CIRCLE.test(String(get("cont") ?? "")),
      };
      const month = `${d.year}-${String(d.month).padStart(2, "0")}`;
      rec.closeKnown = filled[month].close;
      rec.contKnown = filled[month].cont;
      add(byClinic, clinic, month, rec);
      const p = match(staffRaw);
      if (p) add(byPerson, p.key, month, rec);
      else unmatched.add(String(staffRaw).trim());
    }
  }
  return { byPerson, byClinic, unmatched: [...unmatched] };
}

// 1か月分の集計 → 評価で使う数値
export function newPatientMetrics(stat) {
  const nail = stat && stat.nailCount ? { nail_count: stat.nailCount, nail_sales: Math.round(stat.nailSales) } : { nail_count: 0 };
  if (!stat || !stat.count) return { new_count: 0, ...nail };
  const out = {
    ...nail,
    new_count: stat.count,
    new_sales: Math.round(stat.firstPay + stat.contract),
    new_first_avg: Math.round(stat.firstPay / stat.count),
  };
  // 記入がある月だけ率を出す（未記入の月は undefined ＝ 自動で入らない）
  const closeBase = stat.closeBase ?? stat.count, contBase = stat.contBase ?? stat.count;
  if (closeBase) out.new_close = Math.round((stat.closed / closeBase) * 1000) / 10;
  if (contBase) out.new_continue = Math.round((stat.continued / contBase) * 1000) / 10;
  return out;
}
