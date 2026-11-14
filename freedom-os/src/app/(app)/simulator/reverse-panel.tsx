"use client";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SimNote, SourceTag } from "@/components/common/parts";
import { useAction } from "@/components/common/use-action";
import type { Assumptions } from "@/lib/domain/assumptions";
import { reverseCalc } from "@/lib/domain/reverse";
import { isValidDate } from "@/lib/date";
import { dateJa, num, pct, yen } from "@/lib/format";
import { setIndependenceDateAction } from "../actions";
import { expectationOf, project, type SimContext, type SimScenario } from "./simulator";

export function ReversePanel({ s, a, ctx }: { s: SimScenario; a: Assumptions; ctx: SimContext }) {
  const [date, setDate] = useState(ctx.independenceDate);
  const valid = isValidDate(date);
  const { pending, exec } = useAction();
  const r = useMemo(
    () =>
      valid
        ? reverseCalc({
            today: ctx.today,
            independenceDate: date,
            targetClinicRevenue: ctx.targets.clinic,
            targetAiRevenue: ctx.targets.ai,
            currentClinicRevenue: ctx.actual?.clinicRevenue ?? 0,
            currentAiRevenue: ctx.actual?.aiRevenue ?? 0,
            currentActivePatients: ctx.actual?.activePatients ?? 0,
            currentContracts: ctx.actual?.contracts ?? 0,
            currentBalance: ctx.initialBalance ?? a.initial_savings,
            livingCost: ctx.livingCost,
            emergencyMonths: ctx.emergencyMonths,
            assumptions: a,
          })
        : null,
    [valid, date, ctx, a],
  );
  const exp = useMemo(() => (valid ? expectationOf(project(a, ctx, Math.max(s.horizon, 60), date), ctx, date) : null), [valid, a, ctx, s.horizon, date]);

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">独立予定日を変えて逆算</CardTitle>
          <CardDescription>目標（施術 {yen(ctx.targets.clinic)}・AI {yen(ctx.targets.ai)}／月）に、その日までに到達するための必要値。前提は「{s.name}」の単価・継続率など</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-2">
            <label className="space-y-1">
              <span className="text-muted-foreground block text-xs">独立予定日</span>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-48" />
            </label>
            {date !== ctx.independenceDate && valid && (
              <Button variant="outline" disabled={pending} onClick={() => exec(() => setIndependenceDateAction(date))}>この日を独立予定日として保存</Button>
            )}
          </div>
          {r && (
            <div className="space-y-1">
              <Row label="残り期間" value={`${r.monthsLeft}か月（${dateJa(date)}まで）`} />
              <Row label="現在の月商（最新の実績）" value={yen(r.currentTotal)} tag="actual" />
              <Row label="目標月商" value={yen(r.targetTotal)} tag="target" />
              <Row label="必要な売上成長率（毎月・複利）" value={r.requiredGrowthRate == null ? "計算不可" : pct(r.requiredGrowthRate, 1)} tag="calc" strong />
              <Row label="必要施術件数" value={num(r.requiredSessions, "件/月")} tag="calc" />
              <Row label="必要な継続患者数" value={num(r.requiredPatients, "人")} tag="calc" />
              <Row label="必要な新患獲得数（毎月）" value={num(r.requiredNewPatientsPerMonth, "人/月")} tag="calc" strong />
              <Row label="必要なAI継続契約数" value={num(r.requiredContracts, "社")} tag="calc" />
              <Row label="必要なAI新規契約（毎月）" value={num(r.requiredNewContractsPerMonth, "社/月")} tag="calc" strong />
              <Row label="必要な追加貯蓄額" value={yen(r.requiredSavingsTotal)} tag="calc" />
              <Row label="毎月の必要貯蓄額" value={yen(r.requiredSavingsPerMonth)} tag="calc" strong />
              <ul className="text-muted-foreground mt-2 space-y-0.5 text-xs">{r.notes.map((n, i) => <li key={i}>※ {n}</li>)}</ul>
            </div>
          )}
          {!valid && <p className="text-status-red text-sm">日付を正しく入力してください</p>}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">この日に独立した場合の条件見込み（{s.name}）</CardTitle>
          <CardDescription>試算上、独立月の時点で満たせそうな条件。開業・法務の準備は試算できないため対象外</CardDescription>
        </CardHeader>
        <CardContent>
          {exp && (
            <>
              <div className="num mb-3 text-3xl font-bold">{exp.okCount}<span className="text-muted-foreground text-base"> / {exp.total} 見込み</span></div>
              <ul className="space-y-2 text-sm">
                {exp.checks.map((c) => (
                  <li key={c.code} className="flex items-start justify-between gap-3 border-b pb-2 last:border-0">
                    <span className={c.ok === true ? "text-status-green" : c.ok === false ? "text-status-red" : "text-muted-foreground"}>{c.ok === true ? "◯ 見込みあり" : c.ok === false ? "× 未達の見込み" : "－ 判定不可"}：{c.label}</span>
                    <span className="text-muted-foreground text-right text-xs">{c.detail}</span>
                  </li>
                ))}
              </ul>
              <p className="text-muted-foreground mt-3 text-xs">条件を満たしても自動で退職を推奨することはありません。最終判断はご家族と相談のうえ、ご自身で行ってください。</p>
            </>
          )}
          <SimNote className="mt-3" />
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value, tag, strong }: { label: string; value: string; tag?: "actual" | "calc" | "target"; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b py-1.5 text-sm last:border-0">
      <span className="text-muted-foreground flex items-center gap-1.5">{tag && <SourceTag kind={tag} />}{label}</span>
      <span className={`num ${strong ? "font-bold" : ""}`}>{value}</span>
    </div>
  );
}
