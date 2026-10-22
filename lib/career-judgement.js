// 昇格・降格の判定と、その理由（キャリアラダー＆昇降格規定を、データで確認できる形にしたもの）
//
//   昇格：次のクラスの「昇格要件」（その行の数値KPI・技術・行動）＋ 半期評価がA以上
//   降格：今のクラスの「降格・役職解任トリガー」＋ 月次評価のD・C
// 数値で確認できる条件は自動で判定し（達成／未達／該当／注意）、技術・行動など数字で測れない条件は「上司が確認」として文章で並べる。
// 判定の文言はシート「キャリアラダー＆昇降格規定」から読み込む（無ければ下の既定の文言）。

import { normName, FISCAL_MONTHS } from "./incentive-calc.js";
import { newPatientMetrics } from "./new-patients.js";

export const LADDER_SHEET = "キャリアラダー＆昇降格規定";
const NEXT = { G1: "G2", G2: "G3", G3: "G4", G4: "G5", G5: "G6" };

const DEFAULT_LADDER = {
  G6: { role: "GM", kpi: "全社営業利益達成率95%以上（年間）", skill: "全社技術開発・標準化・新業態設計", behavior: "次期BM/院長を年2名育成・出店戦略遂行", demotion: "全社営業利益が2期連続80%未満" },
  G5: { role: "BM", kpi: "管轄3〜4院の合計営業利益達成率100%", skill: "全社技術審査員・難治症状指導", behavior: "エリア離職率10%以下・採用面接・予実管理指導", demotion: "管轄エリア人件費率が半年以上45%超過" },
  G4: { role: "院長", kpi: "自院の人件費比率42%以下維持（月商330万〜）／新規成約率70%以上かつ新規売上20万円以上", skill: "院内全手技チェック合格・問診指導力", behavior: "店舗PL管理・シフト管理・クレーム一次完結・部下育成", demotion: "人件費率45%超過が3ヶ月連続 または 売上予算達成率80%未満が3ヶ月連続" },
  G3: { role: "副院長 / チーフ", kpi: "個人売上100万円以上を3ヶ月連続達成／新規成約率70%以上かつ新規売上15万円以上", skill: "自費フルメニュー施術可・問診成約率80%以上", behavior: "院長不在時の代行業務・新人1名の実技メンター", demotion: "個人売上65万円未満が3ヶ月連続" },
  G2: { role: "一般スタッフ", kpi: "個人売上70万円以上・次回予約率75%以上／新規成約率60%以上（月間新規対応数5名以上）", skill: "基本手技の単独完結・自費提案の定着", behavior: "報連相徹底・院内美化・口コミ獲得推進", demotion: "次回予約率60%未満の継続（改善指導対象）" },
  G1: { role: "新人", kpi: "施術枠内時間遵守率90%以上／新規成約率50%以上（月間新規対応数3名以上）", skill: "入社時研修修了・社内実技チェック合格", behavior: "挨拶・身だしなみ・時間厳守・無遅刻無欠勤", demotion: "指導に対する継続的不服従・度重なる勤怠不良" },
  "-S": { role: "短時間正社員", kpi: "担当枠充足率80%以上・次回予約率70%以上", skill: "G2同等の手技維持", behavior: "限られた時間内での標準業務完結・チーム連携", demotion: "著しい稼働枠の低下・無断欠勤" },
  "-R": { role: "受付・事務スタッフ", kpi: "次回予約誘導率・物販成約数・口コミ獲得数", skill: "レセプト点検・予約システム操作・日計表入力", behavior: "明るい電話/対面接遇・待合室美化・カルテ管理", demotion: "カルテ・レセプト請求不備の頻発" },
};

// シートの表（等級・役職・…・昇格要件3列・降格トリガー）→ { 等級: {role, kpi, skill, behavior, demotion} }
export function parseLadder(rows) {
  const out = { ...DEFAULT_LADDER };
  if (!rows) return out;
  let col = null, parsed = 0;
  for (const row of rows) {
    const cells = (row || []).map((v) => String(v ?? ""));
    if (!col) {
      const n = cells.map(normName);
      const i = (s) => n.findIndex((h) => h.startsWith(s));
      if (i("等級") >= 0 && i("昇格要件（数値") >= 0) col = { grade: i("等級"), role: i("役職"), kpi: i("昇格要件（数値"), skill: i("昇格要件（技術"), behavior: i("昇格要件（行動"), demotion: i("降格") };
      continue;
    }
    const g = String(cells[col.grade] ?? "").trim();
    if (!/^(G\d|-[A-Z])$/.test(g)) { if (parsed) break; continue; } // 最初の表が終わったら終了（下の給与レンジ表は読まない）
    parsed++;
    const t = (k) => (col[k] >= 0 ? String(cells[col[k]] ?? "").replace(/\s*\n\s*/g, "／").trim() : "");
    out[g] = { role: t("role").replace(/（★新設）/, ""), kpi: t("kpi"), skill: t("skill"), behavior: t("behavior"), demotion: t("demotion") };
  }
  return out;
}

const man = (v) => (Math.abs(v) < 10000 ? `${Math.round(v).toLocaleString("ja-JP")}円` : `${(Math.round(v / 1000) / 10).toLocaleString("ja-JP")}万円`);
const pct = (v) => `${Math.round(v * 10) / 10}%`;

// 月番号（年度内）→ "YYYY-MM"
const keyOf = (fy, m) => `${m >= 7 ? fy : fy + 1}-${String(m).padStart(2, "0")}`;

// 末尾から条件を満たし続けている月数
function streak(series, pred) {
  let n = 0;
  for (let i = series.length - 1; i >= 0; i--) { if (pred(series[i].v)) n++; else break; }
  return n;
}

// ===== 判定 =====
// ctx: { model, np, records(Map "月|key" → rec), monthKey, halfKeys, ladder, canSeeLabor }
export function judgeCareer(person, ctx) {
  const { model, np, records, monthKey, halfKeys, ladder } = ctx;
  const grade = person.grade;
  const latest = model.latestMonth;
  const fy = model.fiscalYear;
  const months = latest ? FISCAL_MONTHS.slice(0, FISCAL_MONTHS.indexOf(latest) + 1) : [];

  // 個人売上（今年度・月ごと）
  const salesSeries = (person.monthlySales || []).filter((m) => m.total !== null).map((m) => ({ k: keyOf(fy, m.month), v: m.total }));
  const lastSales = salesSeries.length ? salesSeries[salesSeries.length - 1] : null;

  // 新患（月ごと。新患がいた月だけ。新規集客シートは日付つきなので評価する月まで使う）
  const npOf = (k) => newPatientMetrics(np && np.byPerson && np.byPerson.get(person.key) && np.byPerson.get(person.key)[k]);
  const npSeries = FISCAL_MONTHS.map((m) => keyOf(fy, m)).filter((k) => k <= monthKey).map((k) => ({ k, ...npOf(k) })).filter((x) => x.new_count > 0);
  const lastOf = (field) => [...npSeries].reverse().find((x) => x[field] !== undefined) || null;
  const lastNp = lastOf("new_close"); // 成約率を記入している最新の月
  const lastCont = lastOf("new_continue");

  // 院・ブロック（予算達成率・人件費率。人件費率は固定人件費÷月の売上）
  const clinicsOf = (names) => model.clinics.filter((c) => names.includes(c.name));
  const clinicSeries = (cs) => months.map((m) => {
    const mm = cs.map((c) => c.months.find((x) => x.month === m) || {});
    const actual = mm.reduce((a, x) => a + (x.actual || 0), 0);
    const budget = mm.reduce((a, x) => a + (x.actual != null ? x.budget || 0 : 0), 0);
    const fixed = cs.every((c) => c.fixedLabor != null) ? cs.reduce((a, c) => a + c.fixedLabor, 0) : null;
    return { k: keyOf(fy, m), actual, rate: budget ? (actual / budget) * 100 : null, labor: fixed !== null && actual ? (fixed / actual) * 100 : null };
  }).filter((x) => x.actual > 0);
  const ownClinic = clinicSeries(clinicsOf(person.clinics.slice(0, 1)));
  const blockClinics = (model.blocks || []).filter((b) => b.personKey === person.key).flatMap((b) => b.clinics);
  const block = blockClinics.length ? clinicSeries(clinicsOf(blockClinics)) : [];

  // 月次評価（保存済みの合計点・ランク・行動の点）
  const recOf = (k) => records && records.get(`${k}|${person.key}`);
  const evalMonths = [...new Set([...halfKeys, monthKey])].sort().filter((k) => k <= monthKey);
  const evals = evalMonths.map((k) => ({ k, rec: recOf(k) })).filter((x) => x.rec && x.rec.storedTotal != null);
  const lastEval = evals.length ? evals[evals.length - 1] : null;
  const halfDone = evals.filter((e) => halfKeys.includes(e.k));
  const halfAvg = halfDone.length ? halfDone.reduce((a, e) => a + e.rec.storedTotal, 0) / halfDone.length : null;

  const check = (label, status, detail, extra = {}) => ({ label, status, detail, ...extra });
  const monthName = (k) => `${Number(k.split("-")[1])}月`;

  // ---- 昇格条件（次のクラス） ----
  const to = NEXT[grade];
  const promo = [];
  if (to) {
    const L = ladder[to] || {};
    const salesAtLeast = (yen) => lastSales
      ? check(`個人売上${man(yen)}以上`, lastSales.v >= yen ? "ok" : "ng", `${monthName(lastSales.k)} ${man(lastSales.v)}`)
      : check(`個人売上${man(yen)}以上`, "unknown", "売上データなし");
    const newPatients = (closeMin, countMin, salesMin) => {
      const label = `初回成約率${closeMin}%以上` + (countMin ? `（新患${countMin}名以上）` : "") + (salesMin ? `かつ初回売上${man(salesMin)}以上` : "");
      if (!lastNp) return check(label, "unknown", "自費加入の記入がある月がありません");
      const ok = lastNp.new_close >= closeMin && (!countMin || lastNp.new_count >= countMin) && (!salesMin || lastNp.new_sales >= salesMin);
      return check(label, ok ? "ok" : "ng", `${monthName(lastNp.k)} 成約率${pct(lastNp.new_close)}・新患${lastNp.new_count}名・初回売上${man(lastNp.new_sales)}`);
    };
    const continueAtLeast = (min) => (lastCont
      ? check(`継続率（次回予約）${min}%以上`, lastCont.new_continue >= min ? "ok" : "ng", `${monthName(lastCont.k)} ${pct(lastCont.new_continue)}`)
      : check(`継続率（次回予約）${min}%以上`, "unknown", "通院の記入がある月がありません"));
    if (to === "G2") promo.push(salesAtLeast(700000), continueAtLeast(75), newPatients(60, 5, 0));
    if (to === "G3") {
      const n = streak(salesSeries, (v) => v >= 1000000);
      promo.push(check("個人売上100万円以上を3ヶ月連続", n >= 3 ? "ok" : "ng", `いま${n}ヶ月連続`), newPatients(70, 0, 150000));
    }
    if (to === "G4") {
      const last = ownClinic[ownClinic.length - 1];
      promo.push(last && last.labor !== null
        ? check("自院の人件費率42%以下（月商330万円以上）", last.labor <= 42 && last.actual >= 3300000 ? "ok" : "ng", `${monthName(last.k)} 人件費率${pct(last.labor)}・月商${man(last.actual)}`, { sensitive: true })
        : check("自院の人件費率42%以下（月商330万円以上）", "unknown", "データなし", { sensitive: true }));
      promo.push(newPatients(70, 0, 200000));
      const pc = lastEval && lastEval.rec.scores.pc;
      promo.push(check("PC業務（院長は必須）", pc ? (pc >= 3 ? "ok" : "ng") : "unknown", pc ? `${monthName(lastEval.k)}の評価 ${pc}/5` : "月次評価なし"));
    }
    if (to === "G5" || to === "G6") promo.push(check(L.kpi || "営業利益の達成", "unknown", "営業利益のデータがまだ無いため、社長・GMが確認"));
    promo.push(halfAvg !== null
      ? check("半期の評価率がA以上（80%以上）", halfAvg >= 80 ? "ok" : "ng", `半期平均 ${Math.round(halfAvg * 10) / 10}%（${halfDone.length}ヶ月分）`)
      : check("半期の評価率がA以上（80%以上）", "unknown", "今期の月次評価がまだありません"));
    if (L.skill) promo.push(check(`技術：${L.skill}`, "manual", "上司が確認"));
    if (L.behavior) promo.push(check(`行動：${L.behavior}`, "manual", "上司が確認"));
  }

  // ---- 降格・改善指導の条件（今のクラス） ----
  const down = [];
  const consec = (label, series, pred, need, fmt, extra) => {
    if (!series.length) return check(label, "unknown", "データなし", extra);
    const n = streak(series, pred);
    const last = series[series.length - 1];
    return check(label, n >= need ? "hit" : n > 0 ? "warn" : "ok", n ? `いま${n}ヶ月連続（${monthName(last.k)} ${fmt(last)}）` : `${monthName(last.k)} ${fmt(last)}`, extra);
  };
  if (grade === "G3") down.push(consec("個人売上65万円未満が3ヶ月連続", salesSeries, (v) => v < 650000, 3, (x) => man(x.v)));
  if (grade === "G2") down.push(consec("継続率（次回予約）60%未満の継続", npSeries.filter((x) => x.new_continue !== undefined).map((x) => ({ k: x.k, v: x.new_continue })), (v) => v < 60, 3, (x) => pct(x.v)));
  if (grade === "G4") {
    down.push(consec("人件費率45%超過が3ヶ月連続", ownClinic.filter((x) => x.labor !== null).map((x) => ({ k: x.k, v: x.labor })), (v) => v > 45, 3, (x) => pct(x.v), { sensitive: true }));
    down.push(consec("売上予算達成率80%未満が3ヶ月連続", ownClinic.filter((x) => x.rate !== null).map((x) => ({ k: x.k, v: x.rate })), (v) => v < 80, 3, (x) => pct(x.v)));
    const pc = lastEval && lastEval.rec.scores.pc;
    if (pc && pc < 3) down.push(check("PC業務（必須）が3未満", "warn", `${monthName(lastEval.k)}の評価 ${pc}/5`));
  }
  if (grade === "G5") down.push(consec("管轄エリアの人件費率45%超過が半年以上", block.filter((x) => x.labor !== null).map((x) => ({ k: x.k, v: x.labor })), (v) => v > 45, 6, (x) => pct(x.v), { sensitive: true }));
  if (grade === "G1") {
    const bad = evals.filter((e) => (e.rec.scores.basic_punctual && e.rec.scores.basic_punctual <= 2) || (e.rec.scores.coachable && e.rec.scores.coachable <= 2));
    const lastBad = bad.length && lastEval && bad[bad.length - 1].k === lastEval.k;
    down.push(check("勤怠不良・指導への不服従が続く", bad.length >= 2 && lastBad ? "hit" : lastBad ? "warn" : evals.length ? "ok" : "unknown",
      evals.length ? (lastBad ? `「時間厳守」または「指導の受け入れ」が2以下（${bad.length}ヶ月）` : "問題なし") : "月次評価なし"));
  }
  if (["G6", "-S", "-R", "-P"].includes(grade) && ladder[grade] && ladder[grade].demotion) down.push(check(ladder[grade].demotion, "manual", "上司が確認"));
  // 全クラス共通：月次評価
  if (lastEval) {
    const r = lastEval.rec.storedRank;
    const dCount = streak(evals.map((e) => ({ v: e.rec.storedRank })), (v) => v === "D");
    down.push(check("月次評価がD（評価率50%未満）", dCount >= 2 ? "hit" : r === "D" ? "warn" : "ok", `${monthName(lastEval.k)} ${lastEval.rec.storedTotal}% ${r || ""}${dCount >= 2 ? `（${dCount}ヶ月連続）` : ""}`));
    if (r === "C") down.push(check("月次評価がC（改善指導）", "warn", `${monthName(lastEval.k)} ${lastEval.rec.storedTotal}% C`));
    const basics = Object.entries(lastEval.rec.scores).filter(([id, s]) => id.startsWith("basic_") && s <= 2);
    if (basics.length) down.push(check("社会人としての基本が2以下", "warn", `${monthName(lastEval.k)} ${basics.length}項目`));
  }

  // ---- 総合判定と理由 ----
  const hits = down.filter((c) => c.status === "hit");
  const warns = down.filter((c) => c.status === "warn");
  const autoPromo = promo.filter((c) => c.status !== "manual");
  const promoOk = to && autoPromo.length && autoPromo.every((c) => c.status === "ok");
  const promoNear = to && autoPromo.length && autoPromo.filter((c) => c.status === "ok").length >= Math.ceil(autoPromo.length / 2);
  let verdict, level;
  if (hits.length) { verdict = "降格対象"; level = "down"; }
  else if (warns.length) { verdict = "改善指導"; level = "warn"; }
  else if (promoOk) { verdict = `昇格候補（${to}へ）`; level = "up"; }
  else { verdict = "現状維持"; level = "keep"; }

  const reasons = [];
  for (const c of hits) reasons.push({ tone: "ng", text: `【降格】${c.label}：${c.detail}`, sensitive: !!c.sensitive });
  for (const c of warns) reasons.push({ tone: "warn", text: `【注意】${c.label}：${c.detail}`, sensitive: !!c.sensitive });
  if (to) {
    const ng = promo.filter((c) => c.status === "ng");
    const ok = promo.filter((c) => c.status === "ok");
    if (promoOk) reasons.push({ tone: "ok", text: `【昇格】${to}（${(ladder[to] || {}).role || ""}）の数値条件をすべて満たしています。技術・行動の条件は上司が確認してください` });
    else if (ng.length) reasons.push({ tone: promoNear ? "warn" : "muted", text: `【昇格まで】${to}への条件 ${ok.length}/${autoPromo.length} 達成。未達：${ng.map((c) => c.label).join("・")}` });
  }
  if (!reasons.length) reasons.push({ tone: "muted", text: "降格・改善指導に当たる条件はありません" });

  return { grade, to, toRole: to ? (ladder[to] || {}).role || "" : "", verdict, level, reasons, promotion: promo, demotion: down, halfAvg };
}

// 人件費に関わる判定の数字は、人件費を見られない人には伏せる
export function maskSensitive(j, canSeeLabor) {
  if (canSeeLabor) return j;
  const mask = (c) => (c.sensitive ? { ...c, detail: c.status === "unknown" ? c.detail : "（数値は院長以上のみ表示）" } : c);
  return {
    ...j,
    promotion: j.promotion.map(mask),
    demotion: j.demotion.map(mask),
    reasons: j.reasons.map((r) => (r.sensitive ? { ...r, text: r.text.replace(/：[^：]*$/, "：（数値は院長以上のみ表示）") } : r)),
  };
}
