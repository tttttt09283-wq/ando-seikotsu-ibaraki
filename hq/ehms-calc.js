// Enjoy Hand Management System（EHMS）共通計算エンジン
// 画面ごとに計算式を書かず、ここに集める。テストは test/ehms-calc.test.js。
//
// 決まりごと（CALCULATION_RULES.md と同じ）
//   ・金額は整数円で保存。計算の途中は小数のまま、表示のときだけ丸める
//   ・率は小数（0.2 ＝ 20%）で持つ
//   ・未入力（null）とゼロを区別する。分母がゼロ・未入力の比率は null（画面では「算出不可」）
//   ・年間の比率は月の比率の平均ではなく、年間の分子 ÷ 年間の分母で出し直す
//   ・すべての計算は { value, formula, inputs, version } を返せるようにして、根拠を画面で見せられるようにする
(function (root) {
  const CALC_VERSION = "1.0.0";
  const isNum = (v) => typeof v === "number" && isFinite(v);
  const num = (v) => (v === null || v === undefined || v === "" ? null : isNum(Number(v)) ? Number(v) : null);
  // null を含む合計：全部 null なら null（未入力）、1つでも数字があればその合計
  function sumOrNull(xs) {
    let any = false, s = 0;
    for (const x of xs || []) { const n = num(x); if (n !== null) { any = true; s += n; } }
    return any ? s : null;
  }
  // 比率：分母が null か 0 以下なら null（算出不可）
  function ratio(n, d) {
    const a = num(n), b = num(d);
    if (a === null || b === null || b === 0) return null;
    return a / b;
  }
  function explain(value, formula, inputs, note) {
    return { value, formula, inputs: inputs || {}, note: note || "", version: CALC_VERSION };
  }

  // ===== 会計年度 =====
  // fiscalStart：会計年度の開始月（7 ＝ 7月始まり）。年度は「開始月の年」で呼ぶ（2026年7月〜2027年6月 ＝ 2026年度）
  const pad = (n) => String(n).padStart(2, "0");
  function fiscalYearOf(monthKey, fiscalStart) {
    const [y, m] = String(monthKey).split("-").map(Number);
    return m >= fiscalStart ? y : y - 1;
  }
  function fiscalMonths(fy, fiscalStart) {
    return Array.from({ length: 12 }, (_, i) => {
      const m0 = (fiscalStart - 1 + i) % 12 + 1;
      const y = fiscalStart - 1 + i >= 12 ? fy + 1 : fy;
      return `${y}-${pad(m0)}`;
    });
  }
  function shiftMonth(key, d) {
    const [y, m] = key.split("-").map(Number);
    const t = new Date(Date.UTC(y, m - 1 + d, 1));
    return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}`;
  }

  // ===== PL =====
  const SECTIONS = ["revenue", "cogs", "sga", "non_op_income", "non_op_expense", "extra_gain", "extra_loss", "tax"];
  const SECTION_LABELS = {
    revenue: "売上高", cogs: "売上原価", sga: "販売費及び一般管理費", non_op_income: "営業外収益", non_op_expense: "営業外費用",
    extra_gain: "特別利益", extra_loss: "特別損失", tax: "法人税等",
  };
  // 区分ごとの金額から PL をつくる（テスト1）。区分が null（未入力）の場合も計算はするが complete=false
  function pl(s) {
    const v = {};
    SECTIONS.forEach((k) => { v[k] = num(s && s[k]); });
    const z = (x) => (x === null ? 0 : x);
    const revenue = v.revenue;
    const gross = revenue === null && v.cogs === null ? null : z(revenue) - z(v.cogs);
    const operating = gross === null && v.sga === null ? null : z(gross) - z(v.sga);
    const ordinary = operating === null ? null : operating + z(v.non_op_income) - z(v.non_op_expense);
    const pretax = ordinary === null ? null : ordinary + z(v.extra_gain) - z(v.extra_loss);
    const net = pretax === null ? null : pretax - z(v.tax);
    const labor = num(s && s.labor), fixed = num(s && s.fixed), variable = num(s && s.variable);
    const variableRatio = ratio(variable, revenue);
    const out = {
      ...v, gross, operating, ordinary, pretax, net, labor, fixed, variable,
      grossMargin: ratio(gross, revenue), operatingMargin: ratio(operating, revenue), ordinaryMargin: ratio(ordinary, revenue),
      laborRatio: ratio(labor, revenue), fixedRatio: ratio(fixed, revenue), variableRatio,
      breakEven: fixed !== null && variableRatio !== null && variableRatio < 1 ? fixed / (1 - variableRatio) : null,
      missing: SECTIONS.slice(0, 3).filter((k) => v[k] === null),
    };
    out.complete = out.missing.length === 0;
    out.explain = {
      gross: explain(gross, "売上総利益 ＝ 総売上高 − 売上原価", { 総売上高: revenue, 売上原価: v.cogs }),
      operating: explain(operating, "営業利益 ＝ 売上総利益 − 販売費及び一般管理費", { 売上総利益: gross, 販管費: v.sga }),
      ordinary: explain(ordinary, "経常利益 ＝ 営業利益 ＋ 営業外収益 − 営業外費用", { 営業利益: operating, 営業外収益: v.non_op_income, 営業外費用: v.non_op_expense }),
      pretax: explain(pretax, "税引前利益 ＝ 経常利益 ＋ 特別利益 − 特別損失", { 経常利益: ordinary, 特別利益: v.extra_gain, 特別損失: v.extra_loss }),
      net: explain(net, "税引後利益 ＝ 税引前利益 − 法人税等", { 税引前利益: pretax, 法人税等: v.tax }),
      operatingMargin: explain(out.operatingMargin, "営業利益率 ＝ 営業利益 ÷ 総売上高", { 営業利益: operating, 総売上高: revenue }, revenue ? "" : "売上がゼロ・未入力のため算出不可"),
      laborRatio: explain(out.laborRatio, "人件費率 ＝ 総人件費 ÷ 総売上高", { 総人件費: labor, 総売上高: revenue }, revenue ? "" : "売上がゼロ・未入力のため算出不可"),
      breakEven: explain(out.breakEven, "損益分岐点売上 ＝ 固定費 ÷（1 − 変動費率）", { 固定費: fixed, 変動費率: variableRatio }),
    };
    return out;
  }
  // 月次の記録（{account_id, amount}）と科目マスター → 区分ごとの合計と PL
  //   allocatedHq：この店舗に配賦する本部経費（配賦後の PL のとき）。販管費に足す
  function plFromRecords(records, accounts, opts) {
    const byId = new Map((accounts || []).map((a) => [a.id, a]));
    const buckets = Object.fromEntries(SECTIONS.map((k) => [k, []]));
    const labor = [], fixed = [], variable = [];
    for (const r of records || []) {
      const a = byId.get(r.account_id);
      if (!a) continue;
      const amt = num(r.amount);
      if (amt === null) continue;
      buckets[a.section].push(amt);
      if (a.is_labor) labor.push(amt);
      if (a.section === "cogs" || (a.section === "sga" && !a.is_fixed)) variable.push(amt);
      else if (a.section === "sga") fixed.push(amt);
    }
    const alloc = num(opts && opts.allocatedHq);
    if (alloc) { buckets.sga.push(alloc); fixed.push(alloc); }
    const s = Object.fromEntries(SECTIONS.map((k) => [k, sumOrNull(buckets[k])]));
    return pl({ ...s, labor: sumOrNull(labor), fixed: sumOrNull(fixed), variable: sumOrNull(variable) });
  }
  // 科目ごとの合計（行＝科目）
  function amountsByAccount(records) {
    const out = {};
    for (const r of records || []) { const a = num(r.amount); if (a === null) continue; out[r.account_id] = (out[r.account_id] || 0) + a; }
    return out;
  }

  // ===== 予算差異 =====
  function variance(budget, actual) {
    const b = num(budget), a = num(actual);
    return { budget: b, actual: a, diff: a !== null && b !== null ? a - b : null, rate: ratio(a, b) };
  }

  // ===== 年間集計 =====
  // months：月ごとの PL（pl() の結果）の配列（12か月。未入力の月は null）
  //   金額は期間合計、比率は合計から出し直す（月の比率の平均は使わない）
  function aggregate(pls) {
    const list = (pls || []).filter(Boolean);
    const keys = [...SECTIONS, "labor", "fixed", "variable"];
    const s = Object.fromEntries(keys.map((k) => [k, sumOrNull(list.map((p) => p[k]))]));
    const out = pl(s);
    out.months = list.length;
    return out;
  }
  function periodSums(pls, fiscalStart) {
    const at = (i) => (pls || [])[i] || null;
    const part = (from, to) => aggregate(Array.from({ length: to - from }, (_, k) => at(from + k)));
    return { year: part(0, 12), h1: part(0, 6), h2: part(6, 12), q1: part(0, 3), q2: part(3, 6), q3: part(6, 9), q4: part(9, 12) };
  }

  // ===== 年間着地予測 =====
  // actual：12か月の実績（未確定の月は null）、budget・prior：12か月、method：avg3 / avg6 / seasonal / budget / manual
  // 着地 ＝ 確定実績の累計 ＋ 未経過月の予測の合計
  function landing({ actual, budget, prior, method, manual, target, spread }) {
    const act = (actual || []).map(num);
    const closed = act.map((v, i) => (v !== null ? i : -1)).filter((i) => i >= 0);
    const last = closed.length ? closed[closed.length - 1] : -1;
    const actualSum = sumOrNull(act.slice(0, last + 1));
    const recent = (n) => { const xs = act.slice(0, last + 1).filter((v) => v !== null).slice(-n); return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null; };
    const priorYtd = sumOrNull((prior || []).slice(0, last + 1).map((v, i) => (act[i] !== null ? v : null)));
    const growth = ratio(actualSum, priorYtd);
    const forecast = act.map((v, i) => {
      if (i <= last) return null;
      switch (method) {
        case "avg6": return recent(6);
        case "budget": return num((budget || [])[i]);
        case "seasonal": { const p = num((prior || [])[i]); return p !== null && growth !== null ? p * growth : recent(3); }
        case "manual": return num((manual || [])[i]);
        default: return recent(3);
      }
    });
    const forecastSum = sumOrNull(forecast);
    const value = actualSum === null && forecastSum === null ? null : (actualSum || 0) + (forecastSum || 0);
    const remaining = 11 - last;
    const t = num(target);
    const requiredAvg = t !== null && remaining > 0 ? (t - (actualSum || 0)) / remaining : null;
    const sp = num(spread) ?? 0.1;
    const scen = (k) => (value === null ? null : (actualSum || 0) + (forecastSum || 0) * k);
    return {
      actualSum, forecast, forecastSum, value, remaining, requiredAvg, closedMonths: last + 1,
      achievement: ratio(value, t),
      scenarios: { optimistic: scen(1 + sp), standard: value, pessimistic: scen(1 - sp) },
      explain: explain(value, "年間着地予測 ＝ 確定済み実績累計 ＋ 未経過月の予測合計", { 確定済み実績累計: actualSum, 未経過月の予測合計: forecastSum, 予測方式: method || "avg3" }),
      explainRequired: explain(requiredAvg, "残り期間必要平均売上 ＝（年間目標 − 実績累計）÷ 残り月数", { 年間目標: t, 実績累計: actualSum, 残り月数: remaining }),
    };
  }

  // ===== 本部経費の配賦 =====
  // stores：[{ id, sales, headcount, fte, manual }]、method：sales / headcount / fte / equal / manual
  // 配賦額の合計は必ず本部経費と一致させる（端数は大きい順に1円ずつ配る）→ 全社で二重計上しない
  function allocate(hqCost, stores, method) {
    const total = num(hqCost);
    const list = stores || [];
    if (total === null || !list.length) return { method, shares: {}, total: total ?? 0 };
    const weightOf = (s) => {
      switch (method) {
        case "headcount": return num(s.headcount) || 0;
        case "fte": return num(s.fte) || 0;
        case "equal": return 1;
        case "manual": return num(s.manual) || 0;
        default: return Math.max(0, num(s.sales) || 0);
      }
    };
    const w = list.map(weightOf);
    const W = w.reduce((a, b) => a + b, 0);
    if (!W) return { method, shares: Object.fromEntries(list.map((s) => [s.id, 0])), total, unallocated: total };
    const raw = w.map((x) => (total * x) / W);
    const floor = raw.map(Math.floor);
    let rest = total - floor.reduce((a, b) => a + b, 0);
    const order = raw.map((r, i) => [r - floor[i], i]).sort((a, b) => b[0] - a[0]);
    for (let k = 0; k < order.length && rest > 0; k++, rest--) floor[order[k][1]]++;
    return { method, total, shares: Object.fromEntries(list.map((s, i) => [s.id, floor[i]])), unallocated: 0 };
  }

  // ===== 必要売上（テスト2） =====
  // 必要売上 ＝ 総固定的負担額 ÷（1 − 変動費率 − 目標営業利益率）
  function requiredSales(p) {
    const parts = ["salary", "allowances", "socialInsurance", "bonus", "commute", "welfare", "education"];
    const employment = sumOrNull(parts.map((k) => p[k]));
    const burden = (employment || 0) + (num(p.storeFixed) || 0) + (num(p.hqAllocation) || 0) + (num(p.totalBurden) || 0);
    const v = num(p.variableRate) || 0, m = num(p.targetMargin) || 0;
    const denomRequired = 1 - v - m, denomBreakEven = 1 - v;
    if (denomRequired <= 0 || denomBreakEven <= 0) return { error: "変動費率と目標営業利益率の合計が100%以上のため計算できません" };
    const required = burden / denomRequired;
    const breakEven = burden / denomBreakEven;
    const days = num(p.workDays), hours = num(p.treatHours), unit = num(p.unitPrice);
    return {
      employment, burden, breakEven, required,
      perDay: days ? required / days : null, perHour: hours ? required / hours : null, patients: unit ? required / unit : null,
      gap: num(p.currentSales) !== null ? num(p.currentSales) - required : null,
      explain: explain(required, "必要売上 ＝ 総固定的負担額 ÷（1 − 変動費率 − 目標営業利益率）", { 総固定的負担額: burden, 変動費率: v, 目標営業利益率: m }),
    };
  }

  // ===== 昇給の影響（テスト3） =====
  function raiseImpact(p) {
    const n = num(p.headcount) || 0, raise = num(p.monthlyRaise) || 0;
    const addPay = n * raise * 12;
    const addSocial = addPay * (num(p.socialRate) || 0);
    const addBonus = n * raise * (num(p.bonusMonths) || 0);
    const addBonusSocial = addBonus * (num(p.socialRate) || 0);
    const addLabor = addPay + addSocial + addBonus + addBonusSocial + (num(p.otherLinked) || 0);
    const v = num(p.variableRate) || 0, m = num(p.marginRate) || 0;
    if (1 - v - m <= 0) return { error: "変動費率と目標利益率の合計が100%以上のため計算できません" };
    const requiredSales = addLabor / (1 - v - m);
    return {
      addPay, addSocial, addBonus: addBonus + addBonusSocial, addLabor, requiredSales,
      explain: explain(requiredSales, "追加必要売上 ＝ 年間追加人件費 ÷（1 − 追加変動費率 − 追加売上目標利益率）", { 年間追加人件費: addLabor, 追加変動費率: v, 追加売上目標利益率: m }),
    };
  }

  // ===== 損益分岐点（テスト4） =====
  function breakEven(p) {
    const fixed = num(p.fixed), v = num(p.variableRate), sales = num(p.sales);
    if (fixed === null || v === null || v >= 1) return { error: "固定費と変動費率（100%未満）を入れてください" };
    return {
      breakEven: fixed / (1 - v),
      operatingProfit: sales === null ? null : sales * (1 - v) - fixed,
      explain: explain(fixed / (1 - v), "損益分岐点売上 ＝ 固定費 ÷（1 − 変動費率）", { 固定費: fixed, 変動費率: v }),
    };
  }

  // ===== 人員配置（テスト5） =====
  function staffing(p) {
    const demand = num(p.demand), days = num(p.workDays), perDay = num(p.maxPerDay), u = num(p.utilization);
    if (!days || !perDay || !u) return { error: "勤務日数・1日の最大対応数・目標稼働率を入れてください" };
    const perStaff = days * perDay * u;
    const fte = demand === null ? null : demand / perStaff;
    return {
      perStaff, fte, heads: fte === null ? null : Math.ceil(fte - 1e-9),
      explain: explain(fte, "必要常勤換算人数 ＝ 月間需要 ÷（勤務日数 × 1日最大対応数 × 目標稼働率）", { 月間需要: demand, 勤務日数: days, "1日最大対応数": perDay, 目標稼働率: u }),
    };
  }

  // ===== アラート（経営ダッシュボード） =====
  function alerts({ yearPl, monthPl, monthVariance, targets, landingResult, target }) {
    const out = [];
    const t = targets || {};
    const pct = (x) => (x === null || x === undefined ? "-" : `${Math.round(x * 1000) / 10}%`);
    if (monthVariance && monthVariance.rate !== null && monthVariance.rate < 1) out.push({ level: monthVariance.rate < 0.9 ? "ng" : "warn", title: "売上予算未達", reason: `当月の売上が予算の ${pct(monthVariance.rate)}`, basis: { 予算: monthVariance.budget, 実績: monthVariance.actual }, check: "院別・科目別の未達を確認", action: "未達の院の新患数・来院頻度・単価を確認し、改善策を経営課題に登録" });
    if (monthPl && monthPl.operating !== null && monthPl.operating < 0) out.push({ level: "ng", title: "営業赤字", reason: `当月の営業利益がマイナス（${Math.round(monthPl.operating).toLocaleString("ja-JP")}円）`, basis: { 売上: monthPl.revenue, 営業利益: monthPl.operating }, check: "一時的な費用（賞与・修繕など）か、恒常的な要因か", action: "固定費の見直しと売上改善の両面で対策" });
    if (yearPl && yearPl.laborRatio !== null && num(t.labor_ratio) !== null && yearPl.laborRatio > t.labor_ratio) out.push({ level: "warn", title: "人件費率超過", reason: `年度累計の人件費率 ${pct(yearPl.laborRatio)}（目標 ${pct(t.labor_ratio)}）`, basis: { 人件費: yearPl.labor, 売上: yearPl.revenue }, check: "院別の人件費率・人員配置", action: "人員の適正判断で余剰・稼働率を確認" });
    if (yearPl && yearPl.operatingMargin !== null && num(t.operating_margin) !== null && yearPl.operatingMargin < t.operating_margin) out.push({ level: "info", title: "目標営業利益率に未達", reason: `年度累計の営業利益率 ${pct(yearPl.operatingMargin)}（目標 ${pct(t.operating_margin)}）`, basis: { 営業利益: yearPl.operating, 売上: yearPl.revenue }, check: "利益率の低い院・費目", action: "院別ダッシュボードで利益率の低い院を確認" });
    if (landingResult && landingResult.achievement !== null && landingResult.achievement < 1) out.push({ level: "warn", title: "年間目標未達見込み", reason: `着地予測が年間目標の ${pct(landingResult.achievement)}`, basis: { 着地予測: landingResult.value, 年間目標: num(target) }, check: "残り期間の必要平均売上", action: `残り${landingResult.remaining}か月で月平均 ${landingResult.requiredAvg !== null ? Math.round(landingResult.requiredAvg).toLocaleString("ja-JP") : "-"}円が必要` });
    return out;
  }

  // ===== Phase 2：日計表 → 月次の売上・指標 =====
  // 日計表の「合計」行は 総売上 ＝ 保険窓口 ＋ 自費合計 ＋ 物販 ＋ 請求額（巻き爪・自賠は自費・窓口の内数）なので、この4つだけを科目にする
  function dailyTotalToRecords(total) {
    const t = total || {};
    const g = (k) => num(t[k]);
    const out = [];
    const add = (code, v) => { if (v !== null) out.push({ code, amount: Math.round(v) }); };
    add("R18", g("保険窓口"));
    add("R17", g("自費合計"));
    add("R15", g("物販"));
    const ju = g("柔整請求額"), ha = g("鍼灸請求額");
    if (ju !== null || ha !== null) { add("R02", ju); add("R04", ha); }
    else add("R19", g("請求額") ?? g("請求額合計"));
    const sum = out.reduce((a, r) => a + r.amount, 0);
    const totalSales = g("総売上");
    const metrics = [["new_patients", "新患数"], ["visits", "総来院数"], ["receipts", "レセ枚数"], ["revisits", "再診数"], ["cancels", "キャンセル数"]]
      .map(([metric, col]) => ({ metric, value: g(col) })).filter((m) => m.value !== null);
    return { records: out, metrics, totalSales, sum, matches: totalSales === null ? null : Math.round(totalSales) === sum };
  }

  // ===== Phase 2：スタッフ生産性 =====
  // 総雇用コスト（月）＝ 支給合計（または 基本給＋手当＋交通費）＋ 会社負担社会保険料 ＋ 賞与予算月割 ＋ 福利厚生 ＋ 教育
  function employmentCost(pay, opt) {
    const p = pay || {};
    const base = num(p.total_pay) !== null ? num(p.total_pay) : sumOrNull([p.base_salary, p.allowances, p.commute]);
    if (base === null) return null;
    const socialRate = num(opt && opt.socialRate) ?? 0;
    const social = num(p.social_insurance) !== null ? num(p.social_insurance) : base * socialRate;
    const bonus = num(p.bonus_budget) ?? 0;
    return { base, social, bonus, welfare: num(p.welfare) ?? 0, education: num(p.education) ?? 0, total: base + social + bonus + (num(p.welfare) ?? 0) + (num(p.education) ?? 0), socialEstimated: num(p.social_insurance) === null };
  }
  function productivity({ sales, cost, workDays, workHours, treatHours, fte, required }) {
    const s = num(sales);
    return {
      sales: s,
      perDay: ratio(s, workDays), perHour: ratio(s, workHours), perTreatHour: ratio(s, treatHours), perFte: ratio(s, fte),
      costMultiple: ratio(s, cost), requiredRate: ratio(s, required),
    };
  }

  // ===== Phase 2：必要売上の説明文（数値は計算結果から） =====
  function requiredSalesText(r, p) {
    if (!r || r.error) return r && r.error ? r.error : "";
    const man = (v) => `${Math.round(v / 1000) / 10}万円`;
    const pay = num(p.salary) ?? num(p.totalPay);
    return `月給${pay !== null ? man(pay) : "（未入力）"}のスタッフを雇用するためには、給与以外に社会保険料・賞与・福利厚生・教育費などが必要で、雇用にかかる費用は月${man(r.employment || 0)}です。`
      + `さらに店舗の運営費（${man(num(p.storeFixed) || 0)}）と本部の運営費（${man(num(p.hqAllocation) || 0)}）を合わせると月${man(r.burden)}になり、`
      + `損益が0になる売上は月${man(r.breakEven)}、会社の将来投資とスタッフ還元に必要な利益（目標営業利益率${Math.round((num(p.targetMargin) || 0) * 100)}%）まで確保するには、設定条件では月${man(r.required)}の売上が必要です。`;
  }
  // 必要売上の内訳（積み上げ）：給与 → 雇用維持 → 店舗運営 → 本部運営 → 変動費 → 利益
  function requiredSalesBreakdown(r, p, cost) {
    if (!r || r.error) return [];
    const v = num(p.variableRate) || 0, m = num(p.targetMargin) || 0;
    const base = cost ? cost.base : (num(p.salary) || 0);
    return [
      { label: "給与（支給額）", value: base },
      { label: "雇用維持（社保・賞与・福利厚生・教育）", value: (r.employment || 0) - base },
      { label: "店舗運営費の負担", value: num(p.storeFixed) || 0 },
      { label: "本部運営費の負担", value: num(p.hqAllocation) || 0 },
      { label: "変動費（材料・手数料など）", value: r.required * v },
      { label: "会社の利益（将来投資・還元の原資）", value: r.required * m },
    ];
  }
  // 無理な目標かどうか：必要時間売上 ＞ 施術可能時間1時間あたりの最大売上（単価 × 1時間の最大対応数 × 目標稼働率）
  function feasibility({ required, treatHours, unitPrice, maxPerHour, utilization }) {
    const perHour = ratio(required, treatHours);
    const cap = num(unitPrice) !== null && num(maxPerHour) !== null && num(utilization) !== null ? unitPrice * maxPerHour * utilization : null;
    const level = perHour === null || cap === null ? "unknown" : perHour > cap ? "ng" : perHour > cap * 0.9 ? "warn" : "ok";
    return { perHour, cap, level, explain: explain(perHour, "必要時間売上 ＝ 必要売上 ÷ 施術可能時間（上限＝単価 × 1時間の最大対応数 × 目標稼働率）", { 必要売上: num(required), 施術可能時間: num(treatHours), 上限: cap }) };
  }

  // ===== Phase 2：適正人員（需要から） =====
  // 月間需要（延べ来院）÷ 1人の適正対応数（勤務日数 × 1日最大対応数 × 目標稼働率）＝ 必要常勤換算
  function staffingByDemand({ demand, workDays, maxPerDay, utilization, currentFte, avgCost, unitPrice }) {
    const st = staffing({ demand, workDays, maxPerDay, utilization });
    if (st.error) return st;
    const cur = num(currentFte);
    const gap = st.fte !== null && cur !== null ? cur - st.fte : null;
    const capacity = cur !== null ? cur * st.perStaff : null;
    const unmet = capacity !== null && num(demand) !== null ? Math.max(0, demand - capacity) : null;
    return {
      ...st, currentFte: cur, gap, capacity,
      shortage: gap !== null && gap < 0 ? -gap : 0, surplus: gap !== null && gap > 0 ? gap : 0,
      laborDelta: gap !== null && num(avgCost) !== null ? -gap * avgCost : null,           // 適正にしたときの人件費の増減（＋＝増える）
      opportunityLoss: unmet !== null && num(unitPrice) !== null ? unmet * unitPrice : null, // 受けきれない来院 × 単価
      unmet,
    };
  }
  // 曜日ごとの必要人数（日計表の日別来院の曜日平均 ÷ 1人1日の適正対応数）
  function weekdayNeeds(days, perStaffDay) {
    const by = Array.from({ length: 7 }, () => []);
    for (const d of days || []) { const v = num(d.visits); if (v === null || !v) continue; by[new Date(`${d.date}T00:00:00Z`).getUTCDay()].push(v); }
    return by.map((xs, wd) => {
      const avg = xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
      return { wd, days: xs.length, avg, need: avg !== null && num(perStaffDay) ? avg / perStaffDay : null };
    });
  }

  // ===== 人件費の方針：目安（人件費×3）・42%枠・枠の余り（賞与原資・新店舗の担保） =====
  // 会社の方針：売上が上がっても人件費は売上の42%（cap）で組む。実際の人件費が枠を下回った分が「枠の余り」で、
  // 賞与原資（bonusShare）と新店舗の担保（残り）に分ける。売上の目安は人件費×3（multiple）＝人件費率33.3%。
  function laborPolicy({ sales, labor, cap, multiple, bonusShare }) {
    const S = num(sales), L = num(labor), c = num(cap) ?? 0.42, k = num(multiple) ?? 3, b = Math.max(0, Math.min(1, num(bonusShare) ?? 0.5));
    const capAmount = S === null ? null : S * c;
    const pool = capAmount === null || L === null ? null : capAmount - L;
    const pos = pool === null ? null : Math.max(0, pool);
    const guideSales = L === null ? null : L * k;
    return {
      sales: S, labor: L, cap: c, multiple: k, bonusShare: b,
      ratio: ratio(L, S), capAmount, pool, over: pool !== null && pool < 0,
      bonusPool: pos === null ? null : pos * b, reservePool: pos === null ? null : pos * (1 - b),
      guideSales, guideRate: ratio(S, guideSales), guideGap: S === null || guideSales === null ? null : S - guideSales,
      // 目安（×3）を達成したときの枠の余り ＝ 目安売上 × 42% − 人件費
      poolAtGuide: guideSales === null ? null : guideSales * c - L,
      explain: explain(pool, "枠の余り ＝ 売上 × 人件費枠（42%）− 実際の人件費", { 売上: S, 人件費枠: c, 実際の人件費: L }, "余りがマイナスのときは枠を超えています（賞与原資・担保はゼロ）"),
      explainGuide: explain(guideSales, `売上の目安 ＝ 人件費 × ${k}`, { 人件費: L, 倍率: k }, `目安どおりなら人件費率は ${(100 / k).toFixed(1)}%`),
    };
  }

  // 欲しい賞与原資から必要売上を逆算する
  //   必要な枠の余り ＝ 賞与 ×（1＋社保率）÷ 賞与に回す割合
  //   必要売上 ＝（期間の人件費 ＋ 必要な枠の余り − 連動率×今の売上）÷（人件費枠 − 連動率）
  //   連動率（laborGrowth）：売上が1円増えたときに増える人件費（0 ＝ 今の人員のまま）
  function bonusTarget({ bonus, labor, cap, bonusShare, socialRate, months, currentSales, laborGrowth }) {
    const B = num(bonus), L = num(labor), c = num(cap) ?? 0.42, sh = num(bonusShare) ?? 0.5, sr = num(socialRate) ?? 0, n = num(months) || 1, g = num(laborGrowth) || 0;
    const cur = num(currentSales);
    if (B === null || L === null) return { error: "欲しい賞与原資と期間の人件費を入れてください" };
    if (!(sh > 0)) return { error: "賞与に回す割合が0%のため計算できません" };
    const denom = c - g;
    if (denom <= 0) return { error: "売上に連動して増える人件費の割合が人件費枠以上のため、売上を増やしても余りが増えません" };
    const poolNeeded = (B * (1 + sr)) / sh;
    const base = cur === null ? 0 : cur;
    const required = (poolNeeded + L - g * base) / denom;
    const laborAt = L + g * (required - base);
    return {
      poolNeeded, bonusCost: B * (1 + sr), reserve: poolNeeded - B * (1 + sr), required, perMonth: required / n, laborAt, ratioAt: ratio(laborAt, required),
      extra: cur === null ? null : required - cur, extraPerMonth: cur === null ? null : (required - cur) / n, growth: cur ? required / cur - 1 : null,
      explain: explain(required, "必要売上 ＝（期間の人件費 ＋ 必要な枠の余り − 連動率 × 今の売上）÷（人件費枠 − 連動率）　／　必要な枠の余り ＝ 賞与 ×（1＋社保率）÷ 賞与に回す割合",
        { 欲しい賞与原資: B, 社保率: sr, 賞与に回す割合: sh, 必要な枠の余り: poolNeeded, 期間の人件費: L, 人件費枠: c, 連動率: g, 今の売上: cur }),
    };
  }

  root.EHMS = {
    CALC_VERSION, SECTIONS, SECTION_LABELS, num, sumOrNull, ratio, explain,
    fiscalYearOf, fiscalMonths, shiftMonth,
    pl, plFromRecords, amountsByAccount, variance, aggregate, periodSums, landing, allocate,
    requiredSales, raiseImpact, breakEven, staffing, alerts,
    dailyTotalToRecords, employmentCost, productivity, requiredSalesText, requiredSalesBreakdown, feasibility, staffingByDemand, weekdayNeeds,
    laborPolicy, bonusTarget,
  };
})(typeof window !== "undefined" ? window : globalThis);
