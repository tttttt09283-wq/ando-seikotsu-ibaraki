import { applyOrgToBudget, importOrgChart, removeOrgSnapshot, updateScenario } from "@/lib/engine/planning";
import { EngineError } from "@/lib/engine/engine";
import { operatorPost } from "@/lib/server/route-helpers";
import { getEngineDeps } from "@/lib/server/runtime";
import { gridFromInput } from "@/lib/server/sheet-input";
import { orgInputSchema } from "@/lib/types";

/** 人員（組織図）の取り込み・削除・予算や中期計画への反映（統括責任者のみ）。スタッフの名前は保存しない */
export const POST = operatorPost(orgInputSchema, async (input, actor) => {
  const deps = getEngineDeps();
  switch (input.action) {
    case "import": {
      const { grid, label } = await gridFromInput(input);
      return { result: await importOrgChart(deps, actor.memberId, { grid, month: input.month, kind: input.kind, label: input.label || label }) };
    }
    case "remove":
      return void (await removeOrgSnapshot(deps, actor.memberId, input.id));
    case "apply_budget":
      return { result: await applyOrgToBudget(deps, actor.memberId, input.id) };
    case "apply_plan": {
      const s = (await deps.store.read()).org.snapshots.find((x) => x.id === input.id);
      if (!s) throw new EngineError("組織図が見つかりません", "NOT_FOUND");
      const staff = Object.fromEntries(s.clinics.map((c) => [c.clinicId, c.fte]));
      await updateScenario(deps, actor.memberId, { id: input.scenarioId, years: [{ fyStart: input.fyStart, staff }] });
      return { result: { clinics: s.clinics.length } };
    }
  }
}, { maxBytes: 2_500_000 });
