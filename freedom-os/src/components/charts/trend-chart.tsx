"use client";
// 月次推移：施術売上・AI売上（積み上げ棒）と事業利益（線）。同じ「円」の単一軸。
// 実績月は濃く、試算月は薄い斜線で区別し、ツールチップにも「実績／試算」を表示する。
import { useState } from "react";
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";

export interface TrendPoint {
  month: string; // "YYYY-MM-01"
  label: string;
  kind: "actual" | "sim";
  clinic: number | null; // 未入力の月は null（0円と区別してグラフに描かない）
  ai: number | null;
  profit: number | null;
}

const fmtMan = (v: number) => `${Math.round(v / 10000).toLocaleString("ja-JP")}万`;
const yen = (v: number | null) => (v == null ? "未入力" : `${Math.round(v).toLocaleString("ja-JP")}円`);

export function TrendChart({ data, target, height = 260 }: { data: TrendPoint[]; target?: number; height?: number }) {
  const [table, setTable] = useState(false);
  const hasSim = data.some((d) => d.kind === "sim");
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-muted-foreground flex flex-wrap items-center gap-3 text-xs">
          <span className="flex items-center gap-1"><i className="bg-foreground/80 inline-block size-2.5 rounded-sm" />実績</span>
          {hasSim && <span className="flex items-center gap-1"><i className="inline-block size-2.5 rounded-sm border border-dashed border-current opacity-70" />試算（仮定に基づく）</span>}
        </div>
        <Button size="sm" variant="ghost" onClick={() => setTable(!table)}>{table ? "グラフで見る" : "表で見る"}</Button>
      </div>
      {table ? (
        <div className="overflow-x-auto">
          <table className="num w-full text-sm">
            <thead className="text-muted-foreground text-xs">
              <tr><th className="py-1 text-left">月</th><th className="text-left">区分</th><th className="text-right">施術</th><th className="text-right">AI</th><th className="text-right">事業利益</th></tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.month} className="border-t">
                  <td className="py-1.5">{d.label}</td>
                  <td>{d.kind === "actual" ? (d.clinic == null ? "実績（未入力）" : "実績") : "試算"}</td>
                  <td className="text-right">{yen(d.clinic)}</td>
                  <td className="text-right">{yen(d.ai)}</td>
                  <td className="text-right">{yen(d.profit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ height }} role="img" aria-label="月次の売上と事業利益の推移">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }} barCategoryGap="22%">
              <defs>
                <pattern id="simHatchClinic" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
                  <rect width="6" height="6" fill="var(--series-clinic)" opacity="0.25" />
                  <line x1="0" y1="0" x2="0" y2="6" stroke="var(--series-clinic)" strokeWidth="2.5" />
                </pattern>
                <pattern id="simHatchAi" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
                  <rect width="6" height="6" fill="var(--series-ai)" opacity="0.25" />
                  <line x1="0" y1="0" x2="0" y2="6" stroke="var(--series-ai)" strokeWidth="2.5" />
                </pattern>
              </defs>
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} interval="preserveStartEnd" />
              <YAxis tickFormatter={fmtMan} tickLine={false} axisLine={false} width={52} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} />
              <Tooltip
                cursor={{ fill: "var(--muted)", opacity: 0.5 }}
                contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--popover-foreground)", fontSize: 12 }}
                labelFormatter={(l, p) => `${l}（${p?.[0]?.payload?.kind === "sim" ? "試算" : "実績"}）`}
                formatter={(v, name) => [yen(Number(v)), name]}
              />
              <Legend wrapperStyle={{ fontSize: 12, color: "var(--muted-foreground)" }} />
              {target ? <ReferenceLine y={target} stroke="var(--muted-foreground)" strokeDasharray="4 4" label={{ value: `目標 ${fmtMan(target)}`, position: "insideTopRight", fill: "var(--muted-foreground)", fontSize: 11 }} /> : null}
              <Bar dataKey="clinic" name="施術売上" stackId="rev" fill="var(--series-clinic)" stroke="var(--card)" strokeWidth={2}
                shape={(p: unknown) => <SimAwareBar {...(p as BarShapeProps)} hatch="url(#simHatchClinic)" />} />
              <Bar dataKey="ai" name="AI売上" stackId="rev" fill="var(--series-ai)" stroke="var(--card)" strokeWidth={2} radius={[4, 4, 0, 0]}
                shape={(p: unknown) => <SimAwareBar {...(p as BarShapeProps)} hatch="url(#simHatchAi)" top />} />
              <Line type="monotone" dataKey="profit" name="事業利益" stroke="var(--series-profit)" strokeWidth={2} connectNulls={false} dot={{ r: 3, strokeWidth: 2, stroke: "var(--card)", fill: "var(--series-profit)" }} activeDot={{ r: 5 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

interface BarShapeProps { x: number; y: number; width: number; height: number; fill: string; payload: TrendPoint; hatch: string; top?: boolean }
function SimAwareBar({ x, y, width, height, fill, payload, hatch, top }: BarShapeProps) {
  if (!height || height <= 0) return null;
  const sim = payload.kind === "sim";
  const r = top ? Math.min(4, width / 2, height) : 0;
  const d = r
    ? `M${x},${y + height} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + width - r},${y} Q${x + width},${y} ${x + width},${y + r} L${x + width},${y + height} Z`
    : `M${x},${y} h${width} v${height} h${-width} Z`;
  return <path d={d} fill={sim ? hatch : fill} stroke="var(--card)" strokeWidth={2} />;
}
