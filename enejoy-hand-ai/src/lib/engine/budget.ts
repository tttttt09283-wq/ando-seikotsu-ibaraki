import type { BudgetCell, CompanyData } from "@/lib/types";
import { COMMANDER_ID, TENANT } from "@/tenant";
import { cellAmount, confirmedSource, draftSource, fiscalMonths, isClinicOpen, standardCells, budgetTable } from "./budget-metrics";
import { audit, createApproval, EngineError, iso, log, type EngineDeps } from "./engine";

/**
 * 会社の予算（院別・月別の売上予算）。
 * 編集は「案」に対して行い、確定は承認（予算変更）を経て行う。承認待ちの間は案を編集できない。
 */

const man = (n: number) =>
  Math.abs(n) >= 100_000_000
    ? `${(n / 100_000_000).toFixed(2).replace(/\.?0+$/, "")}億円`
    : `${Math.round(n / 10_000).toLocaleString("ja-JP")}万円`;

function pendingBudgetApproval(data: CompanyData) {
  return data.approvals.find((a) => a.status === "PENDING" && a.payload?.kind === "budget_confirm");
}

function ensureEditable(data: CompanyData) {
  if (pendingBudgetApproval(data)) throw new EngineError("予算の確定が承認待ちのため、今は編集できません（却下・修正依頼のあとに編集できます）", "INVALID_STATE");
}

/** 案がなければ、確定済みの予算（なければ基準額）から作る */
function ensureDraft(data: CompanyData, actorId: string, now: Date) {
  if (data.budget.draft) return data.budget.draft;
  const src = confirmedSource(data);
  data.budget.draft = {
    standardJpy: src.standardJpy,
    cells: standardCells(src.standardJpy).map((c) => ({ ...c, amountJpy: cellAmount(src, c.month, c.clinicId) })),
    updatedAt: iso(now),
    updatedBy: actorId,
  };
  return data.budget.draft;
}

export async function editBudgetDraft(deps: EngineDeps, actorId: string, input: { cells: BudgetCell[]; standardJpy?: number }) {
  const months = new Set(fiscalMonths());
  for (const c of input.cells) {
    if (!months.has(c.month)) throw new EngineError(`対象月（${c.month}）が今年度の範囲外です`, "INVALID_STATE");
    if (!TENANT.clinics.some((x) => x.id === c.clinicId)) throw new EngineError("院が正しくありません", "INVALID_STATE");
    if (!isClinicOpen(c.clinicId, c.month)) throw new EngineError(`${c.month}は開院前のため予算を入れられません`, "INVALID_STATE");
  }
  await deps.store.transact((data) => {
    const now = deps.now();
    ensureEditable(data);
    const draft = ensureDraft(data, actorId, now);
    if (input.standardJpy != null) draft.standardJpy = input.standardJpy;
    for (const c of input.cells) {
      const cur = draft.cells.find((x) => x.month === c.month && x.clinicId === c.clinicId);
      if (cur) cur.amountJpy = c.amountJpy;
      else draft.cells.push({ ...c });
    }
    draft.updatedAt = iso(now);
    draft.updatedBy = actorId;
    audit(data, now, actorId, "budget.draft.edit", `${input.cells.length}件${input.standardJpy != null ? `・基準額 ${man(input.standardJpy)}` : ""}`);
  });
}

/** すべての院・月を基準額で埋める（例：1院あたり月350万円） */
export async function fillBudgetStandard(deps: EngineDeps, actorId: string, standardJpy: number) {
  await deps.store.transact((data) => {
    const now = deps.now();
    ensureEditable(data);
    data.budget.draft = { standardJpy, cells: standardCells(standardJpy), updatedAt: iso(now), updatedBy: actorId };
    audit(data, now, actorId, "budget.draft.fill", `基準額 ${man(standardJpy)} で全院・全月を埋めた`);
  });
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
    const table = budgetTable(data, now, "draft");
    const before = data.budget.confirmed ? confirmedSource(data) : null;
    const changes = before
      ? draft.cells.filter((c) => cellAmount(before, c.month, c.clinicId) !== c.amountJpy)
      : [];
    const gap = table.gapToTarget;
    const summary = [
      `【今年度（${TENANT.revenueTarget.fromMonth}〜${TENANT.revenueTarget.toMonth}）の院別売上予算】`,
      `基準額：1院あたり月 ${man(draft.standardJpy)}`,
      `予算合計：${man(table.totalBudget)}（院・月 ${table.clinicMonthSlots}枠・平均 ${man(table.averagePerClinicMonth)}）`,
      gap > 0 ? `目標3億円まで：${man(gap)} 不足（3億円には院平均 ${man(table.requiredAverageForTarget)} が必要）` : `目標3億円を ${man(-gap)} 上回る`,
      "",
      "■ 院別の年間予算",
      ...table.rows.map((r) => `・${r.name}：${man(r.totalBudget)}（月平均 ${man(r.averageBudget)}）`),
      ...(before
        ? ["", `■ 確定済みの予算からの変更：${changes.length}件`, ...changes.slice(0, 12).map((c) => `・${c.month} ${TENANT.clinics.find((x) => x.id === c.clinicId)?.short}：${man(cellAmount(before, c.month, c.clinicId))} → ${man(c.amountJpy)}`), ...(changes.length > 12 ? [`…ほか${changes.length - 12}件`] : [])]
        : ["", "■ 初めての確定です"]),
      ...(note ? ["", `■ 補足：${note}`] : []),
    ].join("\n");

    const approval = createApproval(data, now, {
      mode: "live",
      category: "budget_change",
      title: `院別売上予算の確定（合計 ${man(table.totalBudget)}）`,
      action: summary,
      purpose: "院ごとの売上予算を確定し、毎月の実績・着地予想と比べて早めに手を打てるようにする。",
      expectedEffect: "院ごとの達成状況が明確になり、遅れている院への支援を早く判断できる。院長・リーダーの目標にもなる。",
      costJpy: 0,
      risk: "予算は院長・スタッフの目標と評価に影響する。現実とかけ離れた予算は、現場の意欲を下げる。",
      commanderRecommendation:
        gap > 0
          ? `この予算のままでは3億円に${man(gap)}足りません。確定する場合は、不足分を新しい柱（商品開発・法人営業）や単価アップでどう埋めるかもあわせて決めることを推奨します。`
          : "予算合計が3億円に届いています。院ごとの差が大きすぎないか（現場が納得できるか）を確認のうえ、確定を推奨します。",
      requestedBy: actorId,
      payload: { kind: "budget_confirm", standardJpy: draft.standardJpy, cells: draft.cells.map((c) => ({ ...c })) },
    });
    log(data, "live", now, { actorId: COMMANDER_ID, type: "approval", message: `院別売上予算の確定の承認を依頼（合計 ${man(table.totalBudget)}）` });
    return approval;
  });
}

/** 承認された予算を確定する（承認の直後に呼ばれる） */
export async function applyBudgetConfirm(deps: EngineDeps, approvalId: string) {
  return deps.store.transact((data) => {
    const now = deps.now();
    const a = data.approvals.find((x) => x.id === approvalId);
    if (!a || a.status !== "APPROVED" || a.payload?.kind !== "budget_confirm" || a.execution) return null;
    data.budget.confirmed = { standardJpy: a.payload.standardJpy, cells: a.payload.cells, confirmedAt: iso(now), approvalId };
    data.budget.draft = null;
    a.execution = { status: "done", at: iso(now), message: "院別売上予算を確定しました" };
    audit(data, now, a.decidedBy ?? "system", "budget.confirm", a.title);
    log(data, "live", now, { actorId: COMMANDER_ID, type: "deliver", message: `院別売上予算を確定しました（${a.title}）` });
    return a.execution;
  });
}

export { draftSource };
