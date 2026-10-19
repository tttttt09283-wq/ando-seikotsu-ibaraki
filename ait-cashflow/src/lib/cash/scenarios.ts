import type { ScenarioAssumptions, ScenarioKind } from "./types";

/** 3つのシナリオの既定の仮定（DB の forecast_scenarios の初期値と同じ） */
export const DEFAULT_SCENARIOS: Record<ScenarioKind, { name: string; assumptions: ScenarioAssumptions }> = {
  conservative: {
    name: "保守",
    assumptions: { fixedInflowDelayDays: 7, expectedInflowRate: 0, overdueInflow: "exclude", expectedOutflowRate: 1.1 },
  },
  standard: {
    name: "標準",
    assumptions: { fixedInflowDelayDays: 0, expectedInflowRate: 0.8, overdueInflow: "delay7", expectedOutflowRate: 1 },
  },
  optimistic: {
    name: "楽観",
    assumptions: { fixedInflowDelayDays: 0, expectedInflowRate: 1, overdueInflow: "tomorrow", expectedOutflowRate: 1 },
  },
};

/** 仮定を日本語の箇条書きにする（画面に必ず出す） */
export function describeAssumptions(a: ScenarioAssumptions): string[] {
  return [
    a.fixedInflowDelayDays > 0 ? `確定した入金予定は${a.fixedInflowDelayDays}日遅れで入ると仮定` : "確定した入金予定は予定日に入ると仮定",
    a.expectedInflowRate === 0 ? "見込みの入金（売上見込みなど）は含めない" : `見込みの入金は${Math.round(a.expectedInflowRate * 100)}%を反映`,
    a.overdueInflow === "exclude" ? "期日を過ぎた未入金は含めない" : a.overdueInflow === "delay7" ? "期日を過ぎた未入金は7日後に入ると仮定" : "期日を過ぎた未入金は明日入ると仮定",
    a.expectedOutflowRate === 1 ? "支払予定はすべて予定どおり" : `見込みの支払は${Math.round(a.expectedOutflowRate * 100)}%で計上`,
    "期日を過ぎた未払いは明日支払うと仮定",
  ];
}
