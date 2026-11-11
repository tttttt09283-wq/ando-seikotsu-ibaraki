// 株式会社Enejoy Hand 本部システム（/hq）の計算ロジック
// 画面（hq.html）から切り離した純粋な関数。テストは test/hq.test.js。
//
// 数字の出どころ
//   ・院の予算・実績・人件費・スタッフ・等級・BMエリア … /api/incentive（キャリア制度・人件費42%管理台帳）
//   ・会社・院のマンダラ … /api/mandala
//   ・新患数・来院経路 … Supabase の bookings（予約システム）
//   ・本部が書く計画・台帳 … Supabase の hq_docs（項目ごとに JSON 1行）
(function (root) {
  const COMPANY_NAME = "株式会社Enejoy Hand";
  const FISCAL_MONTHS = [7, 8, 9, 10, 11, 12, 1, 2, 3, 4, 5, 6]; // 決算は6月。7月始まり
  const LABOR_CAP_RATE = 0.42;

  // 部門（サイドメニューの順）
  const SECTIONS = [
    { id: "dashboard", label: "ダッシュボード", icon: "📊" },
    { id: "performance", label: "業績", icon: "📈" },
    { id: "marketing", label: "集客", icon: "📣" },
    { id: "people", label: "人材", icon: "👥" },
    { id: "accounting", label: "経理・事務", icon: "🧾" },
    { id: "education", label: "教育", icon: "🎓" },
    { id: "org", label: "組織図", icon: "🏢" },
    { id: "career", label: "キャリア", icon: "🧗" },
    { id: "expansion", label: "出店計画", icon: "📍" },
    { id: "annual", label: "年間計画", icon: "🗓" },
    { id: "mandala", label: "マンダラチャート", icon: "🧭" },
  ];

  // 等級（上から）
  const GRADES = [
    { id: "G6", role: "GM", track: "マネジメント" },
    { id: "G5", role: "BM", track: "マネジメント" },
    { id: "G4", role: "院長", track: "マネジメント" },
    { id: "G3", role: "副院長・チーフ", track: "共通→コース選択" },
    { id: "G2", role: "一般スタッフ", track: "共通" },
    { id: "G1", role: "新人", track: "共通" },
    { id: "-S", role: "短時間正社員", track: "その他" },
    { id: "-R", role: "受付・事務", track: "その他" },
    { id: "-P", role: "パート・アルバイト", track: "その他" },
  ];
  const GRADE_ORDER = GRADES.map((g) => g.id);
  function gradeRank(g) {
    const i = GRADE_ORDER.indexOf(g);
    if (i >= 0) return i;
    if (/^-P/.test(String(g || ""))) return GRADE_ORDER.indexOf("-P");
    return GRADE_ORDER.length;
  }
  function gradeRole(g) {
    const hit = GRADES.find((x) => x.id === g) || (/^-P/.test(String(g || "")) ? GRADES.find((x) => x.id === "-P") : null);
    return hit ? hit.role : (g || "未設定");
  }

  // 本部で使う部門（組織図の「本部」）の初期値
  const DEFAULT_DEPTS = [
    { id: "d_exec", name: "経営企画（ダッシュボード・業績・マンダラ）", head: "", mission: "全社の数字と方針を決め、予実を毎月確認する" },
    { id: "d_mkt", name: "集客・マーケティング", head: "", mission: "新患数・来院経路・広告の費用対効果を管理する" },
    { id: "d_hr", name: "人材（採用・労務）", head: "", mission: "採用計画・人員配置・離職防止" },
    { id: "d_acc", name: "経理・事務", head: "", mission: "人件費42%管理・支払い・保険請求・月次の締め" },
    { id: "d_edu", name: "教育・研修", head: "", mission: "研修計画・技術の標準化・キャリアの育成" },
    { id: "d_dev", name: "出店開発", head: "", mission: "新店の物件・資金・開業準備" },
  ];

  // 毎月の経理・事務の定例（day＝期限の日。末日は 31）
  const DEFAULT_ROUTINES = [
    { id: "r_receipt", title: "保険請求（レセプト）の提出", day: 10, cat: "請求" },
    { id: "r_daily", title: "前月の日計表・売上の締め", day: 3, cat: "売上" },
    { id: "r_sales_sheet", title: "進捗売上実績シートへ院別実績を入力", day: 5, cat: "売上" },
    { id: "r_attendance", title: "勤怠の締め・確認", day: 5, cat: "労務" },
    { id: "r_payroll", title: "給与計算・支給合計額の入力（人件費42%管理）", day: 20, cat: "労務" },
    { id: "r_tax", title: "源泉所得税・住民税の納付", day: 10, cat: "税務" },
    { id: "r_social", title: "社会保険料の確認・納付", day: 31, cat: "労務" },
    { id: "r_bills", title: "家賃・リース・業者への支払い", day: 25, cat: "支払い" },
    { id: "r_pl", title: "院別の損益（PL）確認・報告", day: 15, cat: "管理" },
  ];

  const EXPANSION_STATUSES = ["構想", "エリア調査", "物件探し", "契約", "内装工事", "開業準備", "開業済み", "見送り"];
  const DEFAULT_MILESTONES = ["商圏・競合の調査", "物件の決定・契約", "資金計画・融資", "内装・設備の発注", "保健所・受領委任の届出", "スタッフの配置・採用", "開業前の集客（チラシ・LINE・内覧会）", "開業"];
  const RECRUIT_STATUSES = ["応募", "書類選考", "面接", "内定", "入社", "辞退・不採用"];
  const ANNUAL_CATS = ["全社", "業績", "集客", "人材", "経理・事務", "教育", "出店", "イベント"];
  const TRAINING_STATUSES = ["予定", "実施済み", "中止"];

  // ===== 日付 =====
  function pad(n) { return String(n).padStart(2, "0"); }
  function monthKeyOf(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; }
  function fiscalYearOf(monthKey) {
    const [y, m] = String(monthKey).split("-").map(Number);
    return m >= 7 ? y : y - 1;
  }
  // 年度（7月〜翌6月）の月キー
  function fiscalMonthKeys(fy) {
    return FISCAL_MONTHS.map((m) => `${m >= 7 ? fy : fy + 1}-${pad(m)}`);
  }
  // 台帳の月（1〜12）→ 年度内の月キー
  function monthKeyInFiscal(fy, month) {
    return `${month >= 7 ? fy : fy + 1}-${pad(month)}`;
  }
  function shiftMonth(key, d) {
    const [y, m] = key.split("-").map(Number);
    const t = new Date(y, m - 1 + d, 1);
    return monthKeyOf(t);
  }
  function daysBetween(a, b) {
    return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);
  }
  // その月の day 日（月末を超えたら月末）
  function dueDateOf(monthKey, day) {
    const [y, m] = monthKey.split("-").map(Number);
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return `${monthKey}-${pad(Math.min(Math.max(1, Number(day) || 1), last))}`;
  }

  // ===== 業績 =====
  const sum = (xs) => xs.reduce((a, b) => a + (Number(b) || 0), 0);
  const rate = (a, b) => (b ? a / b : null);

  // 院ごとの年度累計（予算・実績は「実績が入っている月」まで）と、全社の月別合計
  function performance(clinics, latestMonth) {
    const upto = latestMonth ? FISCAL_MONTHS.indexOf(latestMonth) : -1;
    const inRange = (m) => upto >= 0 && FISCAL_MONTHS.indexOf(m) <= upto;
    const rows = (clinics || []).map((c) => {
      const months = c.months || [];
      const done = months.filter((x) => inRange(x.month));
      const budget = sum(done.map((x) => x.budget));
      const actual = sum(done.map((x) => x.actual));
      const yearBudget = sum(months.map((x) => x.budget));
      const last = months.find((x) => x.month === latestMonth) || null;
      return {
        name: c.name, manager: c.manager || null, bm: c.bm || null,
        budget, actual, rate: rate(actual, budget), yearBudget, yearProgress: rate(actual, yearBudget),
        latest: last ? { budget: last.budget, actual: last.actual, rate: last.budget && last.actual !== null && last.actual !== undefined ? last.actual / last.budget : null } : null,
        laborRate: c.laborRate ?? null, fixedLabor: c.fixedLabor ?? null,
      };
    });
    const monthly = FISCAL_MONTHS.map((m) => {
      const b = sum((clinics || []).map((c) => (c.months || []).find((x) => x.month === m)?.budget));
      const hasActual = (clinics || []).some((c) => { const v = (c.months || []).find((x) => x.month === m)?.actual; return v !== null && v !== undefined; });
      const a = hasActual ? sum((clinics || []).map((c) => (c.months || []).find((x) => x.month === m)?.actual)) : null;
      return { month: m, budget: b, actual: a, rate: a !== null ? rate(a, b) : null };
    });
    const total = {
      budget: sum(rows.map((r) => r.budget)), actual: sum(rows.map((r) => r.actual)), yearBudget: sum(rows.map((r) => r.yearBudget)),
    };
    total.rate = rate(total.actual, total.budget);
    total.yearProgress = rate(total.actual, total.yearBudget);
    const lm = monthly.find((x) => x.month === latestMonth) || null;
    return { rows, monthly, total, latest: lm };
  }

  // ===== 集客（予約システムの新患） =====
  const normName = (s) => String(s || "").replace(/[\s　]/g, "");
  // 予約から「初めて来た日」を患者ごとに出し、月×院×来院経路で数える（キャンセル・トレーニングは除く）
  function newPatients(bookings, storesById) {
    const first = new Map();
    for (const b of bookings || []) {
      if (b.cancelled || b.is_training) continue;
      const k = normName(b.patient_name);
      if (!k || !b.date) continue;
      const cur = first.get(k);
      if (!cur || b.date < cur.date) first.set(k, b);
    }
    const byMonth = new Map();
    for (const b of first.values()) {
      const mk = b.date.slice(0, 7);
      if (!byMonth.has(mk)) byMonth.set(mk, { month: mk, total: 0, byStore: {}, byChannel: {} });
      const row = byMonth.get(mk);
      row.total++;
      const store = (storesById && storesById[b.store_id]) || (b.store_id ? `店舗${b.store_id}` : "未設定");
      row.byStore[store] = (row.byStore[store] || 0) + 1;
      const ch = String(b.how_know || "").trim() || "未回答";
      for (const c of ch.split(/[,、／/]/).map((x) => x.trim()).filter(Boolean)) row.byChannel[c] = (row.byChannel[c] || 0) + 1;
    }
    return [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month));
  }
  // 施策の費用対効果（CPA＝費用÷獲得数）
  function campaignStats(campaigns) {
    const rows = (campaigns || []).map((c) => {
      const cost = Number(c.cost) || 0;
      const got = Number(c.acquired) || 0;
      return { ...c, cost, acquired: got, cpa: got ? Math.round(cost / got) : null };
    });
    const byChannel = {};
    for (const r of rows) {
      const k = r.channel || "その他";
      if (!byChannel[k]) byChannel[k] = { channel: k, cost: 0, acquired: 0, count: 0 };
      byChannel[k].cost += r.cost; byChannel[k].acquired += r.acquired; byChannel[k].count++;
    }
    const channels = Object.values(byChannel).map((x) => ({ ...x, cpa: x.acquired ? Math.round(x.cost / x.acquired) : null }))
      .sort((a, b) => b.acquired - a.acquired);
    return { rows, channels, cost: sum(rows.map((r) => r.cost)), acquired: sum(rows.map((r) => r.acquired)) };
  }

  // ===== 人材 =====
  function gradeCounts(people) {
    const out = {};
    for (const p of people || []) {
      const g = p.grade ? (/^-P/.test(p.grade) ? "-P" : p.grade) : "未設定";
      out[g] = (out[g] || 0) + 1;
    }
    return out;
  }
  // 院ごとの在籍数と、必要人数（本部が入れた目標）との差
  function staffing(people, clinicNames, headcount) {
    return (clinicNames || []).map((name) => {
      const members = (people || []).filter((p) => (p.clinics || []).includes(name));
      const need = headcount && headcount[name] !== undefined && headcount[name] !== "" ? Number(headcount[name]) : null;
      return { name, count: members.length, need, gap: need === null ? null : members.length - need };
    });
  }
  function recruitFunnel(candidates) {
    const out = Object.fromEntries(RECRUIT_STATUSES.map((s) => [s, 0]));
    for (const c of candidates || []) out[c.status in out ? c.status : "応募"]++;
    return out;
  }

  // ===== 組織図 =====
  // 社長（代表）→ GM → BM（エリア）→ 院（院長・スタッフ）。BMのエリアに入っていない院は「本部直轄」
  function buildOrg(model, opts) {
    const people = (model && model.people) || [];
    const clinics = (model && model.clinics) || [];
    const blocks = (model && model.blocks) || [];
    const byRank = (a, b) => gradeRank(a.grade) - gradeRank(b.grade) || String(a.name).localeCompare(String(b.name), "ja");
    const gms = people.filter((p) => p.grade === "G6").sort(byRank);
    const clinicNode = (name) => {
      const members = people.filter((p) => (p.clinics || []).includes(name) && p.grade !== "G6" && p.grade !== "G5").sort(byRank);
      const managers = members.filter((p) => p.grade === "G4");
      return { name, managers, staff: members.filter((p) => p.grade !== "G4") };
    };
    const used = new Set();
    const areas = blocks.map((b) => {
      const bm = b.personKey ? people.find((p) => p.key === b.personKey) : null;
      const cs = (b.clinics || []).filter((n) => clinics.some((c) => c.name === n));
      cs.forEach((n) => used.add(n));
      return { bmName: bm ? bm.name : b.bmName, bmKey: b.personKey || null, clinics: cs.map(clinicNode) };
    });
    const direct = clinics.map((c) => c.name).filter((n) => !used.has(n)).map(clinicNode);
    const inTree = new Set();
    gms.forEach((p) => inTree.add(p.key));
    areas.forEach((a) => { if (a.bmKey) inTree.add(a.bmKey); a.clinics.forEach((c) => [...c.managers, ...c.staff].forEach((p) => inTree.add(p.key))); });
    direct.forEach((c) => [...c.managers, ...c.staff].forEach((p) => inTree.add(p.key)));
    const others = people.filter((p) => !inTree.has(p.key)).sort(byRank);
    return {
      company: COMPANY_NAME,
      ceo: (opts && opts.ceo) || "",
      depts: (opts && opts.depts) || DEFAULT_DEPTS,
      gms, areas, direct, others,
    };
  }

  // ===== キャリア =====
  // 等級ごとの人数と、上の等級へのパイプライン（昇格候補）
  function careerLadder(people, notes) {
    const counts = gradeCounts(people);
    return GRADES.map((g) => ({
      ...g, count: counts[g.id] || 0,
      candidates: (people || []).filter((p) => notes && notes[p.key] && notes[p.key].target === g.id).map((p) => ({ key: p.key, name: p.name, grade: p.grade, memo: notes[p.key].memo || "" })),
    }));
  }

  // ===== 出店計画 =====
  function expansionProgress(plan, todayStr) {
    const ms = (plan && plan.milestones) || [];
    const done = ms.filter((m) => m.done).length;
    const next = ms.filter((m) => !m.done).sort((a, b) => String(a.due || "9999").localeCompare(String(b.due || "9999")))[0] || null;
    const overdue = ms.filter((m) => !m.done && m.due && todayStr && m.due < todayStr).length;
    const daysToOpen = plan && plan.openDate && todayStr ? daysBetween(todayStr, plan.openDate) : null;
    return { done, total: ms.length, rate: ms.length ? done / ms.length : null, next, overdue, daysToOpen };
  }
  function newMilestones(id) {
    return DEFAULT_MILESTONES.map((title, i) => ({ id: `${id}_m${i + 1}`, title, due: "", done: false }));
  }

  // ===== 年間計画 =====
  function annualByMonth(events, fy) {
    const keys = fiscalMonthKeys(fy);
    return keys.map((k) => ({ month: k, items: (events || []).filter((e) => e.month === k).sort((a, b) => ANNUAL_CATS.indexOf(a.cat) - ANNUAL_CATS.indexOf(b.cat)) }));
  }

  // ===== 教育 =====
  function trainingStats(trainings, people) {
    const list = trainings || [];
    const done = list.filter((t) => t.status === "実施済み");
    const perPerson = (people || []).map((p) => {
      const target = list.filter((t) => t.status !== "中止" && targets(t, p));
      const attended = target.filter((t) => (t.attendees || []).includes(p.key));
      return { key: p.key, name: p.name, grade: p.grade, target: target.length, attended: attended.length, rate: target.length ? attended.length / target.length : null };
    });
    return { total: list.length, done: done.length, planned: list.filter((t) => t.status === "予定").length, perPerson };
  }
  // 研修の対象（空＝全員。等級IDをカンマ区切り）
  function targets(t, p) {
    const want = String(t.target || "").split(/[,、\s]+/).map((x) => x.trim()).filter(Boolean);
    if (!want.length || want.includes("全員")) return true;
    return want.includes(p.grade) || (/^-P/.test(p.grade || "") && want.includes("-P"));
  }

  // ===== 経理・事務 =====
  function routineStatus(routines, doneMap, monthKey, todayStr) {
    const done = (doneMap && doneMap[monthKey]) || {};
    return (routines || []).map((r) => {
      const due = dueDateOf(monthKey, r.day);
      const isDone = !!done[r.id];
      return { ...r, due, done: isDone, overdue: !isDone && !!todayStr && due < todayStr };
    }).sort((a, b) => a.due.localeCompare(b.due));
  }
  // 全社の人件費率（半期の中で、実績がある月）
  function laborSummary(model) {
    const halves = (model && model.company) || [];
    const cur = halves.filter((h) => h.monthsElapsed > 0).slice(-1)[0] || null;
    return cur ? { label: cur.label, sales: cur.sales, labor: cur.labor, rate: cur.laborRate, cap: cur.cap, room: cur.room, over: cur.laborRate !== null && cur.laborRate > LABOR_CAP_RATE } : null;
  }

  // ===== ダッシュボードのアラート =====
  function alerts({ model, perf, docs, todayStr, monthKey }) {
    const out = [];
    const push = (level, section, text) => out.push({ level, section, text });
    if (perf && perf.rows) {
      for (const r of perf.rows) {
        if (r.latest && r.latest.rate !== null && r.latest.rate < 0.8) push("ng", "performance", `${r.name}：最新月の予算達成率が ${Math.round(r.latest.rate * 100)}%（80%未満）`);
        if (r.laborRate !== null && r.laborRate > LABOR_CAP_RATE) push("ng", "accounting", `${r.name}：人件費率 ${Math.round(r.laborRate * 1000) / 10}%（42%超）`);
      }
    }
    const labor = laborSummary(model);
    if (labor && labor.over) push("ng", "accounting", `全社の人件費率が ${Math.round(labor.rate * 1000) / 10}%（42%枠を超えています・${labor.label}）`);
    const d = docs || {};
    const acc = d.accounting || {};
    const routines = routineStatus(acc.routines || DEFAULT_ROUTINES, acc.done, monthKey, todayStr);
    const late = routines.filter((r) => r.overdue);
    if (late.length) push("warn", "accounting", `今月の経理・事務で期限切れ ${late.length}件：${late.slice(0, 3).map((r) => r.title).join("、")}${late.length > 3 ? "…" : ""}`);
    for (const p of ((d.expansion || {}).plans || [])) {
      if (p.status === "開業済み" || p.status === "見送り") continue;
      const pr = expansionProgress(p, todayStr);
      if (pr.overdue) push("warn", "expansion", `出店「${p.name || "名称未設定"}」：期限を過ぎたマイルストーン ${pr.overdue}件`);
    }
    const st = staffing((model && model.people) || [], ((model && model.clinics) || []).map((c) => c.name), (d.people || {}).headcount);
    for (const s of st) if (s.gap !== null && s.gap < 0) push("warn", "people", `${s.name}：必要人数より ${-s.gap}名 不足`);
    const ev = ((d.annual || {}).events || []).filter((e) => e.month === monthKey && !e.done);
    if (ev.length) push("info", "annual", `今月の年間計画で未完了 ${ev.length}件：${ev.slice(0, 3).map((e) => e.title).join("、")}${ev.length > 3 ? "…" : ""}`);
    const order = { ng: 0, warn: 1, info: 2 };
    return out.sort((a, b) => order[a.level] - order[b.level]);
  }

  function uid(prefix) {
    return `${prefix || "x"}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  }

  root.HQ = {
    COMPANY_NAME, FISCAL_MONTHS, LABOR_CAP_RATE, SECTIONS, GRADES, GRADE_ORDER, DEFAULT_DEPTS, DEFAULT_ROUTINES,
    EXPANSION_STATUSES, DEFAULT_MILESTONES, RECRUIT_STATUSES, ANNUAL_CATS, TRAINING_STATUSES,
    gradeRank, gradeRole, monthKeyOf, fiscalYearOf, fiscalMonthKeys, monthKeyInFiscal, shiftMonth, daysBetween, dueDateOf,
    performance, newPatients, campaignStats, gradeCounts, staffing, recruitFunnel, buildOrg, careerLadder,
    expansionProgress, newMilestones, annualByMonth, trainingStats, routineStatus, laborSummary, alerts, uid, normName,
  };
})(typeof window !== "undefined" ? window : globalThis);
