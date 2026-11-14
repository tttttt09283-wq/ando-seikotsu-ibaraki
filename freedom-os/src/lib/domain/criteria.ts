// 独立判定エンジン：7条件を個別に判定する。単一のスコアや成功確率は出さない。
import { monthOf } from "../date";
import type { CriterionCode, IndependenceCriterion, MandalaAction, MandalaGoal, UserSettings } from "../types";
import { lastCompletedMonths, monthlyChurn, monthlyRetention, type ActualsSummary } from "./actuals";
import type { ActionEvaluation } from "./mandala";
import type { ProjectionRow } from "./projection";
import { CRITERIA_DEFS } from "./template";

export type CriterionStatus = "achieved" | "not_achieved" | "insufficient" | "needs_review";
export const CRITERION_STATUS_LABEL: Record<CriterionStatus, string> = {
  achieved: "達成",
  not_achieved: "未達",
  insufficient: "データ不足",
  needs_review: "要確認",
};

export interface CriterionResult {
  code: CriterionCode;
  title: string;
  description: string;
  enabled: boolean;
  status: CriterionStatus;
  summary: string;
  details: string[];
  basis: "actual" | "simulation" | "manual" | "mixed";
}

export interface CriteriaInput {
  today: string;
  settings: UserSettings;
  criteria: IndependenceCriterion[];
  actuals: ActualsSummary;
  goals: MandalaGoal[];
  actions: MandalaAction[];
  evals: Map<string, ActionEvaluation>;
  primaryProjection: ProjectionRow[] | null;
}

const man = (v: number) => `${Math.round(v / 1000) / 10}万円`;

export function criterionConfig(criteria: IndependenceCriterion[], code: CriterionCode) {
  const def = CRITERIA_DEFS.find((d) => d.code === code)!;
  const row = criteria.find((c) => c.code === code);
  return {
    def,
    enabled: row?.enabled ?? true,
    threshold: row?.threshold ?? def.threshold,
    threshold2: row?.threshold2 ?? def.threshold2,
    manualConfirmed: row?.manual_confirmed ?? false,
    note: row?.note ?? "",
  };
}

export function evaluateCriteria(i: CriteriaInput): CriterionResult[] {
  const out: CriterionResult[] = [];
  const s = i.settings;
  const push = (code: CriterionCode, r: Omit<CriterionResult, "code" | "title" | "description" | "enabled">) => {
    const c = criterionConfig(i.criteria, code);
    out.push({ code, title: c.def.title, description: c.def.description, enabled: c.enabled, ...r });
  };

  // 1. 直近6か月の事業利益
  {
    const c = criterionConfig(i.criteria, "profit");
    const th = c.threshold ?? 0;
    const months = lastCompletedMonths(i.actuals, i.today, 6);
    const withData = months.filter((m) => m.hasData);
    const details = months.map((m) => `${m.month.slice(0, 7)}：${m.hasData ? man(m.profit) : "未入力"}`);
    if (withData.length < 6) {
      push("profit", { status: "insufficient", summary: `実績 ${withData.length}/6 か月（基準 ${man(th)}／月）`, details, basis: "actual" });
    } else {
      const ok = withData.filter((m) => m.profit >= th).length;
      push("profit", {
        status: ok === 6 ? "achieved" : "not_achieved",
        summary: `${ok}/6 か月が基準 ${man(th)} 以上`,
        details,
        basis: "actual",
      });
    }
  }

  // 2. 生活防衛資金
  {
    const h = i.actuals.latestHousehold;
    const living = h?.livingCost ?? s.living_cost_monthly;
    const minM = s.emergency_fund_months_min;
    if (!h || h.emergencyFund == null) {
      push("emergency_fund", { status: "insufficient", summary: "生活防衛資金の残高が未入力です", details: ["月次実績の「家計」に残高を入力してください"], basis: "actual" });
    } else if (!living) {
      push("emergency_fund", { status: "insufficient", summary: "生活費が未設定です", details: [], basis: "actual" });
    } else {
      const months = h.emergencyFund / living;
      push("emergency_fund", {
        status: months >= minM ? "achieved" : "not_achieved",
        summary: `生活費の ${months.toFixed(1)} か月分（基準 ${minM}〜${s.emergency_fund_months_target} か月）`,
        details: [`残高 ${man(h.emergencyFund)}（${h.month.slice(0, 7)} 時点）`, `生活費 ${man(living)}／月`],
        basis: "actual",
      });
    }
  }

  // 3. 施術顧客の継続
  {
    const c = criterionConfig(i.criteria, "clinic_retention");
    const minActive = c.threshold ?? 0;
    const minRet = c.threshold2 ?? 0;
    const ms = i.actuals.months;
    const rets: number[] = [];
    for (let k = ms.length - 1; k >= 1 && rets.length < 3; k--) {
      const r = monthlyRetention(ms[k - 1], ms[k]);
      if (r != null) rets.push(r);
    }
    const active = i.actuals.latestActivePatients;
    if (active == null) {
      push("clinic_retention", { status: "insufficient", summary: "継続患者数が未入力です", details: ["月次実績の「施術指標」に継続患者数・新患数を入力してください"], basis: "actual" });
    } else {
      const avgRet = rets.length ? rets.reduce((a, b) => a + b, 0) / rets.length : null;
      const activeOk = active >= minActive;
      const details = [`継続患者数 ${active}人（基準 ${minActive}人）`, avgRet == null ? "継続率：2か月以上の指標入力で計算します" : `平均継続率 ${(avgRet * 100).toFixed(0)}%（基準 ${(minRet * 100).toFixed(0)}%・${rets.length}か月平均）`];
      let status: CriterionStatus;
      if (!activeOk) status = "not_achieved";
      else if (avgRet == null) status = "needs_review";
      else status = avgRet >= minRet ? "achieved" : "not_achieved";
      push("clinic_retention", { status, summary: details[0], details, basis: "actual" });
    }
  }

  // 4. AI 継続契約
  {
    const c = criterionConfig(i.criteria, "ai_stability");
    const minC = c.threshold ?? 0;
    const maxChurn = c.threshold2 ?? 1;
    const ms = i.actuals.months;
    const churns: number[] = [];
    for (let k = ms.length - 1; k >= 1 && churns.length < 3; k--) {
      const r = monthlyChurn(ms[k - 1], ms[k]);
      if (r != null) churns.push(r);
    }
    const active = i.actuals.latestActiveContracts;
    if (active == null) {
      push("ai_stability", { status: "insufficient", summary: "AI継続契約数が未入力です", details: ["月次実績の「AI指標」に継続契約数・解約数を入力してください"], basis: "actual" });
    } else {
      const avg = churns.length ? churns.reduce((a, b) => a + b, 0) / churns.length : null;
      const details = [`継続契約 ${active}社（基準 ${minC}社）`, avg == null ? "解約率：2か月以上の指標入力で計算します" : `平均解約率 ${(avg * 100).toFixed(1)}%（上限 ${(maxChurn * 100).toFixed(0)}%）`];
      let status: CriterionStatus;
      if (active < minC) status = "not_achieved";
      else if (avg == null) status = "needs_review";
      else status = avg <= maxChurn ? "achieved" : "not_achieved";
      push("ai_stability", { status, summary: details[0], details, basis: "actual" });
    }
  }

  // 5. 開業・法務・税務準備（マンダラ F1〜F5・D6 ＋ 専門家確認）
  {
    const c = criterionConfig(i.criteria, "preparation");
    const targets: [string, number][] = [["F", 1], ["F", 2], ["F", 3], ["F", 4], ["F", 5], ["D", 6]];
    const items = targets.map(([code, pos]) => {
      const g = i.goals.find((x) => x.code === code);
      const a = g ? i.actions.find((x) => x.goal_id === g.id && x.position === pos) : undefined;
      const e = a ? i.evals.get(a.id) : undefined;
      return { label: `${code}${pos} ${a?.title || "（未設定）"}`, done: e?.status === "achieved" };
    });
    const done = items.filter((x) => x.done).length;
    const details = items.map((x) => `${x.done ? "✓" : "・"} ${x.label}`);
    details.push(c.manualConfirmed ? "✓ 税理士・保健所等の専門家に確認済み" : "・ 税理士・保健所等の専門家への確認（未チェック）");
    let status: CriterionStatus;
    if (done < items.length) status = "not_achieved";
    else status = c.manualConfirmed ? "achieved" : "needs_review";
    push("preparation", { status, summary: `準備項目 ${done}/${items.length} 完了`, details, basis: "manual" });
  }

  // 6. 独立後の労働時間（試算）
  {
    const p = i.primaryProjection;
    const im = monthOf(s.independence_target_date);
    const after = p ? p.filter((r) => r.month >= im).slice(0, 6) : [];
    if (!after.length) {
      push("work_hours", { status: "insufficient", summary: "主シナリオの試算期間に独立月が含まれていません", details: [], basis: "simulation" });
    } else {
      const maxH = Math.max(...after.map((r) => r.businessHoursWeekly));
      push("work_hours", {
        status: maxH <= s.max_weekly_work_hours ? "needs_review" : "not_achieved",
        summary: `試算：週 ${maxH.toFixed(1)} 時間（上限 ${s.max_weekly_work_hours} 時間）`,
        details: [
          "仮定に基づく試算です。独立前は実際の作業時間を週間レビューで記録して確かめてください",
          maxH <= s.max_weekly_work_hours ? "試算上は上限内。実績で確認できるまで「要確認」とします" : "試算上も上限を超えています。予約枠・保守時間の見直しが必要です",
        ],
        basis: "simulation",
      });
    }
  }

  // 7. 家族生活に必要な手取り
  {
    const living = i.actuals.latestHousehold?.livingCost ?? s.living_cost_monthly;
    const last3 = lastCompletedMonths(i.actuals, i.today, 3).filter((m) => m.hasData);
    if (last3.length >= 3 && living > 0) {
      const avg = last3.reduce((a, m) => a + m.disposableBusiness, 0) / 3;
      push("household", {
        status: avg >= living ? "achieved" : "not_achieved",
        summary: `直近3か月の事業手取り（概算）平均 ${man(avg)}／生活費 ${man(living)}`,
        details: ["事業利益 × (1 − 概算負担率) で計算。正確な税額ではありません"],
        basis: "actual",
      });
    } else {
      const p = i.primaryProjection;
      const im = monthOf(s.independence_target_date);
      const after = p ? p.filter((r) => r.month >= im).slice(0, 6) : [];
      if (!after.length || !living) {
        push("household", { status: "insufficient", summary: "実績3か月分と試算の両方が不足しています", details: [], basis: "mixed" });
      } else {
        const minD = Math.min(...after.map((r) => r.disposableBusiness));
        push("household", {
          status: minD >= living ? "needs_review" : "not_achieved",
          summary: `試算：独立後の最小手取り ${man(minD)}／生活費 ${man(living)}`,
          details: [`実績は ${last3.length}/3 か月。実績がそろうまで試算で判定（要確認）`],
          basis: "simulation",
        });
      }
    }
  }

  return out;
}

/** 独立準備達成率（参考指標）。有効な条件のうち「達成」の割合。成功確率ではない */
export function readinessRate(results: CriterionResult[]): { achieved: number; total: number; rate: number } {
  const enabled = results.filter((r) => r.enabled);
  const achieved = enabled.filter((r) => r.status === "achieved").length;
  return { achieved, total: enabled.length, rate: enabled.length ? achieved / enabled.length : 0 };
}
