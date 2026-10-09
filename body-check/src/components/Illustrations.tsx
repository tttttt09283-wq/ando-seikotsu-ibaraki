/**
 * やわらかい雰囲気のイラスト（画像ファイルを使わず、SVGという図形の記述で描いています）
 * 装飾用なので、読み上げソフトでは読まれないよう aria-hidden を付けています。
 */
import type { CheckId } from "@/types";

const SKIN = "#ffe2cc";
const BODY = "#1e3a5f";
const SHIRT = "#14a8b5";

function Frame({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <svg viewBox="0 0 120 120" className={className} aria-hidden="true" focusable="false">
      <circle cx="60" cy="60" r="56" fill="#d0f0f3" />
      <circle cx="96" cy="24" r="8" fill="#ffd866" opacity="0.9" />
      {children}
    </svg>
  );
}

const limb = { stroke: BODY, strokeWidth: 7, strokeLinecap: "round" as const, fill: "none" };
const arm = { ...limb, stroke: SHIRT };

function Face({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <circle cx={x} cy={y} r="11" fill={SKIN} />
      <path d={`M${x - 11} ${y - 2} q11 -14 22 0`} fill={BODY} />
      <circle cx={x - 4} cy={y + 2} r="1.3" fill={BODY} />
      <circle cx={x + 4} cy={y + 2} r="1.3" fill={BODY} />
      <path d={`M${x - 3} ${y + 6} q3 2.5 6 0`} stroke={BODY} strokeWidth="1.4" fill="none" strokeLinecap="round" />
      <circle cx={x - 7} cy={y + 5} r="2" fill="#ffb3a7" opacity="0.7" />
      <circle cx={x + 7} cy={y + 5} r="2" fill="#ffb3a7" opacity="0.7" />
    </g>
  );
}

export function BalanceIllustration({ className }: { className?: string }) {
  return (
    <Frame className={className}>
      <path d="M60 52 L60 76" stroke={SHIRT} strokeWidth="16" strokeLinecap="round" />
      <path d="M53 50 L32 58" {...arm} />
      <path d="M67 50 L88 58" {...arm} />
      <path d="M57 78 L57 104" {...limb} />
      <path d="M63 78 L74 86 L66 96" {...limb} />
      <Face x={60} y={34} />
      <path d="M40 108 h40" stroke="#63cbd5" strokeWidth="3" strokeLinecap="round" />
    </Frame>
  );
}

export function LegsIllustration({ className }: { className?: string }) {
  return (
    <Frame className={className}>
      {/* 椅子 */}
      <path d="M30 70 h26 M34 70 v34 M54 70 v34 M30 70 v-30" stroke="#a3e1e7" strokeWidth="5" strokeLinecap="round" fill="none" />
      <path d="M62 50 L56 72" stroke={SHIRT} strokeWidth="16" strokeLinecap="round" />
      <path d="M62 52 L82 62" {...arm} />
      <path d="M56 74 L76 80 L76 104" {...limb} />
      <Face x={66} y={34} />
      <path d="M90 36 l6 -6 M92 46 h8" stroke="#f5b301" strokeWidth="3" strokeLinecap="round" />
    </Frame>
  );
}

export function FlexibilityIllustration({ className }: { className?: string }) {
  return (
    <Frame className={className}>
      <path d="M66 60 L44 72" stroke={SHIRT} strokeWidth="16" strokeLinecap="round" />
      <path d="M66 62 L64 104" {...limb} />
      <path d="M70 62 L72 104" {...limb} />
      <path d="M46 74 L50 100" {...arm} />
      <Face x={38} y={84} />
      <path d="M30 108 h60" stroke="#63cbd5" strokeWidth="3" strokeLinecap="round" />
    </Frame>
  );
}

export function ShoulderIllustration({ className }: { className?: string }) {
  return (
    <Frame className={className}>
      <path d="M60 58 L60 80" stroke={SHIRT} strokeWidth="16" strokeLinecap="round" />
      <path d="M53 56 L46 20" {...arm} />
      <path d="M67 56 L74 20" {...arm} />
      <path d="M56 82 L54 106" {...limb} />
      <path d="M64 82 L66 106" {...limb} />
      <Face x={60} y={42} />
      <path d="M32 30 q-6 8 0 16 M88 30 q6 8 0 16" stroke="#f5b301" strokeWidth="3" fill="none" strokeLinecap="round" />
    </Frame>
  );
}

export function ConditionIllustration({ className }: { className?: string }) {
  return (
    <Frame className={className}>
      <circle cx="54" cy="52" r="18" fill="#ffd866" />
      <g stroke="#f5b301" strokeWidth="4" strokeLinecap="round">
        <path d="M54 24 v-6 M54 86 v-6 M26 52 h-6 M88 52 h-6 M34 32 l-4 -4 M74 32 l4 -4" />
      </g>
      <path d="M50 92 a14 14 0 0 1 4 -27 a18 18 0 0 1 34 4 a11 11 0 0 1 2 23 z" fill="#ffffff" />
      <path d="M70 80 c-4 -6 -12 -2 -8 4 l8 7 l8 -7 c4 -6 -4 -10 -8 -4" fill="#ff8a80" />
    </Frame>
  );
}

export function CheckIllustration({ id, className }: { id: CheckId; className?: string }) {
  switch (id) {
    case "balance":
      return <BalanceIllustration className={className} />;
    case "legs":
      return <LegsIllustration className={className} />;
    case "flexibility":
      return <FlexibilityIllustration className={className} />;
    case "shoulder":
      return <ShoulderIllustration className={className} />;
    case "condition":
      return <ConditionIllustration className={className} />;
  }
}

/** トップページのメインビジュアル */
export function HeroIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 240 180" className={className} aria-hidden="true" focusable="false">
      <ellipse cx="120" cy="164" rx="96" ry="10" fill="#a3e1e7" opacity="0.6" />
      {/* スコアメーター */}
      <path d="M40 120 a80 80 0 0 1 160 0" stroke="#d0f0f3" strokeWidth="18" fill="none" strokeLinecap="round" />
      <path d="M40 120 a80 80 0 0 1 128 -64" stroke="#14a8b5" strokeWidth="18" fill="none" strokeLinecap="round" />
      <circle cx="168" cy="56" r="7" fill="#ffc93c" stroke="#fff" strokeWidth="3" />
      {/* 人物 */}
      <path d="M120 96 L120 126" stroke="#14a8b5" strokeWidth="20" strokeLinecap="round" />
      <path d="M111 94 L92 64" stroke="#14a8b5" strokeWidth="8" strokeLinecap="round" />
      <path d="M129 94 L150 70" stroke="#14a8b5" strokeWidth="8" strokeLinecap="round" />
      <path d="M115 130 L110 160 M125 130 L136 158" stroke="#1e3a5f" strokeWidth="8" strokeLinecap="round" />
      <circle cx="120" cy="74" r="15" fill="#ffe2cc" />
      <path d="M105 72 q15 -20 30 0" fill="#1e3a5f" />
      <circle cx="115" cy="76" r="1.8" fill="#1e3a5f" />
      <circle cx="125" cy="76" r="1.8" fill="#1e3a5f" />
      <path d="M115 82 q5 4 10 0" stroke="#1e3a5f" strokeWidth="2" fill="none" strokeLinecap="round" />
      {/* きらきら */}
      <path d="M58 40 l3 8 l8 3 l-8 3 l-3 8 l-3 -8 l-8 -3 l8 -3 z" fill="#ffc93c" />
      <path d="M196 98 l2 5 l5 2 l-5 2 l-2 5 l-2 -5 l-5 -2 l5 -2 z" fill="#ffc93c" />
      <circle cx="78" cy="22" r="4" fill="#63cbd5" />
    </svg>
  );
}
