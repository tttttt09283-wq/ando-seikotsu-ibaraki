// EHMS Phase 2 の画面：既存シートからの取り込み・スタッフ／生産性・必要売上根拠シミュレーター・適正人員配置
// 共通の部品は index.html と ehms-ui.js のもの。計算は ehms-calc.js（EHMS）。
/* global ehFiscalStart, go, S, esc, yen, man, pct, rest, apiGet, render, flash, todayStr, thisMonth, monthLabel, EHMS, HQ, eh, ehUi, ehGuard, ehHead, ehBar, ehTile, ehMan, ehYen, ehPct, ehPl, ehAllocation, ehActiveStores, ehCan, ehMonths, ehRecs, ehClosed, ehLoadRecords, selectAll, intakeFiles, fitBudget, loadFit, loadWage, secFit, EH_HQ, EH_ALL, EH_KIND_LABELS, rateCls */

// ===== 店舗名の照合（シートの院名 → EHMS の店舗。別名 aliases を使う） =====
function ehStoreByName(name) {
  const k = HQ.fitClinicKey(name);
  if (!k) return null;
  return eh().stores.find((s) => [s.name, ...(s.aliases || [])].some((a) => { const ak = HQ.fitClinicKey(a); return ak === k || ak.startsWith(k) || k.startsWith(ak); })) || null;
}
const ehAcc = (code) => eh().accounts.find((a) => a.code === code) || null;

// ===== スタッフ・報酬の読み込み =====
async function ehLoadPeople(force) {
  const e = eh();
  if (e.peopleLoading || (e.peopleLoaded && !force)) return;
  e.peopleLoading = true;
  try {
    e.canSeePay = (await rest("rpc/ehms_can_see_pay", { method: "POST", body: {} })) === true;
    e.employees = await rest("ehms_employees?select=*&order=name.asc");
    e.pay = e.canSeePay ? await rest("ehms_employee_pay?select=*&order=effective_from.desc") : [];
    e.metrics = await selectAll("ehms_monthly_metrics", `select=id,store_id,month,metric,kind,value&scenario=eq.base&kind=eq.actual&month=gte.${EHMS.fiscalMonths(ehUi().fy - 1, ehFiscalStart())[0]}-01`);
    e.peopleLoaded = true; e.peopleErr = null;
  } catch (err) { e.peopleErr = /ehms_employees|ehms_can_see_pay/.test(err.message) ? "Phase 2 のテーブルがまだありません。sql/2026-11-26_ehms_phase2.sql を Supabase で実行してください" : err.message; }
  e.peopleLoading = false;
  render();
}
function ehPeopleGuard() {
  const g = ehGuard(); if (g) return g;
  const e = eh();
  if (e.peopleErr) return `<div class="err">${esc(e.peopleErr)}</div>`;
  if (!e.peopleLoaded) { setTimeout(() => ehLoadPeople(false), 0); return `<div class="center">スタッフを読み込み中...</div>`; }
  return "";
}
const ehPayOf = (empId) => (eh().pay || []).filter((p) => p.employee_id === empId && p.effective_from <= todayStr).sort((a, b) => b.effective_from.localeCompare(a.effective_from))[0] || null;
const ehStaffSet = () => eh().settings.staffing || {};
const ehNum = (v, d) => (v === null || v === undefined || v === "" || !isFinite(v) ? d : Number(v));
// 個人売上（台帳・直近3か月の平均）
function ehPersonSales(name) {
  const n = String(name || "").replace(/[\s　]/g, "").replace(/﨑/g, "崎");
  const p = ((S.model && S.model.people) || []).find((x) => { const xn = String(x.name || "").replace(/[\s　]/g, "").replace(/﨑/g, "崎"); return xn === n || (n.length >= 2 && xn.startsWith(n)) || (xn.length >= 2 && n.startsWith(xn)); });
  if (!p) return { sales: null, months: 0 };
  const ms = (p.monthlySales || []).filter((m) => m.total !== null && m.total !== undefined && m.total > 0).slice(-3);
  return { sales: ms.length ? ms.reduce((a, m) => a + m.total, 0) / ms.length : null, months: ms.length };
}
// 勤怠（賃金管理表・最新月。salary_viewer だけ読み込まれている）
function ehPersonWork(name) {
  if (!S.wage || S.wage === "loading" || !S.wage.tabs || !S.wage.tabs.length) return null;
  const t = S.wage.tabs[0];
  const n = String(name || "").replace(/[\s　]/g, "");
  const p = t.people.find((x) => String(x.name).replace(/[\s　]/g, "") === n || String(x.name).replace(/[\s　]/g, "").startsWith(n));
  return p ? { month: t.month, days: p.values["出勤日数（日）"] ?? null, hours: p.values["総勤務（時間）"] ?? null } : null;
}
// 店舗の月平均（直近3か月の実績）：固定費（人件費を除く）・変動費率・売上
function ehStoreAvg(storeId) {
  const months = ehMonths().filter((mk) => mk <= thisMonth);
  const pls = [];
  for (let i = months.length - 1; i >= 0 && pls.length < 3; i--) { const p = ehPl(storeId, months[i], "actual", false); if (p.hasData && p.revenue) pls.push({ mk: months[i], p, alloc: ehAllocation(months[i], "actual").shares[storeId] || 0 }); }
  if (!pls.length) return null;
  const avg = (f) => pls.reduce((a, x) => a + (f(x) || 0), 0) / pls.length;
  const revenue = avg((x) => x.p.revenue);
  return { months: pls.length, revenue, fixedExLabor: avg((x) => (x.p.fixed || 0) - (x.p.labor || 0)), labor: avg((x) => x.p.labor), variableRate: EHMS.ratio(avg((x) => x.p.variable), revenue), hqAlloc: avg((x) => x.alloc) };
}
// 店舗の常勤換算（スタッフの fte。未入力の人は1、直接売上でない人も含む）
function ehStoreFte(storeId, directOnly) {
  return eh().employees.filter((x) => x.active && x.store_id === storeId && (!directOnly || x.direct_sales)).reduce((a, x) => a + ehNum(x.fte, 1), 0);
}
// 院の延べ来院（指標の最新月、なければ null）と単価
function ehStoreVisits(storeId) {
  const ms = (eh().metrics || []).filter((m) => m.store_id === storeId && m.metric === "visits").sort((a, b) => String(b.month).localeCompare(String(a.month)));
  if (!ms.length) return null;
  const mk = String(ms[0].month).slice(0, 7);
  const p = ehPl(storeId, mk, "actual", false);
  return { month: mk, visits: Number(ms[0].value), unitPrice: p.hasData && p.revenue ? p.revenue / Number(ms[0].value) : null };
}

// ===== 1. 既存シートからの取り込み（データ入出力の中） =====
function ehSyncCard() {
  if (!ehCan.import()) return "";
  const files = typeof intakeFiles === "function" ? intakeFiles() : [];
  const b = typeof fitBudget === "function" && S.fit && S.fit !== "loading" ? fitBudget() : null;
  if (!S.fit && !S.fitErr && typeof loadFit === "function") setTimeout(() => loadFit(false), 0);
  return `<div class="card"><div class="card-h">既存のシートから取り込み（日計表・年間予算）</div><div class="card-b">
    <div class="small" style="margin-bottom:8px;">日計表の院ごとの「合計」行から、売上（保険窓口・自費・物販・保険者請求。合計＝総売上になる4つ）と新患数・延べ来院数・レセ枚数・再診数・キャンセル数を実績として取り込みます。年間予算シートからは院別・月別の売上予算を取り込みます。取り込み前に確認画面が出ます。同じ月を取り込み直すと上書きされるだけで、重複しません。</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
      <span class="small">日計表：</span>${files.length ? files.slice(0, 8).map((f) => `<button class="btn btn-gray btn-sm" onclick="ehSyncDaily('${f.month}')">${esc(monthLabel(f.month))}</button>`).join("") : `<span class="muted">日計表が読み込まれていません（「📥 データ取り込み」を確認）</span>`}
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:8px;">
      <span class="small">年間予算：</span>${b && b.fy ? `<button class="btn btn-gray btn-sm" onclick="ehSyncBudget()">「${esc(b.title)}」（${b.fy}年度）の売上予算</button>` : S.fitErr ? `<span class="small warn">${esc(S.fitErr)}</span>` : `<span class="muted">読み込み中...</span>`}
    </div></div></div>`;
}
async function ehExistingFor(table, months) {
  if (!months.length) return [];
  const cols = table === "ehms_monthly_metrics" ? "id,store_id,month,metric,kind,value" : "id,store_id,month,account_id,kind,amount";
  return selectAll(table, `select=${cols}&scenario=eq.base&month=in.(${months.map((m) => `${m}-01`).join(",")})`);
}
async function ehSyncDaily(month) {
  const f = intakeFiles().find((x) => x.month === month);
  if (!f) return;
  flash("日計表を読み込み中…");
  let book;
  try { const raw = await apiGet(`/api/intake?file=${encodeURIComponent(f.id)}`); book = HQ.parseDailyBook(raw.tabs); }
  catch (err) { flash(`日計表を読めませんでした：${err.message}`, true); return; }
  const rows = []; let line = 0;
  for (const c of book.clinics) {
    const st = ehStoreByName(c.name);
    const conv = EHMS.dailyTotalToRecords(c.total);
    for (const r of conv.records) {
      const acc = ehAcc(r.code);
      rows.push({ line: ++line, raw: [], mk: month, storeId: st ? st.id : null, storeLabel: st ? st.name : c.name, accountId: acc && acc.id, accountLabel: acc ? acc.name : r.code, kind: "actual", amount: r.amount, error: !st ? `院「${c.name}」が店舗マスターにありません（別名を追加してください）` : !acc ? `科目 ${r.code} がありません` : ehClosed(st.id, month) ? "締めた月の実績は取り込めません" : conv.matches === false ? `内訳の合計（${yen(conv.sum)}）が総売上（${yen(conv.totalSales)}）と合いません` : null });
    }
    for (const m of conv.metrics) rows.push({ line: ++line, raw: [], mk: month, storeId: st ? st.id : null, storeLabel: st ? st.name : c.name, metric: m.metric, accountLabel: `指標：${ehMetricLabel(m.metric)}`, kind: "actual", amount: m.value, error: !st ? `院「${c.name}」が店舗マスターにありません` : ehClosed(st.id, month) ? "締めた月の実績は取り込めません" : null });
  }
  await ehAttachExisting(rows);
  eh().importPreview = { fileName: `${f.name || "日計表"}（${monthLabel(month)}）`, hash: `sheet:daily:${f.id}`, rows, already: false, source: "sheet", note: month >= thisMonth ? "今月は途中までの数字です。月末のあとにもう一度取り込むと上書きされます。" : "" };
  render();
}
async function ehSyncBudget() {
  const b = fitBudget();
  if (!b || !b.fy) return;
  const months = EHMS.fiscalMonths(b.fy, 7);
  const acc = ehAcc("R90");
  const rows = []; let line = 0;
  for (const c of b.clinics.filter((x) => x.key !== "全社")) {
    const st = ehStoreByName(c.name);
    months.forEach((mk) => {
      const v = c.months[Number(mk.slice(5))];
      if (!v || v.budget === null || v.budget === undefined) return;
      rows.push({ line: ++line, raw: [], mk, storeId: st ? st.id : null, storeLabel: st ? st.name : c.name, accountId: acc && acc.id, accountLabel: acc ? acc.name : "R90", kind: "budget", amount: Math.round(v.budget), error: !st ? `院「${c.name}」が店舗マスターにありません` : !acc ? "科目 R90 がありません" : null });
    });
  }
  await ehAttachExisting(rows);
  eh().importPreview = { fileName: `年間予算「${b.title}」（${b.fy}年度）`, hash: `sheet:budget:${b.title}`, rows, already: false, source: "sheet", note: "売上予算は総額だけなので「売上予算（総額・内訳なし）」の科目に入れます。売上高の合計で予算と比べられます。" };
  render();
}
async function ehAttachExisting(rows) {
  const months = [...new Set(rows.map((r) => r.mk))];
  const [recs, mets] = await Promise.all([ehExistingFor("ehms_monthly_records", months), ehExistingFor("ehms_monthly_metrics", months)]);
  for (const r of rows) {
    if (r.error) continue;
    r.existing = r.metric
      ? (mets.find((x) => (x.store_id || null) === r.storeId && String(x.month).slice(0, 7) === r.mk && x.metric === r.metric && x.kind === r.kind) || null)
      : (recs.find((x) => (x.store_id || null) === r.storeId && String(x.month).slice(0, 7) === r.mk && x.account_id === r.accountId && x.kind === r.kind) || null);
    if (r.existing && r.metric) r.existing = { ...r.existing, amount: Number(r.existing.value) };
  }
}
const EH_METRIC_LABELS = { new_patients: "新患数", visits: "延べ来院数", receipts: "レセ枚数", revisits: "再診数", cancels: "キャンセル数" };
const ehMetricLabel = (m) => EH_METRIC_LABELS[m] || m;

// ===== 2. スタッフ・生産性 =====
function secEhmsStaff() {
  const head = ehHead("👤", "スタッフ・生産性", "スタッフのマスター（院・役職・雇用形態・常勤換算・勤務時間）と、生産性（1日・1時間あたり売上、人件費に対する売上倍率、必要売上の達成率）。給与は給与を見る権限のある人だけに表示します。院長・受付・本部など直接売上を持たない人は、直接売上だけで評価しません。");
  const g = ehPeopleGuard(); if (g) return head + g;
  const e = eh(), u = ehUi(), set = ehStaffSet();
  if (e.canSeePay && S.salaryViewer === true && !S.wage && !S.wageErr && typeof loadWage === "function") setTimeout(() => loadWage(false), 0);
  const filter = u.staffStore || "";
  const mult = ehPolicy().multiple; // 会社の目安：売上＝人件費×3
  const list = e.employees.filter((x) => (u.showInactive || x.active) && (!filter || x.store_id === filter || (filter === "none" && !x.store_id)));
  const orgTab = S.fit && S.fit !== "loading" && S.fit.org ? HQ.orgTabForMonth(S.fit.org, thisMonth).tab : null;
  const rows = list.map((x) => {
    const pay = ehPayOf(x.id);
    const cost = pay ? EHMS.employmentCost(pay, { socialRate: ehNum(set.social_rate, 0.155) }) : null;
    const ps = ehPersonSales(x.name);
    const work = ehPersonWork(x.name);
    const sa = x.store_id ? ehStoreAvg(x.store_id) : null;
    const fte = x.store_id ? ehStoreFte(x.store_id) : 0;
    const req = cost ? EHMS.requiredSales({ salary: cost.base, socialInsurance: cost.social, bonus: cost.bonus, welfare: cost.welfare, education: cost.education, storeFixed: sa && fte ? sa.fixedExLabor / fte : 0, hqAllocation: sa && fte ? sa.hqAlloc / fte : 0, variableRate: sa && sa.variableRate !== null ? sa.variableRate : 0.05, targetMargin: ehNum((e.settings.targets || {}).operating_margin, 0.2) }) : null;
    const prod = EHMS.productivity({ sales: ps.sales, cost: cost && cost.total, workDays: work ? work.days : x.monthly_work_days, workHours: work ? work.hours : x.monthly_work_hours, treatHours: x.treat_hours, fte: x.fte, required: req && !req.error ? req.required : null });
    const org = orgTab ? HQ.clinicOfPerson(x.name, orgTab) : null;
    return { x, pay, cost, ps, work, req, prod, org };
  });
  const verdict = (r) => !r.x.direct_sales ? { cls: "nobudget", label: "直接売上で評価しない" } : r.prod.requiredRate === null ? { cls: "nobudget", label: "データ不足" } : r.prod.requiredRate >= 1 ? { cls: "ok", label: "必要売上を達成" } : r.prod.requiredRate >= 0.8 ? { cls: "surplus", label: "あと少し" } : { cls: "short", label: "必要売上に未達" };
  const ed = ehCan.master();
  const storeSel = (x) => ed ? `<select onchange="ehPatchEmp('${x.id}',{store_id:this.value||null})"><option value="">（本部・未配属）</option>${ehActiveStores().map((s) => `<option value="${s.id}" ${s.id === x.store_id ? "selected" : ""}>${esc(s.name)}</option>`).join("")}</select>` : esc((e.stores.find((s) => s.id === x.store_id) || {}).name || "本部・未配属");
  const table = `<div class="card"><div class="card-h"><span>スタッフ（${list.length}人）</span><span style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
      <select onchange="eh().ui.staffStore=this.value;render()"><option value="">全店舗</option>${ehActiveStores().map((s) => `<option value="${s.id}" ${s.id === filter ? "selected" : ""}>${esc(s.name)}</option>`).join("")}<option value="none" ${filter === "none" ? "selected" : ""}>本部・未配属</option></select>
      <label class="small"><input type="checkbox" ${u.showInactive ? "checked" : ""} onchange="eh().ui.showInactive=this.checked;render()"/> 退職者も表示</label>
      ${ed && orgTab ? `<button class="btn btn-gray btn-sm" onclick="ehFillFromOrg()">組織図から院・役職を反映</button>` : ""}
      ${ed ? `<button class="btn btn-blue btn-sm" onclick="ehAddEmployee()">＋ スタッフを追加</button>` : ""}</span></div><div class="card-b scroll"><table>
    <tr><th class="l">氏名</th><th class="l">院</th><th class="l">役職</th><th class="l">雇用形態</th><th>常勤換算</th><th>直接売上</th>${e.canSeePay ? "<th>月給（支給合計）</th><th>雇用コスト（月）</th>" : ""}<th>個人売上（月平均）</th><th>出勤日数</th><th>1日あたり売上</th><th>1時間あたり売上</th>${e.canSeePay ? "<th>人件費倍率</th><th>売上の目安（人件費×${mult}）</th><th>必要売上</th>" : ""}<th>必要売上の達成率</th><th class="l">判定</th></tr>
    ${rows.map((r) => { const v = verdict(r); const x = r.x; return `<tr${x.active ? "" : ' style="opacity:.5;"'}><td class="l"><b>${esc(x.name)}</b>${ed ? `<div><a href="javascript:void(0)" class="small" onclick="ehPatchEmp('${x.id}',{active:${!x.active}})">${x.active ? "退職にする" : "在籍に戻す"}</a></div>` : ""}</td>
      <td class="l">${storeSel(x)}</td>
      <td class="l">${ed ? `<input style="width:96px;" value="${esc(x.position || "")}" placeholder="${esc(r.org ? r.org.role : "役職")}" onchange="ehPatchEmp('${x.id}',{position:this.value||null})"/>` : esc(x.position || (r.org ? r.org.role : "-"))}</td>
      <td class="l">${ed ? `<select onchange="ehPatchEmp('${x.id}',{employment_type:this.value||null})"><option value="">-</option>${["正社員", "短時間正社員", "アルバイト", "パート", "業務委託"].map((t) => `<option ${t === x.employment_type ? "selected" : ""}>${t}</option>`).join("")}</select>` : esc(x.employment_type || "-")}</td>
      <td>${ed ? `<input class="num" style="width:56px;" value="${x.fte ?? ""}" placeholder="1" onchange="ehPatchEmp('${x.id}',{fte:this.value===''?null:Number(this.value)})"/>` : x.fte ?? "-"}</td>
      <td><input type="checkbox" ${x.direct_sales ? "checked" : ""} ${ed ? `onchange="ehPatchEmp('${x.id}',{direct_sales:this.checked})"` : "disabled"}/></td>
      ${e.canSeePay ? `<td>${ed ? `<input class="num" style="width:96px;" value="${r.pay && r.pay.total_pay !== null ? r.pay.total_pay : ""}" placeholder="未入力" onchange="ehSavePay('${x.id}',this.value)"/>` : ehYen(r.pay && r.pay.total_pay)}${r.pay ? `<div class="small">${esc(r.pay.effective_from)}〜</div>` : ""}</td><td>${r.cost ? man(r.cost.total) : "-"}${r.cost && r.cost.socialEstimated ? `<div class="small">社保は${Math.round(ehNum(set.social_rate, 0.155) * 1000) / 10}%で見込み</div>` : ""}</td>` : ""}
      <td>${ehMan(r.ps.sales)}${r.ps.months ? `<div class="small">${r.ps.months}か月</div>` : ""}</td><td>${r.work && r.work.days !== null ? `${r.work.days}日` : x.monthly_work_days ? `${x.monthly_work_days}日` : "-"}</td>
      <td>${r.prod.perDay !== null ? yen(r.prod.perDay) : "-"}</td><td>${r.prod.perHour !== null ? yen(r.prod.perHour) : "-"}</td>
      ${e.canSeePay ? `<td>${r.prod.costMultiple !== null ? `${(Math.round(r.prod.costMultiple * 10) / 10).toFixed(1)}倍` : "-"}</td><td>${r.cost ? `${man(r.cost.total * mult)}${r.ps.sales ? `<div class="small ${r.ps.sales >= r.cost.total * mult ? "ok" : "ng"}">達成率 ${pct(r.ps.sales / (r.cost.total * mult), 0)}</div>` : ""}` : "-"}</td><td>${r.req && !r.req.error ? `<a href="javascript:void(0)" onclick="eh().ui.reqEmp='${x.id}';go('ehms_required')">${man(r.req.required)}</a>` : "-"}</td>` : ""}
      <td>${ehPct(r.prod.requiredRate)}</td><td class="l"><span class="vtag ${v.cls}">${esc(v.label)}</span></td></tr>`; }).join("")}
  </table><div class="small" style="margin-top:6px;">個人売上：台帳（進捗売上実績の「個人」）の直近3か月平均。出勤日数・勤務時間：賃金管理表の最新月（給与を見る権限のある人だけ）。必要売上：その人の雇用コスト＋院の固定費（人件費を除く）と本部経費の配賦を院の常勤換算で割った額から、目標営業利益率で計算（金額を押すと根拠シミュレーターへ）。売上の目安：会社の方針「人件費の3倍」（雇用コスト×倍率。倍率は「💰 人件費枠・賞与原資」で設定）。給与を変えると、今月1日から適用する新しい記録を作ります（過去の記録は変えません）。</div></div></div>`;
  return head + ehBar({ scope: false }) + table;
}
async function ehPatchEmp(id, body) {
  try {
    const [row] = await rest(`ehms_employees?id=eq.${id}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: { ...body, updated_by: S.user ? S.user.name : null } });
    const i = eh().employees.findIndex((x) => x.id === id); if (i >= 0 && row) eh().employees[i] = row;
    flash("✓ 保存しました");
  } catch (err) { flash(`保存できませんでした：${err.message}`, true); }
  render();
}
async function ehSavePay(empId, raw) {
  const v = String(raw).replace(/[,，¥円\s]/g, "");
  if (v !== "" && !/^\d+$/.test(v)) { flash("金額は整数（円）で入力してください", true); render(); return; }
  if (v === "") { flash("給与を消すときは、管理者に依頼してください（過去の記録を守るため）", true); render(); return; }
  try {
    await rest("ehms_employee_pay?on_conflict=employee_id,effective_from", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: { employee_id: empId, effective_from: `${thisMonth}-01`, total_pay: Number(v), source: "manual", updated_by: S.user ? S.user.name : null } });
    eh().pay = await rest("ehms_employee_pay?select=*&order=effective_from.desc"); flash("✓ 保存しました（今月から適用）");
  } catch (err) { flash(`保存できませんでした：${err.message}`, true); }
  render();
}
async function ehAddEmployee() {
  const name = prompt("氏名"); if (!name) return;
  try { const [row] = await rest("ehms_employees", { method: "POST", headers: { Prefer: "return=representation" }, body: { name, store_id: eh().ui.staffStore && eh().ui.staffStore !== "none" ? eh().ui.staffStore : null, updated_by: S.user ? S.user.name : null } }); eh().employees.push(row); flash("✓ 追加しました"); }
  catch (err) { flash(`追加できませんでした：${err.message}`, true); }
  render();
}
// 組織図（今月のタブ）の院・役職を、未入力のスタッフに入れる
async function ehFillFromOrg() {
  const tab = HQ.orgTabForMonth(S.fit.org, thisMonth).tab;
  let n = 0;
  for (const x of eh().employees.filter((y) => y.active)) {
    const hit = HQ.clinicOfPerson(x.name, tab);
    if (!hit) continue;
    const st = ehStoreByName(hit.clinic);
    const body = {};
    if (!x.position) body.position = hit.role;
    if (!x.store_id && st) body.store_id = st.id;
    if (/受付/.test(hit.role) && x.direct_sales) body.direct_sales = false;
    if (Object.keys(body).length) { await rest(`ehms_employees?id=eq.${x.id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: { ...body, updated_by: S.user ? S.user.name : null } }); n++; }
  }
  eh().employees = await rest("ehms_employees?select=*&order=name.asc");
  flash(`✓ ${n}人に反映しました`); render();
}

// ===== 3. 必要売上根拠シミュレーター =====
function secEhmsRequired() {
  const head = ehHead("🎯", "必要売上根拠シミュレーター", "スタッフの売上目標が「なぜその金額なのか」を説明します。給与だけでなく、雇用の維持・店舗の運営・本部の運営・会社の利益（将来投資とスタッフ還元の原資）まで積み上げて、必要な売上を出します。");
  const g = ehPeopleGuard(); if (g) return head + g;
  const e = eh(), u = ehUi(), set = ehStaffSet();
  const emp = e.employees.find((x) => x.id === u.reqEmp) || null;
  const pay = emp ? ehPayOf(emp.id) : null;
  const cost = pay ? EHMS.employmentCost(pay, { socialRate: ehNum(set.social_rate, 0.155) }) : null;
  const storeId = (emp && emp.store_id) || u.reqStore || (ehActiveStores()[0] || {}).id;
  const sa = storeId ? ehStoreAvg(storeId) : null;
  const fte = storeId ? ehStoreFte(storeId) : 0;
  const vis = storeId ? ehStoreVisits(storeId) : null;
  const t = e.settings.targets || {};
  const def = {
    salary: cost ? Math.round(cost.base) : 300000, socialInsurance: cost ? Math.round(cost.social) : Math.round(300000 * ehNum(set.social_rate, 0.155)), bonus: cost ? Math.round(cost.bonus) : 25000,
    commute: 0, welfare: cost ? Math.round(cost.welfare) : 5000, education: cost ? Math.round(cost.education) : 3500,
    storeFixed: sa && fte ? Math.round(sa.fixedExLabor / fte) : 150000, hqAllocation: sa && fte ? Math.round(sa.hqAlloc / fte) : 30000,
    variableRate: sa && sa.variableRate !== null ? Math.round(sa.variableRate * 1000) / 10 : 5, targetMargin: Math.round(ehNum(t.operating_margin, 0.2) * 1000) / 10,
    workDays: (emp && emp.monthly_work_days) || ehNum(set.work_days, 22), treatHours: (emp && emp.treat_hours) || 140,
    unitPrice: vis && vis.unitPrice ? Math.round(vis.unitPrice) : 3000, maxPerHour: 2, utilization: Math.round(ehNum(t.utilization, 0.8) * 100),
    currentSales: emp ? Math.round(ehPersonSales(emp.name).sales || 0) || "" : "",
  };
  const st = u.reqInputs && u.reqInputs.__key === `${u.reqEmp || ""}|${storeId}` ? u.reqInputs : (u.reqInputs = { __key: `${u.reqEmp || ""}|${storeId}`, ...def });
  const p = {
    salary: ehNum(st.salary, 0), socialInsurance: ehNum(st.socialInsurance, 0), bonus: ehNum(st.bonus, 0), commute: ehNum(st.commute, 0), welfare: ehNum(st.welfare, 0), education: ehNum(st.education, 0),
    storeFixed: ehNum(st.storeFixed, 0), hqAllocation: ehNum(st.hqAllocation, 0), variableRate: ehNum(st.variableRate, 0) / 100, targetMargin: ehNum(st.targetMargin, 0) / 100,
    workDays: ehNum(st.workDays, null), treatHours: ehNum(st.treatHours, null), unitPrice: ehNum(st.unitPrice, null), currentSales: st.currentSales === "" ? null : ehNum(st.currentSales, null),
  };
  const r = EHMS.requiredSales(p);
  const showPay = e.canSeePay;
  const field = (k, label, unit, hint) => `<div><label>${esc(label)}${unit ? `（${unit}）` : ""}</label><input class="num" style="width:100%;" value="${st[k] ?? ""}" onchange="eh().ui.reqInputs['${k}']=this.value===''?'':Number(String(this.value).replace(/[,，¥円%\\s]/g,''));render()"/>${hint ? `<div class="small">${esc(hint)}</div>` : ""}</div>`;
  const picker = `<div class="card"><div class="card-b"><div class="ctl">
    <div><label>スタッフ（任意）</label><select onchange="eh().ui.reqEmp=this.value;eh().ui.reqInputs=null;render()"><option value="">（条件を手入力）</option>${e.employees.filter((x) => x.active).map((x) => `<option value="${x.id}" ${x.id === u.reqEmp ? "selected" : ""}>${esc(x.name)}${x.store_id ? `（${esc((e.stores.find((s) => s.id === x.store_id) || {}).name || "")}）` : ""}</option>`).join("")}</select></div>
    <div><label>院（店舗運営費・本部経費の配賦）</label><select ${emp && emp.store_id ? "disabled" : ""} onchange="eh().ui.reqStore=this.value;eh().ui.reqInputs=null;render()">${ehActiveStores().map((s) => `<option value="${s.id}" ${s.id === storeId ? "selected" : ""}>${esc(s.name)}</option>`).join("")}</select></div>
    <div style="margin-left:auto;"><button class="btn btn-gray btn-sm" onclick="eh().ui.reqInputs=null;render()">初期値に戻す</button></div></div>
    <div class="small" style="margin-top:6px;">初期値：給与は報酬マスター${showPay ? "" : "（給与を見る権限がないため仮の値）"}、店舗運営費・本部経費・変動費率は院の直近${sa ? sa.months : 0}か月の実績${sa ? "" : "（実績がないため仮の値）"}を院の常勤換算 ${Math.round(fte * 10) / 10}人で割った額、単価は${vis && vis.unitPrice ? `${monthLabel(vis.month)}の売上÷延べ来院` : "仮の値"}、目標営業利益率・稼働率は会社の設定。</div></div></div>`;
  const inputs = `<div class="card"><div class="card-h">条件</div><div class="card-b"><div class="form">
    ${showPay || !emp ? field("salary", "給与（月の支給額）", "円") : `<div><label>給与（月の支給額）</label><div class="muted">非表示（権限なし）</div></div>`}
    ${field("socialInsurance", "会社負担の社会保険料", "円/月")}${field("bonus", "賞与予算（月割）", "円/月")}${field("commute", "交通費（支給額に含まれない分）", "円/月")}${field("welfare", "福利厚生費", "円/月")}${field("education", "教育費", "円/月")}
    ${field("storeFixed", "店舗運営費の負担", "円/月", "院の固定費（人件費以外）÷常勤換算")}${field("hqAllocation", "本部運営費の負担", "円/月", "本部経費の配賦÷常勤換算")}
    ${field("variableRate", "変動費率", "%")}${field("targetMargin", "目標営業利益率", "%")}
    ${field("workDays", "月の勤務日数", "日")}${field("treatHours", "月の施術可能時間", "時間", "勤務−休憩・会議・教育・管理業務")}${field("unitPrice", "平均患者単価", "円")}${field("maxPerHour", "1時間の最大対応数", "人")}${field("utilization", "目標稼働率", "%")}${field("currentSales", "現在の売上（月）", "円")}
  </div></div></div>`;
  if (r.error) return head + picker + `<div class="err">${esc(r.error)}</div>` + inputs;
  const cost2 = { base: p.salary + p.commute };
  const parts = EHMS.requiredSalesBreakdown(r, p, cost2);
  const feas = EHMS.feasibility({ required: r.required, treatHours: p.treatHours, unitPrice: p.unitPrice, maxPerHour: ehNum(st.maxPerHour, null), utilization: ehNum(st.utilization, null) / 100 });
  e.explains = {};
  const tiles = `<div class="grid g4" style="margin-bottom:12px;">
    ${ehTile("rq_req", "必要月間売上", `<span style="color:#142D3C;">${man(r.required)}</span>`, `損益分岐点 ${man(r.breakEven)}`, r.explain)}
    ${ehTile("rq_day", "必要日次売上", r.perDay !== null ? yen(r.perDay) : "-", `${p.workDays ?? "-"}日で割る`, EHMS.explain(r.perDay, "必要日次売上 ＝ 必要月間売上 ÷ 月間勤務日数", { 必要月間売上: r.required, 月間勤務日数: p.workDays }))}
    ${ehTile("rq_hour", "必要時間売上", r.perHour !== null ? yen(r.perHour) : "-", feas.cap !== null ? `上限 ${yen(feas.cap)}／時` : "", feas.explain, feas.level === "ng" ? "ng" : feas.level === "warn" ? "warn" : "")}
    ${ehTile("rq_pat", "必要患者対応数（月）", r.patients !== null ? `${Math.ceil(r.patients)}人` : "-", p.workDays && r.patients ? `1日 約${Math.round(r.patients / p.workDays * 10) / 10}人` : "", EHMS.explain(r.patients, "必要患者対応数 ＝ 必要売上 ÷ 平均患者単価", { 必要売上: r.required, 平均患者単価: p.unitPrice }))}
    ${ehTile("rq_emp", "雇用にかかる費用（月）", man(r.employment), `給与の ${p.salary ? (Math.round(r.employment / p.salary * 100) / 100).toFixed(2) : "-"}倍`)}
    ${ehTile("rq_burden", "総固定的負担額（月）", man(r.burden), "雇用＋店舗＋本部")}
    ${ehTile("rq_gap", "現在の売上との差", r.gap === null ? "-" : `${r.gap >= 0 ? "+" : "−"}${man(Math.abs(r.gap))}`, p.currentSales !== null ? `現在 ${man(p.currentSales)}` : "現在の売上が未入力", null, r.gap !== null && r.gap < 0 ? "ng" : "ok")}
    ${ehTile("rq_return", "スタッフ還元・将来投資の原資", man(r.required * p.targetMargin), "必要売上 × 目標営業利益率")}
  </div>`;
  const colors = ["#2a78d6", "#1baf7a", "#eda100", "#6250d6", "#94a3b8", "#C5A46D"];
  const total = parts.reduce((a, x) => a + x.value, 0) || 1;
  let acc = 0;
  const waterfall = `<div class="card"><div class="card-h">必要売上の積み上げ（給与 → 雇用維持 → 店舗運営 → 本部運営 → 変動費 → 利益）</div><div class="card-b">
    <div style="display:flex;height:34px;border-radius:6px;overflow:hidden;gap:2px;background:#fff;">${parts.map((x, i) => `<div title="${esc(x.label)}：${esc(man(x.value))}" style="flex:${Math.max(0.001, x.value)};background:${colors[i]};"></div>`).join("")}</div>
    <table style="margin-top:10px;">${parts.map((x, i) => { acc += x.value; return `<tr><td class="l"><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${colors[i]};margin-right:6px;"></span>${esc(x.label)}</td><td>${man(x.value)}</td><td class="small">${pct(x.value / total, 1)}</td><td class="small">累計 ${man(acc)}</td></tr>`; }).join("")}
      <tr class="total"><td class="l">必要月間売上</td><td>${man(r.required)}</td><td></td><td></td></tr></table></div></div>`;
  const text = `<div class="card"><div class="card-h">説明（自動作成）</div><div class="card-b" style="line-height:1.9;">${esc(EHMS.requiredSalesText(r, { ...p, salary: showPay || !emp ? p.salary : null }))}
    ${feas.level === "ng" ? `<div class="alert ng" style="margin-top:8px;cursor:default;">⚠️ 無理な目標の可能性：必要時間売上 ${yen(feas.perHour)} が、施術可能時間の上限（単価 ${yen(p.unitPrice)} × 1時間 ${st.maxPerHour}人 × 稼働率 ${st.utilization}%＝${yen(feas.cap)}）を超えています。単価・施術可能時間・稼働率・店舗の固定費の見直しが必要です。</div>` : feas.level === "warn" ? `<div class="alert warn" style="margin-top:8px;cursor:default;">必要時間売上が上限の90%を超えています。余裕の少ない目標です。</div>` : ""}</div></div>`;
  // 店舗との整合：院の必要売上 と スタッフ個人の必要売上の合計
  let consistency = "";
  if (sa && storeId) {
    const storeBurden = (sa.labor || 0) + sa.fixedExLabor + sa.hqAlloc;
    const storeReq = EHMS.requiredSales({ totalBurden: storeBurden, variableRate: p.variableRate, targetMargin: p.targetMargin });
    consistency = `<div class="card"><div class="card-h">院全体との整合（${esc((e.stores.find((s) => s.id === storeId) || {}).name || "")}・直近${sa.months}か月平均）</div><div class="card-b"><table>
      <tr><td class="l">院の人件費＋固定費＋本部配賦</td><td>${man(storeBurden)}</td></tr>
      <tr><td class="l">院の必要売上（同じ条件）</td><td><b>${storeReq.error ? "-" : man(storeReq.required)}</b></td></tr>
      <tr><td class="l">院の実際の売上（月平均）</td><td>${man(sa.revenue)}</td></tr>
      <tr><td class="l">常勤換算1人あたりの必要売上</td><td>${storeReq.error || !fte ? "-" : man(storeReq.required / fte)}</td></tr></table>
      <div class="small" style="margin-top:6px;">直接売上を持たない院長・受付などの費用は、院全体で負担する考え方です（個人の必要売上の合計ではなく、院の必要売上で見ます）。</div></div></div>`;
  }
  return head + ehBar({ scope: false }) + picker + tiles + waterfall + text + consistency + inputs;
}

// ===== 4. 適正人員配置（需要から）＋ 組織図×予算の判定 ＋ 組織図の問題点 =====
function secEhmsStaffing() {
  const head = ehHead("⚖️", "適正人員配置", "患者需要（延べ来院）から必要な施術スタッフ数（常勤換算）を出し、今の人員と比べます。不足なら採用・配置転換・予約設計の見直し、余剰なら応援・配置換えを検討します。需要の根拠がない院には採用を勧めません。下に、組織図×予算での判定と組織図の問題点も出します。");
  const g = ehPeopleGuard(); if (g) return head + g + (typeof secFit === "function" ? secFit() : "");
  const e = eh(), u = ehUi(), set = ehStaffSet(), t = e.settings.targets || {};
  const workDays = ehNum(u.stWorkDays, ehNum(set.work_days, 22)), maxPerDay = ehNum(u.stMax, ehNum(set.max_per_day, 15)), util = ehNum(u.stUtil, Math.round(ehNum(t.utilization, 0.8) * 100)) / 100;
  const daysAll = [];
  Object.values(S.intakeBooks || {}).forEach((b) => { if (b && b.clinics) b.clinics.forEach((c) => c.days.forEach((d) => { const v = d.values["総来院数"]; if (v) daysAll.push({ name: c.name, date: d.date, visits: v }); })); });
  const rows = ehActiveStores().map((s) => {
    const vis = ehStoreVisits(s.id);
    const emps = e.employees.filter((x) => x.active && x.store_id === s.id && x.direct_sales);
    const cur = emps.reduce((a, x) => a + ehNum(x.fte, 1), 0);
    const costs = e.canSeePay ? emps.map((x) => { const p = ehPayOf(x.id); const c = p ? EHMS.employmentCost(p, { socialRate: ehNum(set.social_rate, 0.155) }) : null; return c ? c.total : null; }).filter((v) => v !== null) : [];
    const avgCost = costs.length ? costs.reduce((a, b) => a + b, 0) / costs.length : null;
    const r = EHMS.staffingByDemand({ demand: vis ? vis.visits : null, workDays, maxPerDay, utilization: util, currentFte: cur, avgCost, unitPrice: vis ? vis.unitPrice : null });
    const wk = EHMS.weekdayNeeds(daysAll.filter((d) => ehStoreByName(d.name) && ehStoreByName(d.name).id === s.id), maxPerDay * util);
    const advice = !vis ? "需要（延べ来院）のデータがありません。データがないまま採用は勧めません（「🔁 データ入出力」で日計表を取り込んでください）"
      : r.shortage > 0.5 ? `約${Math.round(r.shortage * 10) / 10}人分不足。採用・他院からの応援・予約枠の設計（施術時間・新患枠）の見直しを検討`
      : r.surplus > 1 ? `約${Math.round(r.surplus * 10) / 10}人分余裕。他院への応援・配置換え・集客の強化を検討`
      : "需要に対して適正です";
    return { s, vis, cur, emps, avgCost, r, wk, advice };
  });
  const ctl = `<div class="card"><div class="card-b"><div class="ctl">
    <div><label>1人の月の勤務日数</label><input class="num" style="width:70px;" value="${workDays}" onchange="eh().ui.stWorkDays=Number(this.value);render()"/></div>
    <div><label>1人1日の最大対応数</label><input class="num" style="width:70px;" value="${maxPerDay}" onchange="eh().ui.stMax=Number(this.value);render()"/></div>
    <div><label>目標稼働率（%）</label><input class="num" style="width:70px;" value="${Math.round(util * 100)}" onchange="eh().ui.stUtil=Number(this.value);render()"/></div>
    <div class="small" style="max-width:420px;">1人の適正対応数（月）＝ ${workDays}日 × ${maxPerDay}人 × ${Math.round(util * 100)}% ＝ <b>${Math.round(workDays * maxPerDay * util)}人</b>。今の人員は「👤 スタッフ・生産性」の、直接売上を持つスタッフの常勤換算の合計（未入力は1）。</div>
  </div></div></div>`;
  const table = `<div class="card"><div class="card-h">院ごとの適正人員（需要＝延べ来院の最新月）</div><div class="card-b scroll"><table>
    <tr><th class="l">院</th><th>延べ来院（月）</th><th>必要（常勤換算）</th><th>必要（実人数）</th><th>今の人員</th><th>過不足</th><th>最大対応能力</th><th>受けきれない来院</th><th>機会損失（推定）</th>${e.canSeePay ? "<th>適正にしたときの人件費</th>" : ""}<th class="l">提案</th></tr>
    ${rows.map(({ s, vis, cur, r, advice, avgCost }) => `<tr><td class="l"><b>${esc(s.name)}</b></td><td>${vis ? `${Math.round(vis.visits)}人<div class="small">${esc(monthLabel(vis.month))}</div>` : "-"}</td>
      <td>${r.fte !== null && r.fte !== undefined ? (Math.round(r.fte * 10) / 10).toFixed(1) : "-"}</td><td>${r.heads ?? "-"}</td><td>${Math.round(cur * 10) / 10}</td>
      <td class="${r.gap === null || r.gap === undefined ? "" : r.gap < -0.5 ? "ng" : r.gap > 1 ? "warn" : "ok"}"><b>${r.gap === null || r.gap === undefined ? "-" : `${r.gap >= 0 ? "+" : "−"}${(Math.round(Math.abs(r.gap) * 10) / 10).toFixed(1)}`}</b></td>
      <td>${r.capacity !== null && r.capacity !== undefined ? `${Math.round(r.capacity)}人` : "-"}</td><td>${r.unmet ? `${Math.round(r.unmet)}人` : r.unmet === 0 ? "0" : "-"}</td><td>${r.opportunityLoss ? man(r.opportunityLoss) : "-"}</td>
      ${e.canSeePay ? `<td>${r.laborDelta === null || r.laborDelta === undefined ? "-" : `${r.laborDelta >= 0 ? "+" : "−"}${man(Math.abs(r.laborDelta))}`}${avgCost ? `<div class="small">1人 ${man(avgCost)}</div>` : ""}</td>` : ""}
      <td class="l wrap small" style="min-width:220px;">${esc(advice)}</td></tr>`).join("")}
  </table><div class="small" style="margin-top:6px;">必要常勤換算＝延べ来院 ÷ 1人の適正対応数、実人数は全員常勤と仮定して切り上げ。機会損失＝今の人員で受けきれない来院 × 単価（売上÷延べ来院）。人件費の増減＝過不足 × 1人あたりの雇用コスト（社保を含む見込み）。</div></div></div>`;
  const wdl = "日月火水木金土";
  const heat = `<div class="card"><div class="card-h">曜日別の必要人数（日計表の日別来院の曜日平均 ÷ 1人1日の適正対応数 ${Math.round(maxPerDay * util * 10) / 10}人）</div><div class="card-b scroll"><table>
    <tr><th class="l">院</th>${[1, 2, 3, 4, 5, 6, 0].map((w) => `<th style="text-align:center;">${wdl[w]}</th>`).join("")}</tr>
    ${rows.map(({ s, wk }) => `<tr><td class="l"><b>${esc(s.name)}</b></td>${[1, 2, 3, 4, 5, 6, 0].map((w) => { const x = wk[w]; if (!x.avg) return `<td style="text-align:center;" class="muted">-</td>`; const lvl = x.need >= 5 ? 4 : x.need >= 4 ? 3 : x.need >= 3 ? 2 : x.need >= 2 ? 1 : 0; const bg = ["#eaf2fd", "#cfe1f8", "#a9c9f1", "#7eaee8", "#4f8fdc"][lvl]; return `<td style="padding:3px;"><div title="平均来院 ${Math.round(x.avg)}人（${x.days}日）" style="background:${bg};border-radius:6px;text-align:center;padding:5px 2px;font-weight:800;color:${lvl >= 3 ? "#fff" : "#142D3C"};">${(Math.round(x.need * 10) / 10).toFixed(1)}人<div style="font-size:10px;font-weight:600;">来院${Math.round(x.avg)}</div></div></td>`; }).join("")}</tr>`).join("")}
  </table><div class="small" style="margin-top:6px;">読み込んだ日計表の月の日別データから出しています（時間帯別は日計表に時間のデータがないため、まだ出せません）。</div></div></div>`;
  return head + ehBar({ scope: false }) + ctl + table + heat + (typeof secFit === "function" ? secFit() : "");
}

// ===== 5. 人件費枠・賞与原資（目安＝人件費×3／枠＝売上×42%／余り＝賞与原資・新店舗の担保） =====
// 人件費枠の率は「目標人件費率」（targets.labor_ratio）と同じ値を使う（設定を二重に持たない）
const ehPolicy = () => {
  const p = eh().settings.labor_policy || {};
  return { cap: ehNum(ehTargets().labor_ratio, 0.42), multiple: ehNum(p.multiple, 3), bonusShare: ehNum(p.bonus_share, 0.5) };
};
// 月ごとの売上・人件費（全社）。EHMS の月次PLに売上と人件費の両方があればそれを、無ければ台帳（月次推移の支給合計）を使う
function ehLaborMonths() {
  const months = ehMonths();
  const A = ehYearPls(EH_ALL, "actual", false);
  const led = S.model && S.model.company ? S.model.company.flatMap((h) => h.months || []) : [];
  return months.map((mk, i) => {
    const p = A[i];
    if (p && p.revenue !== null && p.labor !== null && p.revenue > 0) return { mk, sales: p.revenue, labor: p.labor, src: "EHMS" };
    if (S.model && S.model.fiscalYear !== undefined) {
      const m = led.find((x) => HQ.monthKeyInFiscal(S.model.fiscalYear, x.month) === mk);
      if (m && m.sales) return { mk, sales: m.sales, labor: m.labor, src: m.laborEstimated ? "台帳（推定）" : "台帳" };
    }
    return { mk, sales: null, labor: null, src: null };
  });
}
// 院ごと（年度の実績がある月の合計）。EHMS → 台帳（固定人件費×月数）の順
function ehLaborStores(pol) {
  const months = ehMonths();
  return ehActiveStores().map((s) => {
    const A = ehYearPls(s.id, "actual", false).filter((p) => p && p.revenue !== null && p.labor !== null);
    if (A.length) return { name: s.name, n: A.length, src: "EHMS", ...EHMS.laborPolicy({ sales: A.reduce((a, p) => a + p.revenue, 0), labor: A.reduce((a, p) => a + p.labor, 0), ...pol }) };
    const c = S.model && (S.model.clinics || []).find((x) => x.name === s.name || (s.aliases || []).includes(x.name));
    if (!c || c.fixedLabor === undefined || c.fixedLabor === null) return { name: s.name, n: 0, src: null, ...EHMS.laborPolicy({ sales: null, labor: null, ...pol }) };
    const ms = c.months.filter((m) => m.actual && months.includes(HQ.monthKeyInFiscal(S.model.fiscalYear, m.month)));
    return { name: s.name, n: ms.length, src: "台帳（固定人件費×月数）", ...EHMS.laborPolicy({ sales: ms.length ? ms.reduce((a, m) => a + m.actual, 0) : null, labor: ms.length ? c.fixedLabor * ms.length : null, ...pol }) };
  });
}
function secEhmsPool() {
  const head = ehHead("💰", "人件費枠・賞与原資", "会社の方針は「売上の目安は人件費の3倍」「売上が上がっても人件費は売上の42%で組む」。実際の人件費が42%の枠を下回った分が<b>枠の余り</b>で、<b>賞与原資</b>と<b>新店舗の担保</b>になります。欲しい賞与原資から、必要な売上も逆算できます。");
  const g = ehGuard(); if (g) return head + g;
  const e = eh(), u = ehUi(), pol = ehPolicy(), set = ehStaffSet();
  if (!["owner", "gm", "accounting"].includes(e.role)) return head + `<div class="err">全社の人件費と賞与原資は、社長・GM・経理のアカウントだけで表示します。</div>`;
  if (!S.model && !S.modelErr) return head + `<div class="center">台帳を読み込み中...</div>`;
  e.explains = {};
  const rows = ehLaborMonths();
  const done = rows.filter((r) => r.sales !== null && r.labor !== null);
  const sum = (k) => (done.length ? done.reduce((a, r) => a + r[k], 0) : null);
  const ytd = EHMS.laborPolicy({ sales: sum("sales"), labor: sum("labor"), ...pol });
  const n = done.length;
  // 今のペースが続いたときの年間（実績月の平均 × 12）
  const year = n ? EHMS.laborPolicy({ sales: ytd.sales / n * 12, labor: ytd.labor / n * 12, ...pol }) : EHMS.laborPolicy({ sales: null, labor: null, ...pol });
  const ed = ehCan.settings();
  const policyBar = `<div class="card" style="border-top:3px solid #C5A46D;"><div class="card-b"><div class="ctl">
    <div><label>人件費枠（売上に対する%）</label><input class="num" style="width:80px;" ${ed ? "" : "disabled"} value="${Math.round(pol.cap * 1000) / 10}" onchange="ehSaveSetting('targets','labor_ratio',this.value===''?null:Number(this.value)/100)"/></div>
    <div><label>売上の目安（人件費の◯倍）</label><input class="num" style="width:70px;" ${ed ? "" : "disabled"} value="${pol.multiple}" onchange="ehSaveSetting('labor_policy','multiple',this.value===''?null:Number(this.value))"/></div>
    <div><label>余りのうち賞与原資に回す割合（%）</label><input class="num" style="width:80px;" ${ed ? "" : "disabled"} value="${Math.round(pol.bonusShare * 100)}" onchange="ehSaveSetting('labor_policy','bonus_share',this.value===''?null:Math.max(0,Math.min(100,Number(this.value)))/100)"/></div>
    <div class="small" style="max-width:420px;">残り ${Math.round((1 - pol.bonusShare) * 100)}% が新店舗の担保（内部留保）。目安どおり（人件費×${pol.multiple}）なら人件費率は ${(100 / pol.multiple).toFixed(1)}% で、枠の ${Math.round(pol.cap * 1000) / 10}% との差 ${(pol.cap * 100 - 100 / pol.multiple).toFixed(1)}pt が売上に対する余りになります。${ed ? "" : "（変更は社長のアカウントだけ）"}</div>
  </div></div></div>`;
  const cls = (v) => (v === null ? "" : v < 0 ? "ng" : "ok");
  const tiles = `<div class="grid g4" style="margin-bottom:12px;">
    ${ehTile("lp_sales", `年度累計の売上（${n}か月）`, ehMan(ytd.sales), `目安（人件費×${pol.multiple}）${ehMan(ytd.guideSales)}`)}
    ${ehTile("lp_labor", "年度累計の人件費（社保込）", ehMan(ytd.labor), `人件費率 <b class="${ytd.ratio !== null && ytd.ratio > pol.cap ? "ng" : "ok"}">${ehPct(ytd.ratio)}</b>`)}
    ${ehTile("lp_cap", `人件費枠（売上×${Math.round(pol.cap * 1000) / 10}%）`, ehMan(ytd.capAmount), "この金額までは人件費に使ってよい")}
    ${ehTile("lp_pool", "枠の余り", `<span class="${cls(ytd.pool)}">${ytd.pool === null ? "未入力" : `${ytd.pool < 0 ? "−" : ""}${man(Math.abs(ytd.pool))}`}</span>`, ytd.over ? "枠を超えています" : "枠 − 実際の人件費", ytd.explain, ytd.over ? "ng" : "")}
    ${ehTile("lp_bonus", "うち賞与原資", `<span style="color:#7a5a1e;">${ehMan(ytd.bonusPool)}</span>`, `余りの ${Math.round(pol.bonusShare * 100)}%`)}
    ${ehTile("lp_reserve", "うち新店舗の担保", `<span style="color:#142D3C;">${ehMan(ytd.reservePool)}</span>`, `余りの ${Math.round((1 - pol.bonusShare) * 100)}%`)}
    ${ehTile("lp_guide", `目安（人件費×${pol.multiple}）の達成率`, `<span class="${ytd.guideRate === null ? "" : ytd.guideRate >= 1 ? "ok" : "ng"}">${ehPct(ytd.guideRate)}</span>`, ytd.guideGap === null ? "" : `目安まで ${ytd.guideGap >= 0 ? "到達済み" : `あと ${man(-ytd.guideGap)}`}・達成なら余り ${ehMan(ytd.poolAtGuide)}`, ytd.explainGuide)}
    ${ehTile("lp_year", "今のペースで年間の余り", `<span class="${cls(year.pool)}">${year.pool === null ? "未入力" : `${year.pool < 0 ? "−" : ""}${man(Math.abs(year.pool))}`}</span>`, year.pool === null ? "" : `賞与原資 ${man(year.bonusPool)}・担保 ${man(year.reservePool)}`, n ? EHMS.explain(year.pool, "年間の余り ＝（実績月の平均売上 × 12）× 枠 −（実績月の平均人件費 × 12）", { 実績月数: n, 平均売上: ytd.sales / n, 平均人件費: ytd.labor / n, 枠: pol.cap }) : null)}
  </div>`;
  const mrows = rows.map((r) => ({ r, p: EHMS.laborPolicy({ sales: r.sales, labor: r.labor, ...pol }) }));
  const monthly = `<div class="card"><div class="card-h">月別：売上・人件費・42%枠・余り（全社）</div><div class="card-b scroll"><table>
    <tr><th class="l">月</th><th>売上</th><th>人件費（社保込）</th><th>人件費率</th><th>枠（${Math.round(pol.cap * 1000) / 10}%）</th><th>枠の余り</th><th>賞与原資</th><th>新店舗の担保</th><th>目安（×${pol.multiple}）</th><th>目安の達成率</th><th class="l">元データ</th></tr>
    ${mrows.map(({ r, p }) => `<tr><td class="l">${monthLabel(r.mk)}</td><td>${p.sales === null ? '<span class="muted">-</span>' : man(p.sales)}</td><td>${p.labor === null ? "-" : man(p.labor)}</td><td class="${p.ratio !== null && p.ratio > pol.cap ? "ng" : ""}">${p.ratio === null ? "-" : pct(p.ratio, 1)}</td><td>${p.capAmount === null ? "-" : man(p.capAmount)}</td>
      <td class="${cls(p.pool)}"><b>${p.pool === null ? "-" : `${p.pool < 0 ? "−" : ""}${man(Math.abs(p.pool))}`}</b></td><td>${p.bonusPool === null ? "-" : man(p.bonusPool)}</td><td>${p.reservePool === null ? "-" : man(p.reservePool)}</td><td>${p.guideSales === null ? "-" : man(p.guideSales)}</td><td>${p.guideRate === null ? "-" : pct(p.guideRate, 1)}</td><td class="l small">${esc(r.src || "")}</td></tr>`).join("")}
    <tr class="total"><td class="l">累計</td><td>${ehMan(ytd.sales)}</td><td>${ehMan(ytd.labor)}</td><td>${ehPct(ytd.ratio)}</td><td>${ehMan(ytd.capAmount)}</td><td class="${cls(ytd.pool)}">${ytd.pool === null ? "-" : `${ytd.pool < 0 ? "−" : ""}${man(Math.abs(ytd.pool))}`}</td><td>${ehMan(ytd.bonusPool)}</td><td>${ehMan(ytd.reservePool)}</td><td>${ehMan(ytd.guideSales)}</td><td>${ehPct(ytd.guideRate)}</td><td></td></tr></table>
    <div style="margin-top:10px;">${ehBars(mrows.filter(({ p }) => p.pool !== null).map(({ r, p }) => ({ label: `${Number(r.mk.slice(5))}月`, value: p.pool, sub: `率 ${pct(p.ratio, 1)}` })), (v) => `${v < 0 ? "−" : ""}${man(Math.abs(v))}`)}</div>
    <div class="small" style="margin-top:6px;">累計の人件費率は月の率の平均ではなく、累計の人件費 ÷ 累計の売上。枠を超えた月はマイナスのまま累計に入れています（よい月の余りで悪い月を埋める考え方）。元データ：EHMS の月次PLに売上と人件費（人件費の科目）が両方あればそれを、無ければキャリア制度台帳の「月次推移ダッシュボード」の支給合計×（1＋社保率）を使います（支給合計が無い月は各院の固定人件費の合計で推定）。</div></div></div>`;
  const st = ehLaborStores(pol);
  const stores = `<div class="card"><div class="card-h">院別：枠の余り（年度の実績月の合計）</div><div class="card-b scroll"><table>
    <tr><th class="l">院</th><th>月数</th><th>売上</th><th>人件費</th><th>人件費率</th><th>枠の余り</th><th>目安（×${pol.multiple}）の達成率</th><th class="l">元データ</th></tr>
    ${st.map((s) => `<tr><td class="l"><b>${esc(s.name)}</b></td><td>${s.n || "-"}</td><td>${ehMan(s.sales)}</td><td>${ehMan(s.labor)}</td><td class="${s.ratio !== null && s.ratio > pol.cap ? "ng" : ""}">${ehPct(s.ratio)}</td><td class="${cls(s.pool)}"><b>${s.pool === null ? "-" : `${s.pool < 0 ? "−" : ""}${man(Math.abs(s.pool))}`}</b></td><td>${ehPct(s.guideRate)}</td><td class="l small">${esc(s.src || "データなし")}</td></tr>`).join("")}</table>
    <div class="small" style="margin-top:6px;">院ごとの余りは、どの院が賞与原資・担保を生んでいるかを見るためのものです（本部経費は含みません）。台帳の院別人件費は固定人件費の見込みのため、全社の実際の人件費とは合計が一致しないことがあります。</div></div></div>`;
  // ===== シミュレーター：欲しい賞与原資 → 必要売上 =====
  const avgS = n ? ytd.sales / n : null, avgL = n ? ytd.labor / n : null;
  const defMonths = 12;
  const key = `${u.fy}|${n}`;
  const si = u.poolSim && u.poolSim.__key === key ? u.poolSim : (u.poolSim = { __key: key, bonus: 3000000, months: defMonths, labor: avgL === null ? "" : Math.round(avgL * defMonths), current: avgS === null ? "" : Math.round(avgS * defMonths), growth: 0, social: Math.round(ehNum(set.social_rate, 0.155) * 1000) / 10 });
  const f = (k, label, unit, hint) => `<div><label>${esc(label)}${unit ? `（${unit}）` : ""}</label><input class="num" style="width:100%;" value="${si[k] ?? ""}" onchange="ehPoolSim('${k}',this.value)"/>${hint ? `<div class="small">${esc(hint)}</div>` : ""}</div>`;
  const P = { bonus: ehNum(si.bonus, null), labor: ehNum(si.labor, null), cap: pol.cap, bonusShare: pol.bonusShare, socialRate: ehNum(si.social, 0) / 100, months: ehNum(si.months, 12), currentSales: si.current === "" ? null : ehNum(si.current, null), laborGrowth: ehNum(si.growth, 0) / 100 };
  const r = EHMS.bonusTarget(P);
  const nm = P.months || 12;
  const simIn = `<div class="form">
    ${f("bonus", "欲しい賞与原資（期間の合計・支給額）", "円")}${f("months", "期間", "か月", "12＝年間、6＝半期")}
    ${f("labor", "期間の人件費（社保込・賞与を除く）", "円", avgL === null ? "実績がないため手入力" : `初期値：実績の月平均 ${man(avgL)} × 期間`)}
    ${f("current", "今のペースの売上（期間）", "円", avgS === null ? "" : `初期値：実績の月平均 ${man(avgS)} × 期間`)}
    ${f("social", "賞与にかかる会社の社保率", "%")}${f("growth", "売上が増えたとき人件費が増える割合", "%", "0＝今の人員のまま。歩合・増員がある場合は入れる（例：歩合10%なら10）")}
  </div><div style="margin-top:8px;"><button class="btn btn-gray btn-sm" onclick="eh().ui.poolSim=null;render()">初期値に戻す</button></div>`;
  let simOut = "";
  if (r.error) simOut = `<div class="err">${esc(r.error)}</div>`;
  else {
    const guide = P.labor !== null ? P.labor * pol.multiple : null;
    simOut = `<div class="grid g4" style="margin:12px 0;">
      ${ehTile("bs_pool", "必要な枠の余り", man(r.poolNeeded), `賞与 ${man(P.bonus)}＋社保 ${man(r.bonusCost - P.bonus)} を ${Math.round(pol.bonusShare * 100)}% で割る`)}
      ${ehTile("bs_req", `必要売上（${nm}か月）`, `<span style="color:#142D3C;">${man(r.required)}</span>`, `月あたり <b>${man(r.perMonth)}</b>`, r.explain)}
      ${ehTile("bs_gap", "今のペースとの差", r.extra === null ? "-" : `<span class="${r.extra > 0 ? "ng" : "ok"}">${r.extra > 0 ? "+" : "−"}${man(Math.abs(r.extra))}</span>`, r.extra === null ? "今の売上が未入力" : r.extra > 0 ? `月あたり +${man(r.extraPerMonth)}（${pct(r.growth, 1)}増）` : "今のペースで届きます", null, r.extra !== null && r.extra > 0 ? "ng" : "ok")}
      ${ehTile("bs_ratio", "その売上での人件費率", ehPct(r.ratioAt), `人件費 ${man(r.laborAt)}（賞与を除く）`)}
      ${ehTile("bs_reserve", "同時に貯まる新店舗の担保", man(r.reserve), `余りの ${Math.round((1 - pol.bonusShare) * 100)}%`)}
      ${ehTile("bs_guide", `目安（人件費×${pol.multiple}）との比較`, guide === null ? "-" : man(guide), guide === null ? "" : r.required <= guide ? `目安を達成すれば届きます（目安での余り ${man(guide * pol.cap - P.labor)}）` : `目安より ${man(r.required - guide)} 多く必要`)}
    </div>
    <div class="card" style="background:#fffaf0;border-color:#C5A46D;"><div class="card-b" style="line-height:1.9;">${esc(`賞与原資を${man(P.bonus)}確保するには、会社負担の社保を含めて${man(r.bonusCost)}が必要です。枠の余りのうち賞与に回すのは${Math.round(pol.bonusShare * 100)}%なので、枠の余りは${man(r.poolNeeded)}必要になり、残りの${man(r.reserve)}は新店舗の担保として残ります。${nm}か月の人件費${man(P.labor)}${P.laborGrowth ? `（売上が増えた分の${Math.round(P.laborGrowth * 1000) / 10}%が人件費に乗る前提）` : ""}に対して、人件費を売上の${Math.round(pol.cap * 1000) / 10}%に収めながらこの余りを出すには、${nm}か月で${man(r.required)}（月${man(r.perMonth)}）の売上が必要です。${r.extra === null ? "" : r.extra > 0 ? `今のペースより月${man(r.extraPerMonth)}（${pct(r.growth, 1)}）多く売り上げる必要があります。` : "今のペースで届きます。"}`)}</div></div>`;
    const presets = [1000000, 2000000, 3000000, 5000000, 10000000, 20000000];
    const pr = presets.map((b) => ({ b, x: EHMS.bonusTarget({ ...P, bonus: b }) }));
    simOut += `<div style="margin-top:12px;font-weight:800;font-size:13px;color:#1e3a5f;">早見表（同じ条件で賞与原資を変えた場合）</div><table>
      <tr><th class="l">賞与原資</th><th>必要な枠の余り</th><th>必要売上（${nm}か月）</th><th>月あたり</th><th>今のペースとの差（月）</th><th>人件費率</th></tr>
      ${pr.map(({ b, x }) => `<tr><td class="l"><a href="javascript:void(0)" onclick="ehPoolSim('bonus',${b})">${man(b)}</a></td><td>${x.error ? "-" : man(x.poolNeeded)}</td><td>${x.error ? "-" : man(x.required)}</td><td><b>${x.error ? "-" : man(x.perMonth)}</b></td><td class="${!x.error && x.extraPerMonth > 0 ? "ng" : "ok"}">${x.error || x.extraPerMonth === null ? "-" : `${x.extraPerMonth > 0 ? "+" : "−"}${man(Math.abs(x.extraPerMonth))}`}</td><td>${x.error ? "-" : pct(x.ratioAt, 1)}</td></tr>`).join("")}</table>`;
  }
  const sim = `<div class="card" style="border-top:3px solid #142D3C;"><div class="card-h">🎁 シミュレーター：賞与原資をいくら欲しいか → 必要な売上</div><div class="card-b">${simIn}${simOut}
    <div class="small" style="margin-top:8px;">計算：必要な枠の余り ＝ 賞与 ×（1＋社保率）÷ 賞与に回す割合。必要売上 ＝（期間の人件費 ＋ 必要な枠の余り）÷ 人件費枠（売上連動の人件費がある場合はその分を差し引いて計算）。シミュレーションは画面の中だけで、実績・予算は書き換えません。</div></div></div>`;
  return head + ehBar({ scope: false }) + policyBar + tiles + sim + monthly + stores;
}
function ehPoolSim(k, raw) {
  const u = ehUi();
  const v = raw === "" ? "" : Number(String(raw).replace(/[,，¥円%\s]/g, ""));
  u.poolSim[k] = v === "" || isFinite(v) ? v : u.poolSim[k];
  // 期間を変えたら、月平均から人件費・今の売上を引き直す
  if (k === "months" && isFinite(v) && v > 0) {
    const done = ehLaborMonths().filter((r) => r.sales !== null && r.labor !== null);
    if (done.length) { u.poolSim.labor = Math.round(done.reduce((a, r) => a + r.labor, 0) / done.length * v); u.poolSim.current = Math.round(done.reduce((a, r) => a + r.sales, 0) / done.length * v); }
  }
  render();
}

// ===== 6. デイリー稼働：その日の人件費と、月の支出に対する1日の利益 =====
// 見られる人：EHMS の役割がある人（院の共用アカウントは役割なし＝見えない）。一般スタッフは見えない。
// BM・院長は担当院だけ。実際の制御はデータベースの RLS（報酬・実績）で、ここは画面の出し分け。
function ehDailyCanSee(storeId) {
  const e = eh();
  if (!e.loaded || !e.role || e.role === "staff" || e.demo) return false;
  if (["owner", "gm", "accounting"].includes(e.role)) return true;
  return !!storeId && e.storeIds.includes(storeId);
}
function ehDailyEnsure() {
  const e = eh();
  if (!e.loaded && !e.loading && !e.err) setTimeout(() => ehLoad(false), 0);
  if (e.loaded && e.role && e.role !== "staff" && !e.peopleLoaded && !e.peopleLoading && !e.peopleErr) setTimeout(() => ehLoadPeople(false), 0);
}
const ehDailySet = () => eh().settings.daily_costs || {};
// 院のその月の人件費・固定費・変動費率（どこから取ったかも返す）
function ehMonthCosts(clinicName, mk) {
  const e = eh(), st = ehStoreByName(clinicName);
  if (!st || !ehDailyCanSee(st.id)) return null;
  const p = ehPl(st.id, mk, "actual", false);
  const avg = ehStoreAvg(st.id);
  const set = ehDailySet();
  let labor = null, laborSrc = null;
  if (p.hasData && p.labor) { labor = p.labor; laborSrc = "EHMS 月次PL"; }
  else if (e.canSeePay && e.peopleLoaded) {
    const sr = ehNum(ehStaffSet().social_rate, 0.155);
    const costs = e.employees.filter((x) => x.active && x.store_id === st.id).map((x) => { const pay = ehPayOf(x.id); const c = pay ? EHMS.employmentCost(pay, { socialRate: sr }) : null; return c ? c.total : null; }).filter((v) => v !== null);
    if (costs.length) { labor = costs.reduce((a, b) => a + b, 0); laborSrc = `報酬マスター（在籍${costs.length}人）`; }
  }
  if (labor === null && S.model && S.model.clinics) {
    const k = HQ.fitClinicKey(clinicName);
    const c = S.model.clinics.find((x) => HQ.fitClinicKey(x.name) === k || [st.name, ...(st.aliases || [])].includes(x.name));
    if (c && c.fixedLabor) { labor = c.fixedLabor; laborSrc = "台帳（固定人件費・社保込）"; }
  }
  let fixed = null, fixedSrc = null;
  const manual = (set.fixed || {})[st.id];
  if (p.hasData && p.fixed !== null && p.fixed - (p.labor || 0) > 0) { fixed = p.fixed - (p.labor || 0); fixedSrc = "EHMS 月次PL"; }
  else if (manual !== undefined && manual !== null && manual !== "") { fixed = Number(manual); fixedSrc = "手入力（月の固定費）"; }
  else if (avg && avg.fixedExLabor > 0) { fixed = avg.fixedExLabor; fixedSrc = `直近${avg.months}か月の実績平均`; }
  const vr = avg && avg.variableRate !== null ? avg.variableRate : ehNum(set.variable_rate, null);
  return { store: st, labor, laborSrc, fixed, fixedSrc, variableRate: vr, variableSrc: avg && avg.variableRate !== null ? "実績" : vr !== null ? "手入力" : null };
}
// シフト表から、その月の営業日数と延べ出勤予定
function ehShiftPlan(clinicName, mk) {
  const shifts = S.shift && S.shift !== "loading" ? S.shift.clinics || [] : [];
  const k = HQ.fitClinicKey(clinicName);
  const sh = shifts.find((s) => s.key === k || HQ.fitClinicKey(s.name) === k);
  if (!sh) return null;
  const ds = Object.keys(sh.days).filter((d) => d.startsWith(mk));
  if (!ds.length) return null;
  let open = 0, staffDays = 0;
  ds.forEach((d) => { const x = sh.days[d]; if ((x.am && x.am.open) || (x.pm && x.pm.open)) { open++; staffDays += new Set([...(x.am ? x.am.on : []), ...(x.pm ? x.pm.on : [])]).size; } });
  return open ? { days: open, staffDays } : null;
}
// 日曜を除いた日数（シフト表が無いときの営業日の推定）
function ehWeekdaysIn(mk) {
  const [y, m] = mk.split("-").map(Number); const n = new Date(y, m, 0).getDate(); let c = 0;
  for (let d = 1; d <= n; d++) if (new Date(y, m - 1, d).getDay() !== 0) c++;
  return c;
}
// 院ごとの月の結果（その月の日計表の全日）
function ehDailyProfitAll(book, dates, mk) {
  const shifts = S.shift && S.shift !== "loading" ? S.shift.clinics : [];
  const perDate = dates.map((d) => HQ.dailyOverview({ book, shifts, date: d, opt: dailyOpt() }));
  const names = [...new Set(perDate.flatMap((o) => o.rows.map((r) => r.name)))];
  const set = ehDailySet();
  return names.map((name) => {
    const cost = ehMonthCosts(name, mk);
    if (!cost) return null;
    const plan = ehShiftPlan(name, mk);
    const manualDays = (set.days || {})[cost.store.id];
    const plannedDays = manualDays ? Number(manualDays) : plan ? plan.days : ehWeekdaysIn(mk);
    const days = perDate.map((o) => { const r = o.rows.find((x) => x.name === name); return r && r.sales !== null && r.sales !== undefined && (r.sales > 0 || r.visits > 0) ? { date: o.date, sales: r.sales, staffN: r.staffN } : null; /* 売上も来院も0の日は休み */ }).filter(Boolean);
    const res = EHMS.dailyProfit({ days, monthLabor: cost.labor, monthFixed: cost.fixed, variableRate: cost.variableRate, plannedDays, plannedStaffDays: !manualDays && plan ? plan.staffDays : null });
    return { name, cost, plan, plannedDays, daysSrc: manualDays ? "手入力" : plan ? "シフト表" : "推定（日曜を除く日数）", res };
  }).filter(Boolean);
}
// 全院の合計（日付ごとに足す。どこかの院が未入力なら利益は算出不可）
function ehDailySum(list) {
  const dates = [...new Set(list.flatMap((x) => x.res.rows.map((r) => r.date)))].sort();
  let cum = 0, cumM = 0, broken = false;
  const exp = list.every((x) => x.res.complete) ? list.reduce((a, x) => a + x.res.expense, 0) : null;
  let recoveredOn = null;
  const rows = dates.map((d) => {
    const rs = list.map((x) => x.res.rows.find((r) => r.date === d)).filter(Boolean);
    const add = (k) => (rs.some((r) => r[k] === null) ? null : rs.reduce((a, r) => a + r[k], 0));
    const row = { date: d, sales: add("sales"), staffN: rs.reduce((a, r) => a + (r.staffN || 0), 0) || null, variable: add("variable"), margin: add("margin"), labor: add("labor"), fixed: add("fixed"), afterLabor: add("afterLabor"), profit: add("profit") };
    cumM += row.margin || 0; if (row.profit === null) broken = true; else cum += row.profit;
    if (recoveredOn === null && exp !== null && cumM >= exp) recoveredOn = d;
    return { ...row, cumMargin: cumM, cumProfit: broken ? null : cum, laborRatio: row.labor === null ? null : EHMS.ratio(row.labor, row.sales) };
  });
  const complete = exp !== null;
  const projected = complete ? list.reduce((a, x) => a + x.res.projected, 0) : null;
  const done = rows.length;
  const remaining = list.length ? Math.max(...list.map((x) => x.res.remaining || 0)) : null;
  return { rows, expense: exp, complete, cumMargin: cumM, projected, recoveredOn, done, remaining, days: list.length ? Math.max(...list.map((x) => x.res.days || 0)) : null,
    breakEvenPerDay: complete ? list.reduce((a, x) => a + x.res.breakEvenPerDay, 0) : null, needPerDay: complete ? list.reduce((a, x) => a + (x.res.needPerDay || 0), 0) : null, sales: list.reduce((a, x) => a + x.res.sales, 0),
    explain: EHMS.explain(projected, "全院の月末利益見込み ＝ 各院の見込みの合計", Object.fromEntries(list.map((x) => [x.name, x.res.projected]))) };
}
function ehDailyProfitCard(book, dates, date, pre) {
  ehDailyEnsure();
  const e = eh();
  if (!e.loaded || !e.role || e.role === "staff") return "";
  const mk = S.intakeMonth;
  const list = pre || ehDailyProfitAll(book, dates, mk);
  if (!list.length) return "";
  e.explains = e.explains || {};
  const sel = S.ui.dpClinic && list.some((x) => x.name === S.ui.dpClinic) ? S.ui.dpClinic : "";
  const one = sel ? list.find((x) => x.name === sel) : null;
  const R = one ? one.res : ehDailySum(list);
  const signed = (v) => (v === null || v === undefined ? "算出不可" : `${v < 0 ? "−" : ""}${man(Math.abs(v))}`);
  const cls = (v) => (v === null || v === undefined ? "" : v < 0 ? "ng" : "ok");
  const missing = list.filter((x) => (!one || x === one) && (x.cost.labor === null || x.cost.fixed === null));
  const today = R.rows.find((r) => r.date === date);
  const tiles = `<div class="grid g4" style="margin-bottom:12px;">
    ${ehTile("dp_exp", "月の支出（人件費＋固定費）", R.expense === null ? "未入力あり" : man(R.expense), one ? `人件費 ${ehMan(one.cost.labor)}・固定費 ${ehMan(one.cost.fixed)}` : `${list.length}院の合計`)}
    ${ehTile("dp_be", "1日の損益分岐の売上", R.breakEvenPerDay === null ? "算出不可" : man(R.breakEvenPerDay), `営業 ${R.days ?? "-"}日で月の支出をまかなう売上`)}
    ${ehTile("dp_today", `${Number(date.slice(5, 7))}/${Number(date.slice(8))}の利益`, `<span class="${cls(today && today.profit)}">${today ? signed(today.profit) : "-"}</span>`, today ? `売上 ${man(today.sales)}・人件費 ${today.labor === null ? "-" : man(today.labor)}` : "記録なし")}
    ${ehTile("dp_cum", `今月の累計利益（${R.done}日）`, `<span class="${cls(R.rows.length ? R.rows[R.rows.length - 1].cumProfit : null)}">${R.rows.length ? signed(R.rows[R.rows.length - 1].cumProfit) : "-"}</span>`, `累計の粗利 ${man(R.cumMargin)}`)}
    ${ehTile("dp_rec", "月の支出を回収した日", R.recoveredOn ? `${Number(R.recoveredOn.slice(5, 7))}/${Number(R.recoveredOn.slice(8))}` : R.expense === null ? "算出不可" : "まだ", R.expense === null ? "" : R.recoveredOn ? "この日以降の粗利が利益" : `あと ${man(Math.max(0, R.expense - R.cumMargin))}`, null, R.recoveredOn ? "ok" : "")}
    ${ehTile("dp_need", "残りの日に必要な1日の粗利", R.needPerDay === null ? "算出不可" : R.recoveredOn ? '<span class="ok">回収済み</span>' : man(R.needPerDay), `残り ${R.remaining ?? "-"}日で支出を回収するには`)}
    ${ehTile("dp_proj", "月末の利益見込み", `<span class="${cls(R.projected)}">${signed(R.projected)}</span>`, "今の1日平均が続いた場合", R.explain)}
  </div>`;
  const labels = R.rows.map((r) => `${Number(r.date.slice(5, 7))}/${Number(r.date.slice(8))}`);
  const fmt = (v, short) => (v === null || v === undefined || !isFinite(v) ? "-" : short ? `${Math.round(v / 10000).toLocaleString("ja-JP")}万` : `${v < 0 ? "−" : ""}${man(Math.abs(v))}`);
  const charts = `<div class="grid g2" style="margin-bottom:10px;">
    <div><div style="font-weight:800;font-size:13px;color:#1e3a5f;margin-bottom:4px;">1日の売上と利益</div>${ehLineChart("dp_day", labels, [
      { label: "売上", color: "#2a78d6", values: R.rows.map((r) => r.sales) },
      { label: "利益（人件費・固定費・変動費を引いた後）", color: "#1baf7a", values: R.rows.map((r) => r.profit) },
      { label: "1日の損益分岐の売上", color: "#eb6834", dash: "6 4", values: R.rows.map(() => R.breakEvenPerDay) },
    ], fmt)}</div>
    <div><div style="font-weight:800;font-size:13px;color:#1e3a5f;margin-bottom:4px;">累計の粗利と月の支出（交わった日が回収日）</div>${ehLineChart("dp_cum", labels, [
      { label: "累計の粗利（売上 − 変動費）", color: "#2a78d6", values: R.rows.map((r) => r.cumMargin) },
      { label: "月の支出（人件費＋固定費）", color: "#e34948", dash: "6 4", values: R.rows.map(() => R.expense) },
      { label: "累計の利益", color: "#1baf7a", values: R.rows.map((r) => r.cumProfit) },
    ], fmt)}</div></div>`;
  const table = `<div class="scroll"><table><tr><th class="l">日付</th><th>売上</th><th>出勤</th><th>人件費</th><th>人件費率</th><th>固定費（日割り）</th><th>変動費</th><th>利益</th><th>累計の利益</th></tr>
    ${R.rows.map((r) => `<tr${r.date === date ? ' style="background:#fff7e6;"' : ""}><td class="l"><a href="javascript:void(0)" onclick="dailyGo('${r.date}')">${Number(r.date.slice(5, 7))}/${Number(r.date.slice(8))}（${"日月火水木金土"[new Date(`${r.date}T00:00:00`).getDay()]}）</a></td><td>${man(r.sales)}</td><td>${r.staffN ? `${r.staffN}人` : "-"}</td><td>${r.labor === null ? "-" : man(r.labor)}</td><td class="${r.laborRatio !== null && r.laborRatio > ehNum(ehTargets().labor_ratio, 0.42) ? "ng" : ""}">${r.laborRatio === null ? "-" : pct(r.laborRatio, 0)}</td><td>${r.fixed === null ? "-" : man(r.fixed)}</td><td>${man(r.variable)}</td><td class="${cls(r.profit)}"><b>${signed(r.profit)}</b></td><td class="${cls(r.cumProfit)}">${signed(r.cumProfit)}</td></tr>`).join("")}</table></div>`;
  const ed = ehCan.settings();
  const set = ehDailySet();
  const costs = `<details style="margin-top:10px;" ${missing.length ? "open" : ""}><summary style="cursor:pointer;font-weight:800;font-size:13px;">月の支出の元データ（院ごと）${missing.length ? `<span class="warn">・未入力 ${missing.length}院</span>` : ""}</summary><div class="scroll"><table style="margin-top:6px;">
    <tr><th class="l">院</th><th>人件費（月）</th><th class="l">元</th><th>固定費（月・人件費以外）</th><th class="l">元</th><th>変動費率</th><th>営業日数</th><th>延べ出勤予定</th><th>1人1日の人件費</th></tr>
    ${list.filter((x) => !one || x === one).map((x) => `<tr><td class="l"><b>${esc(x.name)}</b></td><td>${ehMan(x.cost.labor)}</td><td class="l small">${esc(x.cost.laborSrc || "なし")}</td>
      <td>${ed ? `<input class="num" style="width:100px;" value="${(set.fixed || {})[x.cost.store.id] ?? ""}" placeholder="${x.cost.fixed !== null && x.cost.fixedSrc !== "手入力（月の固定費）" ? Math.round(x.cost.fixed) : "家賃・光熱費など"}" onchange="ehSaveDailyCost('fixed','${x.cost.store.id}',this.value)"/>` : ehMan(x.cost.fixed)}</td><td class="l small">${esc(x.cost.fixedSrc || "未入力")}</td>
      <td>${x.cost.variableRate === null ? "0%（未入力）" : pct(x.cost.variableRate, 1)}</td>
      <td>${ed ? `<input class="num" style="width:56px;" value="${(set.days || {})[x.cost.store.id] ?? ""}" placeholder="${x.plannedDays}" onchange="ehSaveDailyCost('days','${x.cost.store.id}',this.value)"/>` : x.plannedDays}<div class="small">${esc(x.daysSrc)}</div></td>
      <td>${x.plan ? `${x.plan.staffDays}人日` : "-"}</td><td>${x.res.perStaffDay === null ? "-" : yen(x.res.perStaffDay)}</td></tr>`).join("")}</table></div>
    ${ed ? `<div class="ctl" style="margin-top:6px;"><div><label>変動費率（実績が無い院に使う・%）</label><input class="num" style="width:80px;" value="${set.variable_rate !== undefined && set.variable_rate !== null ? Math.round(set.variable_rate * 1000) / 10 : ""}" placeholder="例：5" onchange="ehSaveDailyCost('variable_rate',null,this.value)"/></div></div>` : ""}
    <div class="small" style="margin-top:6px;">人件費：EHMS の月次PL → 報酬マスター（在籍スタッフの雇用コストの合計。給与を見る権限のある人だけ）→ 台帳の固定人件費 の順に使います。固定費：EHMS の月次PL → 手入力 → 直近の実績平均。1日の人件費 ＝ 月の人件費 ÷ 月の延べ出勤予定（シフト表）× その日の出勤人数。固定費は営業日数で日割り。固定費が未入力の院は利益を「算出不可」にします（ゼロとみなしません）。本部経費の配賦は含みません。</div></details>`;
  return `<div class="card" style="border-top:3px solid #1baf7a;"><div class="card-h"><span>💴 1日の利益の動き（${esc(monthLabel(mk))}・月の支出に対して）</span>
    <select onchange="ui('dpClinic',this.value)"><option value="">全院（見られる院の合計）</option>${list.map((x) => `<option value="${esc(x.name)}" ${x.name === sel ? "selected" : ""}>${esc(x.name)}</option>`).join("")}</select></div><div class="card-b">
    ${missing.length ? `<div class="note">固定費または人件費が未入力の院があります（${esc(missing.map((x) => x.name).join("・"))}）。下の「月の支出の元データ」で月の固定費（家賃・光熱費など）を入れると利益が出ます。</div>` : ""}
    ${tiles}${charts}${table}${costs}</div></div>`;
}
async function ehSaveDailyCost(field, storeId, raw) {
  const set = ehDailySet();
  const v = raw === "" ? null : Number(String(raw).replace(/[,，¥円%\s]/g, ""));
  if (v !== null && !isFinite(v)) { flash("数字を入れてください", true); return; }
  if (field === "variable_rate") return ehSaveSetting("daily_costs", "variable_rate", v === null ? null : v / 100);
  const m = { ...(set[field] || {}) };
  if (v === null) delete m[storeId]; else m[storeId] = Math.round(v);
  return ehSaveSetting("daily_costs", field, m);
}
// 院ごとの状況の表に足す「その日の人件費・利益」
function ehDailyRowCost(list, name, date) {
  const x = (list || []).find((y) => y.name === name);
  if (!x) return null;
  return x.res.rows.find((r) => r.date === date) || { labor: null, profit: null, afterLabor: null, laborRatio: null };
}
