import Link from "next/link";
import { ArrowUpRight, Sparkles, TriangleExclamationPoint } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardAction } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CriterionBadge, Kpi, SimNote, SourceTag, STATUS_BAR } from "@/components/common/parts";
import { TaskCheck } from "@/components/common/task-check";
import { TrendChart, type TrendPoint } from "@/components/charts/trend-chart";
import { getAppModel } from "@/lib/server/snapshot";
import { rulesAdvice } from "@/lib/domain/advisor";
import { lastCompletedMonths, consecutiveProfitMonths } from "@/lib/domain/actuals";
import { criterionConfig } from "@/lib/domain/criteria";
import { LEVEL_LABEL } from "@/lib/domain/tasks";
import { addMonths, monthOf } from "@/lib/date";
import { dateJa, jstDateTime, man, monthJa, pct, shortMonth, signedYen, yen } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata = { title: "ダッシュボード" };

export default async function DashboardPage() {
  const { model: m } = await getAppModel();
  const st = m.snapshot.settings;
  const cur = m.current;
  const center = m.goalByCode.get("CENTER");
  const advice = rulesAdvice(m);
  const llm = m.snapshot.insights.find((i) => i.source === "llm");

  // 過去6か月（実績）＋ 先6か月（主シナリオの試算）
  const thisMonth = monthOf(m.today);
  const past: TrendPoint[] = m.recent6.map((x) => ({ month: x.month, label: shortMonth(x.month), kind: "actual", clinic: x.hasData ? x.clinicRevenue : null, ai: x.hasData ? x.aiRevenue : null, profit: x.hasData ? x.profit : null }));
  const future: TrendPoint[] = (m.primary?.rows ?? [])
    .filter((r) => r.month > thisMonth && r.month <= addMonths(thisMonth, 6))
    .map((r) => ({ month: r.month, label: shortMonth(r.month), kind: "sim", clinic: r.clinicRevenue, ai: r.aiRevenue, profit: r.profit }));

  const gap = cur ? cur.totalRevenue - st.target_monthly_revenue : null;
  const fund = m.actuals.latestHousehold;
  const living = fund?.livingCost ?? st.living_cost_monthly;
  const fundMonths = fund?.emergencyFund != null && living ? fund.emergencyFund / living : null;
  const profitTh = criterionConfig(m.snapshot.criteria, "profit").threshold ?? 0;
  const stableMonths = consecutiveProfitMonths(m.actuals, m.today, profitTh);
  const last6 = lastCompletedMonths(m.actuals, m.today, 6).filter((x) => x.hasData).length;
  const prepArea = m.goalProgress.find((g) => g.goal.code === "F");
  const plan = m.todayPlan;

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <section className="bg-sidebar text-sidebar-foreground relative overflow-hidden rounded-2xl p-5 sm:p-6">
        <div className="text-xs text-white/60">{dateJa(m.today, true)}（日本時間）</div>
        <div className="mt-2 flex flex-wrap items-end gap-x-6 gap-y-2">
          <div>
            <div className="text-xs text-white/60">独立判断（{dateJa(st.independence_target_date)}）まで</div>
            <div className="num text-4xl font-bold text-white sm:text-5xl">
              {m.daysToIndependence >= 0 ? m.daysToIndependence : 0}
              <span className="ml-1 text-base font-medium text-white/70">日</span>
            </div>
          </div>
          <div>
            <div className="text-xs text-white/60">独立条件</div>
            <div className="num text-2xl font-bold text-white">
              {m.readiness.achieved}
              <span className="text-base text-white/60"> / {m.readiness.total} 達成</span>
            </div>
          </div>
          <div>
            <div className="text-xs text-white/60">マンダラ進捗</div>
            <div className="num text-2xl font-bold text-white">{m.mandalaProgress}%</div>
          </div>
        </div>
        {center?.title && <p className="mt-4 line-clamp-2 text-sm leading-relaxed text-white/80">🎯 {center.title}</p>}
      </section>

      {/* 今日の行動 */}
      <Card>
        <CardHeader>
          <CardTitle>今日の行動</CardTitle>
          <CardDescription>
            未完了タスクの期限・重要度・目標との関連から提案（{plan.totalMinutes}分 ／ 使える時間 {plan.availableMinutes}分）
          </CardDescription>
          <CardAction>
            <Button asChild size="sm" variant="outline"><Link href="/tasks">タスク一覧</Link></Button>
          </CardAction>
        </CardHeader>
        <CardContent className="space-y-3">
          {!plan.main ? (
            <div className="text-muted-foreground text-sm">
              今日実行できるタスクがありません。<Link href="/mandala" className="text-primary underline">マンダラ</Link>の項目から「行動計画を生成」するか、
              <Link href="/tasks" className="text-primary underline">タスクを追加</Link>してください。
              {plan.skippedForTime.length > 0 && <div className="mt-1">（所要時間が使える時間を超えるタスクが {plan.skippedForTime.length} 件あります。設定で「1日に使える時間」を見直せます）</div>}
            </div>
          ) : (
            <>
              <TodayRow s={plan.main} main code={plan.main.task.mandala_action_id ? m.codeOfAction.get(plan.main.task.mandala_action_id) : undefined} />
              {plan.support.map((s) => (
                <TodayRow key={s.task.id} s={s} code={s.task.mandala_action_id ? m.codeOfAction.get(s.task.mandala_action_id) : undefined} />
              ))}
            </>
          )}
        </CardContent>
      </Card>

      {/* 財務 */}
      <section className="space-y-3">
        <div className="flex items-end justify-between">
          <h2 className="font-semibold">財務 <span className="text-muted-foreground text-xs font-normal">{cur ? `${monthJa(cur.month)}の実績` : "実績未入力"}</span></h2>
          <Link href="/actuals" className="text-primary flex items-center text-sm">実績を入力 <ArrowUpRight className="size-4" /></Link>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi label="現在の本業収入（手取り／月）" value={yen(m.employmentIncome)} tag={fund?.employmentIncome != null ? "actual" : "target"} sub={fund?.employmentIncome != null ? "家計の実績" : `年収 ${man(st.employment_annual_income, 0)}（設定値）`} />
          <Kpi label="施術事業売上" value={yen(cur?.clinicRevenue)} tag="actual" sub={`目標 ${man(st.target_clinic_revenue)}`} />
          <Kpi label="AI事業売上" value={yen(cur?.aiRevenue)} tag="actual" sub={`目標 ${man(st.target_ai_revenue)}`} />
          <Kpi label="合計売上" value={yen(cur?.totalRevenue)} tag="actual" sub={`目標 ${man(st.target_monthly_revenue)}`} />
          <Kpi label="事業経費" value={yen(cur?.expenses)} tag="actual" sub={cur?.expenseRatio != null ? `経費率 ${pct(cur.expenseRatio)}` : undefined} />
          <Kpi label="事業利益" value={yen(cur?.profit)} tag="actual" tone={cur ? (cur.profit >= 0 ? "good" : "bad") : undefined} sub="売上 − 事業経費" />
          <Kpi label="推定税引後手取り（事業）" value={yen(cur?.disposableBusiness)} tag="calc" sub={`概算負担率 ${pct(st.tax_social_rate)}で計算`} />
          <Kpi label="目標との差額（月商）" value={signedYen(gap)} tag="calc" tone={gap == null ? undefined : gap >= 0 ? "good" : "bad"} sub={cur ? `達成率 ${pct(cur.totalRevenue / (st.target_monthly_revenue || 1))}` : undefined} />
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">過去6か月の推移と今後6か月の見通し</CardTitle>
            <CardDescription>見通しは主シナリオ「{m.primary?.scenario.name ?? "—"}」の試算です</CardDescription>
          </CardHeader>
          <CardContent>
            <TrendChart data={[...past, ...future]} target={st.target_monthly_revenue} />
            <SimNote className="mt-2" />
          </CardContent>
        </Card>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* 独立準備 */}
        <Card>
          <CardHeader>
            <CardTitle>独立準備</CardTitle>
            <CardDescription>達成数は参考指標です（成功確率ではありません）</CardDescription>
            <CardAction><Button asChild size="sm" variant="outline"><Link href="/independence">詳細</Link></Button></CardAction>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Mini label="独立条件の達成数" value={`${m.readiness.achieved} / ${m.readiness.total}`} />
              <Mini label="目標独立日まで" value={`${Math.max(0, m.daysToIndependence)}日`} />
              <Mini label="生活防衛資金" value={fundMonths == null ? "未入力" : `${fundMonths.toFixed(1)}か月分`} sub={fund?.emergencyFund != null ? yen(fund.emergencyFund) : undefined} tag="actual" />
              <Mini label="顧客基盤" value={`${m.actuals.latestActivePatients ?? "—"}人 ／ ${m.actuals.latestActiveContracts ?? "—"}社`} sub="継続患者 ／ AI継続契約" tag="actual" />
              <Mini label="収益安定性" value={`${stableMonths}か月連続`} sub={`利益 ${man(profitTh)} 以上（直近6か月の入力 ${last6}/6）`} tag="actual" />
              <Mini label="事業準備の進捗" value={`${prepArea?.progress ?? 0}%`} sub="マンダラ F：独立準備" />
            </div>
            <ul className="space-y-1.5">
              {m.criteria.filter((c) => c.enabled).map((c) => (
                <li key={c.code} className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate">{c.title}</span>
                  <CriterionBadge status={c.status} />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {/* 行動 */}
        <Card>
          <CardHeader>
            <CardTitle>行動</CardTitle>
            <CardAction><Button asChild size="sm" variant="outline"><Link href="/mandala">マンダラ</Link></Button></CardAction>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <Mini label="今週の達成率" value={m.week.rate == null ? "—" : pct(m.week.rate)} sub={`${m.week.done}/${m.week.total}件`} />
              <Mini label="遅延タスク" value={`${m.overdue.length}件`} tone={m.overdue.length ? "bad" : undefined} />
              <Mini label="マンダラ進捗" value={`${m.mandalaProgress}%`} />
            </div>
            <div className="space-y-2.5">
              {m.goalProgress.map((g) => (
                <div key={g.goal.id}>
                  <div className="mb-1 flex justify-between text-xs">
                    <span className="truncate">{g.goal.code}. {g.goal.title}</span>
                    <span className="num text-muted-foreground">{g.progress}%{g.counts.missed ? ` ・未達${g.counts.missed}` : ""}</span>
                  </div>
                  <Progress value={g.progress} indicatorClassName={g.counts.missed ? STATUS_BAR.missed : STATUS_BAR.in_progress} />
                </div>
              ))}
            </div>
            {m.overdue.length > 0 && (
              <div>
                <div className="text-status-red mb-1 flex items-center gap-1 text-xs font-semibold"><TriangleExclamationPoint className="size-3.5" />遅延中</div>
                <ul className="space-y-1 text-sm">
                  {m.overdue.slice(0, 4).map((t) => (
                    <li key={t.id} className="flex justify-between gap-2"><span className="truncate">{t.title}</span><span className="num text-status-red shrink-0 text-xs">{t.due_date}</span></li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* AI 分析 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Sparkles className="text-primary size-4" /> AI分析</CardTitle>
          <CardDescription>
            {llm ? `最新のAI分析：${jstDateTime(llm.created_at)}（下はルールベースの最新分析）` : "ルールベースの分析（AI APIキーを設定すると、AI経営参謀で詳しい分析ができます）"}
          </CardDescription>
          <CardAction><Button asChild size="sm" variant="outline"><Link href="/advisor">AI経営参謀</Link></Button></CardAction>
        </CardHeader>
        <CardContent className="grid gap-5 md:grid-cols-3">
          <div>
            <h3 className="text-muted-foreground mb-2 text-xs font-semibold">現在最大の課題</h3>
            {advice.issues[0] ? (
              <>
                <p className="font-semibold">{advice.issues[0].title}</p>
                <p className="text-muted-foreground mt-1 text-sm">{advice.issues[0].detail}</p>
              </>
            ) : (
              <p className="text-muted-foreground text-sm">大きな課題は見つかりませんでした。</p>
            )}
          </div>
          <div>
            <h3 className="text-muted-foreground mb-2 text-xs font-semibold">独立に向けた推奨行動</h3>
            <ol className="list-decimal space-y-1 pl-4 text-sm">
              {advice.actions.map((a, i) => <li key={i}>{a.title}{a.mandala_code && <Badge variant="outline" className="ml-1">{a.mandala_code}</Badge>}</li>)}
            </ol>
          </div>
          <div>
            <h3 className="text-muted-foreground mb-2 text-xs font-semibold">目標達成を妨げる要因</h3>
            <ul className="space-y-1 text-sm">
              {advice.issues.slice(1).map((x, i) => <li key={i}>・{x.title}</li>)}
              {advice.cautions.slice(1, 3).map((c, i) => <li key={`c${i}`} className="text-muted-foreground">・{c}</li>)}
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Mini({ label, value, sub, tag, tone }: { label: string; value: string; sub?: string; tag?: "actual" | "sim"; tone?: "bad" }) {
  return (
    <div className="bg-muted/50 rounded-lg p-3">
      <div className="text-muted-foreground flex items-center justify-between gap-1 text-[11px]">
        <span className="truncate">{label}</span>
        {tag && <SourceTag kind={tag} />}
      </div>
      <div className={cn("num mt-1 text-lg font-bold", tone === "bad" && "text-status-red")}>{value}</div>
      {sub && <div className="text-muted-foreground truncate text-[11px]">{sub}</div>}
    </div>
  );
}

function TodayRow({ s, main, code }: { s: { task: { id: string; title: string; status: string; estimate_minutes: number; due_date: string | null; level: keyof typeof LEVEL_LABEL }; reasons: string[] }; main?: boolean; code?: string }) {
  const t = s.task;
  return (
    <div className={cn("flex items-start gap-3 rounded-xl border p-3", main && "border-primary/60 bg-primary/5")}>
      <TaskCheck id={t.id} done={t.status === "done"} label={t.title} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          {main ? <Badge>最重要</Badge> : <Badge variant="secondary">補助</Badge>}
          {code && <Badge variant="outline">{code}</Badge>}
          <span className="text-muted-foreground text-xs">{LEVEL_LABEL[t.level]}・{t.estimate_minutes}分{t.due_date ? `・期限 ${t.due_date}` : ""}</span>
        </div>
        <div className={cn("mt-1 font-medium", main && "text-base")}>{t.title}</div>
        {s.reasons.length > 0 && <div className="text-muted-foreground mt-0.5 text-xs">{s.reasons.join(" ／ ")}</div>}
      </div>
    </div>
  );
}
