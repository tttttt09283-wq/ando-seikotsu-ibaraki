// AI 経営参謀：
//  1) buildAdvisorPayload … AI に渡す最小限のデータ（事業KPI・目標・条件・タスク名だけ。患者情報は含めない）
//  2) rulesAdvice … API キーが無くても動くルールベース分析（同じ出力形式）
import { monthOf } from "../date";
import type { AdvisorOutput, InsightKind } from "../types";
import { CRITERION_STATUS_LABEL } from "./criteria";
import type { AppModel } from "./model";

const manS = (v: number | null | undefined) => (v == null ? "未入力" : `${Math.round(v / 1000) / 10}万円`);

export interface AdvisorPayload {
  kind: InsightKind;
  today: string;
  targets: {
    monthly_revenue: number;
    clinic_revenue: number;
    ai_revenue: number;
    annual_business_income: number;
    independence_date: string;
    max_weekly_work_hours: number;
    family_hours_weekly_target: number;
  };
  latest_month: null | {
    month: string;
    clinic_revenue: number;
    ai_revenue: number;
    expenses: number;
    profit: number;
    sessions: number | null;
    new_patients: number | null;
    active_patients: number | null;
    active_contracts: number | null;
  };
  last6_profit: { month: string; profit: number | null }[];
  emergency_fund_months: number | null;
  criteria: { title: string; status: string; summary: string }[];
  mandala_areas: { code: string; title: string; progress: number; missed: number }[];
  overdue_tasks: string[];
  this_week: { done: number; total: number };
  latest_review: null | { week_start: string; work_hours: number; family_hours: number; issues: string };
  primary_scenario: null | { name: string; revenue_at_independence: number; profit_at_independence: number; weekly_hours_after: number };
  mandala_codes: { code: string; title: string }[];
}

export function buildAdvisorPayload(m: AppModel, kind: InsightKind): AdvisorPayload {
  const st = m.snapshot.settings;
  const cur = m.current;
  const h = m.actuals.latestHousehold;
  const living = h?.livingCost ?? st.living_cost_monthly;
  const im = monthOf(st.independence_target_date);
  const pr = m.primary?.rows.find((r) => r.month === im);
  const after = m.primary?.rows.filter((r) => r.month >= im).slice(0, 6) ?? [];
  return {
    kind,
    today: m.today,
    targets: {
      monthly_revenue: st.target_monthly_revenue,
      clinic_revenue: st.target_clinic_revenue,
      ai_revenue: st.target_ai_revenue,
      annual_business_income: st.target_annual_business_income,
      independence_date: st.independence_target_date,
      max_weekly_work_hours: st.max_weekly_work_hours,
      family_hours_weekly_target: st.family_hours_weekly_target,
    },
    latest_month: cur
      ? {
          month: cur.month,
          clinic_revenue: cur.clinicRevenue,
          ai_revenue: cur.aiRevenue,
          expenses: cur.expenses,
          profit: cur.profit,
          sessions: cur.sessions,
          new_patients: cur.newPatients,
          active_patients: cur.activePatients,
          active_contracts: cur.activeContracts,
        }
      : null,
    last6_profit: m.recent6.map((x) => ({ month: x.month, profit: x.hasData ? x.profit : null })),
    emergency_fund_months: h?.emergencyFund != null && living ? Math.round((h.emergencyFund / living) * 10) / 10 : null,
    criteria: m.criteria.filter((c) => c.enabled).map((c) => ({ title: c.title, status: CRITERION_STATUS_LABEL[c.status], summary: c.summary })),
    mandala_areas: m.goalProgress.map((g) => ({ code: g.goal.code, title: g.goal.title, progress: g.progress, missed: g.counts.missed })),
    // タスクは名前だけ（自由記述のメモ・説明は送らない）
    overdue_tasks: m.overdue.slice(0, 10).map((t) => t.title),
    this_week: { done: m.week.done, total: m.week.total },
    latest_review: m.latestReview
      ? { week_start: m.latestReview.week_start, work_hours: m.latestReview.work_hours, family_hours: m.latestReview.family_hours, issues: m.latestReview.issues.slice(0, 400) }
      : null,
    primary_scenario: m.primary && pr
      ? {
          name: m.primary.scenario.name,
          revenue_at_independence: pr.totalRevenue,
          profit_at_independence: pr.profit,
          weekly_hours_after: after.length ? Math.max(...after.map((r) => r.businessHoursWeekly)) : 0,
        }
      : null,
    mandala_codes: [...m.actionByCode.entries()].filter(([, a]) => a.title).map(([code, a]) => ({ code, title: a.title })),
  };
}

interface Candidate {
  weight: number;
  issue: { title: string; detail: string };
  action: AdvisorOutput["actions"][number];
  expected: AdvisorOutput["expected"][number];
}

export function rulesAdvice(m: AppModel): AdvisorOutput {
  const st = m.snapshot.settings;
  const cur = m.current;
  const h = m.actuals.latestHousehold;
  const living = h?.livingCost ?? st.living_cost_monthly;
  const fundMonths = h?.emergencyFund != null && living ? h.emergencyFund / living : null;
  const cands: Candidate[] = [];
  const cautions: string[] = ["これはルールベースの分析です。数値はすべて入力された実績と仮定に基づく試算です。"];

  if (!cur) {
    cands.push({
      weight: 100,
      issue: { title: "実績データがまだありません", detail: "売上・経費・顧客数の月次実績がないため、目標との差を測れません。" },
      action: { title: "今月の売上・経費・顧客数を月次実績に入力する", purpose: "現在地を数字で把握する", estimate_minutes: 20, due_in_days: 3, mandala_code: "D4", done_criteria: "今月分の実績が保存されている" },
      expected: { metric: "月次実績の入力月数", target: "毎月1回", verification: "ダッシュボードの過去6か月推移に表示される" },
    });
    cautions.push("実績がないため、判断の多くは試算に依存しています。");
  } else {
    const clinicGap = st.target_clinic_revenue > 0 ? 1 - cur.clinicRevenue / st.target_clinic_revenue : 0;
    const aiGap = st.target_ai_revenue > 0 ? 1 - cur.aiRevenue / st.target_ai_revenue : 0;
    if (clinicGap >= aiGap && clinicGap > 0) {
      const price = m.primary?.assumptions.clinic_price ?? 10000;
      const needSessions = Math.ceil(Math.max(0, st.target_clinic_revenue - cur.clinicRevenue) / price);
      cands.push({
        weight: 60 + clinicGap * 30,
        issue: { title: "施術売上が目標に届いていない", detail: `施術月商 ${manS(cur.clinicRevenue)}（目標 ${manS(st.target_clinic_revenue)}）。単価 ${price.toLocaleString("ja-JP")}円 換算で月 ${needSessions} 件の不足。` },
        action: { title: "既存顧客に次回予約を提案する声かけ文を作り、今週の全施術で使う", purpose: "継続率を上げて施術件数を増やす", estimate_minutes: 30, due_in_days: 7, mandala_code: "A7", done_criteria: "声かけ文を作り、今週の来院者全員に提案した" },
        expected: { metric: "次回予約率", target: "来院者の70%以上", verification: "週間レビューで継続顧客数を記録して比較" },
      });
    } else if (aiGap > 0) {
      cands.push({
        weight: 55 + aiGap * 30,
        issue: { title: "AI事業の売上が目標に届いていない", detail: `AI月商 ${manS(cur.aiRevenue)}（目標 ${manS(st.target_ai_revenue)}）。継続契約 ${cur.activeContracts ?? "未入力"}社。` },
        action: { title: "AI業務改善の提案先を5件リストアップし、2件に連絡する", purpose: "商談数を増やして契約を獲得する", estimate_minutes: 60, due_in_days: 7, mandala_code: "B4", done_criteria: "5件のリストと2件の連絡記録がある" },
        expected: { metric: "商談数", target: "月2件", verification: "AI指標の新規契約数と合わせて月次で確認" },
      });
    }
    if (cur.expenseRatio != null && cur.expenseRatio > 0.3) {
      cands.push({
        weight: 45,
        issue: { title: "事業経費率が高い", detail: `経費率 ${(cur.expenseRatio * 100).toFixed(0)}%（目安 25%以下）。` },
        action: { title: "経費を項目別に見直し、効果の低い支出を1つ止める", purpose: "利益率を上げる", estimate_minutes: 30, due_in_days: 14, mandala_code: "D5", done_criteria: "止める支出を決め、手続きした" },
        expected: { metric: "事業経費率", target: "25%以下", verification: "翌月の月次実績で確認" },
      });
    }
  }

  if (fundMonths == null) {
    cands.push({
      weight: 50,
      issue: { title: "生活防衛資金が未把握", detail: "家計の生活費と貯蓄残高が未入力のため、独立に必要な資金を判定できません。" },
      action: { title: "家計の月間生活費と貯蓄残高を確認して入力する", purpose: "独立に必要な資金を確定する", estimate_minutes: 45, due_in_days: 7, mandala_code: "D1", done_criteria: "月次実績の家計欄に生活費と残高が入力されている" },
      expected: { metric: "生活防衛資金", target: `生活費の${st.emergency_fund_months_min}か月分`, verification: "独立判定の条件2で確認" },
    });
  } else if (fundMonths < st.emergency_fund_months_min) {
    cands.push({
      weight: 58,
      issue: { title: "生活防衛資金が基準に届いていない", detail: `生活費の ${fundMonths.toFixed(1)} か月分（基準 ${st.emergency_fund_months_min} か月）。` },
      action: { title: "毎月の先取り貯蓄額を決めて自動積立を設定する", purpose: "独立前に生活防衛資金を確保する", estimate_minutes: 30, due_in_days: 14, mandala_code: "D3", done_criteria: "自動積立の設定が完了している" },
      expected: { metric: "生活防衛資金", target: `${st.emergency_fund_months_min}か月分`, verification: "毎月の家計残高で確認" },
    });
  }

  if (m.overdue.length > 0) {
    const t = m.overdue[0];
    cands.push({
      weight: 40 + Math.min(20, m.overdue.length * 2),
      issue: { title: "期限を過ぎたタスクが溜まっている", detail: `遅延タスク ${m.overdue.length} 件（最も古いもの：${t.title}）。` },
      action: {
        title: `遅延タスクを見直し、不要なものは削除・必要なものは期限を再設定する`,
        purpose: "計画を現実に合わせ、毎日の提案を正確にする",
        estimate_minutes: 20,
        due_in_days: 2,
        mandala_code: t.mandala_action_id ? m.codeOfAction.get(t.mandala_action_id) ?? "" : "",
        done_criteria: "遅延タスクが0件になっている",
      },
      expected: { metric: "遅延タスク数", target: "0件", verification: "ダッシュボードで確認" },
    });
  }

  const missedAreas = m.goalProgress.filter((g) => g.counts.missed > 0).sort((a, b) => b.counts.missed - a.counts.missed);
  if (missedAreas.length) {
    const g = missedAreas[0];
    cands.push({
      weight: 42,
      issue: { title: `「${g.goal.title}」に期限切れの目標がある`, detail: `${g.counts.missed} 件が期限を過ぎて未達成。` },
      action: { title: `「${g.goal.title}」の未達項目の期限と内容を見直す`, purpose: "実行可能な計画に組み直す", estimate_minutes: 30, due_in_days: 7, mandala_code: "", done_criteria: "未達項目に新しい期限とタスクが設定されている" },
      expected: { metric: "未達項目数", target: "0件", verification: "マンダラチャートで確認" },
    });
  }

  const lr = m.latestReview;
  if (lr && lr.family_hours < st.family_hours_weekly_target) {
    cands.push({
      weight: 35,
      issue: { title: "家族時間が目標を下回っている", detail: `直近の家族時間 週${lr.family_hours}時間（目標 ${st.family_hours_weekly_target}時間）。` },
      action: { title: "来週の家族時間を先にカレンダーへ確保する", purpose: "家族との時間を守りながら準備を進める", estimate_minutes: 15, due_in_days: 3, mandala_code: "G2", done_criteria: "来週の予定に家族時間が入っている" },
      expected: { metric: "家族時間", target: `週${st.family_hours_weekly_target}時間`, verification: "週間レビューで記録" },
    });
  }

  const insufficient = m.criteria.filter((c) => c.enabled && c.status === "insufficient");
  if (insufficient.length) cautions.push(`データ不足の独立条件：${insufficient.map((c) => c.title).join("、")}`);
  cautions.push("税金・社会保険は概算負担率による試算です。正確な金額は税理士・自治体に確認してください。");

  cands.sort((a, b) => b.weight - a.weight);
  const top = cands.slice(0, 3);
  // 推奨行動は3件に満たない場合、今日の提案タスクで補う
  const actions = top.map((c) => c.action);
  const extra = [m.todayPlan.main, ...m.todayPlan.support].filter(Boolean);
  for (const s of extra) {
    if (actions.length >= 3 || !s) break;
    if (actions.some((x) => x.title === s.task.title)) continue;
    actions.push({
      title: s.task.title,
      purpose: s.task.purpose || "計画中のタスクを進める",
      estimate_minutes: s.task.estimate_minutes,
      due_in_days: 7,
      mandala_code: s.task.mandala_action_id ? m.codeOfAction.get(s.task.mandala_action_id) ?? "" : "",
      done_criteria: s.task.done_criteria || "完了にした",
    });
  }

  const current = cur
    ? `最新の実績（${cur.month.slice(0, 4)}年${Number(cur.month.slice(5, 7))}月）は合計月商 ${manS(cur.totalRevenue)}（目標 ${manS(st.target_monthly_revenue)}の${st.target_monthly_revenue ? Math.round((cur.totalRevenue / st.target_monthly_revenue) * 100) : 0}%）、事業利益 ${manS(cur.profit)}。` +
      `生活防衛資金は${fundMonths == null ? "未入力" : `生活費の${fundMonths.toFixed(1)}か月分`}。独立条件は ${m.readiness.achieved}/${m.readiness.total} 達成、マンダラ進捗 ${m.mandalaProgress}%、独立予定日まで ${m.daysToIndependence} 日。`
    : `月次実績が未入力です。マンダラ進捗 ${m.mandalaProgress}%、独立条件は ${m.readiness.achieved}/${m.readiness.total} 達成、独立予定日まで ${m.daysToIndependence} 日。`;

  return {
    current,
    issues: top.slice(0, 2).map((c) => c.issue),
    actions: actions.slice(0, 3),
    expected: top.map((c) => c.expected),
    cautions,
  };
}
