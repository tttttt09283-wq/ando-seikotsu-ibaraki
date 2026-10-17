/**
 * ボタンなどの見た目（クラス名）の共通定義。
 * サーバー側のページ（販売ページなど）からも使えるよう、"use client" のないファイルに置いています。
 */
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
