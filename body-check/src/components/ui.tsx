/**
 * 何度も使う小さな部品（ボタン・カード・選択肢・進捗バーなど）
 */
"use client";

import Link from "next/link";
import { siteConfig } from "@/config/site";

export function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

export const buttonStyles = {
  primary:
    "inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-full bg-brand-600 px-6 py-3 text-lg font-bold text-white shadow-[0_6px_0_0_var(--color-brand-800)] transition active:translate-y-1 active:shadow-[0_2px_0_0_var(--color-brand-800)] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600 disabled:shadow-none disabled:active:translate-y-0",
  accent:
    "inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-full bg-sun-400 px-6 py-3 text-lg font-black text-navy-900 shadow-[0_6px_0_0_var(--color-sun-500)] transition active:translate-y-1 active:shadow-[0_2px_0_0_var(--color-sun-500)]",
  secondary:
    "inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full border-2 border-brand-600 bg-white px-5 py-2 text-base font-bold text-brand-700 transition active:bg-brand-50",
  ghost:
    "inline-flex min-h-11 items-center justify-center gap-1 rounded-full px-4 py-2 text-sm font-bold text-navy-700 underline-offset-4 hover:underline active:bg-brand-100",
};

export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cx("rounded-3xl bg-white p-5 shadow-[0_4px_20px_rgba(30,58,95,0.08)]", className)}>{children}</div>;
}

export function ProgressBar({ current, total, label }: { current: number; total: number; label: string }) {
  const percent = Math.round((current / total) * 100);
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs font-bold text-navy-700">
        <span>{label}</span>
        <span>
          {current} / {total}
        </span>
      </div>
      <div
        className="h-3 w-full overflow-hidden rounded-full bg-white"
        role="progressbar"
        aria-label="チェックの進み具合"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={current}
        aria-valuetext={`${total}ステップ中${current}ステップ目`}
      >
        <div
          className="h-full rounded-full bg-gradient-to-r from-brand-400 to-brand-600 transition-[width] duration-500"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

/**
 * 大きなカード型の選択肢（中身はラジオボタン／チェックボックスなので、読み上げソフトやキーボードでも操作できます）
 */
export function OptionCard({
  type,
  name,
  value,
  checked,
  onChange,
  label,
  description,
  compact,
}: {
  type: "radio" | "checkbox";
  name: string;
  value: string;
  checked: boolean;
  onChange: (value: string) => void;
  label: string;
  description?: string;
  compact?: boolean;
}) {
  return (
    <label
      className={cx(
        "relative flex cursor-pointer items-center gap-3 rounded-2xl border-2 bg-white font-bold transition",
        compact ? "min-h-12 px-3 py-2 text-base" : "min-h-14 px-4 py-3 text-lg",
        checked ? "border-brand-500 bg-brand-50 text-brand-800 shadow-[0_0_0_3px_var(--color-brand-100)]" : "border-slate-200 text-navy-900",
        "has-[:focus-visible]:outline has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-sun-500",
      )}
    >
      <input
        type={type}
        name={name}
        value={value}
        checked={checked}
        onChange={() => onChange(value)}
        className="peer sr-only"
      />
      <span
        aria-hidden="true"
        className={cx(
          "flex size-6 shrink-0 items-center justify-center border-2 transition",
          type === "radio" ? "rounded-full" : "rounded-md",
          checked ? "border-brand-600 bg-brand-600" : "border-slate-300 bg-white",
        )}
      >
        {checked && (
          <svg viewBox="0 0 16 16" className="size-4 text-white">
            <path d="M3 8.5 L6.5 12 L13 4.5" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      <span className="leading-snug">
        {label}
        {description && <span className="mt-0.5 block text-sm font-medium text-slate-600">{description}</span>}
      </span>
    </label>
  );
}

/** 医療診断ではないことの注意書き */
export function MedicalDisclaimer({ className }: { className?: string }) {
  return (
    <p className={cx("rounded-2xl bg-white/70 p-4 text-sm leading-relaxed text-slate-700", className)}>
      ※本チェックは医療診断ではありません。身体機能やコンディションを知るための簡易セルフチェックです。
    </p>
  );
}

export function Footer() {
  return (
    <footer className="mt-auto px-5 pb-8 pt-6 text-center text-xs text-slate-600">
      <p>
        <Link href="/privacy" className="underline underline-offset-4">
          プライバシーと利用目的について
        </Link>
      </p>
      <p className="mt-2">運営：{siteConfig.clinicName}</p>
    </footer>
  );
}

export function Spinner({ label = "読み込み中…" }: { label?: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 py-24" role="status" aria-live="polite">
      <div className="size-12 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600" aria-hidden="true" />
      <p className="text-sm font-bold text-navy-700">{label}</p>
    </div>
  );
}
