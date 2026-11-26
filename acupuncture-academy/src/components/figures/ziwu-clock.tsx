"use client";

import * as React from "react";
import Link from "next/link";
import { meridianMap } from "@/data/meridians";
import { pointMap } from "@/data/points";
import { najiPoints, slotIndexOfHour, ziwuSlots } from "@/data/ziwu";

const pad = (n: number) => String(n).padStart(2, "0");
const range = (s: { start: number; end: number }) => `${pad(s.start)}〜${pad(s.end)}時`;

/** 子午流注の時計（納支法）。スライスを押すと、その刻の経と補瀉の穴を表示する */
export function ZiwuClock() {
  const [now, setNow] = React.useState<number | null>(null);
  const [picked, setPicked] = React.useState<number | null>(null);

  React.useEffect(() => {
    const tick = () => setNow(slotIndexOfHour(new Date().getHours()));
    const id = window.setInterval(tick, 60_000);
    const first = window.setTimeout(tick, 0);
    return () => {
      window.clearInterval(id);
      window.clearTimeout(first);
    };
  }, []);

  const active = picked ?? now ?? 2;
  const slot = ziwuSlots[active];
  const m = meridianMap[slot.meridian];
  const nj = najiPoints(slot.meridian);
  const cx = 160;
  const cy = 160;
  const R = 140;
  const r0 = 62;

  const arc = (i: number) => {
    const a0 = ((-90 - 15 + i * 30) * Math.PI) / 180;
    const a1 = ((-90 + 15 + i * 30) * Math.PI) / 180;
    const p = (rad: number, a: number) => `${cx + rad * Math.cos(a)},${cy + rad * Math.sin(a)}`;
    return `M${p(r0, a0)} L${p(R, a0)} A${R},${R} 0 0,1 ${p(R, a1)} L${p(r0, a1)} A${r0},${r0} 0 0,0 ${p(r0, a0)} Z`;
  };

  return (
    <div className="grid gap-4 md:grid-cols-[minmax(0,320px)_1fr] md:items-center">
      <svg viewBox="0 0 320 320" role="img" aria-label="子午流注の時計（十二支と十二経脈）" className="mx-auto w-full max-w-[320px]">
        {ziwuSlots.map((s, i) => {
          const mm = meridianMap[s.meridian];
          const a = ((-90 + i * 30) * Math.PI) / 180;
          const isActive = i === active;
          const isNow = i === now;
          return (
            <g
              key={s.branch}
              role="button"
              tabIndex={0}
              aria-label={`${s.branch}の刻 ${range(s)} ${mm.name}`}
              onClick={() => setPicked(i)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setPicked(i);
                }
              }}
              className="cursor-pointer"
            >
              <path d={arc(i)} fill={mm.color} opacity={isActive ? 1 : 0.28} stroke="white" strokeWidth={2} />
              <text x={cx + 118 * Math.cos(a)} y={cy + 118 * Math.sin(a) + 4} textAnchor="middle" className="text-[13px] font-bold" fill={isActive ? "white" : "#0f1b2d"}>
                {s.branch}
              </text>
              <text x={cx + 90 * Math.cos(a)} y={cy + 90 * Math.sin(a) + 4} textAnchor="middle" className="text-[11px] font-bold" fill={isActive ? "white" : "#0f1b2d"}>
                {mm.organ}
              </text>
              {isNow && (
                <circle cx={cx + 150 * Math.cos(a)} cy={cy + 150 * Math.sin(a)} r={5} fill="#b42318">
                  <title>いまの時刻</title>
                </circle>
              )}
            </g>
          );
        })}
        <circle cx={cx} cy={cy} r={r0 - 4} fill="white" stroke="#e2e8f0" />
        <text x={cx} y={cy - 10} textAnchor="middle" className="text-[11px]" fill="#64748b">
          {slot.branch}の刻
        </text>
        <text x={cx} y={cy + 8} textAnchor="middle" className="text-[13px] font-bold" fill="#0f1b2d">
          {range(slot)}
        </text>
        <text x={cx} y={cy + 26} textAnchor="middle" className="text-[11px] font-bold" fill={m.color}>
          {m.short}
        </text>
        <text x={cx} y={14} textAnchor="middle" className="text-[9px]" fill="#64748b">
          子（23〜1時）
        </text>
        <text x={cx} y={316} textAnchor="middle" className="text-[9px]" fill="#64748b">
          午（11〜13時）
        </text>
      </svg>

      <div className="space-y-3" aria-live="polite">
        <div className="rounded-xl border p-3" style={{ borderTop: `4px solid ${m.color}` }}>
          <p className="text-xs text-muted-foreground">
            {slot.branch}（{slot.reading}）の刻・{range(slot)}
            {now === active && picked === null && <span className="ml-2 rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold text-warn">いまの時刻</span>}
          </p>
          <p className="text-lg font-bold" style={{ color: m.color }}>
            {m.name}が旺盛になる刻
          </p>
          <p className="text-xs text-muted-foreground">
            前の刻：{meridianMap[ziwuSlots[(active + 11) % 12].meridian].short} → 次の刻：{meridianMap[ziwuSlots[(active + 1) % 12].meridian].short}（流注の順）
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="rounded-xl border p-3">
            <p className="text-xs font-semibold text-warn">実証のとき（瀉法）</p>
            <p className="mt-1 text-sm">
              この刻（{range(nj.drain.slot)}）に、子の五行（{nj.drain.element}）の穴
              <Link href={`/points/${nj.drain.code}`} className="mx-1 font-bold text-primary underline">
                {pointMap[nj.drain.code]?.name}
              </Link>
              を瀉す
            </p>
          </div>
          <div className="rounded-xl border p-3">
            <p className="text-xs font-semibold text-ok">虚証のとき（補法）</p>
            <p className="mt-1 text-sm">
              次の刻（{range(nj.tonify.slot)}）に、母の五行（{nj.tonify.element}）の穴
              <Link href={`/points/${nj.tonify.code}`} className="mx-1 font-bold text-primary underline">
                {pointMap[nj.tonify.code]?.name}
              </Link>
              を補う
            </p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {m.short}は五行の「{nj.element}」。時刻は本来その土地の太陽の動き（真太陽時）で考えるため、時計の時刻とずれることがある。伝統理論の考え方の例で、効果の根拠は確立していない（要確認）。
        </p>
      </div>
    </div>
  );
}
