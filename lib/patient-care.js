// 患者対応評価シート（○・×・対象外のチェック）を読み、スタッフ・月ごとの実施率にする
// 1つのタブに評価用紙が1枚（または縦に何枚か）並んでいる形を想定。タブ名は自由（スタッフ名・日付など）
//   評価日 | (値) | 所属院 | (値) | 対象スタッフ | (値)
//   患者ID | (値) | 評価者 | (値) | 通院段階     | (値)
//   段階 | 評価項目 | 評価（○・×・対象外） | 補足 | …
//   来院・受付 | 笑顔・挨拶… | ○ | …
import { canonClinic } from "./incentive-calc.js";
import { makeStaffMatcher, parseSheetDate } from "./new-patients.js";

const str = (v) => String(v ?? "").trim();
const OK = /^(○|〇|◯|o|O|ｏ|Ｏ|◎|はい|済)$/;
const NG = /^(×|✕|✖|x|X|ｘ|Ｘ|いいえ|未)$/;

// 右隣にある値（空白セルは飛ばす）
function valueRightOf(row, col) {
  for (let c = col + 1; c < Math.min(row.length, col + 3); c++) if (str(row[c])) return row[c];
  return "";
}

function monthKeyFromDate(v, today) {
  const d = parseSheetDate(v);
  if (d) return `${d.year}-${String(d.month).padStart(2, "0")}`;
  const m = str(v).match(/^(\d{1,2})\s*[/月.\-]\s*(\d{1,2})/); // 年が無い「10/24」は今日から見て直近の年
  if (!m) return null;
  const month = Number(m[1]);
  if (month < 1 || month > 12) return null;
  const year = month > today.getMonth() + 2 ? today.getFullYear() - 1 : today.getFullYear();
  return `${year}-${String(month).padStart(2, "0")}`;
}

// rows: 1つのタブの2次元配列 → 評価用紙の配列
export function parseCareForms(rows, today = new Date()) {
  const forms = [];
  if (!rows) return forms;
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r] || [];
    const col = row.findIndex((v) => str(v) === "評価日");
    if (col < 0) continue;
    const form = { date: valueRightOf(row, col), clinic: "", staff: "", evaluator: "", ok: 0, ng: 0, na: 0, items: [] };
    // ヘッダー（評価日の行と次の数行）から 所属院・対象スタッフ・評価者
    for (let h = r; h < Math.min(rows.length, r + 4); h++) {
      const hr = rows[h] || [];
      hr.forEach((v, c) => {
        const k = str(v);
        if (k === "所属院") form.clinic = str(valueRightOf(hr, c));
        else if (k === "対象スタッフ") form.staff = str(valueRightOf(hr, c));
        else if (k === "評価者") form.evaluator = str(valueRightOf(hr, c));
      });
    }
    // 評価欄の列（見出しに「評価（」を含む列）と項目
    let h = r + 1, evalCol = -1, itemCol = -1;
    for (; h < Math.min(rows.length, r + 8); h++) {
      const hr = rows[h] || [];
      evalCol = hr.findIndex((v) => /^評価[（(]/.test(str(v)));
      if (evalCol >= 0) { itemCol = hr.findIndex((v) => str(v) === "評価項目"); break; }
    }
    if (evalCol < 0) continue;
    for (let i = h + 1; i < rows.length; i++) {
      const ir = rows[i] || [];
      const label = str(ir[itemCol >= 0 ? itemCol : evalCol - 1]);
      if (!label || /^(○の数|実施率|判定基準|運用上の注意)/.test(str(ir[0])) || ir.some((v) => str(v) === "評価日")) break;
      const mark = str(ir[evalCol]).replace(/\s/g, "");
      const result = OK.test(mark) ? "ok" : NG.test(mark) ? "ng" : mark ? "na" : null; // 空欄＝未記入（数えない）
      if (result) form[result]++;
      form.items.push({ label, result });
    }
    forms.push(form);
    r = h;
  }
  return forms.map((f) => ({ ...f, month: monthKeyFromDate(f.date, today), rate: f.ok + f.ng ? Math.round((f.ok / (f.ok + f.ng)) * 1000) / 10 : null }));
}

// sheets: { タブ名: 2次元配列 } → { byPerson: Map(key → {月: {count, ok, ng, rate}}), byClinic: 同じ, unmatched, forms }
export function parsePatientCare(sheets, people, today = new Date()) {
  const match = makeStaffMatcher(people);
  const byPerson = new Map(), byClinic = new Map(), unmatched = new Set();
  let forms = 0;
  const add = (map, key, month, f) => {
    if (!map.has(key)) map.set(key, {});
    const m = map.get(key);
    const s = m[month] || (m[month] = { count: 0, ok: 0, ng: 0, rateSum: 0 });
    s.count++; s.ok += f.ok; s.ng += f.ng; s.rateSum += f.rate;
    s.rate = Math.round((s.rateSum / s.count) * 10) / 10; // 1回ごとの実施率の平均
  };
  for (const [tab, rows] of Object.entries(sheets)) {
    for (const f of parseCareForms(rows, today)) {
      if (!f.staff || !f.month || f.rate === null) continue; // 書きかけ（スタッフ・日付・○×が無い）は数えない
      const p = match(f.staff) || match(tab);
      if (!p) { unmatched.add(f.staff); continue; }
      forms++;
      add(byPerson, p.key, f.month, f);
      const clinic = f.clinic ? canonClinic(f.clinic) : p.clinics[0];
      if (clinic) add(byClinic, clinic, f.month, f);
    }
  }
  return { byPerson, byClinic, unmatched: [...unmatched], forms };
}

export function careMetrics(stat) {
  return stat ? { patient_care: stat.rate, patient_care_count: stat.count } : {};
}

