"use client";

/**
 * 第5〜10章の図解。表・タイル・流れ図の3つの汎用 SVG と、舌・脈の専用図で構成する。
 * 文字の折り返しには foreignObject を使い、内容はデータとしてこのファイルにまとめている（編集可能）。
 */
import * as React from "react";
import { confluentPairs } from "@/data/eight-confluent";
import { extraVesselMap, meridianMap } from "@/data/meridians";
import { pointMap } from "@/data/points";

const ink = "#0f1b2d";
const muted = "#64748b";
const navy = "#1e3a6b";
const teal = "#0f766e";
const amber = "#b45309";
const purple = "#7a3e9d";
const red = "#b42318";
const slate = "#475569";

function Wrap({ x, y, w, h, text, size = 9, color = ink, align = "left", bold = false }: { x: number; y: number; w: number; h: number; text: string; size?: number; color?: string; align?: "left" | "center"; bold?: boolean }) {
  return (
    <foreignObject x={x} y={y} width={w} height={h}>
      <p style={{ fontSize: size, lineHeight: 1.4, color, margin: 0, textAlign: align, fontWeight: bold ? 700 : 400 }}>{text}</p>
    </foreignObject>
  );
}

// ------------------------------------------------------------
// 汎用：表
// ------------------------------------------------------------
type TableSpec = { label: string; headers: string[]; widths: number[]; rows: string[][]; color?: string; rowH?: number; note?: string };

function TableFigure({ label, headers, widths, rows, color = navy, rowH = 22, note }: TableSpec) {
  const W = widths.reduce((a, b) => a + b, 0);
  const headH = 24;
  const H = headH + rows.length * rowH + (note ? 22 : 6);
  const xs = widths.map((_, i) => widths.slice(0, i).reduce((a, b) => a + b, 0));
  return (
    <svg viewBox={`0 0 ${W + 4} ${H}`} role="img" aria-label={label} className="mx-auto w-full max-w-xl">
      <rect x={2} y={2} width={W} height={headH} rx={6} fill={color} />
      {headers.map((h, i) => (
        <text key={h} x={2 + xs[i] + widths[i] / 2} y={18} textAnchor="middle" className="text-[10px] font-bold" fill="white">
          {h}
        </text>
      ))}
      {rows.map((r, j) => {
        const y = 2 + headH + j * rowH;
        return (
          <g key={j}>
            {j % 2 === 1 && <rect x={2} y={y} width={W} height={rowH} fill="#f1f5f9" />}
            {r.map((c, i) => (
              <Wrap key={i} x={2 + xs[i] + 4} y={y + 3} w={widths[i] - 8} h={rowH - 2} text={c} size={9} align="center" bold={i === 0} />
            ))}
          </g>
        );
      })}
      <rect x={2} y={2} width={W} height={headH + rows.length * rowH} rx={6} fill="none" stroke="#cbd5e1" />
      {note && <Wrap x={2} y={H - 18} w={W} h={18} text={note} size={8} color={muted} align="center" />}
    </svg>
  );
}

// ------------------------------------------------------------
// 汎用：タイル
// ------------------------------------------------------------
type Tile = { head: string; sub?: string; body?: string; color: string };
function TileFigure({ label, tiles, cols = 2, tileH = 78, note }: { label: string; tiles: Tile[]; cols?: number; tileH?: number; note?: string }) {
  const W = 360;
  const gap = 8;
  const tw = (W - gap * (cols + 1)) / cols;
  const rowsN = Math.ceil(tiles.length / cols);
  const H = gap + rowsN * (tileH + gap) + (note ? 20 : 0);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="mx-auto w-full max-w-xl">
      {tiles.map((t, i) => {
        const x = gap + (i % cols) * (tw + gap);
        const y = gap + Math.floor(i / cols) * (tileH + gap);
        return (
          <g key={t.head + i}>
            <rect x={x} y={y} width={tw} height={tileH} rx={9} fill="white" stroke={t.color} strokeWidth={1.6} />
            <rect x={x} y={y} width={5} height={tileH} rx={2} fill={t.color} />
            <text x={x + 13} y={y + 18} className="text-[12px] font-bold" fill={t.color}>
              {t.head}
            </text>
            {t.sub && (
              <text x={x + tw - 8} y={y + 18} textAnchor="end" className="text-[9px]" fill={muted}>
                {t.sub}
              </text>
            )}
            {t.body && <Wrap x={x + 13} y={y + 26} w={tw - 20} h={tileH - 28} text={t.body} size={9} />}
          </g>
        );
      })}
      {note && <Wrap x={0} y={H - 18} w={W} h={18} text={note} size={8} color={muted} align="center" />}
    </svg>
  );
}

// ------------------------------------------------------------
// 汎用：流れ図（縦）
// ------------------------------------------------------------
type Step = { t: string; d: string; color?: string; side?: { t: string; color: string } };
function FlowFigure({ label, steps, note }: { label: string; steps: Step[]; note?: string }) {
  const W = 360;
  const bh = 46;
  const gap = 16;
  const H = steps.length * (bh + gap) + (note ? 18 : 0);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="mx-auto w-full max-w-xl">
      <defs>
        <marker id="flow-adv" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M0,0 L10,5 L0,10 z" fill={muted} />
        </marker>
      </defs>
      {steps.map((s, i) => {
        const y = 4 + i * (bh + gap);
        const c = s.color ?? navy;
        const bw = s.side ? 232 : 340;
        return (
          <g key={s.t}>
            <rect x={10} y={y} width={bw} height={bh} rx={9} fill="white" stroke={c} strokeWidth={1.8} />
            <text x={22} y={y + 18} className="text-[11px] font-bold" fill={c}>
              {s.t}
            </text>
            <Wrap x={22} y={y + 22} w={bw - 20} h={bh - 22} text={s.d} size={9} />
            {i < steps.length - 1 && <line x1={40} x2={40} y1={y + bh} y2={y + bh + gap - 2} stroke={muted} strokeWidth={1.5} markerEnd="url(#flow-adv)" />}
            {s.side && (
              <g>
                <line x1={bw + 10} x2={bw + 24} y1={y + bh / 2} y2={y + bh / 2} stroke={s.side.color} strokeWidth={1.5} markerEnd="url(#flow-adv)" />
                <rect x={bw + 26} y={y + 6} width={W - bw - 32} height={bh - 12} rx={8} fill={s.side.color} />
                <Wrap x={bw + 30} y={y + 10} w={W - bw - 40} h={bh - 18} text={s.side.t} size={9} color="white" align="center" bold />
              </g>
            )}
          </g>
        );
      })}
      {note && <Wrap x={0} y={H - 16} w={W} h={16} text={note} size={8} color={muted} align="center" />}
    </svg>
  );
}

// ------------------------------------------------------------
// 第5章 要穴
// ------------------------------------------------------------
export function FiveShuFigure() {
  const names = [
    { t: "井", m: "出る", d: "指趾の端" },
    { t: "滎", m: "溜まる", d: "" },
    { t: "兪", m: "注ぐ", d: "" },
    { t: "経", m: "行く", d: "" },
    { t: "合", m: "入る", d: "肘・膝" },
  ];
  const yin = ["木", "火", "土", "金", "水"];
  const yang = ["金", "水", "木", "火", "土"];
  return (
    <svg viewBox="0 0 360 200" role="img" aria-label="五兪穴の流れと五行配当" className="mx-auto w-full max-w-xl">
      <defs>
        <marker id="shu" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M0,0 L10,5 L0,10 z" fill="#0e7490" />
        </marker>
      </defs>
      <path d="M40,58 C80,40 110,74 150,56 C190,38 220,72 262,54 C292,42 312,50 330,54" fill="none" stroke="#bae6fd" strokeWidth={14} strokeLinecap="round" />
      <line x1={30} x2={336} y1={86} y2={86} stroke="#0e7490" strokeWidth={1.5} markerEnd="url(#shu)" />
      <text x={30} y={100} className="text-[8px]" fill={muted}>
        四肢の末端
      </text>
      <text x={336} y={100} textAnchor="end" className="text-[8px]" fill={muted}>
        肘・膝に向かって流れが大きくなる
      </text>
      {names.map((n, i) => {
        const x = 52 + i * 64;
        return (
          <g key={n.t}>
            <circle cx={x} cy={56} r={20} fill="white" stroke="#0e7490" strokeWidth={2} />
            <text x={x} y={61} textAnchor="middle" className="text-[15px] font-bold" fill="#0e7490">
              {n.t}
            </text>
            <text x={x} y={24} textAnchor="middle" className="text-[9px]" fill={muted}>
              {n.m}
            </text>
            <rect x={x - 22} y={112} width={44} height={30} rx={6} fill={navy} />
            <text x={x} y={132} textAnchor="middle" className="text-[13px] font-bold" fill="white">
              {yin[i]}
            </text>
            <rect x={x - 22} y={150} width={44} height={30} rx={6} fill="white" stroke={amber} strokeWidth={1.5} />
            <text x={x} y={170} textAnchor="middle" className="text-[13px] font-bold" fill={amber}>
              {yang[i]}
            </text>
          </g>
        );
      })}
      <text x={4} y={131} className="text-[9px] font-bold" fill={navy}>
        陰経
      </text>
      <text x={4} y={169} className="text-[9px] font-bold" fill={amber}>
        陽経
      </text>
      <text x={180} y={196} textAnchor="middle" className="text-[8px]" fill={muted}>
        陰経は井木から、陽経は井金から相生の順に並ぶ
      </text>
    </svg>
  );
}

export function YuanTableFigure() {
  return (
    <TableFigure
      label="十二経の原穴と郄穴"
      headers={["経脈", "原穴", "郄穴", "経脈", "原穴", "郄穴"]}
      widths={[52, 60, 60, 52, 60, 60]}
      rows={[
        ["肺", "太淵", "孔最", "大腸", "合谷", "温溜"],
        ["脾", "太白", "地機", "胃", "衝陽", "梁丘"],
        ["心", "神門", "陰郄", "小腸", "腕骨", "養老"],
        ["腎", "太渓", "水泉", "膀胱", "京骨", "金門"],
        ["心包", "大陵", "郄門", "三焦", "陽池", "会宗"],
        ["肝", "太衝", "中都", "胆", "丘墟", "外丘"],
      ]}
      note="陰経の原穴は兪穴と同じ穴。郄穴はほかに奇経の4穴（交信・跗陽・築賓・陽交）がある"
    />
  );
}

export function ShuMuFigure() {
  return (
    <TableFigure
      label="背部兪穴と募穴"
      headers={["臓腑", "背部兪穴（高さ）", "募穴"]}
      widths={[60, 160, 120]}
      rowH={20}
      rows={[
        ["肺", "肺兪（T3）", "中府"],
        ["心包", "厥陰兪（T4）", "膻中"],
        ["心", "心兪（T5）", "巨闕"],
        ["肝", "肝兪（T9）", "期門"],
        ["胆", "胆兪（T10）", "日月"],
        ["脾", "脾兪（T11）", "章門"],
        ["胃", "胃兪（T12）", "中脘"],
        ["三焦", "三焦兪（L1）", "石門"],
        ["腎", "腎兪（L2）", "京門"],
        ["大腸", "大腸兪（L4）", "天枢"],
        ["小腸", "小腸兪（S1）", "関元"],
        ["膀胱", "膀胱兪（S2）", "中極"],
      ]}
      note="背部兪穴は各棘突起下縁の高さで後正中線の外方1寸5分（仙骨部は正中仙骨稜の外方1寸5分）"
    />
  );
}

export function HuiHeFigure() {
  return (
    <TileFigure
      label="八会穴と下合穴"
      cols={2}
      tileH={112}
      tiles={[
        { head: "八会穴", sub: "組織ごとの会穴", color: purple, body: "臓会 章門／腑会 中脘／気会 膻中／血会 膈兪／筋会 陽陵泉／脈会 太淵／骨会 大杼／髄会 懸鐘（絶骨）" },
        { head: "下合穴", sub: "六腑の病に", color: teal, body: "胃 足三里／大腸 上巨虚／小腸 下巨虚／胆 陽陵泉／膀胱 委中／三焦 委陽（いずれも足の三陽経上）" },
      ]}
      note="陽陵泉は胆の下合穴であり、八会穴の筋会でもある"
    />
  );
}

// ------------------------------------------------------------
// 第6章 奇経八脈
// ------------------------------------------------------------
export function ExtraVesselsFigure() {
  const t = (id: keyof typeof extraVesselMap, body: string): Tile => ({ head: extraVesselMap[id].name, sub: extraVesselMap[id].reading, color: extraVesselMap[id].color, body });
  return (
    <TileFigure
      label="奇経八脈の全体像"
      cols={2}
      tileH={62}
      tiles={[
        t("GV", "背部正中を上行。「陽脈の海」"),
        t("CV", "腹胸部正中を上行。「陰脈の海」"),
        t("TV", "腹部を上行し胸中に散る。「十二経脈の海」「血海」"),
        t("BV", "腰腹部を帯のように一周する"),
        t("YangLink", "諸陽経をつなぐ。足外側から頭部へ"),
        t("YinLink", "諸陰経をつなぐ。下腿内側から咽喉へ"),
        t("YangHeel", "申脈から下肢外側を上り目内眥へ"),
        t("YinHeel", "照海から下肢内側を上り目内眥へ"),
      ]}
      note="独自の経穴を持つのは督脈と任脈だけ。十四経＝十二正経＋督脈・任脈"
    />
  );
}

export function ConfluentOverviewFigure() {
  return (
    <TableFigure
      label="八脈交会穴の4組"
      headers={["上肢の穴", "通じる奇経", "下肢の穴", "通じる奇経", "主る部位"]}
      widths={[64, 60, 64, 60, 112]}
      rowH={30}
      rows={confluentPairs.map((p) => [
        `${pointMap[p.upper.code].name} ${p.upper.code}`,
        extraVesselMap[p.upper.vessel].name,
        `${pointMap[p.lower.code].name} ${p.lower.code}`,
        extraVesselMap[p.lower.vessel].name,
        p.regions.join("・"),
      ])}
      color={purple}
      note="上肢の穴と下肢の穴を上下で組む。詳しくは「八脈交会穴」の画面で"
    />
  );
}

// ------------------------------------------------------------
// 第7章 診察
// ------------------------------------------------------------
export function FourExamsFigure() {
  return (
    <TileFigure
      label="四診"
      cols={2}
      tileH={84}
      tiles={[
        { head: "望診", sub: "見る", color: navy, body: "顔色・表情（神）、体格・姿勢・動作、皮膚、舌（舌質・舌苔）" },
        { head: "聞診", sub: "聞く・嗅ぐ", color: teal, body: "声の大きさ・張り、呼吸・咳の音、体臭・口臭など" },
        { head: "問診", sub: "尋ねる", color: amber, body: "主訴・経過、寒熱、汗、飲食・口渇、睡眠、二便、月経、既往歴・服薬" },
        { head: "切診", sub: "触れる", color: purple, body: "脈診（寸・関・尺）、腹診、切経（経脈に沿った圧痛・硬結・温度）" },
      ]}
      note="四つの情報を合わせて判断する（四診合参）"
    />
  );
}

export function TongueMapFigure() {
  return (
    <svg viewBox="0 0 360 230" role="img" aria-label="舌の部位と臓腑の対応" className="mx-auto w-full max-w-xl">
      <path d="M60,20 Q60,10 80,10 L180,10 Q200,10 200,20 L200,140 Q200,215 130,215 Q60,215 60,140 Z" fill="#fecaca" stroke="#f87171" strokeWidth={2} />
      <path d="M130,20 L130,180" stroke="#f87171" strokeDasharray="3 4" />
      <ellipse cx={130} cy={50} rx={55} ry={30} fill="#fda4af" opacity={0.6} />
      <ellipse cx={130} cy={118} rx={38} ry={32} fill="#fbcfe8" opacity={0.8} />
      <rect x={64} y={60} width={22} height={100} rx={10} fill="#f9a8d4" opacity={0.8} />
      <rect x={174} y={60} width={22} height={100} rx={10} fill="#f9a8d4" opacity={0.8} />
      <path d="M90,192 Q130,212 170,192" fill="none" stroke="#e11d48" strokeWidth={10} strokeLinecap="round" opacity={0.5} />
      <text x={130} y={54} textAnchor="middle" className="text-[11px] font-bold" fill={ink}>
        舌根：腎
      </text>
      <text x={130} y={122} textAnchor="middle" className="text-[11px] font-bold" fill={ink}>
        舌中：脾胃
      </text>
      <text x={75} y={180} textAnchor="middle" className="text-[9px]" fill={ink}>
        舌辺
      </text>
      <text x={185} y={180} textAnchor="middle" className="text-[9px]" fill={ink}>
        舌辺
      </text>
      <text x={130} y={206} textAnchor="middle" className="text-[11px] font-bold" fill={ink}>
        舌尖：心肺
      </text>
      <text x={130} y={226} textAnchor="middle" className="text-[8px]" fill={muted}>
        舌辺：肝胆（上が咽頭側・下が舌先）
      </text>
      <g>
        <text x={222} y={28} className="text-[11px] font-bold" fill={navy}>
          舌質（色）
        </text>
        <Wrap x={222} y={34} w={134} h={80} text="淡白：気血不足・虚寒／紅：熱／絳（深紅）：熱が盛ん／紫暗・紫斑：瘀血" size={9} />
        <text x={222} y={128} className="text-[11px] font-bold" fill={amber}>
          舌苔
        </text>
        <Wrap x={222} y={134} w={134} h={80} text="白：寒・表／黄：熱／厚い：邪が盛ん・食積／膩：痰湿／少苔・剥落：陰虚" size={9} />
      </g>
    </svg>
  );
}

export function PulsePositionsFigure() {
  return (
    <svg viewBox="0 0 360 220" role="img" aria-label="脈診の寸・関・尺と臓腑の配当" className="mx-auto w-full max-w-xl">
      {/* 前腕 */}
      <path d="M20,60 L340,60 L340,150 L20,150 Z" fill="#f8fafc" stroke="#cbd5e1" strokeWidth={2} />
      <text x={340} y={38} textAnchor="end" className="text-[9px]" fill={muted}>
        手の方向 →
      </text>
      <path d="M150,62 Q160,56 170,62" fill="none" stroke="#94a3b8" />
      <text x={186} y={52} className="text-[9px]" fill={muted}>
        橈骨茎状突起（関の目安）
      </text>
      <line x1={20} x2={340} y1={104} y2={104} stroke="#fca5a5" strokeWidth={3} />
      {[
        { x: 250, t: "寸" },
        { x: 170, t: "関" },
        { x: 90, t: "尺" },
      ].map((p) => (
        <g key={p.t}>
          <ellipse cx={p.x} cy={104} rx={26} ry={16} fill="white" stroke={navy} strokeWidth={2} />
          <text x={p.x} y={109} textAnchor="middle" className="text-[13px] font-bold" fill={navy}>
            {p.t}
          </text>
        </g>
      ))}
      <TableInline />
    </svg>
  );
}
function TableInline() {
  // 上の楕円（尺 x=90・関 x=170・寸 x=250）と列をそろえる
  const cols = [
    { x: 90, head: "尺", left: "腎・膀胱", right: "心包・三焦（命門）" },
    { x: 170, head: "関", left: "肝・胆", right: "脾・胃" },
    { x: 250, head: "寸", left: "心・小腸", right: "肺・大腸" },
  ];
  return (
    <g>
      <text x={20} y={194} className="text-[10px] font-bold" fill={ink}>
        左手
      </text>
      <text x={20} y={212} className="text-[10px] font-bold" fill={ink}>
        右手
      </text>
      {cols.map((c) => (
        <g key={c.head}>
          <text x={c.x} y={176} textAnchor="middle" className="text-[10px] font-bold" fill={navy}>
            {c.head}
          </text>
          <text x={c.x} y={194} textAnchor="middle" className="text-[9.5px]" fill={ink}>
            {c.left}
          </text>
          <text x={c.x} y={212} textAnchor="middle" className="text-[9.5px]" fill={ink}>
            {c.right}
          </text>
        </g>
      ))}
    </g>
  );
}

export function EightPrinciplesFigure() {
  const pairs = [
    { a: "表", b: "裏", q: "病の位置は浅いか深いか", c: navy },
    { a: "寒", b: "熱", q: "病の性質は冷えか熱か", c: red },
    { a: "虚", b: "実", q: "正気の不足か、邪の過剰か", c: teal },
  ];
  return (
    <svg viewBox="0 0 360 200" role="img" aria-label="八綱弁証" className="mx-auto w-full max-w-xl">
      {pairs.map((p, i) => {
        const y = 12 + i * 52;
        return (
          <g key={p.a}>
            <rect x={14} y={y} width={60} height={38} rx={8} fill={p.c} />
            <text x={44} y={y + 25} textAnchor="middle" className="text-[16px] font-bold" fill="white">
              {p.a}
            </text>
            <line x1={78} x2={186} y1={y + 19} y2={y + 19} stroke={p.c} strokeWidth={1.5} strokeDasharray="4 3" />
            <rect x={190} y={y} width={60} height={38} rx={8} fill="white" stroke={p.c} strokeWidth={2} />
            <text x={220} y={y + 25} textAnchor="middle" className="text-[16px] font-bold" fill={p.c}>
              {p.b}
            </text>
            <Wrap x={256} y={y + 4} w={100} h={34} text={p.q} size={9} />
          </g>
        );
      })}
      <rect x={14} y={168} width={236} height={26} rx={8} fill="#f1f5f9" stroke="#94a3b8" />
      <text x={132} y={185} textAnchor="middle" className="text-[11px] font-bold" fill={slate}>
        陰陽：上の6つをまとめる総綱
      </text>
      <Wrap x={256} y={164} w={100} h={34} text="表・熱・実は陽、裏・寒・虚は陰" size={9} />
    </svg>
  );
}

export function ZangfuPatternsFigure() {
  return (
    <TableFigure
      label="代表的な臓腑弁証"
      headers={["証", "主な症状", "舌・脈の例"]}
      widths={[78, 170, 92]}
      rowH={30}
      rows={[
        ["肝気鬱結", "イライラ・ため息・胸脇部の張り、情志で変動", "舌は正常〜やや暗／弦"],
        ["肝陽上亢", "頭痛・めまい・顔の紅潮・怒りっぽい", "紅舌／弦・数"],
        ["脾気虚", "食欲不振・食後の膨満・軟便・倦怠感", "淡・歯痕／弱"],
        ["心血虚", "動悸・不眠・夢が多い・顔色が白い", "淡／細"],
        ["肺気虚", "息切れ・弱い咳・汗をかきやすい・かぜをひきやすい", "淡／弱"],
        ["腎陽虚", "腰膝の冷えとだるさ・夜間尿・寒がり", "淡胖／沈遅"],
        ["腎陰虚", "腰膝のだるさ・ほてり・寝汗・耳鳴", "紅・少苔／細数"],
      ]}
      note="典型例の要約。実際は複数の証が重なることが多い"
    />
  );
}

export function HeadacheChannelsFigure() {
  return (
    <TileFigure
      label="頭痛の部位と経絡"
      cols={2}
      tileH={60}
      tiles={[
        { head: "前額部", sub: "陽明経", color: meridianMap.ST.color, body: "胃経・大腸経の領域" },
        { head: "側頭部", sub: "少陽経", color: meridianMap.GB.color, body: "胆経・三焦経の領域" },
        { head: "後頭部・項部", sub: "太陽経", color: meridianMap.BL.color, body: "膀胱経・小腸経の領域（督脈も通る）" },
        { head: "頭頂部", sub: "厥陰経", color: meridianMap.LR.color, body: "肝経（体内で頭頂に至り督脈と会す）" },
      ]}
      note="経絡弁証の代表例。危険な頭痛の除外が先"
    />
  );
}

// ------------------------------------------------------------
// 第8章 治療
// ------------------------------------------------------------
export function BiaoBenFigure() {
  return (
    <FlowFigure
      label="標治と本治の判断"
      steps={[
        { t: "① 危険徴候はないか", d: "あれば施術より医療機関の受診を優先する", color: red, side: { t: "受診を勧める", color: red } },
        { t: "② 急を要する症状か", d: "強い痛みなど、まず和らげるべき症状があるか", color: amber, side: { t: "急なれば標を治す", color: amber } },
        { t: "③ 背景の体質・病態は", d: "繰り返す原因（虚・寒・気滞など）に働きかける", color: navy, side: { t: "緩なれば本を治す", color: navy } },
        { t: "④ 組み合わせる", d: "多くの場合、局所の症状（標）と全身の状態（本）を同時に扱う（標本同治）", color: teal },
      ]}
    />
  );
}

export function TonifyDrainFigure() {
  return (
    <TableFigure
      label="代表的な手技の補瀉"
      headers={["方法", "補法", "瀉法"]}
      widths={[70, 135, 135]}
      rowH={30}
      rows={[
        ["迎随", "経の流れに沿って刺す", "経の流れに逆らって刺す"],
        ["徐疾", "ゆっくり刺入し、速く抜く", "速く刺入し、ゆっくり抜く"],
        ["呼吸", "呼気で刺入、吸気で抜鍼", "吸気で刺入、呼気で抜鍼"],
        ["開闔", "抜鍼後に鍼孔を閉じる", "抜鍼時に鍼孔を開く（閉じない）"],
        ["刺激量", "少なく・弱く・短く", "多く・強く・長く（一般的な傾向）"],
      ]}
      note="解釈や用い方は流派・教科書で異なる（要確認）"
    />
  );
}

export function NeedleMoxaFigure() {
  return (
    <TileFigure
      label="鍼と灸の特徴"
      cols={2}
      tileH={110}
      tiles={[
        { head: "鍼", sub: "刺す・置く・響かせる", color: navy, body: "深さ・方向・手技で刺激量を調整しやすい。痛み・こり・筋の緊張に用いやすい。注意：出血傾向・抗凝固薬、気胸、神経損傷、折鍼" },
        { head: "灸", sub: "温める", color: amber, body: "温めて巡りをよくする。冷え・虚証（虚寒）に用いやすい。透熱灸・知熱灸・隔物灸・棒灸・灸頭鍼など。注意：熱傷、感覚低下・糖尿病、顔面" },
      ]}
      note="どちらを選ぶかは、証（寒熱・虚実）・部位・患者さんの希望と安全で決める"
    />
  );
}

// ------------------------------------------------------------
// 第9〜10章 臨床・専門
// ------------------------------------------------------------
export function RedFlagFlowFigure() {
  return (
    <FlowFigure
      label="臨床の判断の流れ"
      steps={[
        { t: "① 危険徴候の確認", d: "神経症状・全身症状・外傷・関連痛を除外", color: red, side: { t: "当てはまれば受診", color: red } },
        { t: "② 鑑別の視点", d: "医師の診断状況を確認し、よく似た病態との違いを意識する", color: amber },
        { t: "③ 部位 → 経絡", d: "症状の部位・動作から関係する経脈・経筋を挙げる", color: navy },
        { t: "④ 全身 → 証 → 治則", d: "四診で証を立て、治則と配穴（局所＋遠隔＋背景）を決める", color: teal },
        { t: "⑤ 評価と記録", d: "痛み・可動域・生活・危険徴候を同じ方法で比べる", color: purple },
      ]}
    />
  );
}

export function NeuropathicPainFigure() {
  return (
    <TileFigure
      label="神経障害性疼痛の特徴"
      cols={2}
      tileH={70}
      tiles={[
        { head: "痛みの性質", color: red, body: "焼けるような・電気が走るような・刺すような痛み、しびれを伴う" },
        { head: "感覚の異常", color: amber, body: "アロディニア（触れるだけで痛い）、痛覚過敏、感覚の低下" },
        { head: "分布", color: navy, body: "神経の支配領域（皮膚分節・末梢神経の領域）に一致しやすい" },
        { head: "主な例", color: teal, body: "帯状疱疹後神経痛、糖尿病性神経障害、神経根症、手根管症候群" },
      ]}
      note="診断と薬物療法は医師が行う。鍼灸は医師の治療と並行する補完的な位置づけ"
    />
  );
}

export function ParkinsonFigure() {
  return (
    <TileFigure
      label="パーキンソン病の主な症状"
      cols={2}
      tileH={112}
      tiles={[
        { head: "運動症状", sub: "4大症状", color: navy, body: "静止時振戦（ふるえ）・筋強剛（こわばり）・無動／寡動（動きが少なく遅い）・姿勢保持障害（転びやすい）" },
        { head: "非運動症状", sub: "先に出ることも", color: purple, body: "便秘・嗅覚低下・睡眠障害（寝言や夢に合わせて動く など）・うつ・不安・起立性低血圧・痛み" },
      ]}
      note="薬の効き具合（オン・オフ）で症状が一日の中で変わる。施術は動きやすい時間帯に"
    />
  );
}

export function CareTeamFigure() {
  const members = [
    { t: "主治医", d: "診断・治療方針・同意", c: navy },
    { t: "看護師", d: "体調・服薬・生活", c: teal },
    { t: "理学・作業療法士", d: "運動・動作・環境", c: amber },
    { t: "言語聴覚士", d: "飲み込み・発話", c: purple },
    { t: "ケアマネジャー", d: "介護サービスの調整", c: slate },
    { t: "家族・介護者", d: "日々の様子", c: red },
  ];
  const cx = 180;
  const cy = 118;
  return (
    <svg viewBox="0 0 360 240" role="img" aria-label="多職種連携のイメージ" className="mx-auto w-full max-w-xl">
      {members.map((m, i) => {
        const a = (-90 + i * 60) * (Math.PI / 180);
        const x = cx + 128 * Math.cos(a);
        const y = cy + 86 * Math.sin(a);
        return (
          <g key={m.t}>
            <line x1={cx} y1={cy} x2={x} y2={y} stroke="#cbd5e1" strokeWidth={1.5} />
            <rect x={x - 54} y={y - 18} width={108} height={36} rx={9} fill="white" stroke={m.c} strokeWidth={1.6} />
            <text x={x} y={y - 3} textAnchor="middle" className="text-[10px] font-bold" fill={m.c}>
              {m.t}
            </text>
            <text x={x} y={y + 11} textAnchor="middle" className="text-[8px]" fill={muted}>
              {m.d}
            </text>
          </g>
        );
      })}
      <circle cx={cx} cy={cy} r={34} fill={navy} />
      <text x={cx} y={cy - 2} textAnchor="middle" className="text-[11px] font-bold" fill="white">
        患者さん
      </text>
      <text x={cx} y={cy + 13} textAnchor="middle" className="text-[8px]" fill="white">
        ＋鍼灸師
      </text>
    </svg>
  );
}
