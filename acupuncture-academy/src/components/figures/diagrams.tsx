"use client";

import * as React from "react";
import { flowOrder, meridianMap, extraVesselMap } from "@/data/meridians";
import { pointMap } from "@/data/points";
import type { ConfluentPair } from "@/data/eight-confluent";

// ------------------------------------------------------------
// 経絡系統図
// ------------------------------------------------------------
type Node = { label: string; sub?: string };
const systemTree: { label: string; color: string; children: Node[] }[] = [
  {
    label: "経脈",
    color: "#1e3a6b",
    children: [
      { label: "十二経脈", sub: "正経" },
      { label: "奇経八脈" },
      { label: "十二経別" },
    ],
  },
  {
    label: "絡脈",
    color: "#0f766e",
    children: [{ label: "十五絡脈" }, { label: "孫絡" }, { label: "浮絡" }],
  },
  {
    label: "連属部分",
    color: "#64748b",
    children: [{ label: "十二経筋" }, { label: "十二皮部" }, { label: "臓腑", sub: "内に属す" }],
  },
];

function Box({ x, y, w, h, label, sub, color, solid }: { x: number; y: number; w: number; h: number; label: string; sub?: string; color: string; solid?: boolean }) {
  return (
    <g>
      <rect x={x - w / 2} y={y - h / 2} width={w} height={h} rx={6} fill={solid ? color : "white"} stroke={color} strokeWidth={1.5} />
      <text x={x} y={sub ? y - 1 : y + 4} textAnchor="middle" className="text-[11px] font-semibold" fill={solid ? "white" : color}>
        {label}
      </text>
      {sub && (
        <text x={x} y={y + 10} textAnchor="middle" className="text-[8px]" fill={solid ? "white" : "#64748b"}>
          {sub}
        </text>
      )}
    </g>
  );
}

export function MeridianSystemFigure() {
  const cols = [62, 180, 298];
  return (
    <svg viewBox="0 0 360 250" role="img" aria-label="経絡系統図" className="mx-auto w-full max-w-xl">
      <Box x={180} y={24} w={110} h={30} label="経絡" sub="気血の通り道（伝統理論）" color="#1e3a6b" solid />
      {systemTree.map((branch, i) => {
        const x = cols[i];
        return (
          <g key={branch.label}>
            <path d={`M180,39 V58 H${x} V72`} fill="none" stroke="#94a3b8" strokeWidth={1.2} />
            <Box x={x} y={86} w={92} h={28} label={branch.label} color={branch.color} solid />
            {branch.children.map((c, j) => {
              const y = 140 + j * 38;
              return (
                <g key={c.label}>
                  <path d={`M${x - 40},100 V${y} H${x - 34}`} fill="none" stroke="#cbd5e1" strokeWidth={1.2} />
                  <Box x={x + 6} y={y} w={80} h={c.sub ? 30 : 26} label={c.label} sub={c.sub} color={branch.color} />
                </g>
              );
            })}
          </g>
        );
      })}
    </svg>
  );
}

// ------------------------------------------------------------
// 手足・陰陽の走行方向
// ------------------------------------------------------------
export function LimbDirectionFigure() {
  const yin = "#2563eb";
  const yang = "#ea580c";
  const rows = [
    { name: "手の三陰経", route: "胸 → 手", color: yin, meridians: "肺・心包・心" },
    { name: "手の三陽経", route: "手 → 頭", color: yang, meridians: "大腸・三焦・小腸" },
    { name: "足の三陽経", route: "頭 → 足", color: yang, meridians: "胃・胆・膀胱" },
    { name: "足の三陰経", route: "足 → 胸腹", color: yin, meridians: "脾・肝・腎" },
  ];
  return (
    <svg viewBox="0 0 360 300" role="img" aria-label="手足・陰陽の経脈の走行方向" className="mx-auto w-full max-w-xl">
      <defs>
        <marker id="arrow-yin" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill={yin} />
        </marker>
        <marker id="arrow-yang" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill={yang} />
        </marker>
      </defs>
      {/* 両腕を挙げた模式図 */}
      <g className="fill-slate-50 stroke-slate-300" strokeWidth={2}>
        <circle cx={90} cy={66} r={15} />
        <path d="M72,90 L108,90 L104,170 L76,170 Z" />
        <path d="M74,92 L56,22 L66,20 L82,96 Z" />
        <path d="M106,92 L124,22 L114,20 L98,96 Z" />
        <path d="M76,168 L72,282 L84,282 L90,172 Z" />
        <path d="M104,168 L108,282 L96,282 L90,172 Z" />
      </g>
      {/* 陰経：足 → 胸腹 → 胸 → 手（上へ） */}
      <path d="M80,276 L84,180 L84,120" fill="none" stroke={yin} strokeWidth={3} markerEnd="url(#arrow-yin)" />
      <path d="M80,112 L64,32" fill="none" stroke={yin} strokeWidth={3} markerEnd="url(#arrow-yin)" />
      {/* 陽経：手 → 頭 → 足（下へ） */}
      <path d="M118,30 L104,88 L98,74" fill="none" stroke={yang} strokeWidth={3} markerEnd="url(#arrow-yang)" />
      <path d="M100,96 L100,178 L102,276" fill="none" stroke={yang} strokeWidth={3} markerEnd="url(#arrow-yang)" />
      <text x={36} y={150} className="text-[10px] font-semibold" fill={yin}>
        陰経は上へ
      </text>
      <text x={112} y={220} className="text-[10px] font-semibold" fill={yang}>
        陽経は下へ
      </text>
      <text x={90} y={298} textAnchor="middle" className="fill-slate-400 text-[8px]">
        両腕を挙げた姿勢で考えると覚えやすい
      </text>

      {rows.map((r, i) => {
        const y = 40 + i * 62;
        return (
          <g key={r.name}>
            <rect x={170} y={y - 20} width={180} height={50} rx={8} fill="white" stroke={r.color} strokeOpacity={0.5} />
            <rect x={170} y={y - 20} width={5} height={50} rx={2} fill={r.color} />
            <text x={184} y={y - 2} className="text-[11px] font-semibold" fill="#0f1b2d">
              {r.name}
            </text>
            <text x={340} y={y - 2} textAnchor="end" className="text-[12px] font-bold" fill={r.color}>
              {r.route}
            </text>
            <text x={184} y={y + 16} className="fill-slate-500 text-[9px]">
              {r.meridians}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ------------------------------------------------------------
// 十二経脈の流注（循環図）
// ------------------------------------------------------------
export function FlowCycleFigure({ highlight }: { highlight?: string | null }) {
  const cx = 170;
  const cy = 170;
  const R = 122;
  const nodes = flowOrder.map((id, i) => {
    const a = (-90 + (360 / 12) * i) * (Math.PI / 180);
    return { id, x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) };
  });
  return (
    <svg viewBox="0 0 340 340" role="img" aria-label="十二経脈の流注の循環図" className="mx-auto w-full max-w-md">
      <defs>
        <marker id="flow-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M0,0 L10,5 L0,10 z" fill="#94a3b8" />
        </marker>
      </defs>
      <circle cx={cx} cy={cy} r={R} fill="none" stroke="#e2e8f0" strokeWidth={14} />
      {nodes.map((n, i) => {
        const next = nodes[(i + 1) % nodes.length];
        const dx = next.x - n.x;
        const dy = next.y - n.y;
        const len = Math.hypot(dx, dy);
        const ux = dx / len;
        const uy = dy / len;
        return (
          <line
            key={`l-${n.id}`}
            x1={n.x + ux * 22}
            y1={n.y + uy * 22}
            x2={next.x - ux * 24}
            y2={next.y - uy * 24}
            stroke="#94a3b8"
            strokeWidth={1.6}
            markerEnd="url(#flow-arrow)"
          />
        );
      })}
      {nodes.map((n) => {
        const m = meridianMap[n.id];
        const isYin = m.yinYang === "陰";
        const hl = highlight === n.id;
        return (
          <g key={n.id}>
            <circle cx={n.x} cy={n.y} r={hl ? 23 : 20} fill={isYin ? m.color : "white"} stroke={m.color} strokeWidth={hl ? 3 : 2} />
            <text x={n.x} y={n.y + 1} textAnchor="middle" className="text-[11px] font-bold" fill={isYin ? "white" : m.color}>
              {m.organ}
            </text>
            <text x={n.x} y={n.y + 12} textAnchor="middle" className="text-[7px]" fill={isYin ? "white" : m.color}>
              {m.limb}・{m.channel}
            </text>
          </g>
        );
      })}
      <text x={cx} y={cy - 14} textAnchor="middle" className="fill-primary text-[13px] font-bold">
        十二経脈の流注
      </text>
      <text x={cx} y={cy + 4} textAnchor="middle" className="fill-slate-500 text-[9px]">
        肺経から始まり肝経から肺経へ戻る
      </text>
      <g transform={`translate(${cx - 52},${cy + 18})`}>
        <circle cx={6} cy={6} r={5} fill="#1e3a6b" />
        <text x={14} y={9} className="fill-slate-600 text-[8px]">
          陰経（塗り）
        </text>
        <circle cx={62} cy={6} r={5} fill="white" stroke="#1e3a6b" strokeWidth={1.5} />
        <text x={70} y={9} className="fill-slate-600 text-[8px]">
          陽経（白抜き）
        </text>
      </g>
    </svg>
  );
}

// ------------------------------------------------------------
// 八脈交会穴：2穴と2奇経のつながり
// ------------------------------------------------------------
export function ConfluentPairFigure({ pair }: { pair: ConfluentPair }) {
  const up = pointMap[pair.upper.code];
  const lo = pointMap[pair.lower.code];
  const upV = extraVesselMap[pair.upper.vessel];
  const loV = extraVesselMap[pair.lower.vessel];
  const pointBox = (x: number, y: number, code: string, name: string, meridianId: keyof typeof meridianMap, limb: string) => {
    const m = meridianMap[meridianId];
    return (
      <g>
        <rect x={x} y={y} width={112} height={50} rx={8} fill="white" stroke={m.color} strokeWidth={2} />
        <text x={x + 10} y={y + 20} className="text-[13px] font-bold" fill="#0f1b2d">
          {name}
        </text>
        <text x={x + 102} y={y + 20} textAnchor="end" className="text-[10px] font-semibold" fill={m.color}>
          {code}
        </text>
        <text x={x + 10} y={y + 38} className="fill-slate-500 text-[9px]">
          {limb}・{m.short}
        </text>
      </g>
    );
  };
  const vesselBox = (x: number, y: number, name: string, color: string) => (
    <g>
      <rect x={x} y={y} width={92} height={36} rx={18} fill={color} />
      <text x={x + 46} y={y + 22} textAnchor="middle" className="text-[12px] font-bold" fill="white">
        {name}
      </text>
    </g>
  );
  return (
    <svg viewBox="0 0 340 250" role="img" aria-label={`${up.name}と${lo.name}の八脈交会のつながり`} className="mx-auto w-full max-w-lg">
      {/* 穴 → 奇経 */}
      <line x1={124} y1={35} x2={236} y2={35} stroke={upV.color} strokeWidth={2} strokeDasharray="5 3" />
      <line x1={124} y1={215} x2={236} y2={215} stroke={loV.color} strokeWidth={2} strokeDasharray="5 3" />
      <text x={180} y={29} textAnchor="middle" className="fill-slate-500 text-[9px]">
        通じる
      </text>
      <text x={180} y={209} textAnchor="middle" className="fill-slate-500 text-[9px]">
        通じる
      </text>
      {/* 奇経 → 会合部位 */}
      <path d="M282,53 C282,90 250,110 222,118" fill="none" stroke={upV.color} strokeWidth={2.5} />
      <path d="M282,197 C282,160 250,140 222,132" fill="none" stroke={loV.color} strokeWidth={2.5} />
      {/* 上下の組 */}
      <line x1={68} y1={62} x2={68} y2={188} stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="2 4" />
      <text x={74} y={128} className="fill-slate-500 text-[9px]">
        上下で組む
      </text>
      {/* 会合部位 */}
      <rect x={112} y={100} width={112} height={50} rx={10} fill="#f5f3ff" stroke={pair.color} strokeWidth={1.5} />
      <text x={168} y={118} textAnchor="middle" className="text-[9px] font-semibold" fill={pair.color}>
        会合する部位
      </text>
      <text x={168} y={136} textAnchor="middle" className="text-[10px] font-bold" fill="#0f1b2d">
        {pair.regions.slice(0, 3).join("・")}
      </text>
      {pair.regions.length > 3 && (
        <text x={168} y={147} textAnchor="middle" className="fill-slate-600 text-[8px]">
          {pair.regions.slice(3).join("・")}
        </text>
      )}
      {pointBox(12, 10, up.code, up.name, up.meridian, pair.upper.limb)}
      {pointBox(12, 190, lo.code, lo.name, lo.meridian, pair.lower.limb)}
      {vesselBox(236, 17, upV.name, upV.color)}
      {vesselBox(236, 197, loV.name, loV.color)}
    </svg>
  );
}
