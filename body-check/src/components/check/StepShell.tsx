"use client";

/**
 * 各ステップ共通の枠（進捗バー・見出し・戻る/次へボタン・スキップ）
 */
import { useEffect, useRef } from "react";
import { buttonStyles, cx, ProgressBar } from "@/components/ui";

export function StepShell({
  stepNumber,
  totalSteps,
  progressLabel,
  badge,
  title,
  illustration,
  lead,
  children,
  onBack,
  onNext,
  nextLabel = "次へ",
  error,
  onSkip,
  skipLabel = "この項目をスキップする",
  onStop,
  hideNext,
  onInput,
}: {
  stepNumber: number;
  totalSteps: number;
  progressLabel: string;
  badge?: string;
  title: string;
  illustration?: React.ReactNode;
  lead?: React.ReactNode;
  children: React.ReactNode;
  onBack: () => void;
  onNext?: () => void;
  nextLabel?: string;
  error?: string | null;
  onSkip?: () => void;
  skipLabel?: string;
  onStop?: () => void;
  hideNext?: boolean;
  /** 入力内容が変わったとき（エラー表示を消すため） */
  onInput?: () => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);

  // 画面が切り替わったら一番上に戻し、見出しにフォーカスを移す（読み上げソフト利用者のため）
  useEffect(() => {
    window.scrollTo({ top: 0 });
    headingRef.current?.focus({ preventScroll: true });
  }, [title]);

  // 入力エラーが出たら、エラー文が見える位置までスクロールする
  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ block: "center" });
  }, [error]);

  return (
    <main className="flex flex-1 flex-col">
      <div className="sticky top-0 z-10 bg-brand-50/95 px-5 pb-3 pt-4 backdrop-blur">
        <ProgressBar current={stepNumber} total={totalSteps} label={progressLabel} />
      </div>

      <div key={title} className="flex-1 animate-rise-in space-y-5 px-5 pb-40 pt-2">
        <header className="text-center">
          {illustration && <div className="mx-auto mb-2 w-28">{illustration}</div>}
          {badge && (
            <p className="inline-block rounded-full bg-navy-900 px-4 py-1 text-xs font-bold tracking-widest text-sun-300">
              {badge}
            </p>
          )}
          <h1 ref={headingRef} tabIndex={-1} className="mt-2 text-2xl font-black leading-snug outline-none">
            {title}
          </h1>
          {lead && <div className="mt-3 text-base leading-relaxed text-slate-700">{lead}</div>}
        </header>

        <div className="space-y-5" onChange={onInput}>
          {children}
        </div>

        {error && (
          <p ref={errorRef} role="alert" className="rounded-2xl border-2 border-red-200 bg-red-50 p-3 text-center text-sm font-bold text-red-700">
            {error}
          </p>
        )}

        {(onSkip || onStop) && (
          <div className="flex flex-col items-center gap-1 pt-2">
            {onSkip && (
              <button type="button" onClick={onSkip} className={buttonStyles.ghost}>
                {skipLabel}
              </button>
            )}
            {onStop && (
              <button type="button" onClick={onStop} className="inline-flex min-h-11 items-center justify-center rounded-full px-4 py-2 text-sm font-bold text-red-700 underline-offset-4 hover:underline active:bg-red-50">
                体調に異変を感じたら（中止する）
              </button>
            )}
          </div>
        )}
      </div>

      {/* 画面下に固定した操作ボタン（親指で押しやすい位置） */}
      <nav
        aria-label="ページ移動"
        className="fixed inset-x-0 bottom-0 z-20 border-t border-brand-100 bg-white/95 backdrop-blur"
      >
        <div className="mx-auto flex max-w-md gap-3 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
          <button type="button" onClick={onBack} className="inline-flex min-h-14 w-24 shrink-0 items-center justify-center gap-1 rounded-full border-2 border-brand-600 bg-white px-3 text-base font-bold text-brand-700 transition active:bg-brand-50">
            <span aria-hidden="true">◀</span> 戻る
          </button>
          {!hideNext && onNext && (
            <button type="button" onClick={onNext} className={cx(buttonStyles.primary, "min-w-0 flex-1")}>
              {nextLabel}
            </button>
          )}
        </div>
      </nav>
    </main>
  );
}
