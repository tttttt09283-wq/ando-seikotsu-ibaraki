// 総合評価（総評）
// 半期査定（台帳の総合評価点・100点）＋ 月次評価の半期平均（100点）＝ 200点満点
// 合計点で ランク・給与（昇給／現状維持／降給）・役職（昇格対象／現状維持／降格対象）を決める
import { normName } from "./incentive-calc.js";

export const OVERALL_MAX = 200;
export const REVIEW_SHEET = "総評";
export const REVIEW_HEADER = ["半期", "氏名key", "氏名", "半期査定点", "月次平均点", "総合点", "ランク", "給与判定", "改定額", "役職判定", "総評コメント", "評価者", "更新日時"];
export const OVERALL_RULE_SHEET = "総評基準";
export const OVERALL_RULE_HEADER = ["ランク", "下限点（200点中）", "給与判定", "改定額（月額）", "役職判定"];
export const SALARY_CHOICES = ["昇給", "現状維持", "降給"];
export const POSITION_CHOICES = ["昇格対象", "現状維持", "降格対象"];

// 台帳の「キャリアラダー＆昇降格規定」の判定表（S90・A80・B65・C50）を200点に置き換えた初期値
export const DEFAULT_OVERALL_RULES = [
  { rank: "S", min: 180, salary: "昇給", raise: 15000, position: "昇格対象" },
  { rank: "A", min: 160, salary: "昇給", raise: 7500, position: "昇格対象" },
  { rank: "B", min: 130, salary: "現状維持", raise: 0, position: "現状維持" },
  { rank: "C", min: 100, salary: "現状維持", raise: 0, position: "現状維持" },
  { rank: "D", min: 0, salary: "降給", raise: 0, position: "降格対象" },
];

const num = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(/[,，円¥\s]/g, ""));
  return Number.isFinite(n) ? n : null;
};
const r1 = (v) => Math.round(v * 10) / 10;

export function parseOverallRules(rows) {
  if (!rows || rows.length < 2) return DEFAULT_OVERALL_RULES;
  const out = [];
  for (const r of rows.slice(1)) {
    const rank = String((r && r[0]) ?? "").trim();
    const min = num(r && r[1]);
    if (!rank || min === null) continue;
    out.push({
      rank, min,
      salary: SALARY_CHOICES.includes(String(r[2] ?? "").trim()) ? String(r[2]).trim() : "現状維持",
      raise: num(r[3]) ?? 0,
      position: POSITION_CHOICES.includes(String(r[4] ?? "").trim()) ? String(r[4]).trim() : "現状維持",
    });
  }
  return out.length ? out.sort((a, b) => b.min - a.min) : DEFAULT_OVERALL_RULES;
}

export function overallRuleRows(rules) {
  return [OVERALL_RULE_HEADER, ...rules.map((r) => [r.rank, r.min, r.salary, r.raise, r.position])];
}

export function validateOverallRules(raw) {
  if (!Array.isArray(raw) || !raw.length) throw new Error("基準が空です");
  const rules = raw.map((r, i) => {
    const rank = String(r.rank ?? "").trim().slice(0, 10);
    const min = num(r.min), raise = num(r.raise) ?? 0;
    if (!rank) throw new Error(`${i + 1}行目のランク名を入れてください`);
    if (min === null || min < 0 || min > OVERALL_MAX) throw new Error(`「${rank}」の下限点は0〜${OVERALL_MAX}で入れてください`);
    if (!SALARY_CHOICES.includes(r.salary)) throw new Error(`「${rank}」の給与判定を選んでください`);
    if (!POSITION_CHOICES.includes(r.position)) throw new Error(`「${rank}」の役職判定を選んでください`);
    return { rank, min, salary: r.salary, raise, position: r.position };
  }).sort((a, b) => b.min - a.min);
  if (new Set(rules.map((r) => r.rank)).size !== rules.length) throw new Error("同じランク名が2つあります");
  if (rules[rules.length - 1].min !== 0) throw new Error("一番下のランクの下限点は0にしてください");
  return rules;
}

export function ruleFor(rules, total) {
  return rules.find((r) => total >= r.min) || rules[rules.length - 1];
}

// 半期の識別子（1〜6月＝H1、7〜12月＝H2）
export function halfIdOf(monthKey) {
  const [y, m] = String(monthKey).split("-").map(Number);
  return `${y}-${m >= 7 ? "H2" : "H1"}`;
}
export function halfLabel(halfId) {
  const [y, h] = halfId.split("-");
  return `${y}年${h === "H1" ? "1〜6月" : "7〜12月"}`;
}

// 台帳の半期査定点（兼務で院ごとに行がある人は平均）
export function assessmentScore(person) {
  const scores = (person.evaluations || []).map((e) => e.score).filter((v) => v !== null && v !== undefined);
  return scores.length ? r1(scores.reduce((a, v) => a + v, 0) / scores.length) : null;
}

// assessment: 半期査定点(100点)、monthly: 月次評価の半期平均(100点、イベント加点込みでも100が上限)
export function computeOverall({ assessment, monthly, monthlyCount = 0, rules = DEFAULT_OVERALL_RULES }) {
  const a = assessment === null || assessment === undefined ? null : Math.min(100, Math.max(0, assessment));
  const m = monthly === null || monthly === undefined ? null : Math.min(100, Math.max(0, monthly));
  const complete = a !== null && m !== null;
  const out = { assessment: a, monthly: m, monthlyCount, max: OVERALL_MAX, complete, provisional: false, total: null, rank: null, salary: null, raise: null, position: null };
  if (a === null && m === null) return out;
  let total;
  if (complete) total = a + m;
  else { total = (a ?? m) * 2; out.provisional = true; } // 片方しか無いときは仮判定（ある方を2倍）
  out.total = r1(total);
  const rule = ruleFor(rules, out.total);
  Object.assign(out, { rank: rule.rank, salary: rule.salary, raise: rule.raise, position: rule.position });
  return out;
}

export function parseReviews(rows) {
  const map = new Map();
  if (!rows) return map;
  rows.slice(1).forEach((r, i) => {
    const half = String((r && r[0]) ?? "").trim(), key = normName((r && r[1]) ?? "");
    if (!half || !key) return;
    map.set(`${half}|${key}`, {
      row: i + 2, half, key,
      assessment: num(r[3]), monthly: num(r[4]), total: num(r[5]), rank: r[6] || "",
      salary: r[7] || "", raise: num(r[8]), position: r[9] || "", comment: r[10] || "", evaluator: r[11] || "", updatedAt: r[12] || "",
    });
  });
  return map;
}
