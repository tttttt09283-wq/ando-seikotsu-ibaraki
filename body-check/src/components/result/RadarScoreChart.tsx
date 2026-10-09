"use client";

/**
 * 5項目のレーダーチャート（Recharts というグラフ用ライブラリを使用）
 * 未測定の項目は 0 として描画しつつ、軸ラベルに「未測定」と明記します。
 */
import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer } from "recharts";
import { CHECK_META, MAX_POINTS_PER_CHECK } from "@/config/checks";
import type { CheckScore } from "@/types";

interface Datum {
  axis: string;
  value: number;
  measured: boolean;
}

function AxisTick(props: { x?: number | string; y?: number | string; payload?: { value: string; index: number }; data: Datum[]; light?: boolean }) {
  const { payload, data, light } = props;
  const x = Number(props.x ?? 0);
  const y = Number(props.y ?? 0);
  if (!payload) return null;
  const d = data[payload.index];
  return (
    <g transform={`translate(${x},${y})`}>
      <text textAnchor="middle" dy={0} fontSize={12} fontWeight={700} fill={light ? "#ffffff" : "#1e3a5f"}>
        {payload.value}
      </text>
      <text textAnchor="middle" dy={14} fontSize={11} fontWeight={700} fill={d?.measured ? (light ? "#ffd866" : "#0b6d76") : light ? "#c9d6e3" : "#64748b"}>
        {d?.measured ? `${d.value}/${MAX_POINTS_PER_CHECK}` : "未測定"}
      </text>
    </g>
  );
}

export function RadarScoreChart({ items, light = false }: { items: CheckScore[]; light?: boolean }) {
  const data: Datum[] = items.map((i) => ({
    axis: CHECK_META[i.id].shortName,
    value: i.score === null ? 0 : Math.round(i.score * 10) / 10,
    measured: i.score !== null,
  }));
  const description = data.map((d) => `${d.axis}：${d.measured ? `${d.value}点` : "未測定"}`).join("、");

  return (
    <figure role="img" aria-label={`レーダーチャート（20点満点）。${description}`} className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={data} outerRadius="66%" margin={{ top: 16, right: 30, bottom: 16, left: 30 }}>
          <PolarGrid stroke={light ? "rgba(255,255,255,0.35)" : "#cbd5e1"} />
          <PolarAngleAxis dataKey="axis" tick={(p: object) => <AxisTick {...p} data={data} light={light} />} />
          <PolarRadiusAxis domain={[0, MAX_POINTS_PER_CHECK]} tick={false} axisLine={false} tickCount={5} />
          <Radar
            dataKey="value"
            stroke={light ? "#ffd866" : "#0e8893"}
            strokeWidth={3}
            fill={light ? "#ffd866" : "#14a8b5"}
            fillOpacity={light ? 0.45 : 0.35}
            isAnimationActive={false}
          />
        </RadarChart>
      </ResponsiveContainer>
    </figure>
  );
}
