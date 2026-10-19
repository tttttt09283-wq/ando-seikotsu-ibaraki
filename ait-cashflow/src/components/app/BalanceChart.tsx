"use client";

import * as React from "react";
import { Bar, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatJpDate } from "@/lib/cash/dates";
import { man, yen } from "@/lib/cash/money";
import { cn } from "@/lib/utils";

type Point = { date: string; standard: number; conservative: number | null; inflow: number; outflow: number };

/** 日別の予測残高（標準＝実線、保守＝点線）と入出金。予測値であることを凡例で明示する */
export function BalanceChart({ data, minBalance }: { data: Point[]; minBalance: number }) {
  const [days, setDays] = React.useState(90);
  const shown = data.slice(0, days + 1);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ul className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs" aria-label="凡例">
          <li className="flex items-center gap-1.5">
            <span className="bg-brand inline-block h-0.5 w-5" />
            予測残高（標準）
          </li>
          <li className="flex items-center gap-1.5">
            <span className="border-bad inline-block w-5 border-t-2 border-dashed" />
            予測残高（保守）
          </li>
          <li className="flex items-center gap-1.5">
            <span className="border-warn inline-block w-5 border-t-2 border-dotted" />
            最低必要残高
          </li>
          <li className="flex items-center gap-1.5">
            <span className="bg-good/60 inline-block size-2.5 rounded-sm" />
            入金予定／
            <span className="bg-bad/50 inline-block size-2.5 rounded-sm" />
            支払予定
          </li>
        </ul>
        <div className="flex gap-1" role="group" aria-label="表示期間">
          {[30, 90, 180].map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={days === d}
              onClick={() => setDays(d)}
              className={cn("rounded-full px-3 py-1 text-xs", days === d ? "bg-primary text-primary-foreground" : "bg-secondary hover:bg-accent")}
            >
              {d}日
            </button>
          ))}
        </div>
      </div>
      <div className="h-64 sm:h-80" role="img" aria-label={`今日から${days}日間の日別の予測残高のグラフ`}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={shown} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis dataKey="date" tickFormatter={(d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8))}`} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} minTickGap={24} />
            <YAxis tickFormatter={(v: number) => man(v)} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} width={64} />
            <Tooltip
              formatter={(v, name) => [yen(Math.abs(Number(v))), ({ standard: "予測残高（標準）", conservative: "予測残高（保守）", inflow: "入金予定", outflow: "支払予定" } as Record<string, string>)[String(name)] ?? String(name)]}
              labelFormatter={(d) => formatJpDate(String(d))}
              contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
            />
            <ReferenceLine y={0} stroke="var(--bad)" strokeWidth={1} />
            {minBalance > 0 && <ReferenceLine y={minBalance} stroke="var(--warn)" strokeDasharray="2 3" strokeWidth={2} />}
            <Bar dataKey="inflow" fill="var(--good)" fillOpacity={0.6} barSize={4} />
            <Bar dataKey="outflow" fill="var(--bad)" fillOpacity={0.5} barSize={4} />
            <Line type="stepAfter" dataKey="standard" stroke="var(--brand)" strokeWidth={2.5} dot={false} />
            <Line type="stepAfter" dataKey="conservative" stroke="var(--bad)" strokeWidth={1.5} strokeDasharray="5 4" dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
