// キャリアの2コース（マネジメント／スペシャリスト）と個人KDI・コース別給与
//
// ・G1新人・G2一般は共通。G3（副院長）から「マネジメント」と「スペシャリスト（プレイヤー主義）」に分かれる
//     マネジメント：G3 副院長 → G4 院長 → G5 BM → G6 GM
//     スペシャリスト  ：S1 シニア（G3相当）→ S2 エキスパート（G4相当）→ S3 マスター（G5相当。GM相当は無し）
//   台帳の等級（G3〜G6）は「段（レベル）」として使い、スペシャリストの人はその段の S の評価項目で評価する
// ・給与は 基本給・資格手当・固定残業代 は同じ段なら同じ。マネジメントは「役職手当」、スペシャリストは「技術手当」（役職手当より少ない）
// ・個人KDI（行動の目標）：コースごとの標準KDIを、上司が人ごとに足したり目標を変えたりできる。達成率で採点する
import { normName } from "./incentive-calc.js";

export const TRACKS = { management: "マネジメント", special: "スペシャリスト" };
export const TRACK_LEVELS = ["G3", "G4", "G5", "G6"]; // コースを選べる段
export const SPECIAL_GRADE_OF = { G3: "S1", G4: "S2", G5: "S3", G6: "S3" };
export const SPECIAL_LEVEL_OF = { S1: "G3", S2: "G4", S3: "G5" };
export const SPECIAL_LABELS = { S1: "S1 シニア施術者（副院長相当）", S2: "S2 エキスパート（院長相当）", S3: "S3 マスター（BM相当）" };

export const isSpecialGrade = (g) => /^S\d$/.test(String(g || ""));
// コース込みの評価クラス（台帳の段 G3 ＋ スペシャリスト → S1）
export function trackGradeFor(level, track) {
  return track === "special" && SPECIAL_GRADE_OF[level] ? SPECIAL_GRADE_OF[level] : level;
}
export const canChooseTrack = (level) => TRACK_LEVELS.includes(level);

// ===== コースの記録（「キャリアコース」シート） =====
export const TRACK_SHEET = "キャリアコース";
export const TRACK_HEADER = ["氏名key", "氏名", "コース", "更新者", "更新日時"];
export function parseTracks(rows) {
  const map = new Map();
  (rows || []).slice(1).forEach((r, i) => {
    const key = normName((r && r[0]) || (r && r[1]) || "");
    if (!key) return;
    const v = String((r && r[2]) ?? "").trim();
    map.set(key, { row: i + 2, track: v === TRACKS.special || v === "スペシャル" || v === "special" ? "special" : "management", by: String(r[3] ?? ""), at: String(r[4] ?? "") });
  });
  return map;
}

// ===== 個人KDI =====
export const KDI_SHEET = "個人KDI";
// マンダラ：紐づけたマンダラのマス（「院名#マス」「会社#マス」。マンダラの画面で設定）
export const KDI_HEADER = ["氏名key", "氏名", "項目ID", "項目名", "目標", "単位", "向き", "更新者", "更新日時", "マンダラ"];
const K = (id, label, target, unit, note = "", direction = "以上", mandala = "") => ({ kind: "KDI", id, label, points: 0, target, unit, direction, auto: "", required: false, note, mandala });
// コースごとの標準KDI（その人の個人KDIが無ければこれを使う）
export const DEFAULT_KDI = {
  common: [
    K("kdi_next_plan", "施術後の通院計画の説明", 40, "件", "症状と頻度を結びつけて次回の来院時期を説明した件数"),
    K("kdi_review_ask", "口コミのお願い", 10, "件", "満足度の高い方に口コミをお願いした件数"),
    K("kdi_practice", "技術練習", 8, "時間", "院内・自主練習の合計時間"),
  ],
  management: [
    K("kdi_one_on_one", "部下との面談", 2, "回", "1対1の面談（目標・課題の振り返り）"),
    K("kdi_meeting", "ミーティング・朝礼での数値共有", 4, "回", "売上・予約・継続率などの数字をチームに共有した回数"),
    K("kdi_teaching", "技術・接遇の指導", 4, "回", "部下への実技指導・ロールプレイの回数"),
    K("kdi_plan_check", "予実の確認と対策", 4, "回", "予算と実績を確認し、対策を決めた回数（週1目安）"),
  ],
  special: [
    K("kdi_next_plan", "施術後の通院計画の説明", 60, "件", "症状と頻度を結びつけて次回の来院時期を説明した件数"),
    K("kdi_self_pay", "自費メニューの提案", 30, "件", "症状に合わせて自費メニューを提案した件数"),
    K("kdi_study", "技術研鑽（練習・研修・勉強会）", 10, "時間", "練習・外部研修・勉強会の合計時間"),
    K("kdi_review_ask", "口コミのお願い", 15, "件", "満足度の高い方に口コミをお願いした件数"),
  ],
};
export function kdiGroupOf(grade) {
  if (isSpecialGrade(grade)) return "special";
  if (TRACK_LEVELS.includes(grade)) return "management";
  return "common";
}
export function parseKdi(rows) {
  const map = new Map(); // personKey → [KDI項目]
  (rows || []).slice(1).forEach((r) => {
    const key = normName((r && r[0]) || "");
    const id = String((r && r[2]) ?? "").trim();
    const label = String((r && r[3]) ?? "").trim();
    const target = Number(String((r && r[4]) ?? "").replace(/[,%円¥\s]/g, ""));
    if (!key || !id || !label || !(target > 0)) return;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(K(id, label, target, String(r[5] ?? "").trim(), "", String(r[6] ?? "").trim() === "以下" ? "以下" : "以上", String(r[9] ?? "").trim()));
  });
  return map;
}
// その人のKDI（個人で設定していれば個人のもの、無ければコースの標準）
export function kdiFor(personalMap, personKey, grade) {
  const own = personalMap && personalMap.get(personKey);
  if (own && own.length) return { items: own.map((k) => ({ ...k })), personal: true };
  return { items: DEFAULT_KDI[kdiGroupOf(grade)].map((k) => ({ ...k })), personal: false };
}
export function validateKdi(list) {
  if (!Array.isArray(list)) throw new Error("KDIが正しくありません");
  if (list.length > 10) throw new Error("KDIは10個までです");
  const ids = new Set();
  return list.map((raw, i) => {
    const label = String(raw.label ?? "").trim().slice(0, 40);
    if (!label) throw new Error(`${i + 1}番目のKDIの名前が空です`);
    const target = Number(String(raw.target ?? "").replace(/[,%円¥\s]/g, ""));
    if (!Number.isFinite(target) || target <= 0) throw new Error(`「${label}」の目標を入れてください`);
    let id = String(raw.id ?? "").trim().replace(/[^\w-]/g, "");
    if (!id || ids.has(id) || !id.startsWith("kdi_")) id = `kdi_${Date.now().toString(36)}_${i}`;
    ids.add(id);
    const mandala = /^[^#]{1,20}#[0-8]$/.test(String(raw.mandala ?? "")) ? String(raw.mandala) : "";
    return K(id, label, target, String(raw.unit ?? "").trim().slice(0, 6), "", raw.direction === "以下" ? "以下" : "以上", mandala);
  });
}

// ===== コース別給与（「コース別給与」シート。無ければ台帳のキャリアラダーの給与から作る） =====
export const PAY_SHEET = "コース別給与";
export const PAY_HEADER = ["段", "基本給", "資格手当", "固定残業代", "マネジメント手当（役職手当）", "スペシャリスト手当（技術手当）"];
export const SPECIAL_ALLOWANCE_RATE = 0.5; // 初期値：スペシャリストの技術手当＝役職手当の半分
const LADDER_FALLBACK = {
  G3: { base: 210000, license: 30000, overtime: 40000, mgmt: 30000 },
  G4: { base: 230000, license: 30000, overtime: 30000, mgmt: 60000 },
  G5: { base: 270000, license: 0, overtime: 50000, mgmt: 80000 },
  G6: { base: 300000, license: 0, overtime: 50000, mgmt: 100000 },
};
const num = (v) => { const n = Number(String(v ?? "").replace(/[,円¥\s]/g, "")); return Number.isFinite(n) ? n : 0; };
// 台帳「キャリアラダー＆昇降格規定」の給与の表（等級・基本給・役職手当・資格手当・固定残業代）を読む
export function payFromLadderRows(rows) {
  const out = {};
  let col = null;
  for (const row of rows || []) {
    const cells = (row || []).map((v) => String(v ?? "").trim());
    if (!col) {
      const n = cells.map(normName);
      const i = (s) => n.findIndex((h) => h.startsWith(s));
      if (i("等級") >= 0 && i("基本給") >= 0 && i("役職手当") >= 0) col = { g: i("等級"), base: i("基本給"), mgmt: i("役職手当"), license: i("資格手当"), overtime: i("固定残業代") };
      continue;
    }
    const g = cells[col.g];
    if (!/^(G\d|-[A-Z])$/.test(g)) { if (Object.keys(out).length) break; continue; }
    if (TRACK_LEVELS.includes(g)) out[g] = { base: num(row[col.base]), mgmt: num(row[col.mgmt]), license: col.license >= 0 ? num(row[col.license]) : 0, overtime: col.overtime >= 0 ? num(row[col.overtime]) : 0 };
  }
  return out;
}
export function defaultPayTable(ladderRows) {
  const fromLadder = payFromLadderRows(ladderRows);
  return Object.fromEntries(TRACK_LEVELS.map((g) => {
    const v = { ...LADDER_FALLBACK[g], ...(fromLadder[g] || {}) };
    return [g, { ...v, special: g === "G6" ? null : Math.round((v.mgmt * SPECIAL_ALLOWANCE_RATE) / 1000) * 1000 }];
  }));
}
export function parsePayTable(rows, ladderRows) {
  const table = defaultPayTable(ladderRows);
  (rows || []).slice(1).forEach((r) => {
    const g = String((r && r[0]) ?? "").trim();
    if (!table[g]) return;
    table[g] = { base: num(r[1]), license: num(r[2]), overtime: num(r[3]), mgmt: num(r[4]), special: g === "G6" ? null : num(r[5]) };
  });
  return table;
}
export function payRows(table) {
  return [PAY_HEADER, ...TRACK_LEVELS.map((g) => [g, table[g].base, table[g].license, table[g].overtime, table[g].mgmt, table[g].special ?? ""])];
}
export function validatePayTable(raw) {
  const out = {};
  for (const g of TRACK_LEVELS) {
    const r = (raw && raw[g]) || {};
    const v = (k, label) => { const n = Number(String(r[k] ?? "").replace(/[,円¥\s]/g, "")); if (!Number.isFinite(n) || n < 0 || n > 2000000) throw new Error(`${g}の${label}を正しく入れてください`); return n; };
    out[g] = { base: v("base", "基本給"), license: v("license", "資格手当"), overtime: v("overtime", "固定残業代"), mgmt: v("mgmt", "役職手当"), special: g === "G6" ? null : v("special", "技術手当") };
    if (out[g].special !== null && out[g].special > out[g].mgmt) throw new Error(`${g}：スペシャリストの技術手当は、マネジメントの役職手当以下にしてください（マネジメント＞スペシャリスト）`);
  }
  return out;
}
// 段・コースの月の固定給
export function monthlyPay(table, level, track) {
  const t = table[level];
  if (!t) return null;
  const allowance = track === "special" ? t.special : t.mgmt;
  if (allowance === null || allowance === undefined) return null;
  return { base: t.base, license: t.license, overtime: t.overtime, allowance, total: t.base + t.license + t.overtime + allowance };
}
