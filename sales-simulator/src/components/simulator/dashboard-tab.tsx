"use client";

import { useMemo } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  calculate,
  formatInt,
  formatOneDecimal,
  formatPercent,
  SCENARIOS,
  type ScenarioId,
  type SimInput,
  type SimResult,
} from "@/lib/sim";
import { cn } from "@/lib/utils";

const COLORS = {
  judo: "#2563eb",
  acu: "#16a34a",
  self: "#ea580c",
  ems: "#f59e0b",
  fixed: "#94a3b8",
};

interface Props {
  input: SimInput;
  result: SimResult;
  drafts: Record<ScenarioId, SimInput>;
  dirty: Record<ScenarioId, boolean>;
  active: ScenarioId;
}

export function DashboardTab({ input, result, drafts, dirty, active }: Props) {
  const composition = useMemo(() => {
    const rows = [
      { key: "judo", name: "柔整保険", value: result.judo.total, color: COLORS.judo },
      { key: "acu", name: "鍼灸保険", value: result.acu.total, color: COLORS.acu },
      { key: "self", name: "自費施術", value: result.self.treatmentSales, color: COLORS.self },
      { key: "ems", name: "EMS", value: result.self.emsSales, color: COLORS.ems },
      { key: "fixed", name: "物販・その他", value: result.fixedSales, color: COLORS.fixed },
    ];
    return rows.map((r) => ({
      ...r,
      share: result.totalSales > 0 ? (r.value / result.totalSales) * 100 : 0,
    }));
  }, [result]);

  return (
    <div className="space-y-4">
      {/* 主要売上 */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Tile label="総売上" value={result.totalSales} className="col-span-2 bg-navy-800 text-white lg:col-span-1" dark />
        <Tile label="柔整保険売上" value={result.judo.total} color={COLORS.judo} />
        <Tile label="鍼灸保険売上" value={result.acu.total} color={COLORS.acu} />
        <Tile label="自費施術売上" value={result.self.treatmentSales} color={COLORS.self} />
        <Tile label="EMS売上" value={result.self.emsSales} color={COLORS.ems} />
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        {/* 構成比 */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <div>
              <CardTitle>売上構成比</CardTitle>
              <CardDescription>総売上に占める各項目の割合</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {result.totalSales > 0 ? (
              <div className="flex flex-col items-center gap-4 sm:flex-row">
                <div className="relative h-52 w-52 shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={composition.filter((c) => c.value > 0)}
                        dataKey="value"
                        nameKey="name"
                        innerRadius="62%"
                        outerRadius="100%"
                        stroke="#fff"
                        strokeWidth={2}
                        startAngle={90}
                        endAngle={-270}
                        isAnimationActive={false}
                      >
                        {composition
                          .filter((c) => c.value > 0)
                          .map((c) => (
                            <Cell key={c.key} fill={c.color} />
                          ))}
                      </Pie>
                      <Tooltip
                        formatter={(v) => [`${formatInt(Number(v))}円`, ""]}
                        separator=""
                        contentStyle={{ borderRadius: 10, borderColor: "#e2e8f0", fontSize: 13 }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
                    <div>
                      <p className="text-xs text-slate-500">保険売上比率</p>
                      <p className="num text-xl font-extrabold text-slate-900">
                        {formatPercent((result.insuranceTotal / result.totalSales) * 100)}
                      </p>
                    </div>
                  </div>
                </div>
                <table className="w-full text-sm">
                  <caption className="sr-only">売上構成比の内訳</caption>
                  <tbody>
                    {composition.map((c) => (
                      <tr key={c.key} className="border-b border-slate-100 last:border-0">
                        <td className="py-2">
                          <span className="flex items-center gap-2 text-slate-700">
                            <span className="size-3 shrink-0 rounded-sm" style={{ background: c.color }} />
                            {c.name}
                          </span>
                        </td>
                        <td className="num py-2 text-right font-semibold text-slate-900">{formatInt(c.value)}円</td>
                        <td className="num w-16 py-2 text-right text-slate-500">{formatPercent(c.share)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="py-10 text-center text-sm text-slate-500">売上がまだありません</p>
            )}
          </CardContent>
        </Card>

        {/* 達成率ゲージ */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>目標達成率</CardTitle>
              <CardDescription>目標 {formatInt(input.basic.targetSales)}円</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <Gauge rate={result.achievementRate} />
            <p className="num mt-2 text-center text-sm text-slate-600">
              {result.achievementRate === null
                ? "目標売上を入力してください"
                : result.shortfall > 0
                  ? `あと ${formatInt(result.shortfall)}円`
                  : `目標を ${formatInt(result.surplus)}円 上回っています`}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* 生産性指標 */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="稼働カルテ数" value={formatInt(input.basic.karteCount)} unit="枚" />
        <Stat label="延べ来院数" value={formatInt(result.totalVisits)} unit="回" sub={`1日平均 ${formatOneDecimal(result.visitsPerDay)}回`} />
        <Stat label="カルテ1枚あたり月間売上" value={formatInt(result.salesPerKarte)} unit="円" />
        <Stat label="来院1回あたり売上" value={formatInt(result.salesPerVisit)} unit="円" />
        <Stat label="スタッフ1人あたり月間売上" value={formatInt(result.salesPerStaff)} unit="円" className="col-span-2 lg:col-span-1" />
      </div>

      <ScenarioCompare drafts={drafts} dirty={dirty} active={active} />
    </div>
  );
}

function Tile({
  label,
  value,
  color,
  className,
  dark,
}: {
  label: string;
  value: number;
  color?: string;
  className?: string;
  dark?: boolean;
}) {
  return (
    <div className={cn("rounded-2xl border border-slate-200 bg-white p-4 shadow-sm", className)}>
      <p className={cn("flex items-center gap-1.5 text-xs font-semibold", dark ? "text-navy-100" : "text-slate-500")}>
        {color && <span className="size-2.5 rounded-full" style={{ background: color }} />}
        {label}
      </p>
      <p className="num mt-1 text-xl font-extrabold sm:text-2xl">
        {formatInt(value)}
        <span className={cn("ml-0.5 text-xs font-bold", dark ? "text-navy-100" : "text-slate-500")}>円</span>
      </p>
    </div>
  );
}

function Stat({
  label,
  value,
  unit,
  sub,
  className,
}: {
  label: string;
  value: string;
  unit: string;
  sub?: string;
  className?: string;
}) {
  return (
    <div className={cn("rounded-2xl border border-slate-200 bg-white p-4 shadow-sm", className)}>
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className="num mt-1 text-xl font-extrabold text-slate-900">
        {value}
        {value !== "—" && <span className="ml-0.5 text-xs font-bold text-slate-500">{unit}</span>}
      </p>
      {sub && <p className="num text-xs text-slate-400">{sub}</p>}
    </div>
  );
}

/** 半円ゲージ（100%で満タン。超過時は数値で表示） */
function Gauge({ rate }: { rate: number | null }) {
  const value = rate ?? 0;
  const ratio = Math.min(1, Math.max(0, value / 100));
  const r = 80;
  const c = Math.PI * r;
  const achieved = value >= 100;
  return (
    <div className="relative mx-auto w-full max-w-[260px]">
      <svg viewBox="0 0 200 112" className="w-full" role="img" aria-label={`目標達成率 ${formatPercent(rate)}`}>
        <path d="M20 100 A80 80 0 0 1 180 100" fill="none" stroke="#e2e8f0" strokeWidth="16" strokeLinecap="round" />
        <path
          d="M20 100 A80 80 0 0 1 180 100"
          fill="none"
          stroke={achieved ? COLORS.acu : "#1f3a66"}
          strokeWidth="16"
          strokeLinecap="round"
          strokeDasharray={`${c * ratio} ${c}`}
          style={{ transition: "stroke-dasharray 200ms ease-out" }}
        />
      </svg>
      <div className="absolute inset-x-0 bottom-0 text-center">
        <p className="num text-4xl font-extrabold text-slate-900">
          {rate === null ? "—" : formatOneDecimal(rate)}
          {rate !== null && <span className="ml-0.5 text-lg font-bold text-slate-500">%</span>}
        </p>
      </div>
    </div>
  );
}

function ScenarioCompare({
  drafts,
  dirty,
  active,
}: {
  drafts: Record<ScenarioId, SimInput>;
  dirty: Record<ScenarioId, boolean>;
  active: ScenarioId;
}) {
  const results = useMemo(
    () => Object.fromEntries(SCENARIOS.map(({ id }) => [id, calculate(drafts[id])])) as Record<ScenarioId, SimResult>,
    [drafts],
  );
  const maxTotal = Math.max(1, ...SCENARIOS.map(({ id }) => results[id].totalSales));

  const rows: { label: string; get: (i: SimInput, r: SimResult) => string }[] = [
    { label: "目標売上", get: (i) => `${formatInt(i.basic.targetSales)}円` },
    { label: "目標達成率", get: (_, r) => formatPercent(r.achievementRate) },
    { label: "稼働カルテ数", get: (i) => `${formatInt(i.basic.karteCount)}枚` },
    { label: "平均来院回数", get: (i) => `${formatOneDecimal(i.basic.visitsPerKarte)}回` },
    { label: "延べ来院数", get: (_, r) => `${formatInt(r.totalVisits)}回` },
    { label: "柔整保険売上", get: (_, r) => `${formatInt(r.judo.total)}円` },
    { label: "鍼灸保険売上", get: (_, r) => `${formatInt(r.acu.total)}円` },
    { label: "自費売上（EMS・物販含む）", get: (_, r) => `${formatInt(r.self.total)}円` },
    { label: "来院1回あたり売上", get: (_, r) => `${formatInt(r.salesPerVisit)}円` },
  ];

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>3パターン比較</CardTitle>
          <CardDescription>現在値・改善案・挑戦目標（画面上部で切り替えて編集・保存）</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2.5">
          {SCENARIOS.map(({ id, label }) => (
            <div key={id} className="grid grid-cols-[4.5rem_1fr] items-center gap-2 sm:grid-cols-[6rem_1fr]">
              <span className={cn("text-sm font-semibold", id === active ? "text-navy-800" : "text-slate-600")}>{label}</span>
              <div className="flex items-center gap-2">
                <div className="h-6 flex-1 overflow-hidden rounded-md bg-slate-100">
                  <div
                    className={cn("h-full rounded-md transition-all", id === active ? "bg-navy-700" : "bg-navy-500/50")}
                    style={{ width: `${(results[id].totalSales / maxTotal) * 100}%` }}
                  />
                </div>
                <span className="num w-28 text-right text-sm font-bold text-slate-900">
                  {formatInt(results[id].totalSales)}円
                </span>
              </div>
            </div>
          ))}
        </div>

        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <table className="w-full min-w-[480px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs text-slate-500">
                <th className="py-2 text-left font-semibold">項目</th>
                {SCENARIOS.map(({ id, label }) => (
                  <th key={id} className={cn("py-2 text-right font-semibold", id === active && "text-navy-800")}>
                    {label}
                    {dirty[id] && <span className="ml-1 text-amber-600">●</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-slate-100">
                <td className="py-2 font-bold text-slate-800">総売上</td>
                {SCENARIOS.map(({ id }) => (
                  <td key={id} className="num py-2 text-right font-extrabold text-slate-900">
                    {formatInt(results[id].totalSales)}円
                  </td>
                ))}
              </tr>
              {rows.map((row) => (
                <tr key={row.label} className="border-b border-slate-100 last:border-0">
                  <td className="py-2 text-slate-600">{row.label}</td>
                  {SCENARIOS.map(({ id }) => (
                    <td key={id} className="num py-2 text-right text-slate-800">
                      {row.get(drafts[id], results[id])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-slate-500">
          <span className="text-amber-600">●</span> は保存していない変更があるパターンです。
        </p>
      </CardContent>
    </Card>
  );
}
