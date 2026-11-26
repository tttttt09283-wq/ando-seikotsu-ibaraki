"use client";

import * as React from "react";
import { channelInfo, meridianMap } from "@/data/meridians";
import { pointMap } from "@/data/points";
import type { MeridianId, View } from "@/data/types";
import { labelPlacements, meridianPaths, mirrorPt, pointPositions, sideEar, silhouettes, smoothPath, type Pt } from "./body-geometry";

const viewLabel: Record<View, string> = {
  front: "前面",
  back: "後面",
  side: "右側面",
};

export interface BodyFigureProps {
  view: View;
  visible: MeridianId[];
  selected?: MeridianId | null;
  selectedPoint?: string | null;
  onSelectMeridian?: (id: MeridianId) => void;
  onSelectPoint?: (code: string) => void;
  /** 表示する経穴コード（省略時は辞典収録の全経穴） */
  pointCodes?: string[];
  className?: string;
  showLabels?: boolean;
}

const pts = (p: Pt[]) => p.map(([x, y]) => `${x},${y}`).join(" ");

export function BodyFigure({
  view,
  visible,
  selected,
  selectedPoint,
  onSelectMeridian,
  onSelectPoint,
  pointCodes,
  className,
  showLabels = true,
}: BodyFigureProps) {
  const sil = silhouettes[view];
  const mirror = sil.mirror;
  const interactive = Boolean(onSelectMeridian || onSelectPoint);
  const codes = pointCodes ?? Object.keys(pointPositions);

  const shapes = (cls: string, key: string) => (
    <g className={cls} key={key}>
      {sil.ellipses.map((e, i) => (
        <React.Fragment key={i}>
          <ellipse cx={e.cx} cy={e.cy} rx={e.rx} ry={e.ry} />
          {mirror && e.cx !== 120 && <ellipse cx={240 - e.cx} cy={e.cy} rx={e.rx} ry={e.ry} />}
        </React.Fragment>
      ))}
      {sil.polygons.map((p, i) => (
        <React.Fragment key={i}>
          <polygon points={pts(p)} />
          {mirror && <polygon points={pts(p.map(mirrorPt))} />}
        </React.Fragment>
      ))}
    </g>
  );

  const paths = meridianPaths[view];

  return (
    <svg
      viewBox="0 0 240 500"
      role="img"
      aria-label={`十二経脈の模式図（${viewLabel[view]}・仮図）`}
      className={className}
    >
      {/* 輪郭：太い線を先に描き、同じ形の塗りを重ねて外形線だけを残す */}
      {shapes("fill-none stroke-slate-300 [stroke-width:3] [stroke-linejoin:round]", "outline")}
      {shapes("fill-slate-50 stroke-none", "fill")}
      {view === "side" && <ellipse cx={sideEar.cx} cy={sideEar.cy} rx={sideEar.rx} ry={sideEar.ry} className="fill-slate-50 stroke-slate-300" />}
      {mirror && <line x1={120} y1={80} x2={120} y2={262} className="stroke-slate-200" strokeDasharray="3 4" />}

      {/* 経絡 */}
      {visible.map((id) => {
        const lines = paths[id];
        if (!lines) return null;
        const m = meridianMap[id];
        const isSel = selected === id;
        const dim = selected && !isSel;
        const all = mirror ? [...lines, ...lines.map((l) => l.map(mirrorPt))] : lines;
        return (
          <g key={id} opacity={dim ? 0.18 : 1}>
            {all.map((l, i) => {
              const d = smoothPath(l);
              return (
                <React.Fragment key={i}>
                  <path d={d} fill="none" stroke={m.color} strokeWidth={isSel ? 3.2 : 1.9} strokeLinecap="round" strokeLinejoin="round" />
                  {onSelectMeridian && (
                    <path
                      d={d}
                      fill="none"
                      stroke="transparent"
                      strokeWidth={12}
                      className="cursor-pointer"
                      onClick={() => onSelectMeridian(id)}
                    >
                      <title>{m.name}</title>
                    </path>
                  )}
                </React.Fragment>
              );
            })}
          </g>
        );
      })}

      {/* 経穴 */}
      {codes.map((code) => {
        const pos = pointPositions[code]?.[view];
        const p = pointMap[code];
        if (!pos || !p) return null;
        const color = channelInfo[p.meridian].color;
        const dim = Boolean(selected && selected !== p.meridian);
        const isSel = selectedPoint === code;
        const positions = mirror ? [pos, mirrorPt(pos)] : [pos];
        return (
          <g key={code} opacity={dim ? 0.35 : 1}>
            {positions.map(([x, y], i) => (
              <g
                key={i}
                className={onSelectPoint ? "cursor-pointer" : undefined}
                onClick={onSelectPoint ? () => onSelectPoint(code) : undefined}
                role={onSelectPoint ? "button" : undefined}
                tabIndex={onSelectPoint ? 0 : undefined}
                aria-label={onSelectPoint ? `${p.name}（${code}）の詳細を開く` : undefined}
                onKeyDown={
                  onSelectPoint
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onSelectPoint(code);
                        }
                      }
                    : undefined
                }
              >
                {onSelectPoint && <circle cx={x} cy={y} r={11} fill="transparent" />}
                <circle cx={x} cy={y} r={isSel ? 5.5 : 4} fill="white" stroke={color} strokeWidth={isSel ? 3 : 2} />
                <circle cx={x} cy={y} r={1.4} fill={color} />
              </g>
            ))}
            {showLabels &&
              (() => {
                const lp = labelPlacements[code]?.[view] ?? (view === "side" ? { dx: 8, dy: 3, anchor: "start" as const } : { dx: -7, dy: 3, anchor: "end" as const });
                const [lx, ly] = lp.mirror && mirror ? positions[1] : positions[0];
                return (
                  <text
                    x={lx + lp.dx}
                    y={ly + lp.dy}
                    textAnchor={lp.anchor}
                    className="fill-slate-700 text-[8px] font-semibold"
                    style={{ paintOrder: "stroke", stroke: "white", strokeWidth: 2.5 }}
                  >
                    {p.name}
                  </text>
                );
              })()}
          </g>
        );
      })}

      <text x={8} y={16} className="fill-slate-500 text-[10px] font-semibold">
        {viewLabel[view]}
      </text>
      <text x={232} y={16} textAnchor="end" className="fill-amber-700 text-[9px]">
        模式図（仮）
      </text>
      {mirror && (
        <text x={120} y={494} textAnchor="middle" className="fill-slate-400 text-[8px]">
          {view === "front" ? "像の左側 ＝ 身体の右側" : "像の右側 ＝ 身体の右側"}
        </text>
      )}
      {interactive && <desc>経絡の線または経穴の点を選ぶと詳細が表示されます。</desc>}
    </svg>
  );
}
