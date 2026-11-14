"use client";
import { useMemo, useState } from "react";
import { RotateCcw, Save, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SimNote, SourceTag } from "@/components/common/parts";
import { useAction } from "@/components/common/use-action";
import { ASSUMPTION_FIELDS, type AssumptionField, type Assumptions } from "@/lib/domain/assumptions";
import { requiredPatients, steadyStateNewPatients } from "@/lib/domain/calc";
import { projectScenario, scenarioExpectation, type ProjectionRow } from "@/lib/domain/projection";
import { addMonths, diffMonths, monthOf } from "@/lib/date";
import { monthJa, num, pct, yen } from "@/lib/format";
import type { ScenarioKind } from "@/lib/types";
import { cn } from "@/lib/utils";
import { saveAssumptionsAction, setPrimaryScenarioAction } from "../actions";
import { ScenarioCharts } from "./charts";
import { ReversePanel } from "./reverse-panel";

export interface SimScenario {
  id: string;
  kind: ScenarioKind;
  name: string;
  description: string;
  horizon: number;
  isPrimary: boolean;
  assumptions: Assumptions;
  defaults: Assumptions;
}
export interface SimContext {
  today: string;
  startMonth: string;
  independenceDate: string;
  taxSocialRate: number;
  livingCost: number;
  employmentTakehome: number;
  employmentWeeklyHours: number;
  weeklyDiscretionaryHours: number;
  initialBalance: number | null;
  initialActivePatients: number | null;
  initialContracts: number | null;
  targets: { clinic: number; ai: number; total: number };
  emergencyMonths: number;
  maxWeeklyHours: number;
  familyTarget: number;
  profitThreshold: number;
  activePatientsMin: number;
  contractsMin: number;
  actual: null | { month: string; sessions: number | null; clinicRevenue: number; aiRevenue: number; activePatients: number | null; contracts: number | null };
}

export function project(a: Assumptions, ctx: SimContext, months: number, independenceDate = ctx.independenceDate): ProjectionRow[] {
  return projectScenario(a, {
    startMonth: ctx.startMonth,
    months,
    independenceDate,
    taxSocialRate: ctx.taxSocialRate,
    livingCost: ctx.livingCost,
    employmentTakehome: ctx.employmentTakehome,
    employmentWeeklyHours: ctx.employmentWeeklyHours,
    weeklyDiscretionaryHours: ctx.weeklyDiscretionaryHours,
    initialBalance: ctx.initialBalance,
    initialActivePatients: ctx.initialActivePatients,
    initialContracts: ctx.initialContracts,
  });
}

export function expectationOf(rows: ProjectionRow[], ctx: SimContext, independenceDate = ctx.independenceDate) {
  return scenarioExpectation(rows, {
    independenceDate,
    profitThreshold: ctx.profitThreshold,
    emergencyMonths: ctx.emergencyMonths,
    livingCost: ctx.livingCost,
    activePatientsMin: ctx.activePatientsMin,
    contractsMin: ctx.contractsMin,
    maxWeeklyHours: ctx.maxWeeklyHours,
  });
}

export function Simulator({ scenarios, ctx, initialTab }: { scenarios: SimScenario[]; ctx: SimContext; initialTab: "calc" | "compare" | "reverse" }) {
  // 編集中の値（シナリオごと）。保存するまでサーバーには送らない
  const [drafts, setDrafts] = useState<Record<string, Assumptions>>(() => Object.fromEntries(scenarios.map((s) => [s.id, s.assumptions])));
  const [activeId, setActiveId] = useState(scenarios.find((s) => s.isPrimary)?.id ?? scenarios[0]?.id ?? "");
  const projections = useMemo(() => Object.fromEntries(scenarios.map((s) => [s.id, project(drafts[s.id], ctx, s.horizon)])), [scenarios, drafts, ctx]);
  const dirty = (id: string) => JSON.stringify(drafts[id]) !== JSON.stringify(scenarios.find((s) => s.id === id)?.assumptions);
  const active = scenarios.find((s) => s.id === activeId);
  if (!active) return null;

  return (
    <Tabs defaultValue={initialTab}>
      <TabsList>
        <TabsTrigger value="calc">シミュレーター</TabsTrigger>
        <TabsTrigger value="compare">3シナリオ比較</TabsTrigger>
        <TabsTrigger value="reverse">独立日から逆算</TabsTrigger>
      </TabsList>
      <div className="flex flex-wrap gap-2">
        {scenarios.map((s) => (
          <button
            key={s.id}
            onClick={() => setActiveId(s.id)}
            className={cn("flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm", s.id === activeId ? "border-primary bg-primary/10 text-primary font-semibold" : "text-muted-foreground")}
          >
            {s.isPrimary && <Star className="size-3.5 fill-current" />}
            {s.name}
            {dirty(s.id) && <span className="bg-status-amber size-1.5 rounded-full" title="未保存の変更" />}
          </button>
        ))}
      </div>
      <TabsContent value="calc">
        <CalcPanel
          key={active.id}
          s={active}
          a={drafts[active.id]}
          rows={projections[active.id]}
          ctx={ctx}
          dirty={dirty(active.id)}
          onChange={(a) => setDrafts({ ...drafts, [active.id]: a })}
        />
      </TabsContent>
      <TabsContent value="compare">
        <ComparePanel scenarios={scenarios} drafts={drafts} projections={projections} ctx={ctx} />
      </TabsContent>
      <TabsContent value="reverse">
        <ReversePanel s={active} a={drafts[active.id]} ctx={ctx} />
      </TabsContent>
    </Tabs>
  );
}

// ---------------------------------------------------------------------------
function AssumptionInput({ f, value, onChange, override }: { f: AssumptionField; value: number; onChange: (v: number) => void; override?: string | null }) {
  const isRate = f.kind === "rate";
  const shown = isRate ? Math.round(value * 10000) / 100 : value;
  const unit = { yen: "円", count: f.key.includes("contracts") ? "社" : f.key.includes("sales") ? "個" : "人", rate: "%", hours: "時間", minutes: "分", days: "日", times: "回" }[f.kind];
  const [text, setText] = useState(String(shown));
  return (
    <label className="block space-y-1">
      <span className="text-muted-foreground block text-xs">{f.label}</span>
      <div className="relative">
        <Input
          inputMode="decimal"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            const n = Number(e.target.value.replace(/[,，]/g, ""));
            if (e.target.value.trim() !== "" && Number.isFinite(n)) onChange(isRate ? n / 100 : n);
          }}
          onBlur={() => setText(String(isRate ? Math.round(value * 10000) / 100 : value))}
          className="num pr-10 text-right"
          aria-invalid={text.trim() === "" || !Number.isFinite(Number(text.replace(/[,，]/g, "")))}
        />
        <span className="text-muted-foreground pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs">{unit}</span>
      </div>
      {override ? <span className="text-status-green block text-[11px]">{override}</span> : f.help && <span className="text-muted-foreground block text-[11px]">{f.help}</span>}
    </label>
  );
}

/** 実績がある前提値は試算で実績を優先する（入力値は実績がないときだけ使う） */
function overrideNote(key: string, ctx: SimContext): string | null {
  if (key === "clinic_initial_active" && ctx.initialActivePatients != null) return `実績 ${ctx.initialActivePatients}人を優先して試算中`;
  if (key === "ai_initial_contracts" && ctx.initialContracts != null) return `実績 ${ctx.initialContracts}社を優先して試算中`;
  if (key === "initial_savings" && ctx.initialBalance != null) return `実績 ${yen(ctx.initialBalance)}を優先して試算中`;
  return null;
}

function Line({ label, value, tag, strong, tone }: { label: string; value: string; tag?: "actual" | "sim" | "calc" | "target"; strong?: boolean; tone?: "good" | "bad" }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b py-1.5 text-sm last:border-0">
      <span className="text-muted-foreground flex items-center gap-1.5">{tag && <SourceTag kind={tag} />}{label}</span>
      <span className={cn("num", strong && "text-base font-bold", tone === "good" && "text-status-green", tone === "bad" && "text-status-red")}>{value}</span>
    </div>
  );
}

function CalcPanel({ s, a, rows, ctx, dirty, onChange }: { s: SimScenario; a: Assumptions; rows: ProjectionRow[]; ctx: SimContext; dirty: boolean; onChange: (a: Assumptions) => void }) {
  const { pending, exec } = useAction();
  const indepIdx = Math.max(0, diffMonths(monthOf(ctx.independenceDate), ctx.startMonth));
  const [idx, setIdx] = useState(Math.min(rows.length - 1, indepIdx + 12));
  const r = rows[Math.min(idx, rows.length - 1)];
  const set = (k: keyof Assumptions, v: number) => onChange({ ...a, [k]: v });
  const groups: { g: AssumptionField["group"]; title: string }[] = [
    { g: "clinic", title: "施術事業の前提" },
    { g: "ai", title: "AI事業の前提" },
    { g: "household", title: "家計・時間の前提" },
  ];
  const patients = r ? requiredPatients(r.clinicSessions, a.clinic_visit_frequency) : null;
  const tSessions = a.clinic_price > 0 ? Math.ceil(ctx.targets.clinic / a.clinic_price) : null;
  const tPatients = tSessions == null ? null : requiredPatients(tSessions, a.clinic_visit_frequency);
  const actualRevenueBySessions = ctx.actual?.sessions != null ? ctx.actual.sessions * a.clinic_price : null;

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
      <div className="space-y-4">
        {groups.map(({ g, title }) => (
          <Card key={g}>
            <CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 md:grid-cols-3">
              {ASSUMPTION_FIELDS.filter((f) => f.group === g).map((f) => (
                <AssumptionInput key={f.key} f={f} value={a[f.key]} onChange={(v) => set(f.key, v)} override={overrideNote(f.key, ctx)} />
              ))}
            </CardContent>
          </Card>
        ))}
        <Card>
          <CardHeader><CardTitle className="text-base">税金・事業形態の注意事項</CardTitle></CardHeader>
          <CardContent className="text-muted-foreground space-y-1.5 text-sm">
            <p>・税金・社会保険は「事業利益 × 概算負担率（設定画面で {pct(ctx.taxSocialRate)}）」の概算です。正確な申告計算ではありません。所得区分・控除・自治体により実際の額は変わります。</p>
            <p>・独立前は本業の給与と合算され、税率が上がる可能性があります。独立後は国民健康保険・国民年金に切り替わります。</p>
            <p>・消費税：売上（課税売上高）が年1,000万円を超えた年の2年後から納税義務が生じます。インボイス登録をすると売上規模に関係なく課税事業者になります。</p>
            <p>・青色申告（最大65万円控除）、個人事業か法人化かで手取りは変わります。判断の前に税理士へ相談してください。</p>
            <p>・自費施術でも施術所の開設届・構造設備基準・広告規制が関係します。保健所に確認してください。</p>
          </CardContent>
        </Card>
      </div>

      {r && (
        <div className="bg-card/95 fixed inset-x-3 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-20 grid grid-cols-3 gap-2 rounded-xl border p-2.5 text-center shadow-lg backdrop-blur lg:hidden" aria-live="polite">
          <div><div className="text-muted-foreground text-[10px]">{monthJa(r.month)} 月商</div><div className="num text-sm font-bold">{yen(r.totalRevenue)}</div></div>
          <div><div className="text-muted-foreground text-[10px]">事業利益</div><div className="num text-sm font-bold">{yen(r.profit)}</div></div>
          <div><div className="text-muted-foreground text-[10px]">貯蓄余力</div><div className={cn("num text-sm font-bold", r.savingsCapacity < 0 && "text-status-red")}>{yen(r.savingsCapacity)}</div></div>
        </div>
      )}
      <div className="space-y-4 lg:sticky lg:top-4 lg:self-start">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-base">
              <span>計算結果</span>
              <Badge variant="amber">試算</Badge>
            </CardTitle>
            <CardDescription>
              <label className="flex items-center gap-2">
                対象月
                <select value={idx} onChange={(e) => setIdx(Number(e.target.value))} className="bg-background rounded border px-2 py-1 text-sm">
                  {rows.map((x, i) => <option key={x.month} value={i}>{monthJa(x.month)}{x.independent ? "（独立後）" : "（独立前）"}</option>)}
                </select>
              </label>
            </CardDescription>
          </CardHeader>
          {r && (
            <CardContent className="space-y-4">
              <div>
                <h3 className="mb-1 text-xs font-semibold">施術事業</h3>
                <Line label="予約枠ベースの上限件数" value={num(r.clinicCapacity, "件")} tag="calc" />
                <Line label="需要（継続患者×来院頻度）" value={num(r.clinicDemand, "件")} tag="calc" />
                <Line label="月間施術件数" value={num(r.clinicSessions, "件")} tag="sim" strong />
                <Line label="月間必要実患者数" value={num(patients, "人")} tag="calc" />
                <Line label="継続患者数（コホート）" value={num(r.clinicActive, "人")} tag="sim" />
                <Line label="患者数維持に必要な新患数" value={num(steadyStateNewPatients(r.clinicActive, a.clinic_retention_rate), "人/月")} tag="calc" />
                <Line label="月間売上" value={yen(r.clinicRevenue)} tag="sim" strong />
                <Line label="事業利益" value={yen(r.clinicRevenue - r.clinicExpenses)} tag="sim" />
                <Line label={`目標 ${yen(ctx.targets.clinic)} に必要な件数／患者数`} value={`${num(tSessions, "件")} ／ ${num(tPatients == null ? null : Math.ceil(tPatients), "人")}`} tag="target" />
                <Line label="目標売上までの不足額" value={yen(Math.max(0, ctx.targets.clinic - r.clinicRevenue))} tone={r.clinicRevenue >= ctx.targets.clinic ? "good" : "bad"} tag="calc" />
                {ctx.actual?.sessions != null && (
                  <Line label={`実績優先：${monthJa(ctx.actual.month)}の${ctx.actual.sessions}件 × 単価`} value={yen(actualRevenueBySessions)} tag="actual" />
                )}
              </div>
              <div>
                <h3 className="mb-1 text-xs font-semibold">AI事業</h3>
                <Line label="初期導入売上" value={yen(r.aiInitialRevenue)} tag="sim" />
                <Line label="月額継続売上" value={yen(r.aiRecurringRevenue)} tag="sim" />
                <Line label="商品売上" value={yen(r.aiProductRevenue)} tag="sim" />
                <Line label="合計月商" value={yen(r.aiRevenue)} tag="sim" strong />
                <Line label="月間経費" value={yen(r.aiExpenses)} tag="sim" />
                <Line label="事業利益" value={yen(r.aiRevenue - r.aiExpenses)} tag="sim" />
                <Line label="契約社数" value={num(r.aiContracts, "社")} tag="sim" />
                <Line label="1社当たり保守時間" value={num(a.ai_maintenance_hours, "時間/月")} tag="calc" />
                <Line label="AI事業の必要労働時間" value={num(r.aiContracts * a.ai_maintenance_hours + r.aiNew * a.ai_setup_hours, "時間/月")} tag="calc" />
              </div>
              <div>
                <h3 className="mb-1 text-xs font-semibold">全体収支（{r.independent ? "独立後" : "独立前・本業あり"}）</h3>
                <Line label="施術売上" value={yen(r.clinicRevenue)} />
                <Line label="AI売上" value={yen(r.aiRevenue)} />
                <Line label="合計売上" value={yen(r.totalRevenue)} strong />
                <Line label="事業経費" value={yen(r.expenses)} />
                <Line label="事業利益（事業所得の目安）" value={yen(r.profit)} strong />
                <Line label="税金・社会保険の概算" value={yen(r.taxSocial)} />
                <Line label="事業の手取り概算" value={yen(r.disposableBusiness)} />
                {!r.independent && <Line label="本業の手取り" value={yen(r.employmentIncome)} />}
                <Line label="推定可処分所得" value={yen(r.householdIncome)} strong />
                <Line label="家計生活費" value={yen(r.livingCost)} />
                <Line label="月間貯蓄余力" value={yen(r.savingsCapacity)} tone={r.savingsCapacity >= 0 ? "good" : "bad"} strong />
                <Line label="生活防衛資金の残高" value={yen(r.balance)} />
                <Line label="事業の労働時間（週）" value={num(r.businessHoursWeekly, "時間")} tone={r.independent && r.businessHoursWeekly > ctx.maxWeeklyHours ? "bad" : undefined} />
                <Line label="家族時間の目安（週）" value={num(r.familyHoursWeekly, "時間")} tone={r.familyHoursWeekly < ctx.familyTarget ? "bad" : "good"} />
              </div>
              <SimNote />
            </CardContent>
          )}
        </Card>
        <div className="flex flex-wrap gap-2">
          <Button className="flex-1" disabled={pending || !dirty} onClick={() => exec(() => saveAssumptionsAction(s.id, a))}><Save />{dirty ? "このシナリオを保存" : "保存済み"}</Button>
          <Button variant="outline" onClick={() => onChange(s.defaults)} title="初期値に戻す（保存するまで反映されません）"><RotateCcw />初期値</Button>
          {!s.isPrimary && <Button variant="outline" disabled={pending} onClick={() => exec(() => setPrimaryScenarioAction(s.id))}><Star />主シナリオにする</Button>}
        </div>
        {s.isPrimary && <p className="text-muted-foreground text-xs">★ 主シナリオ：ダッシュボードの見通し・マンダラの達成見込み・独立判定に使われます。</p>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
function ComparePanel({ scenarios, drafts, projections, ctx }: { scenarios: SimScenario[]; drafts: Record<string, Assumptions>; projections: Record<string, ProjectionRow[]>; ctx: SimContext }) {
  const horizon = Math.min(...scenarios.map((s) => projections[s.id].length));
  const indepIdx = Math.max(0, diffMonths(monthOf(ctx.independenceDate), ctx.startMonth));
  const [idx, setIdx] = useState(Math.min(horizon - 1, indepIdx + 12));
  const month = addMonths(ctx.startMonth, idx);
  const cols = scenarios.map((s) => {
    const rows = projections[s.id];
    const r = rows[idx];
    const a = drafts[s.id];
    return { s, a, r, exp: expectationOf(rows, ctx), total36: rows.reduce((t, x) => t + x.profit, 0) };
  });
  const rowsDef: { label: string; get: (c: (typeof cols)[number]) => string }[] = [
    { label: "施術単価", get: (c) => yen(c.a.clinic_price) },
    { label: "施術人数（件/月）", get: (c) => num(c.r.clinicSessions, "件") },
    { label: "施術人数（人/日）", get: (c) => num(c.r.clinicSessions / Math.max(1, c.r.independent ? c.a.clinic_work_days_post : c.a.clinic_work_days_pre), "人") },
    { label: "AI契約数", get: (c) => num(c.r.aiContracts, "社") },
    { label: "売上", get: (c) => yen(c.r.totalRevenue) },
    { label: "経費", get: (c) => yen(c.r.expenses) },
    { label: "利益", get: (c) => yen(c.r.profit) },
    { label: "手取り概算（事業）", get: (c) => yen(c.r.disposableBusiness) },
    { label: "労働時間（週・事業）", get: (c) => num(c.r.businessHoursWeekly, "時間") },
    { label: "家族時間の目安（週）", get: (c) => num(c.r.familyHoursWeekly, "時間") },
    { label: "生活防衛資金の残高", get: (c) => yen(c.r.balance) },
    { label: "36か月の事業利益合計", get: (c) => yen(c.total36) },
    { label: "独立条件の達成見込み", get: (c) => `${c.exp.okCount} / ${c.exp.total}` },
  ];
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">3シナリオ比較</CardTitle>
          <CardDescription className="flex flex-wrap items-center gap-2">
            比較する月
            <select value={idx} onChange={(e) => setIdx(Number(e.target.value))} className="bg-background rounded border px-2 py-1 text-sm">
              {Array.from({ length: horizon }, (_, i) => addMonths(ctx.startMonth, i)).map((m, i) => <option key={m} value={i}>{monthJa(m)}{i >= indepIdx ? "（独立後）" : ""}</option>)}
            </select>
            <span>独立予定 {monthJa(ctx.independenceDate)}</span>
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="num w-full min-w-[560px] text-sm">
            <thead>
              <tr className="text-muted-foreground text-xs">
                <th className="py-2 text-left">{monthJa(month)}</th>
                {cols.map((c) => <th key={c.s.id} className="text-right">{c.s.name}{c.s.isPrimary && " ★"}</th>)}
              </tr>
            </thead>
            <tbody>
              {rowsDef.map((rd) => (
                <tr key={rd.label} className="border-t">
                  <td className="text-muted-foreground py-2">{rd.label}</td>
                  {cols.map((c) => <td key={c.s.id} className="text-right">{rd.get(c)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {cols.map((c) => (
              <div key={c.s.id} className="rounded-lg border p-3">
                <div className="mb-1 text-sm font-semibold">{c.s.name}：独立月の見込み</div>
                <ul className="space-y-0.5 text-xs">
                  {c.exp.checks.map((x) => (
                    <li key={x.code} className="flex justify-between gap-2">
                      <span className={x.ok === true ? "text-status-green" : x.ok === false ? "text-status-red" : "text-muted-foreground"}>{x.ok === true ? "◯" : x.ok === false ? "×" : "－"} {x.label}</span>
                      <span className="text-muted-foreground text-right">{x.detail}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <SimNote className="mt-3" />
        </CardContent>
      </Card>
      <ScenarioCharts
        series={cols.map((c) => ({ id: c.s.id, kind: c.s.kind, name: c.s.name, rows: projections[c.s.id] }))}
        independenceMonth={monthOf(ctx.independenceDate)}
        target={ctx.targets.total}
      />
    </div>
  );
}
