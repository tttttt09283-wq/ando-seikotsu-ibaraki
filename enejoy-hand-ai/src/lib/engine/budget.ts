import { getClinics } from "@/lib/clinics";
import { parseBudgetGrid, UNIT_LABEL, type BudgetUnit } from "@/lib/import/budget";
import type { BudgetCell, CompanyData } from "@/lib/types";
import { COMMANDER_ID, TENANT } from "@/tenant";
import { budgetTable, cellOf, confirmedSource, fiscalMonths, isClinicOpen, nextVersionLabel, standardCells } from "./budget-metrics";
import { audit, createApproval, EngineError, iso, log, type EngineDeps } from "./engine";

/**
 * 会社の予算（院別・月別の売上予算と人員）。
 * 案はいつでも自由に編集でき、確定は承認（予算変更）を経て行う。
 * 確定するたびに版（当初予算 → 修正予算①…）として残し、当初予算と比べられるようにする。
 * 承認待ちの間は、承認する内容が変わらないよう案を編集できない。
 */

const man = (n: number) =>
  Math.abs(n) >= 100_000_000
    ? `${(n / 100_000_000).toFixed(2).replace(/\.?0+$/, "")}億円`
    : `${Math.round(n / 10_000).toLocaleString("ja-JP")}万円`;

function pendingBudgetApproval(data: CompanyData) {
  return data.approvals.find((a) => a.status === "PENDING" && a.payload?.kind === "budget_confirm");
}

function ensureEditable(data: CompanyData) {
  if (pendingBudgetApproval(data)) {
    throw new EngineError("予算の確定が承認待ちのため、今は編集できません（承認画面で却下・修正依頼をすると、また編集できます）", "INVALID_STATE");
  }
}

/** 案がなければ、確定済みの予算（なければ基準額）から作る */
function ensureDraft(data: CompanyData, actorId: string, now: Date) {
  if (data.budget.draft) return data.budget.draft;
  const clinics = getClinics(data);
  const src = confirmedSource(data);
  data.budget.draft = {
    standardJpy: src.standardJpy,
    perStaffJpy: src.perStaffJpy,
    cells: standardCells(clinics, src.standardJpy).map((c) => {
      const cur = cellOf(src, clinics, c.month, c.clinicId);
      return { ...c, amountJpy: cur.amountJpy, ...(cur.staff != null ? { staff: cur.staff } : {}) };
    }),
    updatedAt: iso(now),
    updatedBy: actorId,
  };
  return data.budget.draft;
}

export type CellEdit = { month: string; clinicId: string; amountJpy?: number; staff?: number | null };

/** 案の編集：予算額・人員を院・月ごとに上書きする。基準額・1人あたり売上も変えられる */
export async function editBudgetDraft(
  deps: EngineDeps,
  actorId: string,
  input: { cells: CellEdit[]; standardJpy?: number; perStaffJpy?: number },
) {
  const months = new Set(fiscalMonths());
  await deps.store.transact((data) => {
    const now = deps.now();
    ensureEditable(data);
    const clinics = getClinics(data);
    for (const c of input.cells) {
      if (!months.has(c.month)) throw new EngineError(`対象月（${c.month}）が今年度の範囲外です`, "INVALID_STATE");
      const clinic = clinics.find((x) => x.id === c.clinicId);
      if (!clinic) throw new EngineError("院が正しくありません", "INVALID_STATE");
      if (!isClinicOpen(clinics, c.clinicId, c.month)) throw new EngineError(`${clinic.name}の${c.month}は営業していない月のため入力できません`, "INVALID_STATE");
    }
    const draft = ensureDraft(data, actorId, now);
    if (input.standardJpy != null) draft.standardJpy = input.standardJpy;
    if (input.perStaffJpy != null) draft.perStaffJpy = input.perStaffJpy;
    for (const c of input.cells) {
      let cur = draft.cells.find((x) => x.month === c.month && x.clinicId === c.clinicId);
      if (!cur) {
        cur = { month: c.month, clinicId: c.clinicId, amountJpy: draft.standardJpy };
        draft.cells.push(cur);
      }
      if (c.amountJpy != null) cur.amountJpy = c.amountJpy;
      if (c.staff === null) delete cur.staff;
      else if (c.staff != null) cur.staff = c.staff;
    }
    draft.updatedAt = iso(now);
    draft.updatedBy = actorId;
    audit(data, now, actorId, "budget.draft.edit", `${input.cells.length}件${input.standardJpy != null ? `・基準額 ${man(input.standardJpy)}` : ""}${input.perStaffJpy != null ? `・1人あたり ${man(input.perStaffJpy)}` : ""}`);
  });
}

/** 営業しているすべての院・月を基準額で埋める（人員の入力は残す） */
export async function fillBudgetStandard(deps: EngineDeps, actorId: string, standardJpy: number) {
  await deps.store.transact((data) => {
    const now = deps.now();
    ensureEditable(data);
    const prev = data.budget.draft ?? null;
    const staffOf = (m: string, id: string) => prev?.cells.find((c) => c.month === m && c.clinicId === id)?.staff;
    data.budget.draft = {
      standardJpy,
      perStaffJpy: prev?.perStaffJpy ?? confirmedSource(data).perStaffJpy,
      cells: standardCells(getClinics(data), standardJpy).map((c) => {
        const staff = staffOf(c.month, c.clinicId);
        return staff != null ? { ...c, staff } : c;
      }),
      updatedAt: iso(now),
      updatedBy: actorId,
    };
    audit(data, now, actorId, "budget.draft.fill", `基準額 ${man(standardJpy)} で全院・全月を埋めた`);
  });
}

/**
 * 人員から予算を計算する：人員を入れた院・月の予算 ＝ 人数 × 1人あたりの月の売上。
 * clinicIds を省略すると、人員を入れたすべての院が対象。
 */
export async function applyStaffing(deps: EngineDeps, actorId: string, input: { perStaffJpy?: number; clinicIds?: string[] }) {
  return deps.store.transact((data) => {
    const now = deps.now();
    ensureEditable(data);
    const draft = ensureDraft(data, actorId, now);
    if (input.perStaffJpy != null) draft.perStaffJpy = input.perStaffJpy;
    let changed = 0;
    for (const c of draft.cells) {
      if (c.staff == null || (input.clinicIds && !input.clinicIds.includes(c.clinicId))) continue;
      const next = Math.round(c.staff * draft.perStaffJpy);
      if (next !== c.amountJpy) changed++;
      c.amountJpy = next;
    }
    if (!draft.cells.some((c) => c.staff != null)) throw new EngineError("人員が入力されていません。院・月ごとに施術者の人数を入れてください", "INVALID_STATE");
    draft.updatedAt = iso(now);
    draft.updatedBy = actorId;
    audit(data, now, actorId, "budget.draft.staffing", `1人あたり ${man(draft.perStaffJpy)} で ${changed}件を計算`);
    return { changed };
  });
}

/** 予算表（CSV）を案に取り込む。表にある院・月だけを上書きし、それ以外は今の案のまま */
export async function importBudget(deps: EngineDeps, actorId: string, input: { grid: string[][]; unit: BudgetUnit; label?: string }) {
  const snap = await deps.store.read();
  const parsed = parseBudgetGrid(input.grid, {
    clinics: getClinics(snap),
    fromMonth: TENANT.revenueTarget.fromMonth,
    months: fiscalMonths(),
    unit: input.unit,
  });
  if (parsed.cells.length === 0) {
    throw new EngineError(
      [parsed.warnings.join(" "), parsed.unmatched.length ? `院が分からない行：${parsed.unmatched.join("、")}（新しい院なら、先に「院の設定」で追加してください）` : ""]
        .filter(Boolean)
        .join(" ") || "取り込める予算がありませんでした",
      "INVALID_STATE",
    );
  }
  await editBudgetDraft(deps, actorId, { cells: parsed.cells });
  await deps.store.transact((data) => {
    audit(data, deps.now(), actorId, "budget.import", `${input.label ?? "予算表"}：${new Set(parsed.cells.map((c) => c.clinicId)).size}院・${parsed.cells.length}件（${UNIT_LABEL[parsed.unitUsed]}）`);
  });
  return {
    clinics: [...new Set(parsed.cells.map((c) => c.clinicId))],
    cells: parsed.cells.length,
    total: parsed.cells.reduce((n, c) => n + c.amountJpy, 0),
    annualOnly: parsed.annualOnly,
    unit: UNIT_LABEL[parsed.unitUsed],
    unmatched: parsed.unmatched,
    warnings: parsed.warnings,
  };
}

export async function discardBudgetDraft(deps: EngineDeps, actorId: string) {
  await deps.store.transact((data) => {
    ensureEditable(data);
    data.budget.draft = null;
    audit(data, deps.now(), actorId, "budget.draft.discard", "");
  });
}

/** 案の確定を承認依頼する（承認された時点の内容をそのまま確定する） */
export async function requestBudgetConfirm(deps: EngineDeps, actorId: string, note?: string) {
  return deps.store.transact((data) => {
    const now = deps.now();
    ensureEditable(data);
    const draft = ensureDraft(data, actorId, now);
    const clinics = getClinics(data);
    const table = budgetTable(data, now, "draft");
    const label = nextVersionLabel(data);
    const before = data.budget.confirmed ? confirmedSource(data) : null;
    const changes = before
      ? draft.cells.filter((c) => cellOf(before, clinics, c.month, c.clinicId).amountJpy !== c.amountJpy)
      : [];
    const gap = table.gapToTarget;
    const name = (id: string) => clinics.find((x) => x.id === id)?.short ?? id;
    const summary = [
      `【${label}：今年度（${TENANT.revenueTarget.fromMonth}〜${TENANT.revenueTarget.toMonth}）の院別売上予算】`,
      `基準額：1院あたり月 ${man(draft.standardJpy)}`,
      `予算合計：${man(table.totalBudget)}（${table.rows.length}院・院・月 ${table.clinicMonthSlots}枠・平均 ${man(table.averagePerClinicMonth)}）`,
      gap > 0 ? `目標3億円まで：${man(gap)} 不足（3億円には院平均 ${man(table.requiredAverageForTarget)} が必要）` : `目標3億円を ${man(-gap)} 上回る`,
      ...(table.originalTotal != null ? [`当初予算との差：${table.totalBudget - table.originalTotal >= 0 ? "+" : "−"}${man(Math.abs(table.totalBudget - table.originalTotal))}`] : []),
      "",
      "■ 院別の年間予算",
      ...table.rows.map(
        (r) =>
          `・${r.name}：${man(r.totalBudget)}（月平均 ${man(r.averageBudget)}）${r.added ? `［新店・${r.openedMonth ?? ""}開院］` : ""}${r.closedMonth ? `［${r.closedMonth}まで］` : ""}`,
      ),
      ...(before
        ? [
            "",
            `■ 今の確定予算からの変更：${changes.length}件`,
            ...changes.slice(0, 12).map((c) => `・${c.month} ${name(c.clinicId)}：${man(cellOf(before, clinics, c.month, c.clinicId).amountJpy)} → ${man(c.amountJpy)}${c.staff != null ? `（${c.staff}人）` : ""}`),
            ...(changes.length > 12 ? [`…ほか${changes.length - 12}件`] : []),
          ]
        : ["", "■ 初めての確定（当初予算）です"]),
      ...(note ? ["", `■ 変更の理由・補足：${note}`] : []),
    ].join("\n");

    const approval = createApproval(data, now, {
      mode: "live",
      category: "budget_change",
      title: `院別売上予算の確定：${label}（合計 ${man(table.totalBudget)}）`,
      action: summary,
      purpose: "院ごとの売上予算を確定し、毎月の実績・着地予想と比べて早めに手を打てるようにする。",
      expectedEffect: "院ごとの達成状況が明確になり、遅れている院への支援を早く判断できる。院長・リーダーの目標にもなる。",
      costJpy: 0,
      risk: "予算は院長・スタッフの目標と評価に影響する。現実とかけ離れた予算は、現場の意欲を下げる。",
      commanderRecommendation:
        gap > 0
          ? `この予算のままでは3億円に${man(gap)}足りません。確定する場合は、不足分を人員の増加・新店・単価アップのどれで埋めるかもあわせて決めることを推奨します。`
          : "予算合計が3億円に届いています。院ごとの差や人員の計画に無理がないか（現場が納得できるか）を確認のうえ、確定を推奨します。",
      requestedBy: actorId,
      payload: {
        kind: "budget_confirm",
        standardJpy: draft.standardJpy,
        perStaffJpy: draft.perStaffJpy,
        cells: draft.cells.map((c) => ({ ...c })),
        label,
        note,
      },
    });
    log(data, "live", now, { actorId: COMMANDER_ID, type: "approval", message: `院別売上予算（${label}）の確定の承認を依頼（合計 ${man(table.totalBudget)}）` });
    return approval;
  });
}

/** 承認された予算を確定する（承認の直後に呼ばれる）。確定した版は履歴に残す */
export async function applyBudgetConfirm(deps: EngineDeps, approvalId: string) {
  return deps.store.transact((data) => {
    const now = deps.now();
    const a = data.approvals.find((x) => x.id === approvalId);
    if (!a || a.status !== "APPROVED" || a.payload?.kind !== "budget_confirm" || a.execution) return null;
    const p = a.payload;
    const version = {
      label: p.label,
      standardJpy: p.standardJpy,
      perStaffJpy: p.perStaffJpy,
      cells: p.cells,
      confirmedAt: iso(now),
      approvalId,
      note: p.note,
    };
    data.budget.history = [...(data.budget.history ?? []), version];
    data.budget.confirmed = version;
    data.budget.draft = null;
    a.execution = { status: "done", at: iso(now), message: `院別売上予算（${p.label}）を確定しました` };
    audit(data, now, a.decidedBy ?? "system", "budget.confirm", a.title);
    log(data, "live", now, { actorId: COMMANDER_ID, type: "deliver", message: `院別売上予算（${p.label}）を確定しました` });
    return a.execution;
  });
}

export type { BudgetCell, CompanyData };
