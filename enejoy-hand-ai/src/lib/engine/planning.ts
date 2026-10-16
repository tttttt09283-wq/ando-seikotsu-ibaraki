import { clinicOpenIn, getClinics } from "@/lib/clinics";
import { UNIT_LABEL, type BudgetUnit } from "@/lib/import/budget";
import { parseOrgChart } from "@/lib/import/org-chart";
import { addMonths, parseClinicYearGrid } from "@/lib/import/year-grid";
import { jstMonthKey } from "@/lib/time";
import type { CompanyData, KpiDef, MidPlanNewStore, MidPlanScenario, MidPlanYear, NumberSource } from "@/lib/types";
import { COMMANDER_ID, TENANT } from "@/tenant";
import { editBudgetDraft } from "./budget";
import { fiscalMonths } from "./budget-metrics";
import { audit, createApproval, EngineError, iso, log, newId, upsertClinicMonth, type EngineDeps } from "./engine";
import { seriesOptions } from "./kpi-metrics";
import { defaultYear, fyStarts, midPlanTable, newScenario, termLabel } from "./midplan-metrics";

/**
 * 管理項目（KPI）・人員（組織図）・中期事業計画・年間予算表／進捗表の取り込み。
 * どれも会社の本番の数字として扱い、デモの初期化では消さない。
 * 組織図はスタッフの名前を保存せず、院ごとの役割別の人数だけを残す。
 */

const oku = (n: number) =>
  Math.abs(n) >= 100_000_000
    ? `${(n / 100_000_000).toFixed(2).replace(/\.?0+$/, "")}億円`
    : `${Math.round(n / 10_000).toLocaleString("ja-JP")}万円`;

// ---- 管理項目 ----

function editableDefs(data: CompanyData): KpiDef[] {
  if (!data.kpis.defs) data.kpis.defs = structuredClone(TENANT.kpis);
  return data.kpis.defs;
}

export type KpiInput = Omit<KpiDef, "id" | "archived"> & { id?: string };

export async function saveKpi(deps: EngineDeps, actorId: string, input: KpiInput) {
  return deps.store.transact((data) => {
    const defs = editableDefs(data);
    const keys = new Set(seriesOptions(data).map((s) => s.key));
    const need =
      input.calc.kind === "series" ? [input.calc.key] : input.calc.kind === "ratio" ? [input.calc.numerator, input.calc.denominator] : [];
    if (input.target?.kind === "series") need.push(input.target.key);
    const bad = need.find((k) => !keys.has(k));
    if (bad) throw new EngineError(`「${bad}」という数字はありません`, "INVALID_STATE");
    if (input.calc.kind === "ratio" && input.calc.numerator === input.calc.denominator) {
      throw new EngineError("分子と分母に同じ数字は使えません", "INVALID_STATE");
    }
    const id = input.id ?? newId("kpi");
    const def: KpiDef = { ...input, id, name: input.name.trim() };
    const i = defs.findIndex((d) => d.id === id);
    if (i >= 0) defs[i] = def;
    else {
      if (defs.some((d) => !d.archived && d.name === def.name)) throw new EngineError(`「${def.name}」はすでにあります`, "INVALID_STATE");
      defs.push(def);
    }
    audit(data, deps.now(), actorId, i >= 0 ? "kpi.update" : "kpi.add", def.name);
    return def;
  });
}

/** 管理項目を外す（会社の標準の項目は非表示にするだけ。手入力の記録は残す） */
export async function removeKpi(deps: EngineDeps, actorId: string, id: string) {
  await deps.store.transact((data) => {
    const defs = editableDefs(data);
    const d = defs.find((x) => x.id === id);
    if (!d) throw new EngineError("管理項目が見つかりません", "NOT_FOUND");
    if (TENANT.kpis.some((x) => x.id === id) || d.calc.kind === "manual") d.archived = true;
    else data.kpis.defs = defs.filter((x) => x.id !== id);
    audit(data, deps.now(), actorId, "kpi.remove", d.name);
  });
}

export async function moveKpi(deps: EngineDeps, actorId: string, id: string, dir: -1 | 1) {
  await deps.store.transact((data) => {
    const defs = editableDefs(data);
    const visible = defs.filter((d) => !d.archived);
    const i = visible.findIndex((d) => d.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= visible.length) return;
    const a = defs.indexOf(visible[i]);
    const b = defs.indexOf(visible[j]);
    [defs[a], defs[b]] = [defs[b], defs[a]];
    audit(data, deps.now(), actorId, "kpi.move", visible[i].name);
  });
}

/** 会社の標準の管理項目に戻す（追加した手入力の記録は残る） */
export async function resetKpis(deps: EngineDeps, actorId: string) {
  await deps.store.transact((data) => {
    data.kpis.defs = null;
    audit(data, deps.now(), actorId, "kpi.reset", "");
  });
}

/** 手入力の管理項目の値（null で消す） */
export async function recordKpiValue(deps: EngineDeps, actorId: string, input: { kpiId: string; month: string; clinicId: string; value: number | null }) {
  if (!fiscalMonths().includes(input.month)) throw new EngineError("対象月が今年度の範囲外です", "INVALID_STATE");
  await deps.store.transact((data) => {
    const def = (data.kpis.defs ?? TENANT.kpis).find((d) => d.id === input.kpiId);
    if (!def || def.calc.kind !== "manual") throw new EngineError("手入力の管理項目ではありません", "INVALID_STATE");
    if (!getClinics(data).some((c) => c.id === input.clinicId)) throw new EngineError("院が正しくありません", "INVALID_STATE");
    const now = deps.now();
    if (input.value == null) {
      const r = data.clinicMonths.find((x) => x.month === input.month && x.clinicId === input.clinicId);
      if (r) delete r.values[input.kpiId];
    } else {
      upsertClinicMonth(data, now, { month: input.month, clinicId: input.clinicId, values: { [input.kpiId]: input.value }, source: "manual", updatedBy: actorId }, true);
    }
    audit(data, now, actorId, "kpi.value", `${def.name} ${input.month} ${input.clinicId}：${input.value ?? "削除"}`);
  });
}

// ---- 人員（組織図） ----

export async function importOrgChart(
  deps: EngineDeps,
  actorId: string,
  input: { grid: string[][]; month: string; kind: "actual" | "plan"; label: string },
) {
  const snap = await deps.store.read();
  const parsed = parseOrgChart(input.grid, { clinics: getClinics(snap), roles: TENANT.staffRoles });
  if (!parsed.clinics.length && !parsed.unmatched.length) throw new EngineError(parsed.warnings.join(" ") || "組織図を読み取れませんでした", "INVALID_STATE");
  return deps.store.transact((data) => {
    const now = deps.now();
    const label = input.label.trim() || `${input.month} の組織図`;
    data.org.snapshots = data.org.snapshots.filter((s) => !(s.month === input.month && s.kind === input.kind && s.label === label));
    const snapshot = {
      id: newId("org"),
      month: input.month,
      kind: input.kind,
      label,
      clinics: parsed.clinics,
      unmatched: parsed.unmatched,
      importedAt: iso(now),
      importedBy: actorId,
    };
    data.org.snapshots.push(snapshot);
    data.org.snapshots.sort((a, b) => a.month.localeCompare(b.month));
    // ブロック（ブロックマネージャーの担当）は、実際の組織図から院の設定に反映する
    let blocks = 0;
    if (input.kind === "actual") {
      for (const [clinicId, block] of Object.entries(parsed.blocks)) {
        const added = data.clinicSetup.added.find((c) => c.id === clinicId);
        if (added) {
          if (added.block !== block) blocks++;
          added.block = block;
        } else {
          const o = (data.clinicSetup.overrides[clinicId] ??= {});
          if (o.block !== block) blocks++;
          o.block = block;
        }
      }
    }
    const fte = parsed.clinics.reduce((n, c) => n + c.fte, 0);
    audit(data, now, actorId, "org.import", `${label}（${input.kind === "actual" ? "実際" : "計画"}・${input.month}〜）：${parsed.clinics.length}院・施術者 換算${Math.round(fte * 10) / 10}人`);
    return {
      snapshotId: snapshot.id,
      clinics: parsed.clinics.length,
      fte: Math.round(fte * 10) / 10,
      unmatched: parsed.unmatched.map((u) => u.label),
      blocksChanged: blocks,
      warnings: parsed.warnings,
    };
  });
}

export async function removeOrgSnapshot(deps: EngineDeps, actorId: string, id: string) {
  await deps.store.transact((data) => {
    const s = data.org.snapshots.find((x) => x.id === id);
    if (!s) throw new EngineError("組織図が見つかりません", "NOT_FOUND");
    data.org.snapshots = data.org.snapshots.filter((x) => x.id !== id);
    audit(data, deps.now(), actorId, "org.remove", s.label);
  });
}

/** 組織図の人数（換算）を、予算の案の人員に入れる（その月から、次の実際の組織図の前の月まで） */
export async function applyOrgToBudget(deps: EngineDeps, actorId: string, id: string) {
  const data = await deps.store.read();
  const s = data.org.snapshots.find((x) => x.id === id);
  if (!s) throw new EngineError("組織図が見つかりません", "NOT_FOUND");
  const next = data.org.snapshots.filter((x) => x.kind === "actual" && x.month > s.month).map((x) => x.month).sort()[0];
  const clinics = getClinics(data);
  const months = fiscalMonths().filter((m) => m >= s.month && (s.kind === "plan" || !next || m < next));
  if (!months.length) throw new EngineError("今年度の中に反映する月がありません", "INVALID_STATE");
  const cells = s.clinics.flatMap((c) => {
    const clinic = clinics.find((x) => x.id === c.clinicId);
    if (!clinic) return [];
    return months.filter((m) => clinicOpenIn(clinic, m)).map((month) => ({ month, clinicId: c.clinicId, staff: c.fte }));
  });
  await editBudgetDraft(deps, actorId, { cells });
  return { cells: cells.length, from: months[0], to: months[months.length - 1] };
}

// ---- 中期事業計画 ----

function findScenario(data: CompanyData, id: string) {
  const s = data.midPlan.scenarios.find((x) => x.id === id);
  if (!s) throw new EngineError("事業計画のシナリオが見つかりません", "NOT_FOUND");
  return s;
}

function yearOf(s: MidPlanScenario, fyStart: string): MidPlanYear {
  let y = s.years.find((x) => x.fyStart === fyStart);
  if (!y) {
    y = defaultYear(fyStart);
    s.years.push(y);
    s.years.sort((a, b) => a.fyStart.localeCompare(b.fyStart));
  }
  return y;
}

export async function createScenario(deps: EngineDeps, actorId: string, input: { name: string; copyFrom?: string }) {
  return deps.store.transact((data) => {
    const now = iso(deps.now());
    const name = input.name.trim();
    if (data.midPlan.scenarios.some((s) => s.name === name)) throw new EngineError(`「${name}」はすでにあります`, "INVALID_STATE");
    if (data.midPlan.scenarios.length >= 10) throw new EngineError("シナリオは10個までです", "LIMIT");
    const base = input.copyFrom ? findScenario(data, input.copyFrom) : null;
    const s: MidPlanScenario = base
      ? { ...structuredClone(base), id: newId("pln"), name, updatedAt: now, updatedBy: actorId }
      : newScenario(newId("pln"), name, now, actorId);
    data.midPlan.scenarios.push(s);
    audit(data, deps.now(), actorId, "plan.create", `${name}${base ? `（${base.name}をコピー）` : ""}`);
    return s;
  });
}

export type ScenarioUpdate = {
  id: string;
  name?: string;
  note?: string;
  laborPerStaffYearJpy?: number | null;
  otherCostRate?: number | null;
  years?: {
    fyStart: string;
    growthRate?: number;
    clinicGrowth?: Record<string, number | null>;
    staff?: Record<string, number | null>;
    targetJpy?: number | null;
    note?: string;
    /** 取り込んだ月別の計画を消して、成長率の計算に戻す院 */
    clearMonthly?: string[];
  }[];
  newStores?: (Omit<MidPlanNewStore, "id"> & { id?: string })[];
};

export async function updateScenario(deps: EngineDeps, actorId: string, input: ScenarioUpdate) {
  const allowed = new Set(fyStarts().slice(1));
  return deps.store.transact((data) => {
    const s = findScenario(data, input.id);
    if (input.name != null) {
      const name = input.name.trim();
      if (data.midPlan.scenarios.some((x) => x.id !== s.id && x.name === name)) throw new EngineError(`「${name}」はすでにあります`, "INVALID_STATE");
      s.name = name;
    }
    if (input.note !== undefined) s.note = input.note || undefined;
    if (input.laborPerStaffYearJpy !== undefined) s.laborPerStaffYearJpy = input.laborPerStaffYearJpy ?? undefined;
    if (input.otherCostRate !== undefined) s.otherCostRate = input.otherCostRate ?? undefined;
    for (const y of input.years ?? []) {
      if (!allowed.has(y.fyStart)) throw new EngineError(`${y.fyStart} は計画の対象の年度ではありません`, "INVALID_STATE");
      const cur = yearOf(s, y.fyStart);
      if (y.growthRate != null) cur.growthRate = y.growthRate;
      for (const [k, v] of Object.entries(y.clinicGrowth ?? {})) {
        if (v == null) delete cur.clinicGrowth[k];
        else cur.clinicGrowth[k] = v;
      }
      for (const [k, v] of Object.entries(y.staff ?? {})) {
        if (v == null) delete cur.staff[k];
        else cur.staff[k] = v;
      }
      if (y.targetJpy !== undefined) cur.targetJpy = y.targetJpy ?? undefined;
      if (y.note !== undefined) cur.note = y.note || undefined;
      for (const k of y.clearMonthly ?? []) delete cur.monthly[k];
    }
    if (input.newStores) {
      for (const n of input.newStores) {
        if (n.matureJpy < n.startJpy) throw new EngineError(`${n.name}：成熟時の月商は開院時より大きくしてください`, "INVALID_STATE");
      }
      s.newStores = input.newStores.map((n) => ({ ...n, id: n.id ?? newId("nst"), name: n.name.trim() }));
    }
    s.updatedAt = iso(deps.now());
    s.updatedBy = actorId;
    audit(data, deps.now(), actorId, "plan.update", s.name);
    return s;
  });
}

export async function removeScenario(deps: EngineDeps, actorId: string, id: string) {
  await deps.store.transact((data) => {
    const s = findScenario(data, id);
    data.midPlan.scenarios = data.midPlan.scenarios.filter((x) => x.id !== id);
    audit(data, deps.now(), actorId, "plan.remove", s.name);
  });
}

/** 事業計画の採用を承認依頼する（承認された時点のシナリオを採用する） */
export async function requestPlanAdopt(deps: EngineDeps, actorId: string, input: { id: string; note?: string }) {
  return deps.store.transact((data) => {
    const now = deps.now();
    if (data.approvals.some((a) => a.status === "PENDING" && a.payload?.kind === "plan_adopt")) {
      throw new EngineError("事業計画の採用はすでに承認待ちです。承認画面で判断してから、もう一度依頼してください", "INVALID_STATE");
    }
    const s = findScenario(data, input.id);
    const t = midPlanTable(data, now, s);
    const last = t.years[t.years.length - 1];
    const summary = [
      `【中期事業計画「${s.name}」：${t.years[0].term}〜${last.term}】`,
      "",
      ...t.years.map(
        (y) =>
          `・${y.term}（${y.era}）${y.kind === "current" ? "見込み" : "計画"}：売上 ${oku(y.revenue)}${y.yoy != null ? `（前年比 ${y.yoy}%）` : ""}・${y.clinicsOpen}院${y.staffAvg != null ? `・施術者 ${y.staffAvg}人` : ""}${y.profitJpy != null ? `・営業利益の目安 ${oku(y.profitJpy)}（${y.margin}%）` : ""}${y.targetJpy != null ? `・目標 ${oku(y.targetJpy)}` : ""}`,
      ),
      ...(s.newStores.length ? ["", "■ 新店", ...s.newStores.map((n) => `・${n.name}：${n.openMonth}開院・月商 ${oku(n.startJpy)} → ${oku(n.matureJpy)}（${n.rampMonths}か月）・施術者 ${n.staff}人`)] : []),
      "",
      "■ 既存店の成長率",
      ...s.years.map((y) => `・${termLabel(y.fyStart)}：${Math.round(y.growthRate * 1000) / 10}%`),
      ...(input.note ? ["", `■ 補足：${input.note}`] : []),
    ].join("\n");
    const approval = createApproval(data, now, {
      mode: "live",
      category: "budget_change",
      title: `中期事業計画の採用：${s.name}（${last.term} 売上 ${oku(last.revenue)}）`,
      action: summary,
      purpose: "2〜3年先までの売上・院数・人員の計画を会社として決め、出店・採用・予算の判断の基準にする。",
      expectedEffect: "出店・採用のタイミングと必要な人数が明確になり、毎年の予算づくりがこの計画に沿って行える。",
      costJpy: 0,
      risk: "計画は出店・採用・投資の判断に影響する。成長率や新店の立ち上がりが楽観的すぎると、人員・資金の計画がずれる。",
      commanderRecommendation:
        last.yoy != null && last.yoy > 115
          ? "最終年度の伸びが大きい計画です。新店の立ち上がり・採用の見込みが現場の実感と合っているかを確認してから採用することを推奨します。"
          : "既存店の成長率・新店・人員の前提を確認のうえ、採用を推奨します。採用後は毎年の予算づくりでこの計画と比べます。",
      requestedBy: actorId,
      payload: { kind: "plan_adopt", scenario: structuredClone(s), note: input.note },
    });
    log(data, "live", now, { actorId: COMMANDER_ID, type: "approval", message: `中期事業計画「${s.name}」の採用の承認を依頼` });
    return approval;
  });
}

export async function applyPlanAdopt(deps: EngineDeps, approvalId: string) {
  return deps.store.transact((data) => {
    const now = deps.now();
    const a = data.approvals.find((x) => x.id === approvalId);
    if (!a || a.status !== "APPROVED" || a.payload?.kind !== "plan_adopt" || a.execution) return null;
    data.midPlan.adopted = { scenario: a.payload.scenario, approvalId, at: iso(now), note: a.payload.note };
    a.execution = { status: "done", at: iso(now), message: `中期事業計画「${a.payload.scenario.name}」を採用しました` };
    audit(data, now, a.decidedBy ?? "system", "plan.adopt", a.title);
    log(data, "live", now, { actorId: COMMANDER_ID, type: "deliver", message: `中期事業計画「${a.payload.scenario.name}」を採用しました` });
    return a.execution;
  });
}

// ---- 年間予算表・進捗表の取り込み ----

/**
 * 年度（R8.7~R9.6 など）・「予算」「実績」「昨対」の行がある表を取り込む。
 * - 今期の予算 → 予算の案（人員の行があれば人員も）
 * - 来期以降の予算・計画 → 中期計画のシナリオ（院・月の計画として）
 * - 実績・昨対 → 院の売上の実績（今月は日計表が最新なので上書きしない）
 * この形の表でなければ null を返す（呼び出し側で別の読み方を試す）
 */
export async function importPlanSheet(
  deps: EngineDeps,
  actorId: string,
  input: { grid: string[][]; unit: BudgetUnit; label?: string; scenarioId?: string; source: NumberSource },
) {
  const snap = await deps.store.read();
  const clinics = getClinics(snap);
  const currentFy = TENANT.revenueTarget.fromMonth;
  const parsed = parseClinicYearGrid(input.grid, { clinics, currentFyStart: currentFy, unit: input.unit });
  if (!parsed.recognized) return null;
  const warnings = [...parsed.warnings];
  const now = deps.now();
  const currentMonth = jstMonthKey(now);

  // 今期の予算 → 予算の案。来期以降の計画（新案）がある表の今期の行は、比べるための数字なので入れない
  const hasFuture = parsed.budgets.some((b) => b.fyStart > currentFy);
  const cur = hasFuture ? undefined : parsed.budgets.find((b) => b.fyStart === currentFy);
  if (hasFuture && parsed.budgets.some((b) => b.fyStart === currentFy)) {
    warnings.push("来期以降の計画がある表のため、今期の行は比較用として予算の案には入れませんでした。");
  }
  let budgetCells = 0;
  let budgetTotal = 0;
  if (cur && cur.cells.length) {
    const staff = new Map(cur.staff.map((s) => [`${s.month}|${s.clinicId}`, s.staff]));
    const cells = cur.cells.map((c) => ({ ...c, ...(staff.has(`${c.month}|${c.clinicId}`) ? { staff: staff.get(`${c.month}|${c.clinicId}`) } : {}) }));
    try {
      await editBudgetDraft(deps, actorId, { cells });
      budgetCells = cells.length;
      budgetTotal = cells.reduce((n, c) => n + c.amountJpy, 0);
    } catch (e) {
      if (!(e instanceof EngineError)) throw e;
      warnings.push(`今期の予算は案に入れませんでした：${e.message}`);
    }
  }

  const futureStarts = new Set(fyStarts().slice(1));
  return deps.store.transact((data) => {
    // 実績
    let actualCells = 0;
    let skippedCurrent = 0;
    for (const a of parsed.actuals) {
      if (a.month >= currentMonth) {
        skippedCurrent++;
        continue;
      }
      upsertClinicMonth(
        data,
        now,
        { month: a.month, clinicId: a.clinicId, values: { salesActual: a.amountJpy }, source: input.source, sourceLabel: input.label ?? "年間予算・進捗表", updatedBy: actorId },
        true,
      );
      actualCells++;
    }
    if (skippedCurrent) warnings.push(`今月以降の実績 ${skippedCurrent}件は、日計表の数字を優先して取り込みませんでした。`);

    // 来期以降 → 中期計画
    const future = parsed.budgets.filter((b) => b.fyStart > currentFy);
    let scenarioName: string | null = null;
    const futureYears: { fyStart: string; term: string; clinics: number; total: number }[] = [];
    if (future.length) {
      let s = input.scenarioId ? data.midPlan.scenarios.find((x) => x.id === input.scenarioId) : data.midPlan.scenarios[0];
      if (!s) {
        s = newScenario(newId("pln"), "標準", iso(now), actorId);
        data.midPlan.scenarios.push(s);
      }
      scenarioName = s.name;
      for (const b of future) {
        if (!futureStarts.has(b.fyStart)) {
          warnings.push(`${termLabel(b.fyStart)}（${b.fyStart}〜）は計画の範囲外のため取り込みませんでした。`);
          continue;
        }
        const y = yearOf(s, b.fyStart);
        const byClinic = new Map<string, number[]>();
        for (const c of b.cells) {
          const i = (Number(c.month.slice(0, 4)) - Number(b.fyStart.slice(0, 4))) * 12 + Number(c.month.slice(5)) - Number(b.fyStart.slice(5));
          if (i < 0 || i > 11) continue;
          const arr = byClinic.get(c.clinicId) ?? Array.from({ length: 12 }, () => 0);
          arr[i] = c.amountJpy;
          byClinic.set(c.clinicId, arr);
        }
        for (const [clinicId, arr] of byClinic) y.monthly[clinicId] = arr;
        const staffBy = new Map<string, number[]>();
        for (const st of b.staff) staffBy.set(st.clinicId, [...(staffBy.get(st.clinicId) ?? []), st.staff]);
        for (const [clinicId, xs] of staffBy) y.staff[clinicId] = Math.round((xs.reduce((n, v) => n + v, 0) / xs.length) * 10) / 10;
        if (parsed.growthRate && b.fyStart === addMonths(currentFy, 12)) y.growthRate = parsed.growthRate;
        futureYears.push({ fyStart: b.fyStart, term: termLabel(b.fyStart), clinics: byClinic.size, total: b.cells.reduce((n, c) => n + c.amountJpy, 0) });
      }
      s.updatedAt = iso(now);
      s.updatedBy = actorId;
    }
    const prevActual = parsed.actuals.filter((a) => a.month < currentFy).length;
    audit(
      data,
      now,
      actorId,
      "plan.import",
      `${input.label ?? "年間予算・進捗表"}：今期予算 ${budgetCells}件・実績 ${actualCells}件・来期以降 ${futureYears.length}年度（${UNIT_LABEL[parsed.unitUsed]}）`,
    );
    return {
      kind: "year_grid" as const,
      unit: UNIT_LABEL[parsed.unitUsed],
      budget: { cells: budgetCells, total: budgetTotal, staffCells: cur?.staff.length ?? 0, companyTotal: cur?.companyTotal ?? null },
      actuals: { cells: actualCells, previousYear: prevActual },
      futureYears,
      scenarioName,
      growthRate: parsed.growthRate ?? null,
      unmatched: parsed.unmatched.slice(0, 20),
      warnings,
    };
  });
}

export type { CompanyData };
