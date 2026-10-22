// 全社イベント（台帳の「イベント」シート・参加者1人1行）
//
//   加点   … その月の月次評価の合計点に足す点
//   報酬額 … インセンティブと同じく人件費（社保込み）の42%枠に含める
//
// 登録・削除は社長・GMが月次評価の「全社イベント」画面から行う。

import { normName, SOCIAL_INSURANCE_RATE } from "./incentive-calc.js";
import { makeStaffMatcher } from "./new-patients.js";

export const EVENT_SHEET = "イベント";
export const EVENT_HEADER = ["日付", "イベント名", "氏名", "結果", "加点", "報酬額", "メモ", "登録者", "更新日時"];
export const MAX_EVENT_BONUS = 20;

const num = (v) => {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(/[¥,円点\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

// "2026-11-03" / "2026/11/3" / シリアル値 → "2026-11-03"
export function normDate(v) {
  if (typeof v === "number" && v > 30000 && v < 80000) {
    return new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000).toISOString().slice(0, 10);
  }
  const m = String(v ?? "").match(/(\d{4})\s*[/\-年.]\s*(\d{1,2})\s*[/\-月.]\s*(\d{1,2})/);
  return m ? `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}` : "";
}

export function parseEvents(rows, people) {
  const list = [];
  if (!rows || rows.length < 2) return list;
  const head = rows[0].map(normName);
  const c = Object.fromEntries(EVENT_HEADER.map((h) => [h, head.indexOf(normName(h))]));
  const match = makeStaffMatcher(people || []);
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i] || [];
    const date = normDate(r[c["日付"]]);
    const name = String(r[c["イベント名"]] ?? "").trim();
    const personName = String(r[c["氏名"]] ?? "").trim();
    if (!date || !name || !personName) continue;
    const p = match(personName);
    list.push({
      row: i + 1, date, month: date.slice(0, 7), name, personName: p ? p.name : personName, key: p ? p.key : null,
      result: String(r[c["結果"]] ?? ""), bonus: Math.max(0, Math.min(MAX_EVENT_BONUS, num(r[c["加点"]]))), reward: Math.max(0, num(r[c["報酬額"]])),
      memo: String(r[c["メモ"]] ?? ""),
    });
  }
  return list;
}

// 人・月ごとのイベント加点の合計
export function eventBonusMap(events) {
  const map = new Map(); // "YYYY-MM|key" → 加点
  for (const e of events) if (e.key && e.bonus) map.set(`${e.month}|${e.key}`, (map.get(`${e.month}|${e.key}`) || 0) + e.bonus);
  return map;
}

// イベントでまとめる（日付＋名前）
export function groupEvents(events) {
  const groups = new Map();
  for (const e of events) {
    const k = `${e.date}|${e.name}`;
    if (!groups.has(k)) groups.set(k, { date: e.date, name: e.name, memo: e.memo, entries: [] });
    groups.get(k).entries.push({ key: e.key, name: e.personName, result: e.result, bonus: e.bonus, reward: e.reward });
  }
  return [...groups.values()].sort((a, b) => b.date.localeCompare(a.date));
}

// インセンティブ画面のデータに、イベント報酬を足す（本人のインセンティブ欄と、全社の42%枠）
export function attachEventsToModel(model, events) {
  const fy = model.fiscalYear;
  const halfOf = (month) => {
    const [y, m] = month.split("-").map(Number);
    const efy = m >= 7 ? y : y - 1;
    if (efy !== fy) return null; // 今年度のイベントだけ
    return m >= 7 ? "H1" : "H2";
  };
  const rewardByHalf = { H1: 0, H2: 0 };
  for (const e of events) {
    const half = halfOf(e.month);
    if (!half || !e.reward) continue;
    rewardByHalf[half] += e.reward;
    const p = e.key && model.people.find((x) => x.key === e.key);
    if (p) {
      p.incentives.push({
        type: "event", half, name: e.name, date: e.date, result: e.result,
        earned: e.reward, projected: e.reward, max: e.reward, status: "確定",
        detail: `${e.date.slice(5).replace("-", "/")} ${e.name}${e.result ? `：${e.result}` : ""}`,
      });
    }
  }
  for (const c of model.company || []) {
    const add = rewardByHalf[c.key] || 0;
    c.eventRewards = add;
    if (!add) continue;
    c.incentivePaid += add;
    c.incentiveCost = c.incentivePaid * (1 + SOCIAL_INSURANCE_RATE);
    c.payableRatio = c.incentiveCost > 0 ? Math.max(0, Math.min(1, c.roomProjected / c.incentiveCost)) : null;
    const scale = c.monthsElapsed ? 6 / c.monthsElapsed : 0;
    c.laborRateWithIncentive = c.sales && c.monthsElapsed ? (c.labor + c.incentiveCost / scale) / c.sales : null;
  }
  return model;
}
