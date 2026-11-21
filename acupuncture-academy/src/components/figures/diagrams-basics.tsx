"use client";

/**
 * 第1〜3章の図解（すべて編集可能なインライン SVG）。
 * 文字は図の中に詰め込みすぎず、詳しい説明は講義本文・キャプションに置く。
 */
import * as React from "react";
import { meridianMap } from "@/data/meridians";
import type { MeridianId } from "@/data/types";

const ink = "#0f1b2d";
const muted = "#64748b";
const navy = "#1e3a6b";
const yangC = "#ea580c";
const yinC = "#2563eb";

function Arrow({ id, color }: { id: string; color: string }) {
  return (
    <marker id={id} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M0,0 L10,5 L0,10 z" fill={color} />
    </marker>
  );
}

// ------------------------------------------------------------
// 陰陽：太極図と4つの関係
// ------------------------------------------------------------
export function YinYangFigure() {
  const rel = [
    { t: "対立制約", d: "互いに引き合い、行き過ぎを抑える" },
    { t: "互根互用", d: "一方だけでは成り立たない" },
    { t: "消長平衡", d: "一方が増えれば他方が減る" },
    { t: "相互転化", d: "極まると反対側へ転じる" },
  ];
  return (
    <svg viewBox="0 0 360 220" role="img" aria-label="陰陽の太極図と4つの関係" className="mx-auto w-full max-w-xl">
      <g transform="translate(80,110)">
        <circle r={62} fill="#0f1b2d" />
        <path d="M0,-62 A62,62 0 0,1 0,62 A31,31 0 0,1 0,0 A31,31 0 0,0 0,-62 Z" fill="white" />
        <circle r={62} fill="none" stroke="#0f1b2d" strokeWidth={2} />
        <circle cy={-31} r={8} fill="white" />
        <circle cy={31} r={8} fill="#0f1b2d" />
        <text x={30} y={22} textAnchor="middle" className="text-[13px] font-bold" fill={ink}>
          陽
        </text>
        <text x={-30} y={-10} textAnchor="middle" className="text-[13px] font-bold" fill="white">
          陰
        </text>
      </g>
      {rel.map((r, i) => {
        const y = 28 + i * 46;
        return (
          <g key={r.t}>
            <rect x={168} y={y - 16} width={184} height={38} rx={8} fill="white" stroke="#cbd5e1" />
            <text x={180} y={y} className="text-[12px] font-bold" fill={navy}>
              {r.t}
            </text>
            <text x={180} y={y + 15} className="text-[9px]" fill={muted}>
              {r.d}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ------------------------------------------------------------
// 陰陽の失調：平衡・陽盛・陰盛・陽虚・陰虚
// ------------------------------------------------------------
export function YinYangBalanceFigure() {
  const cols = [
    { t: "平衡", yang: 60, yin: 60, note: "健康" },
    { t: "陽盛", yang: 90, yin: 60, note: "実熱" },
    { t: "陰盛", yang: 60, yin: 90, note: "実寒" },
    { t: "陽虚", yang: 32, yin: 60, note: "虚寒" },
    { t: "陰虚", yang: 60, yin: 32, note: "虚熱" },
  ];
  const base = 150;
  return (
    <svg viewBox="0 0 360 210" role="img" aria-label="陰陽の失調の4つの型" className="mx-auto w-full max-w-xl">
      <line x1={10} x2={350} y1={base} y2={base} stroke="#cbd5e1" />
      <line x1={10} x2={350} y1={base - 60} y2={base - 60} stroke="#94a3b8" strokeDasharray="3 4" />
      <text x={350} y={base - 64} textAnchor="end" className="text-[8px]" fill={muted}>
        正常の高さ
      </text>
      {cols.map((c, i) => {
        const x = 22 + i * 68;
        return (
          <g key={c.t}>
            <rect x={x} y={base - c.yang} width={20} height={c.yang} rx={3} fill={yangC} />
            <rect x={x + 24} y={base - c.yin} width={20} height={c.yin} rx={3} fill={yinC} />
            <text x={x + 22} y={base + 18} textAnchor="middle" className="text-[12px] font-bold" fill={ink}>
              {c.t}
            </text>
            <text x={x + 22} y={base + 33} textAnchor="middle" className="text-[10px]" fill={muted}>
              {c.note}
            </text>
          </g>
        );
      })}
      <g transform="translate(14,14)">
        <rect width={10} height={10} rx={2} fill={yangC} />
        <text x={14} y={9} className="text-[10px]" fill={ink}>
          陽
        </text>
        <rect x={36} width={10} height={10} rx={2} fill={yinC} />
        <text x={50} y={9} className="text-[10px]" fill={ink}>
          陰
        </text>
      </g>
    </svg>
  );
}

// ------------------------------------------------------------
// 五行：相生（外周の円）と相克（内側の星形）
// ------------------------------------------------------------
const elements = [
  { k: "木", organ: "肝・胆", color: "#16a34a" },
  { k: "火", organ: "心・小腸", color: "#dc2626" },
  { k: "土", organ: "脾・胃", color: "#a16207" },
  { k: "金", organ: "肺・大腸", color: "#64748b" },
  { k: "水", organ: "腎・膀胱", color: "#1e40af" },
];

export function FiveElementsFigure() {
  const cx = 180;
  const cy = 128;
  const R = 92;
  const pos = elements.map((_, i) => {
    const a = (-90 + 72 * i) * (Math.PI / 180);
    return [cx + R * Math.cos(a), cy + R * Math.sin(a)] as const;
  });
  const shorten = (a: readonly [number, number], b: readonly [number, number], r1: number, r2: number) => {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l = Math.hypot(dx, dy);
    return [a[0] + (dx / l) * r1, a[1] + (dy / l) * r1, b[0] - (dx / l) * r2, b[1] - (dy / l) * r2];
  };
  return (
    <svg viewBox="0 0 360 260" role="img" aria-label="五行の相生と相克" className="mx-auto w-full max-w-lg">
      <defs>
        <Arrow id="gen-arrow" color={navy} />
        <Arrow id="ctl-arrow" color="#b42318" />
      </defs>
      {pos.map((p, i) => {
        const q = pos[(i + 1) % 5];
        const [x1, y1, x2, y2] = shorten(p, q, 30, 32);
        const mx = (x1 + x2) / 2;
        const my = (y1 + y2) / 2;
        const nx = mx - cx;
        const ny = my - cy;
        const nl = Math.hypot(nx, ny);
        return (
          <path
            key={`g${i}`}
            d={`M${x1},${y1} Q${mx + (nx / nl) * 18},${my + (ny / nl) * 18} ${x2},${y2}`}
            fill="none"
            stroke={navy}
            strokeWidth={2}
            markerEnd="url(#gen-arrow)"
          />
        );
      })}
      {pos.map((p, i) => {
        const q = pos[(i + 2) % 5];
        const [x1, y1, x2, y2] = shorten(p, q, 30, 32);
        return <line key={`c${i}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#b42318" strokeWidth={1.5} strokeDasharray="4 3" markerEnd="url(#ctl-arrow)" />;
      })}
      {elements.map((e, i) => (
        <g key={e.k}>
          <circle cx={pos[i][0]} cy={pos[i][1]} r={27} fill="white" stroke={e.color} strokeWidth={3} />
          <text x={pos[i][0]} y={pos[i][1] + 2} textAnchor="middle" className="text-[16px] font-bold" fill={e.color}>
            {e.k}
          </text>
          <text x={pos[i][0]} y={pos[i][1] + 15} textAnchor="middle" className="text-[8px]" fill={muted}>
            {e.organ}
          </text>
        </g>
      ))}
      <g transform="translate(16,238)">
        <line x1={0} x2={22} y1={0} y2={0} stroke={navy} strokeWidth={2} markerEnd="url(#gen-arrow)" />
        <text x={28} y={4} className="text-[10px]" fill={ink}>
          相生（母 → 子：生み育てる）
        </text>
        <line x1={190} x2={212} y1={0} y2={0} stroke="#b42318" strokeWidth={1.5} strokeDasharray="4 3" markerEnd="url(#ctl-arrow)" />
        <text x={218} y={4} className="text-[10px]" fill={ink}>
          相克（抑える）
        </text>
      </g>
    </svg>
  );
}

// ------------------------------------------------------------
// 気・血・津液の関係
// ------------------------------------------------------------
export function QiBloodFluidFigure() {
  const node = (x: number, y: number, label: string, sub: string, color: string) => (
    <g>
      <circle cx={x} cy={y} r={36} fill={color} />
      <text x={x} y={y + 2} textAnchor="middle" className="text-[17px] font-bold" fill="white">
        {label}
      </text>
      <text x={x} y={y + 18} textAnchor="middle" className="text-[8px]" fill="white">
        {sub}
      </text>
    </g>
  );
  return (
    <svg viewBox="0 0 360 250" role="img" aria-label="気・血・津液の関係" className="mx-auto w-full max-w-lg">
      <defs>
        <Arrow id="qbf" color={muted} />
      </defs>
      <path d="M150,70 Q100,110 92,150" fill="none" stroke={muted} strokeWidth={1.5} markerEnd="url(#qbf)" />
      <path d="M110,168 Q130,120 168,82" fill="none" stroke={muted} strokeWidth={1.5} markerEnd="url(#qbf)" />
      <text x={70} y={100} className="text-[9px]" fill={ink}>
        気は血の帥
      </text>
      <text x={70} y={112} className="text-[8px]" fill={muted}>
        （血を動かす）
      </text>
      <text x={150} y={140} className="text-[9px]" fill={ink}>
        血は気の母
      </text>
      <text x={150} y={152} className="text-[8px]" fill={muted}>
        （気を養う）
      </text>
      <path d="M212,82 Q250,120 262,150" fill="none" stroke={muted} strokeWidth={1.5} markerEnd="url(#qbf)" />
      <text x={244} y={100} className="text-[9px]" fill={ink}>
        気が津液を
      </text>
      <text x={244} y={112} className="text-[9px]" fill={ink}>
        めぐらせる
      </text>
      <line x1={128} y1={196} x2={232} y2={196} stroke={muted} strokeWidth={1.5} markerStart="url(#qbf)" markerEnd="url(#qbf)" />
      <text x={180} y={190} textAnchor="middle" className="text-[9px]" fill={ink}>
        津血同源
      </text>
      {node(180, 54, "気", "5つの作用", navy)}
      {node(92, 196, "血", "滋養する", "#b42318")}
      {node(268, 196, "津液", "潤す", "#0e7490")}
    </svg>
  );
}

// ------------------------------------------------------------
// 五臓と六腑（表裏）
// ------------------------------------------------------------
export function ZangFuFigure() {
  const rows: { zang: string; zf: string; fu: string; ff: string; color: string }[] = [
    { zang: "肝", zf: "疏泄・蔵血", fu: "胆", ff: "胆汁を蔵す・決断", color: "#16a34a" },
    { zang: "心", zf: "血脈・神明を主る", fu: "小腸", ff: "受盛・清濁を分ける", color: "#dc2626" },
    { zang: "脾", zf: "運化・統血・昇清", fu: "胃", ff: "受納・腐熟", color: "#a16207" },
    { zang: "肺", zf: "気を主る・宣発粛降", fu: "大腸", ff: "伝導", color: "#64748b" },
    { zang: "腎", zf: "蔵精・水を主る・納気", fu: "膀胱", ff: "尿を貯え出す", color: "#1e40af" },
  ];
  return (
    <svg viewBox="0 0 360 260" role="img" aria-label="五臓と六腑の表裏関係" className="mx-auto w-full max-w-xl">
      <text x={92} y={16} textAnchor="middle" className="text-[11px] font-bold" fill={navy}>
        五臓（裏・陰）
      </text>
      <text x={270} y={16} textAnchor="middle" className="text-[11px] font-bold" fill={navy}>
        六腑（表・陽）
      </text>
      {rows.map((r, i) => {
        const y = 30 + i * 44;
        return (
          <g key={r.zang}>
            <rect x={14} y={y} width={156} height={36} rx={8} fill={r.color} />
            <text x={36} y={y + 23} textAnchor="middle" className="text-[16px] font-bold" fill="white">
              {r.zang}
            </text>
            <text x={58} y={y + 22} className="text-[9px]" fill="white">
              {r.zf}
            </text>
            <line x1={170} y1={y + 18} x2={192} y2={y + 18} stroke={r.color} strokeWidth={2} />
            <rect x={192} y={y} width={156} height={36} rx={8} fill="white" stroke={r.color} strokeWidth={2} />
            <text x={216} y={y + 23} textAnchor="middle" className="text-[14px] font-bold" fill={r.color}>
              {r.fu}
            </text>
            <text x={240} y={y + 22} className="text-[9px]" fill={ink}>
              {r.ff}
            </text>
          </g>
        );
      })}
      <text x={180} y={254} textAnchor="middle" className="text-[9px]" fill={muted}>
        ＋ 心包 ― 三焦（経絡の表裏として加わり、六臓六腑・十二経脈になる）
      </text>
    </svg>
  );
}

// ------------------------------------------------------------
// 経別の「離・入・出・合」
// ------------------------------------------------------------
export function JingbieFlowFigure() {
  const st = [
    { t: "離", d: "四肢（主に肘・膝付近）で正経から別れる" },
    { t: "入", d: "体幹の深部に入り臓腑をめぐる" },
    { t: "出", d: "頭頸部で体表に出る" },
    { t: "合", d: "陰経の経別も陽経に合流（六合）" },
  ];
  return (
    <svg viewBox="0 0 360 150" role="img" aria-label="経別の離・入・出・合" className="mx-auto w-full max-w-xl">
      <defs>
        <Arrow id="jb" color={navy} />
      </defs>
      {st.map((s, i) => {
        const x = 12 + i * 88;
        return (
          <g key={s.t}>
            <circle cx={x + 34} cy={40} r={24} fill={i === 3 ? navy : "white"} stroke={navy} strokeWidth={2} />
            <text x={x + 34} y={47} textAnchor="middle" className="text-[18px] font-bold" fill={i === 3 ? "white" : navy}>
              {s.t}
            </text>
            {i < 3 && <line x1={x + 62} y1={40} x2={x + 92} y2={40} stroke={navy} strokeWidth={2} markerEnd="url(#jb)" />}
            <foreignObject x={x} y={72} width={80} height={72}>
              <p style={{ fontSize: 9, lineHeight: 1.45, color: ink, textAlign: "center", margin: 0 }}>{s.d}</p>
            </foreignObject>
          </g>
        );
      })}
    </svg>
  );
}

// ------------------------------------------------------------
// 外邪の伝変：皮部 → 絡脈 → 経脈 → 臓腑
// ------------------------------------------------------------
export function TransmissionFigure() {
  const layers = [
    { t: "皮部", d: "体表の領域", c: "#e0e7f3" },
    { t: "絡脈", d: "浅い枝", c: "#b9c7e2" },
    { t: "経脈", d: "深い幹線", c: "#7d93bd" },
    { t: "臓腑", d: "体の内部", c: navy },
  ];
  return (
    <svg viewBox="0 0 360 210" role="img" aria-label="外邪が皮部から臓腑へ伝わる順序" className="mx-auto w-full max-w-lg">
      <defs>
        <Arrow id="tr" color="#b42318" />
      </defs>
      {layers.map((l, i) => {
        const x = 20 + i * 34;
        const y = 14 + i * 24;
        const w = 260 - i * 68;
        const h = 170 - i * 48;
        const last = i === layers.length - 1;
        return (
          <g key={l.t}>
            <rect x={x} y={y} width={w} height={h} rx={14} fill={l.c} />
            <text x={last ? x + w / 2 : x + 12} y={last ? y + h / 2 + 4 : y + 17} textAnchor={last ? "middle" : "start"} className="text-[11px] font-bold" fill={i >= 2 ? "white" : ink}>
              {l.t}
            </text>
          </g>
        );
      })}
      <text x={150} y={202} textAnchor="middle" className="text-[9px]" fill={muted}>
        外から内へ・浅い層から深い層へ
      </text>
      <line x1={330} y1={24} x2={330} y2={176} stroke="#b42318" strokeWidth={2.5} markerEnd="url(#tr)" />
      <text x={318} y={100} textAnchor="end" className="text-[10px] font-semibold" fill="#b42318">
        伝変
      </text>
      <text x={318} y={114} textAnchor="end" className="text-[8px]" fill={muted}>
        （伝統理論）
      </text>
    </svg>
  );
}

// ------------------------------------------------------------
// 前腕の断面で見る手の六経の配置
// ------------------------------------------------------------
export function ArmChannelsFigure() {
  const cx = 180;
  const cy = 112;
  const items: { id: MeridianId; angle: number; side: "前面" | "後面" }[] = [
    { id: "LU", angle: 210, side: "前面" },
    { id: "PC", angle: 270, side: "前面" },
    { id: "HT", angle: 330, side: "前面" },
    { id: "LI", angle: 150, side: "後面" },
    { id: "TE", angle: 90, side: "後面" },
    { id: "SI", angle: 30, side: "後面" },
  ];
  return (
    <svg viewBox="0 0 360 230" role="img" aria-label="前腕の断面で見た手の六経の位置" className="mx-auto w-full max-w-lg">
      <ellipse cx={cx} cy={cy} rx={104} ry={70} fill="#f8fafc" stroke="#cbd5e1" strokeWidth={2} />
      <line x1={cx - 112} y1={cy} x2={cx + 112} y2={cy} stroke="#e2e8f0" strokeDasharray="3 4" />
      <text x={cx} y={cy - 78} textAnchor="middle" className="text-[10px] font-bold" fill={yinC}>
        前面（掌側）＝ 陰経
      </text>
      <text x={cx} y={cy + 88} textAnchor="middle" className="text-[10px] font-bold" fill={yangC}>
        後面（背側）＝ 陽経
      </text>
      <text x={cx - 128} y={cy + 4} textAnchor="end" className="text-[9px]" fill={muted}>
        橈側
      </text>
      <text x={cx - 128} y={cy + 16} textAnchor="end" className="text-[9px]" fill={muted}>
        （母指側）
      </text>
      <text x={cx + 128} y={cy + 4} className="text-[9px]" fill={muted}>
        尺側
      </text>
      <text x={cx + 128} y={cy + 16} className="text-[9px]" fill={muted}>
        （小指側）
      </text>
      {items.map((it) => {
        const a = (it.angle * Math.PI) / 180;
        const x = cx + 76 * Math.cos(a);
        const y = cy + 48 * Math.sin(a);
        const m = meridianMap[it.id];
        return (
          <g key={it.id}>
            <circle cx={x} cy={y} r={20} fill={m.yinYang === "陰" ? m.color : "white"} stroke={m.color} strokeWidth={2.5} />
            <text x={x} y={y + 1} textAnchor="middle" className="text-[10px] font-bold" fill={m.yinYang === "陰" ? "white" : m.color}>
              {m.organ}
            </text>
            <text x={x} y={y + 11} textAnchor="middle" className="text-[7px]" fill={m.yinYang === "陰" ? "white" : m.color}>
              {m.channel}
            </text>
          </g>
        );
      })}
      <text x={cx} y={226} textAnchor="middle" className="text-[8px]" fill={muted}>
        模式図（仮）。左が橈側、右が尺側
      </text>
    </svg>
  );
}

// ------------------------------------------------------------
// 三陰三陽と表裏・同名経
// ------------------------------------------------------------
export function ChannelPairsFigure() {
  const pairs: [string, MeridianId, MeridianId, string, MeridianId, MeridianId][] = [
    ["太陰", "LU", "SP", "陽明", "LI", "ST"],
    ["少陰", "HT", "KI", "太陽", "SI", "BL"],
    ["厥陰", "PC", "LR", "少陽", "TE", "GB"],
  ];
  const cell = (x: number, y: number, id: MeridianId) => {
    const m = meridianMap[id];
    return (
      <g>
        <rect x={x} y={y} width={64} height={26} rx={6} fill={m.yinYang === "陰" ? m.color : "white"} stroke={m.color} strokeWidth={2} />
        <text x={x + 32} y={y + 17} textAnchor="middle" className="text-[10px] font-bold" fill={m.yinYang === "陰" ? "white" : m.color}>
          {m.limb}・{m.organ}
        </text>
      </g>
    );
  };
  return (
    <svg viewBox="0 0 360 240" role="img" aria-label="三陰三陽と表裏関係・同名経" className="mx-auto w-full max-w-xl">
      <text x={92} y={16} textAnchor="middle" className="text-[11px] font-bold" fill={yinC}>
        陰経（裏）
      </text>
      <text x={268} y={16} textAnchor="middle" className="text-[11px] font-bold" fill={yangC}>
        陽経（表）
      </text>
      {pairs.map(([yin, h1, f1, yang, h2, f2], i) => {
        const y = 30 + i * 64;
        return (
          <g key={yin}>
            <text x={18} y={y + 34} className="text-[12px] font-bold" fill={ink}>
              {yin}
            </text>
            {cell(52, y, h1)}
            {cell(52, y + 30, f1)}
            <text x={342} y={y + 34} textAnchor="end" className="text-[12px] font-bold" fill={ink}>
              {yang}
            </text>
            {cell(236, y, h2)}
            {cell(236, y + 30, f2)}
            <line x1={116} y1={y + 13} x2={236} y2={y + 13} stroke="#94a3b8" strokeWidth={1.2} />
            <line x1={116} y1={y + 43} x2={236} y2={y + 43} stroke="#94a3b8" strokeWidth={1.2} />
            <text x={176} y={y + 10} textAnchor="middle" className="text-[8px]" fill={muted}>
              表裏
            </text>
            <text x={176} y={y + 40} textAnchor="middle" className="text-[8px]" fill={muted}>
              表裏
            </text>
          </g>
        );
      })}
      <text x={180} y={232} textAnchor="middle" className="text-[9px]" fill={muted}>
        同じ段の手と足の経（例：手の太陰肺経と足の太陰脾経）が「同名経」
      </text>
    </svg>
  );
}
