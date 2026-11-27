"use client";

/** 第4章「経穴学」の図解（編集可能なインライン SVG）。 */
import * as React from "react";

const ink = "#0f1b2d";
const muted = "#64748b";
const navy = "#1e3a6b";
const teal = "#0f766e";
const amber = "#b45309";

// ------------------------------------------------------------
// 経穴の3分類
// ------------------------------------------------------------
export function PointClassificationFigure() {
  const cols = [
    { t: "十四経穴（経穴）", sub: "正経12経＋任脈・督脈", d: ["名称・部位・所属経が決まっている", "WHO 標準で361穴", "例：合谷 LI4・足三里 ST36"], c: navy },
    { t: "奇穴（経外奇穴）", sub: "十四経に属さない", d: ["名称・部位は決まっている", "特定の症状に用いる経験穴が多い", "例：太陽・四神聡・夾脊"], c: teal },
    { t: "阿是穴", sub: "部位が決まっていない", d: ["圧痛・硬結など反応のある所", "患者ごと・その時ごとに探す", "「天応穴」とも呼ばれる"], c: amber },
  ];
  return (
    <svg viewBox="0 0 360 210" role="img" aria-label="経穴の3分類" className="mx-auto w-full max-w-xl">
      {cols.map((c, i) => {
        const x = 6 + i * 118;
        return (
          <g key={c.t}>
            <rect x={x} y={8} width={112} height={194} rx={10} fill="white" stroke={c.c} strokeWidth={2} />
            <rect x={x} y={8} width={112} height={46} rx={10} fill={c.c} />
            <rect x={x} y={40} width={112} height={14} fill={c.c} />
            <text x={x + 56} y={28} textAnchor="middle" className="text-[11px] font-bold" fill="white">
              {c.t}
            </text>
            <text x={x + 56} y={44} textAnchor="middle" className="text-[8px]" fill="white">
              {c.sub}
            </text>
            {c.d.map((line, j) => (
              <foreignObject key={line} x={x + 8} y={62 + j * 44} width={96} height={42}>
                <p style={{ fontSize: 9, lineHeight: 1.45, color: ink, margin: 0 }}>・{line}</p>
              </foreignObject>
            ))}
          </g>
        );
      })}
    </svg>
  );
}

// ------------------------------------------------------------
// 主な骨度（寸）：部位ごとの区間を比率どおりの長さで並べる
// ------------------------------------------------------------
type Seg = { from: string; to: string; cun: number };
const boneGroups: { title: string; color: string; segs: Seg[] }[] = [
  {
    title: "体幹前面",
    color: navy,
    segs: [
      { from: "胸骨上窩", to: "胸骨体下端", cun: 9 },
      { from: "胸骨体下端", to: "臍中央", cun: 8 },
      { from: "臍中央", to: "恥骨結合上縁", cun: 5 },
    ],
  },
  {
    title: "上肢",
    color: "#7a3e9d",
    segs: [
      { from: "腋窩横紋前端", to: "肘窩横紋", cun: 9 },
      { from: "肘窩横紋", to: "手関節横紋", cun: 12 },
    ],
  },
  {
    title: "下肢内側",
    color: teal,
    segs: [
      { from: "恥骨結合上縁", to: "大腿骨内側上顆", cun: 18 },
      { from: "脛骨内側顆下縁", to: "内果尖", cun: 13 },
    ],
  },
  {
    title: "下肢外側・後面",
    color: amber,
    segs: [
      { from: "大転子頂点", to: "膝窩横紋", cun: 19 },
      { from: "膝窩横紋", to: "外果尖", cun: 16 },
    ],
  },
];

export function BoneProportionFigure() {
  const scale = 7.2; // 1寸あたりの px
  const top = 30;
  return (
    <svg viewBox="0 0 360 300" role="img" aria-label="主な骨度（寸）" className="mx-auto w-full max-w-xl">
      {boneGroups.map((g, i) => {
        const x = 14 + i * 88;
        let y = top;
        return (
          <g key={g.title}>
            <text x={x + 2} y={18} className="text-[10px] font-bold" fill={g.color}>
              {g.title}
            </text>
            {g.segs.map((s, j) => {
              const h = s.cun * scale;
              const y0 = y + (j > 0 && g.title.startsWith("下肢内側") ? 6 : 0);
              y = y0 + h;
              return (
                <g key={s.from}>
                  <rect x={x} y={y0} width={14} height={h - 2} rx={3} fill={g.color} opacity={j % 2 ? 0.55 : 0.9} />
                  <text x={x + 7} y={y0 + h / 2 + 4} textAnchor="middle" className="text-[10px] font-bold" fill="white">
                    {s.cun}
                  </text>
                  {(j === 0 || g.segs[j - 1].to !== s.from) && (
                    <text x={x + 19} y={y0 + 7} className="text-[7.5px]" fill={ink}>
                      {s.from}
                    </text>
                  )}
                  <text x={x + 19} y={y0 + h} className="text-[7.5px]" fill={ink}>
                    {s.to}
                  </text>
                </g>
              );
            })}
          </g>
        );
      })}
      <text x={180} y={294} textAnchor="middle" className="text-[9px]" fill={muted}>
        数字は寸。棒の長さは寸数に比例。正確な起点・終点は本文を参照
      </text>
    </svg>
  );
}

// ------------------------------------------------------------
// 同身寸（指寸法）
// ------------------------------------------------------------
export function FingerCunFigure() {
  const finger = (x: number, y: number, w: number, h: number) => <rect x={x} y={y} width={w} height={h} rx={w / 2} fill="#f8fafc" stroke="#94a3b8" strokeWidth={1.5} />;
  return (
    <svg viewBox="0 0 360 200" role="img" aria-label="同身寸（中指同身寸・母指同身寸・横指同身寸）" className="mx-auto w-full max-w-xl">
      {/* 中指同身寸 */}
      <g>
        {finger(40, 30, 22, 120)}
        <line x1={40} x2={62} y1={70} y2={70} stroke="#94a3b8" />
        <line x1={40} x2={62} y1={104} y2={104} stroke="#94a3b8" />
        <rect x={64} y={70} width={6} height={34} fill={navy} />
        <text x={76} y={91} className="text-[11px] font-bold" fill={navy}>
          1寸
        </text>
        <text x={56} y={172} textAnchor="middle" className="text-[11px] font-bold" fill={ink}>
          中指同身寸
        </text>
        <text x={56} y={188} textAnchor="middle" className="text-[8px]" fill={muted}>
          中指中節の両端の横紋の間
        </text>
      </g>
      {/* 母指同身寸 */}
      <g>
        {finger(156, 50, 30, 92)}
        <line x1={156} x2={186} y1={90} y2={90} stroke="#94a3b8" />
        <rect x={156} y={78} width={30} height={5} fill={teal} />
        <text x={171} y={70} textAnchor="middle" className="text-[11px] font-bold" fill={teal}>
          1寸
        </text>
        <text x={171} y={172} textAnchor="middle" className="text-[11px] font-bold" fill={ink}>
          母指同身寸
        </text>
        <text x={171} y={188} textAnchor="middle" className="text-[8px]" fill={muted}>
          母指の指節間関節の幅
        </text>
      </g>
      {/* 横指同身寸（一夫法） */}
      <g>
        {[0, 1, 2, 3].map((i) => finger(250 + i * 22, 36 + (i === 1 || i === 2 ? -6 : 4), 20, 110))}
        <line x1={250} x2={336} y1={92} y2={92} stroke="#94a3b8" strokeDasharray="3 3" />
        <rect x={250} y={82} width={86} height={5} fill={amber} />
        <text x={293} y={76} textAnchor="middle" className="text-[11px] font-bold" fill={amber}>
          3寸
        </text>
        <text x={293} y={172} textAnchor="middle" className="text-[11px] font-bold" fill={ink}>
          横指同身寸（一夫法）
        </text>
        <text x={293} y={188} textAnchor="middle" className="text-[8px]" fill={muted}>
          示指〜小指をそろえた幅（中節の高さ）
        </text>
      </g>
    </svg>
  );
}

// ------------------------------------------------------------
// 背部の体表指標（椎骨の高さの目安）
// ------------------------------------------------------------
export function SpineLandmarksFigure() {
  const marks = [
    { y: 52, label: "第7頸椎棘突起（隆椎）", note: "頸を前に曲げると最も突出" },
    { y: 92, label: "第3胸椎棘突起", note: "左右の肩甲棘内端を結ぶ線の高さ" },
    { y: 150, label: "第7胸椎棘突起", note: "左右の肩甲骨下角を結ぶ線の高さ" },
    { y: 236, label: "第4腰椎棘突起", note: "左右の腸骨稜の最高点を結ぶ線（ヤコビー線）" },
  ];
  return (
    <svg viewBox="0 0 360 290" role="img" aria-label="背部の体表指標と椎骨の高さの目安" className="mx-auto w-full max-w-xl">
      {/* 体幹の輪郭 */}
      <path d="M86,36 L134,36 L160,60 L158,150 L150,250 L70,250 L62,150 L60,60 Z" fill="#f8fafc" stroke="#cbd5e1" strokeWidth={2} />
      {/* 脊柱 */}
      <line x1={110} y1={30} x2={110} y2={262} stroke="#94a3b8" strokeWidth={2} strokeDasharray="2 5" />
      {/* 肩甲骨 */}
      <path d="M76,82 L102,90 L96,150 Z" fill="#e2e8f0" stroke="#94a3b8" />
      <path d="M144,82 L118,90 L124,150 Z" fill="#e2e8f0" stroke="#94a3b8" />
      <line x1={78} y1={84} x2={102} y2={90} stroke="#64748b" strokeWidth={2} />
      <line x1={142} y1={84} x2={118} y2={90} stroke="#64748b" strokeWidth={2} />
      {/* 腸骨稜 */}
      <path d="M68,238 Q80,224 96,236" fill="none" stroke="#64748b" strokeWidth={2} />
      <path d="M152,238 Q140,224 124,236" fill="none" stroke="#64748b" strokeWidth={2} />
      {marks.map((m) => (
        <g key={m.label}>
          <line x1={60} x2={166} y1={m.y} y2={m.y} stroke={navy} strokeWidth={1} strokeDasharray="4 3" />
          <circle cx={110} cy={m.y} r={4.5} fill={navy} />
          <line x1={166} x2={176} y1={m.y} y2={m.y} stroke={navy} />
          <text x={180} y={m.y} className="text-[10px] font-bold" fill={ink}>
            {m.label}
          </text>
          <text x={180} y={m.y + 12} className="text-[8px]" fill={muted}>
            {m.note}
          </text>
        </g>
      ))}
      <text x={180} y={284} textAnchor="middle" className="text-[8px]" fill={muted}>
        背面から見た模式図（仮）。高さはあくまで目安で、個人差があるため触診で確かめる
      </text>
    </svg>
  );
}
