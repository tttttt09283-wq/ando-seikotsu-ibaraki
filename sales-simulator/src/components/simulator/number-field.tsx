"use client";

import { memo, useEffect, useId, useState } from "react";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { clamp, formatInt, formatOneDecimal, toSafeNumber } from "@/lib/sim";
import { cn } from "@/lib/utils";

export type Accent = "navy" | "judo" | "acu" | "self";

const accentClasses: Record<Accent, { range: string; thumb: string }> = {
  navy: { range: "bg-navy-700", thumb: "border-navy-700" },
  judo: { range: "bg-judo", thumb: "border-judo" },
  acu: { range: "bg-acu", thumb: "border-acu" },
  self: { range: "bg-self", thumb: "border-self" },
};

interface NumberFieldProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  unit: string;
  /** 入力できる最大値（率なら100）。未指定なら上限なし */
  max?: number;
  /** スライダーの最大値（入力欄はこれを超えてもよい） */
  sliderMax: number;
  step?: number;
  /** 小数第1位まで許可 */
  decimal?: boolean;
  accent?: Accent;
  hint?: string;
  disabled?: boolean;
  /** スライダーを表示しない */
  noSlider?: boolean;
}

function display(value: number, decimal: boolean) {
  return decimal ? formatOneDecimal(value) : formatInt(value);
}

/** 数値入力＋スライダー（双方向に同期） */
export const NumberField = memo(function NumberField({
  label,
  value,
  onChange,
  unit,
  max,
  sliderMax,
  step = 1,
  decimal = false,
  accent = "navy",
  hint,
  disabled,
  noSlider,
}: NumberFieldProps) {
  const id = useId();
  const [focused, setFocused] = useState(false);
  const [text, setText] = useState(() => display(value, decimal));

  // 外部（スライダー・リセット・パターン切替）から値が変わったら表示を合わせる
  useEffect(() => {
    if (!focused) setText(display(value, decimal));
  }, [value, decimal, focused]);

  const normalize = (raw: number) => {
    const limited = clamp(raw, 0, max ?? Number.MAX_SAFE_INTEGER);
    return decimal ? Math.round(limited * 10) / 10 : Math.round(limited);
  };

  const handleText = (raw: string) => {
    setText(raw);
    // 空欄・入力途中（"1." など）でも安全に 0 / 数値として扱い、即時に再計算する
    onChange(normalize(toSafeNumber(raw)));
  };

  const sliderValue = Math.min(value, sliderMax);
  const a = accentClasses[accent];

  return (
    <div className={cn("space-y-1.5", disabled && "opacity-60")}>
      <div className="flex items-end justify-between gap-3">
        <label htmlFor={id} className="text-sm font-semibold text-slate-700">
          {label}
        </label>
        <div className="relative w-36 shrink-0 sm:w-40">
          <Input
            id={id}
            inputMode={decimal ? "decimal" : "numeric"}
            autoComplete="off"
            disabled={disabled}
            value={text}
            onFocus={(e) => {
              setFocused(true);
              setText(decimal ? String(value) : String(Math.round(value)));
              requestAnimationFrame(() => e.target.select());
            }}
            onBlur={() => {
              setFocused(false);
              setText(display(value, decimal));
            }}
            onChange={(e) => handleText(e.target.value)}
            className="num pr-9 text-right text-base font-bold"
            aria-describedby={hint ? `${id}-hint` : undefined}
          />
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-semibold text-slate-500">
            {unit}
          </span>
        </div>
      </div>
      {!noSlider && (
        <Slider
          aria-label={label}
          disabled={disabled}
          min={0}
          max={sliderMax}
          step={step}
          value={[sliderValue]}
          onValueChange={([v]) => onChange(normalize(v))}
          rangeClassName={a.range}
          thumbClassName={a.thumb}
        />
      )}
      {hint && (
        <p id={`${id}-hint`} className="text-xs text-slate-500">
          {hint}
        </p>
      )}
    </div>
  );
});

/** 自動計算の結果表示（入力不可） */
export function ComputedRow({
  label,
  value,
  unit,
  strong,
  className,
}: {
  label: string;
  value: string;
  unit?: string;
  strong?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex items-baseline justify-between gap-3 py-1.5", className)}>
      <span className={cn("text-sm text-slate-600", strong && "font-bold text-slate-800")}>{label}</span>
      <span className={cn("num text-right font-bold text-slate-800", strong ? "text-xl" : "text-base")}>
        {value}
        {unit && <span className="ml-0.5 text-xs font-semibold text-slate-500">{unit}</span>}
      </span>
    </div>
  );
}
