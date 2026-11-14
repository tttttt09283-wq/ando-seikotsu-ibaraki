"use client";
// 3シナリオの36か月推移。指標を切り替えて1本の軸で比較する（2軸グラフは使わない）
import { useMemo, useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SimNote } from "@/components/common/parts";
import type { ProjectionRow } from "@/lib/domain/projection";
import { shortMonth } from "@/lib/format";
import type { ScenarioKind } from "@/lib/types";
import { cn } from "@/lib/utils";

const METRICS = [
  { key: "totalRevenue", label: "合計売上", unit: "yen" },
  { key: "profit", label: "事業利益", unit: "yen" },
  { key: "householdIncome", label: "可処分所得", unit: "yen" },
  { key: "balance", label: "生活防衛資金", unit: "yen" },
  { key: "aiContracts", label: "AI契約数", unit: "社" },
  { key: "clinicActive", label: "継続患者数", unit: "人" },
  { key: "businessHoursWeekly", label: "事業の労働時間（週）", unit: "時間" },
] as const;

const COLOR: Record<ScenarioKind, string> = { conservative: "var(--scn-conservative)", standard: "var(--scn-standard)", challenge: "var(--scn-challenge)" };
const DASH: Record<ScenarioKind, string | undefined> = { conservative: "6 3", standard: undefined, challenge: "2 3" };

export function ScenarioCharts({ series, independenceMonth, target }: { series: { id: string; kind: ScenarioKind; name: string; rows: ProjectionRow[] }[]; independenceMonth: string; target: number }) {
  const [metric, setMetric] = useState<(typeof METRICS)[number]["key"]>("totalRevenue");
  const [table, setTable] = useState(false);
  const m = METRICS.find((x) => x.key === metric)!;
  const data = useMemo(() => {
    const len = Math.max(...series.map((s) => s.rows.length));
    return Array.from({ length: len }, (_, i) => {
      const row: Record<string, string | number> = { month: series[0].rows[i]?.month ?? "", label: series[0].rows[i] ? shortMonth(series[0].rows[i].month) : "" };
      for (const s of series) if (s.rows[i]) row[s.id] = s.rows[i][metric] as number;
      return row;
    });
  }, [series, metric]);
  const fmt = (v: number) => (m.unit === "yen" ? `${Math.round(v / 10000).toLocaleString("ja-JP")}万` : `${Math.round(v * 10) / 10}${m.unit}`);
  const fmtFull = (v: number) => (m.unit === "yen" ? `${Math.round(v).toLocaleString("ja-JP")}円` : `${Math.round(v * 10) / 10}${m.unit}`);
  const indepLabel = data.find((d) => d.month === independenceMonth)?.label;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">月次推移（{data.length}か月）</CardTitle>
        <CardDescription>指標を選んで3シナリオを比較。縦の点線が独立予定月です</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {METRICS.map((x) => (
            <button key={x.key} onClick={() => setMetric(x.key)} className={cn("rounded-full border px-3 py-1 text-xs", metric === x.key ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground")}>{x.label}</button>
          ))}
          <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setTable(!table)}>{table ? "グラフで見る" : "表で見る"}</Button>
        </div>
        {table ? (
          <div className="max-h-96 overflow-auto">
            <table className="num w-full text-sm">
              <thead className="bg-card text-muted-foreground sticky top-0 text-xs"><tr><th className="py-1 text-left">月</th>{series.map((s) => <th key={s.id} className="text-right">{s.name}</th>)}</tr></thead>
              <tbody>{data.map((d) => <tr key={String(d.month)} className="border-t"><td className="py-1">{d.label}</td>{series.map((s) => <td key={s.id} className="text-right">{d[s.id] == null ? "—" : fmtFull(Number(d[s.id]))}</td>)}</tr>)}</tbody>
            </table>
          </div>
        ) : (
          <div className="h-72" role="img" aria-label={`${m.label}の3シナリオ推移`}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 8, right: 12, left: -6, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} interval={5} />
                <YAxis tickFormatter={fmt} tickLine={false} axisLine={false} width={56} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--popover-foreground)", fontSize: 12 }}
                  labelFormatter={(l) => `${l}（試算）`}
                  formatter={(v, name) => [fmtFull(Number(v)), name]}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {indepLabel && <ReferenceLine x={indepLabel} stroke="var(--muted-foreground)" strokeDasharray="3 3" label={{ value: "独立", position: "insideTopLeft", fill: "var(--muted-foreground)", fontSize: 11 }} />}
                {metric === "totalRevenue" && target > 0 && <ReferenceLine y={target} stroke="var(--muted-foreground)" strokeDasharray="4 4" label={{ value: "目標月商", position: "insideBottomRight", fill: "var(--muted-foreground)", fontSize: 11 }} />}
                {series.map((s) => (
                  <Line key={s.id} type="monotone" dataKey={s.id} name={s.name} stroke={COLOR[s.kind]} strokeWidth={2} strokeDasharray={DASH[s.kind]} dot={false} activeDot={{ r: 5, stroke: "var(--card)", strokeWidth: 2 }} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
        <SimNote />
      </CardContent>
    </Card>
  );
}
