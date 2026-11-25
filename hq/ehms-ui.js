// Enjoy Hand Management System（EHMS）Phase 1 の画面
// 本部システム（index.html）の中で動く。共通の部品（esc・man・rest・selectAll・S・render など）は index.html のものを使う。
// 計算はすべて ehms-calc.js（window.EHMS）。データは Supabase の ehms_* テーブル（行単位の権限は データベース側の RLS）。
/* global S, esc, yen, man, pct, rest, selectAll, render, ui, flash, todayStr, thisMonth, monthLabel, EHMS */

const EH_ROLE_LABELS = { owner: "社長・経営者", gm: "GM", bm: "BM・エリアマネージャー", store_manager: "院長", accounting: "経理・管理部門", staff: "一般スタッフ" };
const EH_KIND_LABELS = { actual: "実績", budget: "予算", forecast: "予測" };
const EH_SECTION_ORDER = ["revenue", "cogs", "sga", "non_op_income", "non_op_expense", "extra_gain", "extra_loss", "tax"];
const EH_COLORS = { actual: "#2a78d6", budget: "#eb6834", prior: "#1baf7a" }; // 検証済みの配色（色覚の違いでも区別できる）
const EH_HQ = "hq", EH_ALL = "all";

function eh() {
  if (!S.ehms) S.ehms = { loaded: false, loading: false, err: null, role: null, storeIds: [], settings: {}, stores: [], bus: [], accounts: [], records: [], closes: [], jobs: [], audit: [], roles: [], staff: [], demo: false, ui: {}, explains: {}, recFy: null };
  return S.ehms;
}
const ehFiscalStart = () => Number((eh().settings.company || {}).fiscal_start_month) || 7;
const ehTargets = () => eh().settings.targets || {};
function ehUi() {
  const e = eh();
  if (!e.ui.fy) e.ui.fy = EHMS.fiscalYearOf(thisMonth, ehFiscalStart());
  if (!e.ui.month) e.ui.month = thisMonth;
  if (!e.ui.scope) e.ui.scope = EH_ALL;
  if (!e.ui.kind) e.ui.kind = "actual";
  return e.ui;
}
const ehMonths = () => EHMS.fiscalMonths(ehUi().fy, ehFiscalStart());
const ehPriorMonth = (mk) => { const [y, m] = mk.split("-"); return `${Number(y) - 1}-${m}`; };
const ehToDate = (mk) => `${mk}-01`;
const ehStoreName = (id) => id === EH_HQ ? "本部" : id === EH_ALL ? "全社" : ((eh().stores.find((s) => s.id === id) || {}).name || "-");
const ehActiveStores = () => eh().stores.filter((s) => s.active).sort((a, b) => a.sort - b.sort);
const ehAccounts = () => eh().accounts.filter((a) => a.active).sort((a, b) => a.sort - b.sort);

// ===== 権限（画面の出し分け。本当の制御はデータベースの RLS） =====
const ehCan = {
  write(storeId) { const r = eh().role; if (eh().demo) return false; if (["owner", "gm", "accounting"].includes(r)) return true; if (["bm", "store_manager"].includes(r)) return storeId && storeId !== EH_HQ && eh().storeIds.includes(storeId); return false; },
  master() { return !eh().demo && ["owner", "gm"].includes(eh().role); },
  accounts() { return !eh().demo && ["owner", "gm", "accounting"].includes(eh().role); },
  settings() { return !eh().demo && eh().role === "owner"; },
  close() { return !eh().demo && ["owner", "accounting"].includes(eh().role); },
  roles() { return eh().role === "owner"; },
  audit() { return ["owner", "gm"].includes(eh().role); },
  import() { return !eh().demo && ["owner", "gm", "accounting"].includes(eh().role); },
};

// ===== 読み込み =====
async function ehLoad(force) {
  const e = eh();
  if (e.loading || (e.loaded && !force)) return;
  e.loading = true; e.err = null;
  try {
    e.role = await rest("rpc/ehms_role", { method: "POST", body: {} });
    if (e.role) {
      e.storeIds = (await rest("rpc/ehms_store_ids", { method: "POST", body: {} })) || [];
      const [settings, stores, bus, accounts, closes] = await Promise.all([
        rest("ehms_settings?select=key,value"), rest("ehms_stores?select=*&order=sort.asc"), rest("ehms_business_units?select=*&order=sort.asc"),
        rest("ehms_accounts?select=*&order=sort.asc"), rest("ehms_month_closes?select=*"),
      ]);
      e.settings = Object.fromEntries((settings || []).map((r) => [r.key, r.value || {}]));
      e.stores = stores || []; e.bus = bus || []; e.accounts = accounts || []; e.closes = closes || [];
      await ehLoadRecords(true);
    }
    e.loaded = true;
  } catch (err) {
    e.err = /ehms_/.test(err.message) ? "EHMS のテーブルがまだありません。sql/2026-11-25_ehms_phase1.sql を Supabase で実行してください" : err.message;
  }
  e.loading = false;
  render();
}
// 選んだ年度と前年度の数字（前年同月比のため）
async function ehLoadRecords(force) {
  const e = eh(), fy = ehUi().fy;
  if (!force && e.recFy === fy) return;
  if (e.demo) { e.records = ehDemoRecords(); e.recFy = fy; return; }
  const from = ehToDate(EHMS.fiscalMonths(fy - 1, ehFiscalStart())[0]);
  const to = ehToDate(EHMS.shiftMonth(EHMS.fiscalMonths(fy, ehFiscalStart())[11], 1));
  const rows = await selectAll("ehms_monthly_records", `select=id,store_id,month,account_id,kind,amount,version,source&scenario=eq.base&month=gte.${from}&month=lt.${to}`);
  e.records = rows.map((r) => ({ ...r, mk: String(r.month).slice(0, 7) }));
  e.recFy = fy;
}
function ehSetFy(fy) { ehUi().fy = Number(fy); ehUi().month = EHMS.fiscalMonths(Number(fy), ehFiscalStart())[0]; eh().recFy = null; ehLoadRecords(true).then(render).catch((err) => flash(err.message, true)); }

// ===== 集計 =====
function ehRecs({ mk, scope, kind }) {
  return eh().records.filter((r) => r.mk === mk && r.kind === kind && (scope === EH_ALL ? true : scope === EH_HQ ? !r.store_id : r.store_id === scope));
}
// 本部経費の配賦（その月・その区分の本部の販管費を、設定の方式で店舗に配る）
function ehAllocation(mk, kind) {
  const acc = new Map(eh().accounts.map((a) => [a.id, a]));
  const hqCost = EHMS.sumOrNull(ehRecs({ mk, scope: EH_HQ, kind }).filter((r) => (acc.get(r.account_id) || {}).section === "sga").map((r) => r.amount));
  const stores = ehActiveStores().map((s) => {
    const sales = EHMS.sumOrNull(ehRecs({ mk, scope: s.id, kind }).filter((r) => (acc.get(r.account_id) || {}).section === "revenue").map((r) => r.amount));
    const manual = ((eh().settings.allocation || {}).manual || {})[s.id];
    return { id: s.id, sales, headcount: 1, manual };
  });
  return EHMS.allocate(hqCost, stores, (eh().settings.allocation || {}).method || "sales");
}
function ehPl(scope, mk, kind, withAlloc) {
  const recs = ehRecs({ mk, scope, kind });
  let allocatedHq = null;
  if (withAlloc && scope !== EH_ALL && scope !== EH_HQ) allocatedHq = ehAllocation(mk, kind).shares[scope] || null;
  const p = EHMS.plFromRecords(recs, eh().accounts, { allocatedHq });
  p.hasData = recs.length > 0;
  p.allocatedHq = allocatedHq;
  return p;
}
function ehYearPls(scope, kind, withAlloc, fy) {
  const months = EHMS.fiscalMonths(fy || ehUi().fy, ehFiscalStart());
  return months.map((mk) => { const p = ehPl(scope, mk, kind, withAlloc); return p.hasData ? p : null; });
}
const ehClosed = (storeId, mk) => eh().closes.some((c) => String(c.month).slice(0, 7) === mk && (!c.store_id || c.store_id === storeId));

// ===== 表示の部品 =====
const ehYen = (v) => (v === null || v === undefined || !isFinite(v) ? "未入力" : yen(v));
const ehMan = (v) => (v === null || v === undefined || !isFinite(v) ? "未入力" : man(v));
const ehPct = (v) => (v === null || v === undefined || !isFinite(v) ? "算出不可" : pct(v, 1));
// 数字のカード（押すと根拠・計算式が出る）
function ehTile(key, label, value, sub, explainObj, cls) {
  if (explainObj) eh().explains[key] = { label, ...explainObj };
  return `<div class="tile ${explainObj ? "link" : ""}" ${explainObj ? `onclick="ehShowExplain('${key}')"` : ""}><div class="k">${esc(label)}${explainObj ? ' <span class="small">ⓘ</span>' : ""}</div><div class="v ${cls || ""}" style="font-size:21px;">${value}</div><div class="s">${sub || ""}</div></div>`;
}
function ehShowExplain(key) {
  const x = eh().explains[key];
  if (!x) return;
  const inputs = Object.entries(x.inputs || {}).map(([k, v]) => `<tr><td class="l">${esc(k)}</td><td>${typeof v === "number" ? (Math.abs(v) < 2 && !Number.isInteger(v) ? pct(v, 2) : yen(v)) : v === null || v === undefined ? "未入力" : esc(v)}</td></tr>`).join("");
  const box = document.createElement("div");
  box.id = "ehModal";
  box.style.cssText = "position:fixed;inset:0;background:rgba(15,23,42,.45);z-index:60;display:flex;align-items:center;justify-content:center;padding:16px;";
  box.onclick = (ev) => { if (ev.target === box) box.remove(); };
  box.innerHTML = `<div style="background:white;border-radius:14px;max-width:520px;width:100%;padding:18px 20px;box-shadow:0 12px 40px rgba(0,0,0,.25);">
    <div style="font-weight:800;font-size:16px;color:#142D3C;margin-bottom:8px;">${esc(x.label)} の根拠</div>
    <div style="font-size:13px;background:#F5F7FA;border-radius:8px;padding:8px 10px;margin-bottom:10px;">${esc(x.formula || "")}</div>
    <table>${inputs}<tr class="total"><td class="l">結果</td><td>${typeof x.value === "number" ? (Math.abs(x.value) < 2 && !Number.isInteger(x.value) ? pct(x.value, 2) : yen(x.value)) : "算出不可"}</td></tr></table>
    ${x.note ? `<div class="small" style="margin-top:6px;">${esc(x.note)}</div>` : ""}
    <div class="small" style="margin-top:8px;">計算ロジック v${esc(x.version || EHMS.CALC_VERSION)}・${esc(new Date().toLocaleString("ja-JP"))}</div>
    <div style="text-align:right;margin-top:10px;"><button class="btn btn-gray btn-sm" onclick="document.getElementById('ehModal').remove()">閉じる</button></div></div>`;
  document.body.appendChild(box);
}
// 折れ線（月の推移）。series: [{ label, color, dash, values }]
let EH_TIPS = {};
function ehLineChart(id, labels, series, fmt) {
  const W = 760, H = 230, L = 70, R = 20, T = 12, B = 26;
  const vals = series.flatMap((s) => s.values).filter((v) => v !== null && v !== undefined && isFinite(v));
  if (!vals.length) return `<div class="muted">データがありません。</div>`;
  let lo = Math.min(0, ...vals), hi = Math.max(...vals);
  if (hi === lo) hi = lo + 1;
  const span = hi - lo, mag = 10 ** Math.floor(Math.log10(span / 4)), step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((k) => span / k <= 4) || mag * 10;
  const y0 = Math.floor(lo / step) * step, y1 = Math.ceil(hi / step) * step;
  const X = (i) => L + (i + 0.5) * ((W - L - R) / labels.length), Y = (v) => T + (H - T - B) * (1 - (v - y0) / (y1 - y0 || 1));
  const ticks = []; for (let v = y0; v <= y1 + step / 2; v += step) ticks.push(v);
  const path = (arr) => { let d = "", pen = false; arr.forEach((v, i) => { if (v === null || v === undefined || !isFinite(v)) { pen = false; return; } d += `${pen ? "L" : "M"}${X(i).toFixed(1)},${Y(v).toFixed(1)}`; pen = true; }); return d; };
  EH_TIPS[id] = labels.map((lb, i) => `<b>${esc(lb)}</b>${series.map((s) => `<br><span style="color:${s.color}">${s.dash ? "┅" : "━"}</span> ${esc(s.label)}：${esc(fmt(s.values[i]))}`).join("")}`);
  return `<div style="position:relative;"><svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block;" role="img" aria-label="${esc(series.map((s) => s.label).join("・"))}の推移">
    ${ticks.map((t) => `<line x1="${L}" x2="${W - R}" y1="${Y(t)}" y2="${Y(t)}" stroke="${t === 0 ? "#94a3b8" : "#e8e6e1"}"/><text x="${L - 8}" y="${Y(t) + 4}" text-anchor="end" font-size="13" fill="#64748b">${esc(fmt(t, true))}</text>`).join("")}
    ${labels.map((lb, i) => `<text x="${X(i)}" y="${H - 8}" text-anchor="middle" font-size="13" fill="#64748b">${esc(lb.replace(/^\d+年/, ""))}</text>`).join("")}
    ${series.map((s) => `<path d="${path(s.values)}" fill="none" stroke="${s.color}" stroke-width="2" ${s.dash ? `stroke-dasharray="${s.dash}"` : ""}/>${s.values.map((v, i) => v === null || v === undefined || !isFinite(v) ? "" : `<circle cx="${X(i)}" cy="${Y(v)}" r="3.5" fill="${s.dash ? "#fff" : s.color}" stroke="${s.dash ? s.color : "#fff"}" stroke-width="2"/>`).join("")}`).join("")}
    ${labels.map((_, i) => `<rect x="${X(i) - (W - L - R) / labels.length / 2}" y="${T}" width="${(W - L - R) / labels.length}" height="${H - T - B}" fill="transparent" onmousemove="ehTip(event,'${id}',${i})" onmouseleave="ehTipOff('${id}')"/>`).join("")}
  </svg><div id="tip_${id}" style="display:none;position:absolute;z-index:5;background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:7px 10px;font-size:12px;line-height:1.6;box-shadow:0 4px 12px rgba(0,0,0,.12);pointer-events:none;min-width:170px;"></div></div>
  <div class="legend" style="margin-top:4px;">${series.map((s) => `<span><svg width="24" height="10"><line x1="0" x2="24" y1="5" y2="5" stroke="${s.color}" stroke-width="2" ${s.dash ? `stroke-dasharray="${s.dash}"` : ""}/></svg> ${esc(s.label)}</span>`).join("")}</div>`;
}
function ehTip(ev, id, i) {
  const el = document.getElementById(`tip_${id}`); if (!el) return;
  el.innerHTML = (EH_TIPS[id] || [])[i] || ""; el.style.display = "block";
  const box = ev.currentTarget.ownerSVGElement.getBoundingClientRect();
  el.style.left = `${Math.min(Math.max(6, ev.clientX - box.left + 12), box.width - 190)}px`; el.style.top = `${Math.max(0, ev.clientY - box.top - 8)}px`;
}
function ehTipOff(id) { const el = document.getElementById(`tip_${id}`); if (el) el.style.display = "none"; }
// 横棒（院の比較）
function ehBars(rows, fmt) {
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.value || 0)));
  return rows.length ? `<table>${rows.map((r) => `<tr><td class="l" style="width:110px;"><b>${esc(r.label)}</b></td><td style="width:60%;"><div style="height:14px;background:#eef2f7;border-radius:4px;overflow:hidden;"><i style="display:block;height:100%;width:${Math.max(0, Math.min(100, Math.abs(r.value || 0) / max * 100))}%;background:${(r.value || 0) < 0 ? "#e34948" : "#2a78d6"};border-radius:0 4px 4px 0;"></i></div></td><td>${esc(fmt(r.value))}</td><td class="small">${r.sub || ""}</td></tr>`).join("")}</table>` : `<div class="muted">データがありません。</div>`;
}

// ===== 上の絞り込み（年度・月・店舗・実績/予算/予測） =====
function ehBar(opts = {}) {
  const u = ehUi(), e = eh();
  const fys = []; const cur = EHMS.fiscalYearOf(thisMonth, ehFiscalStart()); for (let y = cur + 1; y >= cur - 3; y--) fys.push(y);
  const scopes = [[EH_ALL, "全社"], ...ehActiveStores().map((s) => [s.id, s.name]), ...(opts.hq ? [[EH_HQ, "本部（共通費）"]] : [])];
  return `<div class="card" style="border-top:3px solid #142D3C;"><div class="card-b"><div class="ctl">
    <div><label>年度</label><select onchange="ehSetFy(this.value)">${fys.map((y) => `<option value="${y}" ${y === u.fy ? "selected" : ""}>${y}年度（${y}年${ehFiscalStart()}月〜）</option>`).join("")}</select></div>
    <div><label>月</label><select onchange="eh().ui.month=this.value;render()">${ehMonths().map((mk) => `<option value="${mk}" ${mk === u.month ? "selected" : ""}>${monthLabel(mk)}${ehClosed(null, mk) ? "（締め済）" : ""}</option>`).join("")}</select></div>
    ${opts.scope === false ? "" : `<div><label>店舗</label><select onchange="eh().ui.scope=this.value;render()">${scopes.map(([v, l]) => `<option value="${v}" ${v === u.scope ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></div>`}
    ${opts.kind ? `<div><label>表示</label><span class="chips" style="margin:0;">${["actual", "budget", "forecast"].map((k) => `<button class="chip ${u.kind === k ? "sel" : ""}" onclick="eh().ui.kind='${k}';render()">${EH_KIND_LABELS[k]}</button>`).join("")}</span></div>` : ""}
    <div style="margin-left:auto;display:flex;gap:6px;align-items:center;">
      <span class="tag ${e.demo ? "amber" : "blue"}">${e.demo ? "デモデータ（保存されません）" : `実データ・${esc(EH_ROLE_LABELS[e.role] || e.role || "")}`}</span>
      <button class="btn btn-gray btn-sm" onclick="ehToggleDemo()">${e.demo ? "実データに戻す" : "デモで見る"}</button>
      <button class="btn btn-gray btn-sm" onclick="window.print()">🖨 印刷</button>
    </div></div></div></div>`;
}
function ehGuard() {
  const e = eh();
  if (!e.loaded && !e.err) { setTimeout(() => ehLoad(false), 0); return `<div class="center">EHMS を読み込み中...</div>`; }
  if (e.err) return `<div class="err">${esc(e.err)}<br><button class="btn btn-gray btn-sm" style="margin-top:6px;" onclick="eh().loaded=false;ehLoad(true)">もう一度読み込む</button></div>`;
  if (!e.role) return `<div class="err">このアカウントには EHMS（経営管理）を使う権限がありません。社長・経営者のアカウントで「🔐 権限・締め・履歴」から役割を付けてください。</div>`;
  return "";
}
function ehHead(icon, title, lead) {
  return `<div class="h2" style="color:#142D3C;">${icon} ${esc(title)} <span class="tag" style="background:#C5A46D22;color:#7a5a1e;">EHMS</span></div><div class="lead">${lead}</div>`;
}

// ===== デモデータ（画面の中だけ。データベースには保存しない） =====
function ehToggleDemo() { const e = eh(); e.demo = !e.demo; e.recFy = null; ehLoadRecords(true).then(render).catch((err) => flash(err.message, true)); }
function ehDemoRecords() {
  const e = eh(), out = [];
  let seed = 7;
  const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  const code = (c) => (e.accounts.find((a) => a.code === c) || {}).id;
  const months = [...EHMS.fiscalMonths(ehUi().fy - 1, ehFiscalStart()), ...EHMS.fiscalMonths(ehUi().fy, ehFiscalStart())];
  const lastActual = thisMonth;
  ehActiveStores().forEach((s, si) => {
    const base = 2_600_000 + si * 220_000;
    months.forEach((mk, mi) => {
      const season = 1 + 0.06 * Math.sin((mi / 12) * Math.PI * 2);
      const sales = Math.round(base * season * (1 + mi * 0.006) * (0.94 + rnd() * 0.12));
      const lines = [["R01", 0.22], ["R02", 0.28], ["R07", 0.25], ["R11", 0.12], ["R15", 0.03], ["R16", 0.10], ["C02", 0.02], ["S01", 0.30], ["S06", 0.04], ["S08", 0.05], ["S11", 0.07], ["S12", 0.02], ["S14", 0.025], ["S20", 0.01], ["S24", 0.03]];
      for (const kind of ["actual", "budget"]) {
        if (kind === "actual" && mk > lastActual) continue;
        const k = kind === "budget" ? base * season * (1 + mi * 0.008) / sales : 1;
        for (const [c, r] of lines) { const id = code(c); if (id) out.push({ id: `demo-${s.id}-${mk}-${c}-${kind}`, store_id: s.id, mk, month: `${mk}-01`, account_id: id, kind, amount: Math.round(sales * r * k) }); }
      }
    });
  });
  months.forEach((mk) => { if (mk <= lastActual) { const id = code("S23"); if (id) out.push({ id: `demo-hq-${mk}`, store_id: null, mk, month: `${mk}-01`, account_id: id, kind: "actual", amount: 1_200_000 }); } });
  return out;
}

// ===== 1. 全社経営ダッシュボード =====
function secEhmsDash() {
  const head = ehHead("🏛", "全社経営ダッシュボード", "全社の売上・利益・予算達成・着地予測を一画面で。数字のカードを押すと、計算式と使った数字が出ます。");
  const g = ehGuard(); if (g) return head + g;
  const u = ehUi(), e = eh(); e.explains = {};
  const scope = u.scope;
  const months = ehMonths();
  const mPl = ehPl(scope, u.month, "actual", false), mBud = ehPl(scope, u.month, "budget", false), mPrior = ehPl(scope, ehPriorMonth(u.month), "actual", false);
  const idx = months.indexOf(u.month);
  const ytd = EHMS.aggregate(months.slice(0, idx + 1).map((mk) => { const p = ehPl(scope, mk, "actual", false); return p.hasData ? p : null; }));
  const ytdBud = EHMS.aggregate(months.slice(0, idx + 1).map((mk) => { const p = ehPl(scope, mk, "budget", false); return p.hasData ? p : null; }));
  const yearBud = EHMS.aggregate(ehYearPls(scope, "budget", false));
  const act = months.map((mk) => { const p = ehPl(scope, mk, "actual", false); return p.hasData ? p.revenue : null; });
  const bud = months.map((mk) => { const p = ehPl(scope, mk, "budget", false); return p.hasData ? p.revenue : null; });
  const prior = months.map((mk) => { const p = ehPl(scope, ehPriorMonth(mk), "actual", false); return p.hasData ? p.revenue : null; });
  const land = EHMS.landing({ actual: act, budget: bud, prior, method: (e.settings.forecast || {}).method || "avg3", target: yearBud.revenue });
  const v = EHMS.variance(mBud.revenue, mPl.revenue), vy = EHMS.variance(ytdBud.revenue, ytd.revenue);
  const t = ehTargets();
  const tiles = `<div class="grid g4" style="margin-bottom:14px;">
    ${ehTile("m_rev", `${monthLabel(u.month)}の総売上`, ehMan(mPl.revenue), `予算 ${ehMan(mBud.revenue)}・達成率 <b>${ehPct(v.rate)}</b>・前年同月比 ${ehPct(EHMS.ratio(mPl.revenue, mPrior.revenue))}`, EHMS.explain(v.rate, "予算達成率 ＝ 実績 ÷ 予算", { 実績: mPl.revenue, 予算: mBud.revenue }))}
    ${ehTile("y_rev", "年度累計売上", ehMan(ytd.revenue), `累計予算 ${ehMan(ytdBud.revenue)}・達成率 <b>${ehPct(vy.rate)}</b>`, EHMS.explain(vy.rate, "累計予算達成率 ＝ 累計実績 ÷ 累計予算", { 累計実績: ytd.revenue, 累計予算: ytdBud.revenue }))}
    ${ehTile("landing", "年間売上着地予測", ehMan(land.value), `年間予算 ${ehMan(yearBud.revenue)}・見込み ${ehPct(land.achievement)}`, land.explain)}
    ${ehTile("req", "残り期間の必要平均売上（月）", ehMan(land.requiredAvg), `残り${land.remaining}か月`, land.explainRequired)}
    ${ehTile("gross", "売上総利益（当月）", ehMan(mPl.gross), `粗利率 ${ehPct(mPl.grossMargin)}`, mPl.explain.gross)}
    ${ehTile("op", "営業利益（当月）", ehMan(mPl.operating), `営業利益率 <b>${ehPct(mPl.operatingMargin)}</b>（目標 ${ehPct(t.operating_margin)}）`, mPl.explain.operating, mPl.operating !== null && mPl.operating < 0 ? "ng" : "")}
    ${ehTile("ord", "経常利益・税引後利益（当月）", ehMan(mPl.ordinary), `税引後 ${ehMan(mPl.net)}`, mPl.explain.ordinary)}
    ${ehTile("labor", "人件費率（年度累計）", ehPct(ytd.laborRatio), `人件費 ${ehMan(ytd.labor)}・目標 ${ehPct(t.labor_ratio)}`, ytd.explain.laborRatio, ytd.laborRatio !== null && t.labor_ratio && ytd.laborRatio > t.labor_ratio ? "warn" : "")}
    ${ehTile("fixvar", "固定費率・変動費率（年度累計）", `${ehPct(ytd.fixedRatio)} / ${ehPct(ytd.variableRatio)}`, `固定費 ${ehMan(ytd.fixed)}・変動費 ${ehMan(ytd.variable)}`, EHMS.explain(ytd.fixedRatio, "固定費率 ＝ 固定費 ÷ 売上、変動費率 ＝ 変動費 ÷ 売上", { 固定費: ytd.fixed, 変動費: ytd.variable, 売上: ytd.revenue }))}
    ${ehTile("bep", "損益分岐点売上（年度累計）", ehMan(ytd.breakEven), `安全余裕 ${ytd.breakEven && ytd.revenue ? ehPct(1 - ytd.breakEven / ytd.revenue) : "算出不可"}`, ytd.explain.breakEven)}
    ${ehTile("stores", "店舗数", `${ehActiveStores().length}店舗`, `事業部 ${e.bus.filter((b) => b.active).length}`)}
    ${ehTile("ytdop", "営業利益（年度累計）", ehMan(ytd.operating), `営業利益率 ${ehPct(ytd.operatingMargin)}`, ytd.explain.operatingMargin)}
  </div>`;
  const al = EHMS.alerts({ yearPl: ytd.months ? ytd : null, monthPl: mPl.hasData ? mPl : null, monthVariance: mPl.hasData && mBud.hasData ? v : null, targets: t, landingResult: yearBud.revenue ? land : null, target: yearBud.revenue });
  const alerts = `<div class="card"><div class="card-h">🚨 経営アラート（${al.length}件）</div><div class="card-b">${al.length ? al.map((a) => `<div class="alert ${a.level}" style="cursor:default;display:block;"><b>${esc(a.title)}</b>：${esc(a.reason)}<div class="small" style="margin-top:3px;">根拠：${esc(Object.entries(a.basis || {}).map(([k, x]) => `${k} ${typeof x === "number" ? yen(x) : x ?? "未入力"}`).join("・"))}<br>確認：${esc(a.check)}<br>推奨アクション：${esc(a.action)}</div></div>`).join("") : `<div class="muted">基準を外れている項目はありません。${mPl.hasData ? "" : "（この月の実績が未入力です）"}</div>`}</div></div>`;
  const ml = months.map(monthLabel);
  const opA = months.map((mk) => { const p = ehPl(scope, mk, "actual", false); return p.hasData ? p.operating : null; });
  const opB = months.map((mk) => { const p = ehPl(scope, mk, "budget", false); return p.hasData ? p.operating : null; });
  const fmtM = (x, short) => (x === null || x === undefined ? "未入力" : short ? `${Math.round(x / 10000).toLocaleString("ja-JP")}万` : man(x));
  const charts = `<div class="grid g2">
    <div class="card"><div class="card-h">月別売上（実績・予算・前年）</div><div class="card-b">${ehLineChart("rev", ml, [{ label: "実績", color: EH_COLORS.actual, values: act }, { label: "予算", color: EH_COLORS.budget, dash: "6 4", values: bud }, { label: "前年", color: EH_COLORS.prior, dash: "2 3", values: prior }], fmtM)}</div></div>
    <div class="card"><div class="card-h">月別営業利益（実績・予算）</div><div class="card-b">${ehLineChart("op", ml, [{ label: "実績", color: EH_COLORS.actual, values: opA }, { label: "予算", color: EH_COLORS.budget, dash: "6 4", values: opB }], fmtM)}</div></div>
  </div>`;
  const storeRows = ehActiveStores().map((s) => ({ s, y: EHMS.aggregate(months.slice(0, idx + 1).map((mk) => { const p = ehPl(s.id, mk, "actual", true); return p.hasData ? p : null; })) }));
  const compare = scope === EH_ALL ? `<div class="grid g2">
    <div class="card"><div class="card-h">院別売上（年度累計）</div><div class="card-b">${ehBars(storeRows.map((r) => ({ label: r.s.name, value: r.y.revenue, sub: r.y.revenue && ytd.revenue ? `構成比 ${pct(r.y.revenue / ytd.revenue, 0)}` : "" })).sort((a, b) => (b.value || 0) - (a.value || 0)), (x) => ehMan(x))}</div></div>
    <div class="card"><div class="card-h">院別営業利益（年度累計・本部経費配賦後）</div><div class="card-b">${ehBars(storeRows.map((r) => ({ label: r.s.name, value: r.y.operating, sub: `利益率 ${ehPct(r.y.operatingMargin)}` })).sort((a, b) => (b.value || 0) - (a.value || 0)), (x) => ehMan(x))}</div></div>
  </div>` : "";
  const costMix = (() => {
    const acc = new Map(e.accounts.map((a) => [a.id, a]));
    const by = {};
    months.slice(0, idx + 1).forEach((mk) => ehRecs({ mk, scope, kind: "actual" }).forEach((r) => { const a = acc.get(r.account_id); if (a && (a.section === "sga" || a.section === "cogs")) by[a.name] = (by[a.name] || 0) + Number(r.amount); }));
    const tot = Object.values(by).reduce((x, y) => x + y, 0);
    return `<div class="card"><div class="card-h">経費構成比（年度累計）</div><div class="card-b">${ehBars(Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, x]) => ({ label: k, value: x, sub: tot ? pct(x / tot, 1) : "" })), (x) => ehMan(x))}</div></div>`;
  })();
  const missing = `<div class="note">現預金・借入金・未収金・スタッフ数・平均年収・還元額は Phase 2〜3（資金繰り・人事）で入力できるようにします。今は会計科目の月次実績・予算から計算できる指標を出しています。</div>`;
  return head + ehBar({ kind: false }) + tiles + alerts + charts + compare + costMix + missing;
}

// ===== 2. 院別ダッシュボード =====
function secEhmsStore() {
  const head = ehHead("🏥", "院別ダッシュボード", "院ごとの売上・予算達成・前年同月比・営業利益（本部経費の配賦前／配賦後）・人件費率を比べます。");
  const g = ehGuard(); if (g) return head + g;
  const u = ehUi(), e = eh(); e.explains = {};
  const months = ehMonths(), idx = months.indexOf(u.month);
  const alloc = u.alloc !== false;
  const rows = ehActiveStores().map((s) => {
    const m = ehPl(s.id, u.month, "actual", alloc), b = ehPl(s.id, u.month, "budget", false), p = ehPl(s.id, ehPriorMonth(u.month), "actual", alloc);
    const pre = ehPl(s.id, u.month, "actual", false);
    const y = EHMS.aggregate(months.slice(0, idx + 1).map((mk) => { const x = ehPl(s.id, mk, "actual", alloc); return x.hasData ? x : null; }));
    const yb = EHMS.aggregate(months.slice(0, idx + 1).map((mk) => { const x = ehPl(s.id, mk, "budget", false); return x.hasData ? x : null; }));
    return { s, m, b, p, pre, y, yb };
  });
  const sortKey = u.sortKey || "rev";
  const val = (r) => ({ rev: r.m.revenue, rate: EHMS.ratio(r.m.revenue, r.b.revenue), op: r.m.operating, margin: r.m.operatingMargin, labor: r.m.laborRatio !== null ? -r.m.laborRatio : null, yoy: EHMS.ratio(r.m.revenue, r.p.revenue) })[sortKey];
  const sorted = [...rows].sort((a, b) => (val(b) ?? -Infinity) - (val(a) ?? -Infinity));
  const th = (k, l) => `<th style="cursor:pointer;" onclick="eh().ui.sortKey='${k}';render()">${l}${sortKey === k ? " ▼" : ""}</th>`;
  const table = `<div class="card"><div class="card-h"><span>${monthLabel(u.month)}の院別比較（ランキング）</span>
    <span class="chips" style="margin:0;"><button class="chip ${alloc ? "sel" : ""}" onclick="eh().ui.alloc=true;render()">本部経費 配賦後</button><button class="chip ${!alloc ? "sel" : ""}" onclick="eh().ui.alloc=false;render()">配賦前</button></span></div><div class="card-b scroll"><table>
    <tr><th class="l">順位</th><th class="l">院</th>${th("rev", "総売上")}<th>売上予算</th>${th("rate", "達成率")}${th("yoy", "前年同月比")}<th>営業利益（配賦前）</th>${th("op", alloc ? "営業利益（配賦後）" : "営業利益")}${th("margin", "営業利益率")}${th("labor", "人件費率")}<th>年度累計 売上</th><th>累計達成率</th></tr>
    ${sorted.map((r, i) => `<tr><td class="l">${i + 1}</td><td class="l"><a href="javascript:void(0)" onclick="eh().ui.scope='${r.s.id}';go('ehms_year')" style="color:#142D3C;font-weight:800;">${esc(r.s.name)}</a></td>
      <td>${ehMan(r.m.revenue)}</td><td>${ehMan(r.b.revenue)}</td><td class="${rateCls(EHMS.ratio(r.m.revenue, r.b.revenue))}">${ehPct(EHMS.ratio(r.m.revenue, r.b.revenue))}</td><td>${ehPct(EHMS.ratio(r.m.revenue, r.p.revenue))}</td>
      <td>${ehMan(r.pre.operating)}</td><td class="${r.m.operating !== null && r.m.operating < 0 ? "ng" : ""}">${ehMan(r.m.operating)}${alloc && r.m.allocatedHq ? `<div class="small">配賦 ${man(r.m.allocatedHq)}</div>` : ""}</td>
      <td>${ehPct(r.m.operatingMargin)}</td><td class="${r.m.laborRatio !== null && ehTargets().labor_ratio && r.m.laborRatio > ehTargets().labor_ratio ? "warn" : ""}">${ehPct(r.m.laborRatio)}</td>
      <td>${ehMan(r.y.revenue)}</td><td class="${rateCls(EHMS.ratio(r.y.revenue, r.yb.revenue))}">${ehPct(EHMS.ratio(r.y.revenue, r.yb.revenue))}</td></tr>`).join("")}
  </table><div class="small" style="margin-top:6px;">見出しを押すと並び替えます。本部経費の配賦方式：${esc({ sales: "売上比率", headcount: "人員比率", fte: "常勤換算人数比率", equal: "店舗均等", manual: "個別設定" }[(e.settings.allocation || {}).method || "sales"])}（「⚙ マスター設定」で変更）。全社の合計には本部経費を一度だけ入れます（配賦しても二重には数えません）。新患数・来院数・稼働率・人員は Phase 2 で取り込みます（今は「📈 業績」「🗓 デイリー稼働」で確認できます）。</div></div></div>`;
  return head + ehBar({ scope: false }) + table;
}

// ===== 3. 月次PL（入力） =====
function secEhmsPl() {
  const head = ehHead("📒", "月次PL", "会計科目ごとに予算・実績を入力し、利益を自動で計算します。全社は院と本部の合計（入力はできません）。締めた月の実績は変更できません。");
  const g = ehGuard(); if (g) return head + g;
  const u = ehUi(), e = eh(); e.explains = {};
  const scope = u.scope;
  const mk = u.month;
  const editable = scope !== EH_ALL && ehCan.write(scope);
  const closed = ehClosed(scope === EH_HQ || scope === EH_ALL ? null : scope, mk);
  const recsA = ehRecs({ mk, scope, kind: "actual" }), recsB = ehRecs({ mk, scope, kind: "budget" }), recsP = ehRecs({ mk: ehPriorMonth(mk), scope, kind: "actual" });
  const amtA = EHMS.amountsByAccount(recsA), amtB = EHMS.amountsByAccount(recsB), amtP = EHMS.amountsByAccount(recsP);
  const accs = ehAccounts().filter((a) => scope === EH_HQ ? true : scope === EH_ALL ? true : !a.hq_only);
  const plA = ehPl(scope, mk, "actual", false), plB = ehPl(scope, mk, "budget", false), plP = ehPl(scope, ehPriorMonth(mk), "actual", false);
  const cell = (acc, kind, value) => {
    if (!editable || (kind === "actual" && closed)) return `<td>${value === undefined ? '<span class="muted">-</span>' : yen(value)}</td>`;
    return `<td><input class="num" inputmode="numeric" value="${value === undefined ? "" : value}" placeholder="未入力" onchange="ehSaveCell('${scope}','${mk}','${acc.id}','${kind}',this.value)" style="width:110px;"/></td>`;
  };
  const line = (label, a, b, p, strong, cls) => `<tr class="${strong ? "total" : ""}"><td class="l" style="${strong ? "" : "padding-left:18px;"}">${label}</td><td>${ehYen(b)}</td><td class="${cls || ""}">${ehYen(a)}</td><td>${a !== null && b !== null ? yen(a - b) : "-"}</td><td>${ehPct(EHMS.ratio(a, b))}</td><td>${ehYen(p)}</td><td>${ehPct(EHMS.ratio(a, p))}</td></tr>`;
  let body = "";
  for (const sec of EH_SECTION_ORDER) {
    const list = accs.filter((a) => a.section === sec);
    if (!list.length) continue;
    body += `<tr><td class="l" colspan="7" style="background:#F5F7FA;font-weight:800;color:#142D3C;">${esc(EHMS.SECTION_LABELS[sec])}</td></tr>`;
    body += list.map((a) => `<tr><td class="l" style="padding-left:18px;">${esc(a.name)}<span class="small"> ${esc(a.code)}${a.is_labor ? "・人件費" : ""}${a.section === "sga" && !a.is_fixed ? "・変動" : ""}</span></td>${cell(a, "budget", amtB[a.id])}${cell(a, "actual", amtA[a.id])}
      <td>${amtA[a.id] !== undefined && amtB[a.id] !== undefined ? yen(amtA[a.id] - amtB[a.id]) : "-"}</td><td>${amtA[a.id] === undefined || amtB[a.id] === undefined ? "-" : ehPct(EHMS.ratio(amtA[a.id], amtB[a.id]))}</td><td>${amtP[a.id] === undefined ? "-" : yen(amtP[a.id])}</td><td>${amtA[a.id] === undefined || amtP[a.id] === undefined ? "-" : ehPct(EHMS.ratio(amtA[a.id], amtP[a.id]))}</td></tr>`).join("");
    if (sec === "revenue") body += line("売上高 合計", plA.revenue, plB.revenue, plP.revenue, true);
    if (sec === "cogs") body += line("売上総利益", plA.gross, plB.gross, plP.gross, true);
    if (sec === "sga") body += line("うち人件費", plA.labor, plB.labor, plP.labor) + line("営業利益", plA.operating, plB.operating, plP.operating, true, plA.operating !== null && plA.operating < 0 ? "ng" : "");
    if (sec === "non_op_expense") body += line("経常利益", plA.ordinary, plB.ordinary, plP.ordinary, true);
    if (sec === "extra_loss") body += line("税引前利益", plA.pretax, plB.pretax, plP.pretax, true);
    if (sec === "tax") body += line("税引後利益", plA.net, plB.net, plP.net, true);
  }
  const alloc = scope !== EH_ALL && scope !== EH_HQ ? ehAllocation(mk, "actual").shares[scope] : null;
  const ratios = `<div class="grid g4" style="margin-bottom:12px;">
    ${ehTile("pl_op", "営業利益（実績）", ehYen(plA.operating), `営業利益率 ${ehPct(plA.operatingMargin)}`, plA.explain.operating, plA.operating !== null && plA.operating < 0 ? "ng" : "")}
    ${ehTile("pl_margin", "営業利益率", ehPct(plA.operatingMargin), `予算 ${ehPct(plB.operatingMargin)}`, plA.explain.operatingMargin)}
    ${ehTile("pl_labor", "人件費率", ehPct(plA.laborRatio), `人件費 ${ehYen(plA.labor)}`, plA.explain.laborRatio)}
    ${ehTile("pl_alloc", "本部経費の配賦（参考）", alloc ? yen(alloc) : "-", alloc ? `配賦後の営業利益 ${ehYen(plA.operating !== null ? plA.operating - alloc : null)}` : "院を選ぶと表示", alloc ? EHMS.explain(alloc, "本部経費 × この院の配賦比率（設定の方式）", { 方式: (e.settings.allocation || {}).method || "sales" }) : null)}
  </div>`;
  const status = `<div class="note">${esc(ehStoreName(scope))}・${monthLabel(mk)}　${closed ? "🔒 この月は締め済みです（実績は変更できません）" : editable ? "✏️ 入力すると自動で保存されます（空にすると削除）" : scope === EH_ALL ? "全社は院と本部の合計です。入力は院・本部を選んで行ってください" : "この店舗を入力する権限がありません"}${e.demo ? "　※デモデータ表示中は保存されません" : ""}</div>`;
  return head + ehBar({ hq: true }) + status + ratios + `<div class="card"><div class="card-b scroll"><table>
    <tr><th class="l">科目</th><th>予算</th><th>実績</th><th>差額</th><th>達成率</th><th>前年同月</th><th>前年同月比</th></tr>${body}</table>
    <div class="small" style="margin-top:6px;">未入力の科目は「未入力」と表示し、ゼロとは扱いません。売上がゼロ・未入力の月の比率は「算出不可」。「本部管理費」「法人税等」は本部の行だけで使います（院の利益には配賦で反映し、二重計上しない）。</div></div></div>`;
}
// 1つのセルを保存（あれば更新、なければ追加、空なら削除）
async function ehSaveCell(scope, mk, accountId, kind, raw) {
  const e = eh();
  if (e.demo) { flash("デモデータ表示中は保存できません", true); return; }
  const storeId = scope === EH_HQ ? null : scope;
  const v = String(raw).replace(/[,，¥円\s]/g, "");
  if (v !== "" && !/^-?\d+$/.test(v)) { flash("金額は整数（円）で入力してください", true); render(); return; }
  const existing = e.records.find((r) => r.mk === mk && r.kind === kind && r.account_id === accountId && (r.store_id || null) === storeId);
  flash("保存中…");
  try {
    const by = S.user ? S.user.name : null;
    if (v === "") {
      if (existing) { await rest(`ehms_monthly_records?id=eq.${existing.id}`, { method: "DELETE" }); e.records = e.records.filter((r) => r !== existing); }
    } else if (existing) {
      const [row] = await rest(`ehms_monthly_records?id=eq.${existing.id}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: { amount: Number(v), updated_by: by, source: "manual" } });
      Object.assign(existing, row, { mk });
    } else {
      const [row] = await rest("ehms_monthly_records", { method: "POST", headers: { Prefer: "return=representation" }, body: { store_id: storeId, month: `${mk}-01`, account_id: accountId, kind, amount: Number(v), source: "manual", created_by: by, updated_by: by } });
      e.records.push({ ...row, mk });
    }
    flash("✓ 保存しました");
  } catch (err) { flash(`保存できませんでした：${err.message}`, true); }
  render();
}

// ===== 4. 年間PL・推移・着地予測 =====
function secEhmsYear() {
  const head = ehHead("📊", "年間PL・年間推移・着地予測", "12か月を横に並べて、予算・実績・差額・達成率・前年同月を比べます。上期・下期・四半期・年間の合計と、年間の着地予測（確定実績＋未経過月の予測）も出します。");
  const g = ehGuard(); if (g) return head + g;
  const u = ehUi(), e = eh(); e.explains = {};
  const scope = u.scope, months = ehMonths();
  const pls = (kind, fy) => ehYearPls(scope, kind, u.alloc !== false && scope !== EH_ALL && scope !== EH_HQ, fy);
  const A = pls("actual"), B = pls("budget"), P = pls("actual", u.fy - 1);
  const items = [["revenue", "売上高"], ["cogs", "売上原価"], ["gross", "売上総利益"], ["sga", "販管費"], ["labor", "人件費"], ["operating", "営業利益"], ["operatingMargin", "営業利益率"], ["laborRatio", "人件費率"], ["ordinary", "経常利益"], ["net", "税引後利益"]];
  const view = u.yview || "actual";
  const get = (arr, i, k) => (arr[i] ? arr[i][k] : null);
  const fmt = (k, v) => (/Margin|Ratio/.test(k) ? ehPct(v) : v === null || v === undefined ? "-" : Math.round(v / 1000).toLocaleString("ja-JP"));
  const sumsA = EHMS.periodSums(A), sumsB = EHMS.periodSums(B), sumsP = EHMS.periodSums(P);
  const periodCell = (k, sA, sB, sP) => {
    const a = sA[k], b = sB[k], p = sP[k];
    if (view === "budget") return fmt(k, b);
    if (view === "diff") return /Margin|Ratio/.test(k) ? (a !== null && b !== null ? `${((a - b) * 100).toFixed(1)}pt` : "-") : a !== null && b !== null ? fmt(k, a - b) : "-";
    if (view === "rate") return /Margin|Ratio/.test(k) ? "-" : ehPct(EHMS.ratio(a, b));
    if (view === "yoy") return /Margin|Ratio/.test(k) ? "-" : ehPct(EHMS.ratio(a, p));
    if (view === "prior") return fmt(k, p);
    return fmt(k, a);
  };
  const table = `<div class="card"><div class="card-h"><span>年間PL（単位：千円・${esc(ehStoreName(scope))}）</span>
    <span class="chips" style="margin:0;">${[["actual", "実績"], ["budget", "予算"], ["diff", "予算差額"], ["rate", "達成率"], ["prior", "前年同月"], ["yoy", "前年同月比"]].map(([k, l]) => `<button class="chip ${view === k ? "sel" : ""}" onclick="eh().ui.yview='${k}';render()">${l}</button>`).join("")}</span></div><div class="card-b scroll"><table>
    <tr><th class="l">項目</th>${months.map((mk) => `<th>${Number(mk.slice(5))}月${ehClosed(null, mk) ? "🔒" : ""}</th>`).join("")}<th>上期</th><th>下期</th><th>年間</th></tr>
    ${items.map(([k, l]) => `<tr class="${["gross", "operating"].includes(k) ? "total" : ""}"><td class="l">${l}</td>${months.map((_, i) => { const base = view === "budget" ? B[i] : view === "prior" ? P[i] : A[i]; return `<td>${!base ? '<span class="muted">-</span>' : periodCell(k, { [k]: get(A, i, k) }, { [k]: get(B, i, k) }, { [k]: get(P, i, k) })}</td>`; }).join("")}
      ${["h1", "h2", "year"].map((pk) => { const base = view === "budget" ? sumsB[pk] : view === "prior" ? sumsP[pk] : sumsA[pk]; const c = !base.months ? '<span class="muted">-</span>' : periodCell(k, sumsA[pk], sumsB[pk], sumsP[pk]); return `<td>${pk === "year" ? `<b>${c}</b>` : c}</td>`; }).join("")}</tr>`).join("")}
  </table><div class="small" style="margin-top:6px;">四半期：Q1 ${fmt("revenue", sumsA.q1.revenue)}・Q2 ${fmt("revenue", sumsA.q2.revenue)}・Q3 ${fmt("revenue", sumsA.q3.revenue)}・Q4 ${fmt("revenue", sumsA.q4.revenue)}（売上・実績・千円）。上期・下期・年間の比率は、月の比率の平均ではなく合計から出し直しています。</div></div></div>`;
  const method = u.fmethod || (e.settings.forecast || {}).method || "avg3";
  const actual = A.map((p) => (p ? p.revenue : null)), budget = B.map((p) => (p ? p.revenue : null)), prior = P.map((p) => (p ? p.revenue : null));
  const land = EHMS.landing({ actual, budget, prior, method, target: sumsB.year.revenue, manual: (u.manualForecast || []) });
  const lastA = actual.map((v, i) => (v !== null ? i : -1)).filter((i) => i >= 0).pop();
  const forecastSeries = actual.map((v, i) => (i === lastA ? v : v === null ? land.forecast[i] : null)); // 最後の実績から予測の線をつなぐ
  const fmtM = (x, short) => (x === null || x === undefined ? "未入力" : short ? `${Math.round(x / 10000).toLocaleString("ja-JP")}万` : man(x));
  const landCard = `<div class="card"><div class="card-h"><span>年間売上の着地予測</span>
    <span style="display:flex;gap:6px;align-items:center;font-size:12px;">予測方式 <select onchange="eh().ui.fmethod=this.value;render()">${[["avg3", "直近3か月平均"], ["avg6", "直近6か月平均"], ["seasonal", "前年の季節変動"], ["budget", "月別予算"], ["manual", "手動"]].map(([k, l]) => `<option value="${k}" ${k === method ? "selected" : ""}>${l}</option>`).join("")}</select></span></div><div class="card-b">
    <div class="grid g4" style="margin-bottom:10px;">
      ${ehTile("ly_land", "年間着地予測（標準）", ehMan(land.value), `楽観 ${ehMan(land.scenarios.optimistic)}・悲観 ${ehMan(land.scenarios.pessimistic)}`, land.explain)}
      ${ehTile("ly_act", "確定済み実績累計", ehMan(land.actualSum), `${land.closedMonths}か月分`)}
      ${ehTile("ly_target", "年間予算・達成見込み", ehMan(sumsB.year.revenue), `見込み ${ehPct(land.achievement)}`)}
      ${ehTile("ly_req", "残り期間の必要平均売上", ehMan(land.requiredAvg), `残り${land.remaining}か月`, land.explainRequired)}
    </div>
    ${method === "manual" ? `<div class="small" style="margin-bottom:6px;">未経過月の予測を入力：${months.map((mk, i) => actual[i] === null ? `<label style="display:inline-block;margin:2px 6px;">${Number(mk.slice(5))}月 <input class="num" style="width:90px;" value="${(u.manualForecast || [])[i] ?? ""}" onchange="(eh().ui.manualForecast=eh().ui.manualForecast||[])[${i}]=this.value===''?null:Number(this.value);render()"/></label>` : "").join("")}</div>` : ""}
    ${ehLineChart("land", months.map(monthLabel), [{ label: "確定実績", color: EH_COLORS.actual, values: actual }, { label: "予測（未経過月）", color: EH_COLORS.actual, dash: "3 3", values: forecastSeries }, { label: "予算", color: EH_COLORS.budget, dash: "6 4", values: budget }, { label: "前年", color: EH_COLORS.prior, dash: "2 3", values: prior }], fmtM)}
    <div class="small">確定実績は実線、予測（未経過月）は点線で区別しています。楽観・悲観は予測部分を±10%。</div></div></div>`;
  return head + ehBar({ hq: true }) + `<div style="margin:-4px 0 10px;"><span class="chips" style="margin:0;"><button class="chip ${u.alloc !== false ? "sel" : ""}" onclick="eh().ui.alloc=true;render()">本部経費 配賦後</button><button class="chip ${u.alloc === false ? "sel" : ""}" onclick="eh().ui.alloc=false;render()">配賦前</button></span></div>` + table + landCard;
}

// ===== 5. マスター設定 =====
function secEhmsMaster() {
  const head = ehHead("⚙", "マスター設定", "店舗・事業部・会計科目・会社の設定（会計年度の開始月・目標値・本部経費の配賦方式）。店舗や科目は削除せず「無効」にします（過去の数字を守るため）。");
  const g = ehGuard(); if (g) return head + g;
  const e = eh(), s = e.settings, t = ehTargets(), c = s.company || {};
  const set = `<div class="card"><div class="card-h">会社の設定 ${ehCan.settings() ? "" : '<span class="small">（変更は社長・経営者だけ）</span>'}</div><div class="card-b"><div class="form">
    <div><label>会社名</label><input ${ehCan.settings() ? "" : "disabled"} value="${esc(c.name || "")}" onchange="ehSaveSetting('company','name',this.value)"/></div>
    <div><label>会計年度の開始月</label><select ${ehCan.settings() ? "" : "disabled"} onchange="ehSaveSetting('company','fiscal_start_month',Number(this.value))">${Array.from({ length: 12 }, (_, i) => i + 1).map((m) => `<option value="${m}" ${m === ehFiscalStart() ? "selected" : ""}>${m}月</option>`).join("")}</select></div>
    <div><label>目標営業利益率（%）</label><input ${ehCan.settings() ? "" : "disabled"} class="num" value="${t.operating_margin !== undefined ? t.operating_margin * 100 : ""}" onchange="ehSaveSetting('targets','operating_margin',this.value===''?null:Number(this.value)/100)"/></div>
    <div><label>目標人件費率（%）</label><input ${ehCan.settings() ? "" : "disabled"} class="num" value="${t.labor_ratio !== undefined ? t.labor_ratio * 100 : ""}" onchange="ehSaveSetting('targets','labor_ratio',this.value===''?null:Number(this.value)/100)"/></div>
    <div><label>目標稼働率（%）</label><input ${ehCan.settings() ? "" : "disabled"} class="num" value="${t.utilization !== undefined ? t.utilization * 100 : ""}" onchange="ehSaveSetting('targets','utilization',this.value===''?null:Number(this.value)/100)"/></div>
    <div><label>最低資金確保月数</label><input ${ehCan.settings() ? "" : "disabled"} class="num" value="${t.cash_months ?? ""}" onchange="ehSaveSetting('targets','cash_months',this.value===''?null:Number(this.value))"/></div>
    <div><label>本部経費の配賦方式</label><select ${ehCan.settings() ? "" : "disabled"} onchange="ehSaveSetting('allocation','method',this.value)">${[["sales", "売上比率"], ["headcount", "人員比率"], ["fte", "常勤換算人数比率"], ["equal", "店舗均等"], ["manual", "個別設定"]].map(([k, l]) => `<option value="${k}" ${k === ((s.allocation || {}).method || "sales") ? "selected" : ""}>${l}</option>`).join("")}</select></div>
    <div><label>着地予測の初期方式</label><select ${ehCan.settings() ? "" : "disabled"} onchange="ehSaveSetting('forecast','method',this.value)">${[["avg3", "直近3か月平均"], ["avg6", "直近6か月平均"], ["seasonal", "前年の季節変動"], ["budget", "月別予算"]].map(([k, l]) => `<option value="${k}" ${k === ((s.forecast || {}).method || "avg3") ? "selected" : ""}>${l}</option>`).join("")}</select></div>
  </div>${(s.allocation || {}).method === "manual" ? `<div class="small">個別設定の比率：${ehActiveStores().map((st) => `<label style="display:inline-block;margin:2px 8px;">${esc(st.name)} <input class="num" style="width:60px;" ${ehCan.settings() ? "" : "disabled"} value="${((s.allocation || {}).manual || {})[st.id] ?? ""}" onchange="ehSaveManualAlloc('${st.id}',this.value)"/></label>`).join("")}</div>` : ""}
  <div class="small">参考初期値（目標営業利益率20%・人件費率45%・稼働率80%・資金6か月）は確定基準ではなく、変更できる参考値です。</div></div></div>`;
  const bus = e.bus;
  const stores = `<div class="card"><div class="card-h"><span>店舗（${e.stores.length}）</span>${ehCan.master() ? `<button class="btn btn-blue btn-sm" onclick="ehAddStore()">＋ 店舗を追加</button>` : ""}</div><div class="card-b scroll"><table>
    <tr><th class="l">コード</th><th class="l">店舗名</th><th class="l">事業部</th><th class="l">開業日</th><th class="l">閉店日</th><th class="l">状態</th><th>並び</th></tr>
    ${e.stores.map((st) => `<tr><td class="l">${esc(st.code)}</td><td class="l">${ehCan.master() ? `<input value="${esc(st.name)}" onchange="ehPatch('ehms_stores','${st.id}',{name:this.value})"/>` : esc(st.name)}</td>
      <td class="l">${ehCan.master() ? `<select onchange="ehPatch('ehms_stores','${st.id}',{business_unit_id:this.value||null})"><option value="">-</option>${bus.map((b) => `<option value="${b.id}" ${b.id === st.business_unit_id ? "selected" : ""}>${esc(b.name)}</option>`).join("")}</select>` : esc((bus.find((b) => b.id === st.business_unit_id) || {}).name || "-")}</td>
      <td class="l">${ehCan.master() ? `<input type="date" value="${st.opened_on || ""}" onchange="ehPatch('ehms_stores','${st.id}',{opened_on:this.value||null})"/>` : esc(st.opened_on || "-")}</td>
      <td class="l">${ehCan.master() ? `<input type="date" value="${st.closed_on || ""}" onchange="ehPatch('ehms_stores','${st.id}',{closed_on:this.value||null})"/>` : esc(st.closed_on || "-")}</td>
      <td class="l">${ehCan.master() ? `<select onchange="ehPatch('ehms_stores','${st.id}',{active:this.value==='1'})"><option value="1" ${st.active ? "selected" : ""}>有効</option><option value="0" ${!st.active ? "selected" : ""}>無効</option></select>` : st.active ? "有効" : "無効"}</td>
      <td>${ehCan.master() ? `<input class="num" style="width:56px;" value="${st.sort}" onchange="ehPatch('ehms_stores','${st.id}',{sort:Number(this.value)||0})"/>` : st.sort}</td></tr>`).join("")}
  </table></div></div>`;
  const buCard = `<div class="card"><div class="card-h"><span>事業部（${bus.length}）</span>${ehCan.master() ? `<button class="btn btn-blue btn-sm" onclick="ehAddBu()">＋ 事業部を追加</button>` : ""}</div><div class="card-b"><table>
    ${bus.map((b) => `<tr><td class="l">${ehCan.master() ? `<input value="${esc(b.name)}" onchange="ehPatch('ehms_business_units','${b.id}',{name:this.value})"/>` : esc(b.name)}</td><td class="l">${ehCan.master() ? `<select onchange="ehPatch('ehms_business_units','${b.id}',{active:this.value==='1'})"><option value="1" ${b.active ? "selected" : ""}>有効</option><option value="0" ${!b.active ? "selected" : ""}>無効</option></select>` : b.active ? "有効" : "無効"}</td></tr>`).join("")}
  </table></div></div>`;
  const secOpts = EH_SECTION_ORDER.map((k) => [k, EHMS.SECTION_LABELS[k]]);
  const accCard = `<div class="card"><div class="card-h"><span>会計科目（${e.accounts.length}）</span>${ehCan.accounts() ? `<button class="btn btn-blue btn-sm" onclick="ehAddAccount()">＋ 科目を追加</button>` : ""}</div><div class="card-b scroll"><table>
    <tr><th class="l">コード</th><th class="l">科目名</th><th class="l">区分</th><th>人件費</th><th>固定費</th><th>本部だけ</th><th class="l">状態</th><th>並び</th></tr>
    ${e.accounts.map((a) => { const ed = ehCan.accounts(); return `<tr><td class="l">${esc(a.code)}</td><td class="l">${ed ? `<input value="${esc(a.name)}" onchange="ehPatch('ehms_accounts','${a.id}',{name:this.value})"/>` : esc(a.name)}</td>
      <td class="l">${ed ? `<select onchange="ehPatch('ehms_accounts','${a.id}',{section:this.value})">${secOpts.map(([k, l]) => `<option value="${k}" ${k === a.section ? "selected" : ""}>${l}</option>`).join("")}</select>` : esc(EHMS.SECTION_LABELS[a.section])}</td>
      ${["is_labor", "is_fixed", "hq_only"].map((f) => `<td><input type="checkbox" ${a[f] ? "checked" : ""} ${ed ? `onchange="ehPatch('ehms_accounts','${a.id}',{${f}:this.checked})"` : "disabled"}/></td>`).join("")}
      <td class="l">${ed ? `<select onchange="ehPatch('ehms_accounts','${a.id}',{active:this.value==='1'})"><option value="1" ${a.active ? "selected" : ""}>有効</option><option value="0" ${!a.active ? "selected" : ""}>無効</option></select>` : a.active ? "有効" : "無効"}</td>
      <td>${ed ? `<input class="num" style="width:56px;" value="${a.sort}" onchange="ehPatch('ehms_accounts','${a.id}',{sort:Number(this.value)||0})"/>` : a.sort}</td></tr>`; }).join("")}
  </table><div class="small" style="margin-top:6px;">売上原価は変動費として扱います。販管費は「固定費」のチェックを外すと変動費（決済手数料など）。「本部だけ」の科目は院の月次PLに出ません（本部経費の二重計上を防ぐため）。</div></div></div>`;
  return head + (e.demo ? `<div class="note">デモデータ表示中です。マスターの変更は実データに戻してから行ってください。</div>` : "") + set + stores + buCard + accCard;
}
async function ehSaveSetting(key, field, value) {
  const e = eh();
  const v = { ...(e.settings[key] || {}), [field]: value };
  try {
    await rest("ehms_settings?on_conflict=key", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: { key, value: v, updated_by: S.user ? S.user.name : null } });
    e.settings[key] = v; flash("✓ 保存しました");
    if (key === "company" && field === "fiscal_start_month") { ehUi().fy = EHMS.fiscalYearOf(thisMonth, ehFiscalStart()); ehUi().month = thisMonth; e.recFy = null; await ehLoadRecords(true); }
  } catch (err) { flash(`保存できませんでした：${err.message}`, true); }
  render();
}
function ehSaveManualAlloc(storeId, raw) { const m = { ...((eh().settings.allocation || {}).manual || {}) }; m[storeId] = raw === "" ? null : Number(raw); ehSaveSetting("allocation", "manual", m); }
async function ehPatch(table, id, body) {
  try {
    const [row] = await rest(`${table}?id=eq.${id}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: { ...body, updated_by: S.user ? S.user.name : null } });
    const list = table === "ehms_stores" ? eh().stores : table === "ehms_accounts" ? eh().accounts : eh().bus;
    const i = list.findIndex((x) => x.id === id); if (i >= 0 && row) list[i] = row;
    flash("✓ 保存しました");
  } catch (err) { flash(`保存できませんでした：${err.message}`, true); }
  render();
}
async function ehInsert(table, body, listName) {
  try { const [row] = await rest(table, { method: "POST", headers: { Prefer: "return=representation" }, body: { ...body, updated_by: S.user ? S.user.name : null } }); eh()[listName].push(row); flash("✓ 追加しました"); }
  catch (err) { flash(`追加できませんでした：${err.message}`, true); }
  render();
}
function ehAddStore() { const name = prompt("店舗名"); if (!name) return; const code = prompt("店舗コード（英数字・重複しないもの）", `STORE${eh().stores.length + 1}`); if (!code) return; ehInsert("ehms_stores", { name, code: code.toUpperCase(), business_unit_id: (eh().bus[0] || {}).id || null, sort: eh().stores.length + 1 }, "stores"); }
function ehAddBu() { const name = prompt("事業部の名前"); if (name) ehInsert("ehms_business_units", { name, sort: eh().bus.length + 1 }, "bus"); }
function ehAddAccount() { const name = prompt("科目名"); if (!name) return; const code = prompt("科目コード（例：R17・S25。重複しないもの）"); if (!code) return; const section = prompt("区分（revenue / cogs / sga / non_op_income / non_op_expense / extra_gain / extra_loss / tax）", "sga"); if (!EH_SECTION_ORDER.includes(section)) { alert("区分が正しくありません"); return; } ehInsert("ehms_accounts", { name, code: code.toUpperCase(), section, sort: 900 + eh().accounts.length }, "accounts"); }

// ===== 6. データ入出力（CSV・Excel） =====
const EH_IO_HEADER = ["年月", "店舗コード", "店舗名", "科目コード", "科目名", "区分", "金額"];
function secEhmsIo() {
  const head = ehHead("🔁", "データ入出力", "CSV・Excel（.xlsx）で月次の予算・実績を取り込み・書き出しします。取り込み前に確認画面を出し、エラー行を表示します。同じファイルを何度取り込んでも、数字は上書きされるだけで重複しません。");
  const g = ehGuard(); if (g) return head + g;
  const e = eh(), u = ehUi();
  const imp = e.importPreview;
  const preview = imp ? `<div class="card"><div class="card-h"><span>取り込み前の確認：${esc(imp.fileName)}</span><span>${imp.already ? '<span class="tag amber">このファイルは取り込み済みです（もう一度取り込んでも上書きされるだけです）</span>' : ""}</span></div><div class="card-b scroll">
    <div class="grid g4" style="margin-bottom:10px;">
      <div class="tile"><div class="k">行数</div><div class="v">${imp.rows.length}</div></div>
      <div class="tile"><div class="k">新しく追加</div><div class="v ok">${imp.rows.filter((r) => !r.error && !r.existing).length}</div></div>
      <div class="tile"><div class="k">上書き（金額が変わる）</div><div class="v warn">${imp.rows.filter((r) => !r.error && r.existing && r.existing.amount !== r.amount).length}</div><div class="s">同じ金額 ${imp.rows.filter((r) => !r.error && r.existing && r.existing.amount === r.amount).length}行は変更なし</div></div>
      <div class="tile"><div class="k">エラー</div><div class="v ${imp.rows.some((r) => r.error) ? "ng" : ""}">${imp.rows.filter((r) => r.error).length}</div><div class="s">エラーの行は取り込みません</div></div>
    </div>
    <table><tr><th class="l">行</th><th class="l">年月</th><th class="l">店舗</th><th class="l">科目</th><th class="l">区分</th><th>金額</th><th class="l">結果</th></tr>
    ${imp.rows.slice(0, 300).map((r) => `<tr><td class="l">${r.line}</td><td class="l">${esc(r.mk || r.raw[0] || "")}</td><td class="l">${esc(r.storeLabel || "")}</td><td class="l">${esc(r.accountLabel || "")}</td><td class="l">${esc(EH_KIND_LABELS[r.kind] || "")}</td><td>${r.amount !== null && r.amount !== undefined ? yen(r.amount) : "-"}</td>
      <td class="l ${r.error ? "ng" : r.existing ? "warn" : "ok"}">${r.error ? esc(r.error) : r.existing ? (r.existing.amount === r.amount ? "変更なし" : `上書き（今 ${yen(r.existing.amount)}）`) : "追加"}</td></tr>`).join("")}
    </table>${imp.rows.length > 300 ? `<div class="small">先頭300行だけ表示しています。</div>` : ""}
    <div style="margin-top:10px;display:flex;gap:8px;"><button class="btn btn-blue" ${ehCan.import() && imp.rows.some((r) => !r.error) ? "" : "disabled"} onclick="ehRunImport()">取り込む</button><button class="btn btn-gray" onclick="eh().importPreview=null;render()">やめる</button></div></div></div>` : "";
  const io = `<div class="grid g2">
    <div class="card"><div class="card-h">取り込み（CSV・Excel）</div><div class="card-b">
      <div class="small" style="margin-bottom:8px;">1行目に見出し（${EH_IO_HEADER.join("・")}）。年月は「2026-07」、店舗は店舗コードか店舗名（空欄＝本部）、科目は科目コードか科目名、区分は「実績・予算・予測」、金額は整数円。締めた月の実績は取り込めません。</div>
      <input type="file" accept=".csv,.xlsx" ${ehCan.import() ? "" : "disabled"} onchange="ehReadFile(this.files[0])"/>
      <div style="margin-top:8px;"><button class="btn btn-gray btn-sm" onclick="ehDownloadTemplate()">取り込み用のひな形（CSV）</button></div>
      ${ehCan.import() ? "" : `<div class="small warn" style="margin-top:6px;">取り込みは社長・GM・経理の権限が必要です。</div>`}
    </div></div>
    <div class="card"><div class="card-h">書き出し（${u.fy}年度）</div><div class="card-b">
      <div style="display:flex;gap:8px;flex-wrap:wrap;"><button class="btn btn-gray btn-sm" onclick="ehExport('csv')">月次データ（CSV）</button><button class="btn btn-gray btn-sm" onclick="ehExport('xlsx')">月次データ（Excel）</button><button class="btn btn-gray btn-sm" onclick="ehExportPl()">年間PL（Excel）</button><button class="btn btn-gray btn-sm" onclick="window.print()">🖨 印刷用</button></div>
      <div class="small" style="margin-top:6px;">見られる店舗の数字だけを書き出します。CSV は Excel で文字化けしないよう BOM 付き UTF-8。</div>
    </div></div></div>`;
  const jobs = e.jobs.length ? `<div class="card"><div class="card-h">取り込みの履歴</div><div class="card-b scroll"><table><tr><th class="l">日時</th><th class="l">ファイル</th><th>行数</th><th>追加</th><th>上書き</th><th>スキップ</th><th class="l">実行者</th></tr>
    ${e.jobs.map((j) => `<tr><td class="l">${esc(new Date(j.created_at).toLocaleString("ja-JP"))}</td><td class="l">${esc(j.file_name || "")}</td><td>${j.rows_total}</td><td>${j.rows_inserted}</td><td>${j.rows_updated}</td><td>${j.rows_skipped}</td><td class="l">${esc(j.created_by || "")}</td></tr>`).join("")}</table></div></div>` : "";
  if (!e.jobsLoaded && ehCan.import()) { e.jobsLoaded = true; rest("ehms_import_jobs?select=*&order=created_at.desc&limit=30").then((r) => { e.jobs = r || []; render(); }).catch(() => {}); }
  return head + ehBar({ scope: false }) + preview + io + jobs;
}
function ehDownload(name, blob) { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); }
const ehCsvCell = (v) => { const s = v === null || v === undefined ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
function ehCsv(rows) { return "﻿" + rows.map((r) => r.map(ehCsvCell).join(",")).join("\r\n"); }
function ehDownloadTemplate() {
  const st = ehActiveStores()[0], ac = ehAccounts()[0];
  ehDownload("EHMS_取り込みひな形.csv", new Blob([ehCsv([EH_IO_HEADER, [ehMonths()[0], st ? st.code : "", st ? st.name : "", ac ? ac.code : "", ac ? ac.name : "", "実績", 1000000]])], { type: "text/csv" }));
}
function ehExportRows() {
  const e = eh(), acc = new Map(e.accounts.map((a) => [a.id, a])), st = new Map(e.stores.map((s) => [s.id, s]));
  const months = new Set(ehMonths());
  return e.records.filter((r) => months.has(r.mk)).sort((a, b) => a.mk.localeCompare(b.mk) || String(a.store_id).localeCompare(String(b.store_id)))
    .map((r) => [r.mk, r.store_id ? (st.get(r.store_id) || {}).code : "", r.store_id ? (st.get(r.store_id) || {}).name : "本部", (acc.get(r.account_id) || {}).code, (acc.get(r.account_id) || {}).name, EH_KIND_LABELS[r.kind], Number(r.amount)]);
}
async function ehExport(type) {
  const rows = [EH_IO_HEADER, ...ehExportRows()];
  if (type === "csv") ehDownload(`EHMS_月次データ_${ehUi().fy}年度.csv`, new Blob([ehCsv(rows)], { type: "text/csv" }));
  else ehDownload(`EHMS_月次データ_${ehUi().fy}年度.xlsx`, await ehXlsx([{ name: "月次データ", rows }]));
}
async function ehExportPl() {
  const months = ehMonths(), u = ehUi();
  const sheets = [EH_ALL, ...ehActiveStores().map((s) => s.id), EH_HQ].map((scope) => {
    const A = ehYearPls(scope, "actual", false), B = ehYearPls(scope, "budget", false);
    const items = [["revenue", "売上高"], ["cogs", "売上原価"], ["gross", "売上総利益"], ["sga", "販管費"], ["labor", "人件費"], ["operating", "営業利益"], ["ordinary", "経常利益"], ["net", "税引後利益"]];
    const rows = [["項目", "区分", ...months, "年間"]];
    for (const [k, l] of items) for (const [arr, kl] of [[B, "予算"], [A, "実績"]]) rows.push([l, kl, ...arr.map((p) => (p && p[k] !== null ? Math.round(p[k]) : "")), EHMS.aggregate(arr)[k] ?? ""]);
    return { name: ehStoreName(scope).slice(0, 28), rows };
  });
  ehDownload(`EHMS_年間PL_${u.fy}年度.xlsx`, await ehXlsx(sheets));
}
// 取り込み：CSV か Excel を読み、確認画面へ
async function ehReadFile(file) {
  if (!file) return;
  const buf = new Uint8Array(await file.arrayBuffer());
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", buf))).map((b) => b.toString(16).padStart(2, "0")).join("");
  let rows;
  try { rows = /\.xlsx$/i.test(file.name) ? (await ehReadXlsx(buf))[0] || [] : ehParseCsv(new TextDecoder("utf-8").decode(buf).replace(/^﻿/, "")); }
  catch (err) { flash(`ファイルを読めませんでした：${err.message}`, true); return; }
  const e = eh();
  const head = (rows[0] || []).map((h) => String(h).trim());
  const col = (name) => head.findIndex((h) => h === name);
  const ci = { mk: col("年月"), store: col("店舗コード") >= 0 ? col("店舗コード") : col("店舗名"), storeName: col("店舗名"), acc: col("科目コード") >= 0 ? col("科目コード") : col("科目名"), accName: col("科目名"), kind: col("区分"), amount: col("金額") };
  if (ci.mk < 0 || ci.acc < 0 || ci.kind < 0 || ci.amount < 0) { flash("見出しに「年月・科目コード（か科目名）・区分・金額」が必要です", true); return; }
  const kindOf = { 実績: "actual", 予算: "budget", 予測: "forecast", actual: "actual", budget: "budget", forecast: "forecast" };
  const seen = new Set();
  const parsed = rows.slice(1).map((raw, i) => ({ raw, line: i + 2 })).filter((r) => r.raw.some((v) => String(v ?? "").trim() !== "")).map((r) => {
    const g = (k) => (ci[k] >= 0 ? String(r.raw[ci[k]] ?? "").trim() : "");
    const out = { ...r };
    let mk = g("mk");
    if (/^\d{5}$/.test(mk)) { const d = new Date(Date.UTC(1899, 11, 30) + Number(mk) * 86400000); mk = d.toISOString().slice(0, 7); }
    const m = mk.match(/^(\d{4})[-/年.](\d{1,2})/);
    out.mk = m ? `${m[1]}-${String(Number(m[2])).padStart(2, "0")}` : null;
    if (!out.mk) { out.error = "年月が読めません（例：2026-07）"; return out; }
    const sv = g("store") || g("storeName");
    const store = sv ? e.stores.find((s) => s.code === sv.toUpperCase() || s.name === sv) : null;
    if (sv && sv !== "本部" && !store) { out.error = `店舗「${sv}」がマスターにありません`; return out; }
    out.storeId = store ? store.id : null; out.storeLabel = store ? store.name : "本部";
    const av = g("acc") || g("accName");
    const acc = e.accounts.find((a) => a.code === av.toUpperCase() || a.name === av);
    if (!acc) { out.error = `科目「${av}」がマスターにありません`; return out; }
    out.accountId = acc.id; out.accountLabel = acc.name;
    if (acc.hq_only && out.storeId) { out.error = `「${acc.name}」は本部だけで使う科目です`; return out; }
    out.kind = kindOf[g("kind")];
    if (!out.kind) { out.error = "区分は「実績・予算・予測」"; return out; }
    const amt = g("amount").replace(/[,，¥円\s]/g, "");
    if (amt === "") { out.error = "金額が空です（未入力は取り込みません）"; return out; }
    if (!/^-?\d+(\.0+)?$/.test(amt)) { out.error = "金額は整数（円）"; return out; }
    out.amount = Number(amt);
    if (!ehCan.write(out.storeId || EH_HQ) && !(out.storeId === null && ["owner", "gm", "accounting"].includes(e.role))) { out.error = "この店舗に書き込む権限がありません"; return out; }
    if (out.kind === "actual" && ehClosed(out.storeId, out.mk)) { out.error = "締めた月の実績は取り込めません"; return out; }
    const key = `${out.storeId}|${out.mk}|${out.accountId}|${out.kind}`;
    if (seen.has(key)) { out.error = "ファイルの中で同じ店舗・年月・科目・区分が重複しています"; return out; }
    seen.add(key);
    return out;
  });
  // 今の値（その月の分を読み直す）
  const months = [...new Set(parsed.filter((r) => r.mk).map((r) => `${r.mk}-01`))];
  const existing = months.length ? await selectAll("ehms_monthly_records", `select=id,store_id,month,account_id,kind,amount&scenario=eq.base&month=in.(${months.join(",")})`) : [];
  for (const r of parsed) if (!r.error) r.existing = existing.find((x) => (x.store_id || null) === r.storeId && String(x.month).slice(0, 7) === r.mk && x.account_id === r.accountId && x.kind === r.kind) || null;
  let already = false;
  try { already = !!(await rest(`ehms_import_jobs?select=id&file_hash=eq.${hash}&limit=1`)).length; } catch (err) { /* 履歴が読めなくても続ける */ }
  e.importPreview = { fileName: file.name, hash, rows: parsed, already };
  render();
}
async function ehRunImport() {
  const e = eh(), imp = e.importPreview;
  if (!imp) return;
  const by = S.user ? S.user.name : null;
  let ins = 0, upd = 0, skip = 0;
  const errors = imp.rows.filter((r) => r.error).map((r) => ({ line: r.line, error: r.error }));
  flash("取り込み中…");
  try {
    const job = (await rest("ehms_import_jobs", { method: "POST", headers: { Prefer: "return=representation" }, body: { file_name: imp.fileName, file_hash: imp.hash, target: "monthly_records", rows_total: imp.rows.length, errors, created_by: by, status: "running" } }))[0];
    const toInsert = imp.rows.filter((r) => !r.error && !r.existing).map((r) => ({ store_id: r.storeId, month: `${r.mk}-01`, account_id: r.accountId, kind: r.kind, amount: r.amount, source: "import", import_job_id: job.id, created_by: by, updated_by: by }));
    for (let i = 0; i < toInsert.length; i += 500) { await rest("ehms_monthly_records", { method: "POST", headers: { Prefer: "return=minimal" }, body: toInsert.slice(i, i + 500) }); ins += toInsert.slice(i, i + 500).length; }
    for (const r of imp.rows.filter((x) => !x.error && x.existing)) {
      if (r.existing.amount === r.amount) { skip++; continue; }
      await rest(`ehms_monthly_records?id=eq.${r.existing.id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: { amount: r.amount, source: "import", import_job_id: job.id, updated_by: by } });
      upd++;
    }
    skip += errors.length;
    flash(`✓ 追加 ${ins}行・上書き ${upd}行・スキップ ${skip}行`);
    e.importPreview = null; e.jobsLoaded = false; e.recFy = null;
    await ehLoadRecords(true);
  } catch (err) { flash(`取り込みの途中で止まりました：${err.message}（ここまでの分は保存されています。もう一度取り込むと残りが入ります）`, true); }
  render();
}
function ehParseCsv(text) {
  const rows = []; let row = [], cur = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; continue; }
    if (c === '"') q = true; else if (c === ",") { row.push(cur); cur = ""; } else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cur); rows.push(row); row = []; cur = ""; } else cur += c;
  }
  if (cur !== "" || row.length) { row.push(cur); rows.push(row); }
  return rows;
}
// ---- Excel（.xlsx）の読み書き（追加ライブラリなし。ブラウザの圧縮機能を使う） ----
async function ehInflate(data) {
  const ds = new DecompressionStream("deflate-raw");
  const out = await new Response(new Blob([data]).stream().pipeThrough(ds)).arrayBuffer();
  return new TextDecoder().decode(out);
}
async function ehReadXlsx(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let eocd = -1; for (let i = buf.length - 22; i >= 0; i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error("Excel の形式ではありません");
  const files = new Map(); let p = dv.getUint32(eocd + 16, true);
  for (let n = 0; n < dv.getUint16(eocd + 10, true); n++) {
    const method = dv.getUint16(p + 10, true), size = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true), el = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
    files.set(new TextDecoder().decode(buf.slice(p + 46, p + 46 + nl)), { method, size, off }); p += 46 + nl + el + cl;
  }
  const get = async (name) => { const f = files.get(name); if (!f) return null; const s = f.off + 30 + dv.getUint16(f.off + 26, true) + dv.getUint16(f.off + 28, true); const d = buf.slice(s, s + f.size); return f.method === 0 ? new TextDecoder().decode(d) : ehInflate(d); };
  const doc = (x) => new DOMParser().parseFromString(x, "application/xml");
  const sst = []; const ss = await get("xl/sharedStrings.xml");
  if (ss) doc(ss).querySelectorAll("si").forEach((si) => sst.push([...si.querySelectorAll("t")].filter((t) => !t.closest("rPh")).map((t) => t.textContent).join("")));
  const rels = doc(await get("xl/_rels/workbook.xml.rels") || "<r/>");
  const wb = doc(await get("xl/workbook.xml"));
  const sheets = [];
  for (const sh of wb.querySelectorAll("sheet")) {
    const rid = sh.getAttribute("r:id") || sh.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id");
    const rel = [...rels.querySelectorAll("Relationship")].find((r) => r.getAttribute("Id") === rid);
    const xml = await get(`xl/${(rel ? rel.getAttribute("Target") : "").replace(/^\/?xl\//, "")}`);
    const rows = [];
    if (xml) doc(xml).querySelectorAll("row").forEach((r) => {
      const ri = Number(r.getAttribute("r")) - 1, row = [];
      r.querySelectorAll("c").forEach((c) => {
        const ref = c.getAttribute("r"); let ci = 0; for (const ch of ref.match(/^[A-Z]+/)[0]) ci = ci * 26 + ch.charCodeAt(0) - 64;
        const t = c.getAttribute("t"), v = c.querySelector("v");
        row[ci - 1] = t === "s" ? sst[Number(v && v.textContent)] : t === "inlineStr" ? c.textContent : v ? v.textContent : "";
      });
      rows[ri] = Array.from({ length: row.length }, (_, i) => row[i] ?? "");
    });
    sheets.push(Array.from({ length: rows.length }, (_, i) => rows[i] || []));
  }
  return sheets;
}
const EH_CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function ehCrc32(b) { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = EH_CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
// シート [{ name, rows }] → .xlsx（無圧縮の zip）
async function ehXlsx(sheets) {
  const x = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const colName = (i) => { let s = ""; i++; while (i) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
  const files = {
    "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`,
    "_rels/.rels": `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    "xl/workbook.xml": `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${x(s.name.replace(/[\\/?*[\]:]/g, " "))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}</Relationships>`,
  };
  sheets.forEach((s, i) => {
    files[`xl/worksheets/sheet${i + 1}.xml`] = `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${s.rows.map((r, ri) => `<row r="${ri + 1}">${r.map((v, ci) => v === "" || v === null || v === undefined ? "" : typeof v === "number" ? `<c r="${colName(ci)}${ri + 1}"><v>${v}</v></c>` : `<c r="${colName(ci)}${ri + 1}" t="inlineStr"><is><t>${x(v)}</t></is></c>`).join("")}</row>`).join("")}</sheetData></worksheet>`;
  });
  const enc = new TextEncoder(), parts = [], central = []; let off = 0;
  for (const [name, text] of Object.entries(files)) {
    const nm = enc.encode(name), data = enc.encode(text), crc = ehCrc32(data);
    const lh = new DataView(new ArrayBuffer(30)); lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, nm.length, true);
    const ch = new DataView(new ArrayBuffer(46)); ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, nm.length, true); ch.setUint32(42, off, true);
    parts.push(new Uint8Array(lh.buffer), nm, data); central.push(new Uint8Array(ch.buffer), nm); off += 30 + nm.length + data.length;
  }
  const cdSize = central.reduce((a, b) => a + b.length, 0);
  const end = new DataView(new ArrayBuffer(22)); end.setUint32(0, 0x06054b50, true); end.setUint16(8, Object.keys(files).length, true); end.setUint16(10, Object.keys(files).length, true); end.setUint32(12, cdSize, true); end.setUint32(16, off, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

// ===== 7. 権限・月次締め・変更履歴 =====
function secEhmsAdmin() {
  const head = ehHead("🔐", "権限・月次締め・変更履歴", "誰がどの店舗の数字を見られるか（データベースの行単位で制御）、月次の締め、変更の履歴。");
  const g = ehGuard(); if (g) return head + g;
  const e = eh(), u = ehUi();
  if (!e.adminLoaded) {
    e.adminLoaded = true;
    Promise.all([
      ehCan.roles() ? rest("ehms_user_roles?select=*") : Promise.resolve([]),
      ehCan.roles() ? rest("clinic_staff?select=name,role,auth_uid&auth_uid=not.is.null&order=name.asc").catch(() => []) : Promise.resolve([]),
      ehCan.audit() ? rest("ehms_audit_logs?select=id,table_name,action,at,before,after&order=at.desc&limit=80") : Promise.resolve([]),
    ]).then(([roles, staff, audit]) => { e.roles = roles || []; e.staff = staff || []; e.audit = audit || []; render(); }).catch((err) => flash(err.message, true));
  }
  const roles = ehCan.roles() ? `<div class="card"><div class="card-h"><span>役割と担当店舗</span><button class="btn btn-blue btn-sm" onclick="ehAddRole()">＋ 役割を付ける</button></div><div class="card-b scroll">
    <div class="small" style="margin-bottom:6px;">社長・経営者／GM／経理は全店舗、BM／院長は担当店舗だけ。役割のない人は EHMS を見られません（給与を見る権限のある管理者は、役割がなくても社長・経営者として扱います）。</div>
    <table><tr><th class="l">氏名</th><th class="l">役割</th><th class="l">担当店舗（BM・院長）</th><th class="l">状態</th><th></th></tr>
    ${e.roles.map((r) => `<tr><td class="l"><b>${esc(r.name || r.auth_uid)}</b></td>
      <td class="l"><select onchange="ehSaveRole('${r.auth_uid}',{role:this.value})">${Object.entries(EH_ROLE_LABELS).map(([k, l]) => `<option value="${k}" ${k === r.role ? "selected" : ""}>${l}</option>`).join("")}</select></td>
      <td class="l">${["bm", "store_manager"].includes(r.role) ? ehActiveStores().map((s) => `<label style="display:inline-block;margin-right:8px;font-size:12px;"><input type="checkbox" ${(r.store_ids || []).includes(s.id) ? "checked" : ""} onchange="ehToggleRoleStore('${r.auth_uid}','${s.id}',this.checked)"/>${esc(s.name)}</label>`).join("") : '<span class="muted">全店舗</span>'}</td>
      <td class="l"><select onchange="ehSaveRole('${r.auth_uid}',{active:this.value==='1'})"><option value="1" ${r.active ? "selected" : ""}>有効</option><option value="0" ${!r.active ? "selected" : ""}>無効</option></select></td><td></td></tr>`).join("") || '<tr><td class="l muted" colspan="5">まだ役割を付けた人はいません</td></tr>'}
    </table></div></div>` : `<div class="note">役割の設定は社長・経営者だけが行えます。あなたの役割：${esc(EH_ROLE_LABELS[e.role] || e.role)}</div>`;
  const closes = `<div class="card"><div class="card-h">月次締め（${u.fy}年度・全店舗）</div><div class="card-b"><div style="display:flex;flex-wrap:wrap;gap:6px;">
    ${ehMonths().map((mk) => { const c = e.closes.find((x) => String(x.month).slice(0, 7) === mk && !x.store_id); return `<div style="border:1px solid #e2e8f0;border-radius:10px;padding:8px 10px;min-width:120px;"><div style="font-weight:800;">${monthLabel(mk)}</div><div class="small">${c ? `🔒 締め済（${esc(c.closed_by || "")}）` : "未締め"}</div>${ehCan.close() ? `<button class="btn btn-gray btn-sm" style="margin-top:4px;" onclick="ehToggleClose('${mk}',${c ? `'${c.id}'` : "null"})">${c ? "締め解除" : "締める"}</button>` : ""}</div>`; }).join("")}
  </div><div class="small" style="margin-top:6px;">締めた月の実績は、画面からも取り込みからも変更できません（データベースで止めます）。修正するときは、社長・経理が締め解除してから直し、もう一度締めてください。操作は変更履歴に残ります。</div></div></div>`;
  const audit = ehCan.audit() ? `<div class="card"><div class="card-h">変更履歴（新しい順・80件）</div><div class="card-b scroll"><table><tr><th class="l">日時</th><th class="l">対象</th><th class="l">操作</th><th class="l">内容</th></tr>
    ${e.audit.map((a) => { const d = a.after || a.before || {}; const what = d.amount !== undefined ? `${d.month || ""} ${ehStoreName(d.store_id || EH_HQ)} ${(e.accounts.find((x) => x.id === d.account_id) || {}).name || ""} ${EH_KIND_LABELS[d.kind] || ""} ${a.before && a.after ? `${yen(a.before.amount)} → ${yen(a.after.amount)}` : yen(d.amount)}` : d.name || d.key || d.month || ""; return `<tr><td class="l small">${esc(new Date(a.at).toLocaleString("ja-JP"))}</td><td class="l small">${esc(a.table_name.replace("ehms_", ""))}</td><td class="l small">${esc({ INSERT: "追加", UPDATE: "変更", DELETE: "削除" }[a.action] || a.action)}</td><td class="l small">${esc(what)}${d.updated_by ? `（${esc(d.updated_by)}）` : ""}</td></tr>`; }).join("") || '<tr><td class="l muted" colspan="4">履歴はまだありません</td></tr>'}
  </table></div></div>` : "";
  return head + ehBar({ scope: false }) + roles + closes + audit;
}
async function ehToggleClose(mk, id) {
  try {
    if (id) await rest(`ehms_month_closes?id=eq.${id}`, { method: "DELETE" });
    else await rest("ehms_month_closes", { method: "POST", headers: { Prefer: "return=minimal" }, body: { store_id: null, month: `${mk}-01`, closed_by: S.user ? S.user.name : null } });
    eh().closes = await rest("ehms_month_closes?select=*"); flash(id ? "締めを解除しました" : "✓ 締めました");
  } catch (err) { flash(`できませんでした：${err.message}`, true); }
  render();
}
function ehAddRole() {
  const e = eh();
  const candidates = e.staff.filter((s) => !e.roles.some((r) => r.auth_uid === s.auth_uid));
  if (!candidates.length) { alert("役割を付けられるスタッフ（ログインできる人）がいません"); return; }
  const list = candidates.map((s, i) => `${i + 1}. ${s.name}`).join("\n");
  const n = Number(prompt(`役割を付ける人の番号を入れてください\n${list}`));
  const s = candidates[n - 1]; if (!s) return;
  const role = prompt("役割（owner / gm / bm / store_manager / accounting / staff）", "store_manager");
  if (!EH_ROLE_LABELS[role]) { alert("役割が正しくありません"); return; }
  ehSaveRole(s.auth_uid, { name: s.name, role, active: true }, true);
}
async function ehSaveRole(uid, body, isNew) {
  try {
    const by = S.user ? S.user.name : null;
    if (isNew) await rest("ehms_user_roles", { method: "POST", headers: { Prefer: "return=minimal" }, body: { auth_uid: uid, ...body, updated_by: by } });
    else await rest(`ehms_user_roles?auth_uid=eq.${uid}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: { ...body, updated_by: by, updated_at: new Date().toISOString() } });
    eh().roles = await rest("ehms_user_roles?select=*"); flash("✓ 保存しました");
  } catch (err) { flash(`保存できませんでした：${err.message}`, true); }
  render();
}
function ehToggleRoleStore(uid, storeId, on) {
  const r = eh().roles.find((x) => x.auth_uid === uid); if (!r) return;
  const ids = new Set(r.store_ids || []); if (on) ids.add(storeId); else ids.delete(storeId);
  ehSaveRole(uid, { store_ids: [...ids] });
}
