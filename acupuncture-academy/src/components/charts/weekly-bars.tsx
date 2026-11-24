"use client";

import * as React from "react";
import { formatJpDate } from "@/lib/dates";

/** 単系列の週次棒グラフ（ネイビー1色・ホバーで値表示・表で代替） */
export function WeeklyBars({
  title,
  data,
  max,
  format,
  emptyLabel = "記録なし",
}: {
  title: string;
  data: { start: string; value: number | null }[];
  max: number;
  format: (v: number) => string;
  emptyLabel?: string;
}) {
  const [hover, setHover] = React.useState<number | null>(null);
  const W = 320;
  const H = 150;
  const pad = { l: 8, r: 8, t: 22, b: 22 };
  const bw = (W - pad.l - pad.r) / data.length;
  const ih = H - pad.t - pad.b;
  const latest = data[data.length - 1];
  return (
    <figure className="rounded-xl border bg-white p-4">
      <figcaption className="mb-1 flex items-baseline justify-between gap-2">
        <span className="text-sm font-bold text-primary">{title}</span>
        <span className="text-xs text-muted-foreground">今週 {latest.value === null ? emptyLabel : format(latest.value)}</span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`${title}の週ごとの推移`} onMouseLeave={() => setHover(null)}>
        <line x1={pad.l} x2={W - pad.r} y1={pad.t + ih} y2={pad.t + ih} stroke="#cbd5e1" />
        <line x1={pad.l} x2={W - pad.r} y1={pad.t} y2={pad.t} stroke="#eef2f7" />
        {data.map((d, i) => {
          const x = pad.l + i * bw;
          const h = d.value ? Math.max(2, (d.value / max) * ih) : 0;
          const y = pad.t + ih - h;
          const w = Math.min(22, bw - 6);
          const cx = x + bw / 2;
          const isLatest = i === data.length - 1;
          return (
            <g key={d.start} onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} tabIndex={0} aria-label={`${formatJpDate(d.start)}週：${d.value === null ? emptyLabel : format(d.value)}`}>
              <rect x={x} y={pad.t} width={bw} height={ih} fill={hover === i ? "#f1f5f9" : "transparent"} />
              {h > 0 && (
                <path
                  d={`M${cx - w / 2},${pad.t + ih} V${y + Math.min(4, h)} Q${cx - w / 2},${y} ${cx - w / 2 + Math.min(4, h)},${y} H${cx + w / 2 - Math.min(4, h)} Q${cx + w / 2},${y} ${cx + w / 2},${y + Math.min(4, h)} V${pad.t + ih} Z`}
                  fill={isLatest ? "#1e3a6b" : "#7d93bd"}
                />
              )}
              {(isLatest || hover === i) && d.value !== null && (
                <text x={cx} y={y - 5} textAnchor="middle" className="fill-slate-700 text-[10px] font-semibold">
                  {format(d.value)}
                </text>
              )}
              <text x={cx} y={H - 6} textAnchor="middle" className="fill-slate-500 text-[9px]">
                {formatJpDate(d.start)}
              </text>
            </g>
          );
        })}
      </svg>
      <table className="sr-only">
        <caption>{title}</caption>
        <thead>
          <tr>
            <th>週の開始日</th>
            <th>値</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.start}>
              <td>{d.start}</td>
              <td>{d.value === null ? emptyLabel : format(d.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
