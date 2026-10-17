"use client";

/**
 * 4つのチェック（カラダ年齢・AI姿勢・骨格タイプ・体幹）で共通の部品
 */
import Link from "next/link";
import { siteConfig } from "@/config/site";
import { buildBookingUrl } from "@/lib/booking";
import { useIsDemo } from "@/lib/useDemo";
import { buttonStyles, cx } from "@/components/styles";

/** 画面上部：メニューへ戻るリンク＋チェック名 */
export function ToolHeader({ icon, title, sub }: { icon: string; title: string; sub?: string }) {
  return (
    <header className="bg-gradient-to-b from-brand-500 to-brand-600 px-5 pb-6 pt-4 text-white">
      <Link href="/" className="text-sm font-bold text-white/90 underline-offset-4 hover:underline">
        ← メニューに戻る
      </Link>
      <p className="mt-3 text-4xl" aria-hidden="true">
        {icon}
      </p>
      <h1 className="mt-1 text-2xl font-black leading-snug">{title}</h1>
      {sub && <p className="mt-1 text-sm font-bold text-white/90">{sub}</p>}
    </header>
  );
}

/**
 * 結果画面の最後：相談・予約ボタン（デモ中は導入の案内）
 * summary は予約フォームへ引き継ぐ結果の要約（個人情報は含めない）
 */
export function ToolResultCta({ summary, lead }: { summary: string; lead: string }) {
  const demo = useIsDemo();
  if (demo) {
    return (
      <section className="rounded-[2rem] border-2 border-dashed border-sun-400 bg-white p-6 text-center">
        <p className="text-xs font-bold tracking-widest text-sun-500">DEMO</p>
        <h2 className="mt-1 text-xl font-black leading-snug">実際の院では、ここから WEB予約へ進みます</h2>
        <p className="mt-3 text-sm leading-relaxed text-slate-700">チェック結果は予約フォームに自動で引き継がれます。</p>
        <Link href="/for-clinics" className={cx(buttonStyles.accent, "mt-5")}>
          導入について見る
        </Link>
      </section>
    );
  }
  const url = siteConfig.bookingUrl ? buildBookingUrl(siteConfig.bookingUrl, summary) : null;
  return (
    <section className="rounded-[2rem] bg-gradient-to-br from-navy-900 to-brand-700 p-6 text-center text-white">
      <p className="text-3xl" aria-hidden="true">
        🤝
      </p>
      <h2 className="mt-1 text-xl font-black leading-snug">自分の身体を、もっと詳しく知りたい方へ</h2>
      <p className="mt-3 text-sm leading-relaxed text-white/85">{lead}</p>
      {url ? (
        <>
          <a href={url} target="_blank" rel="noopener noreferrer" className={cx(buttonStyles.accent, "mt-5")}>
            この結果で相談・予約する
            <span className="sr-only">（新しいタブで開きます）</span>
          </a>
          <p className="mt-2 text-xs text-white/75">チェック結果は予約フォームに引き継がれます／ご予約は任意です</p>
        </>
      ) : (
        <p className="mt-4 rounded-2xl bg-white/15 p-3 text-sm font-bold">WEB予約は現在準備中です。</p>
      )}
    </section>
  );
}

/** 結果画面の下：ほかのチェックへ */
export function OtherChecks({ current }: { current: string }) {
  const items = [
    { href: "/check", label: "カラダ年齢チェック", icon: "🧍" },
    { href: "/posture", label: "AI姿勢チェック", icon: "📸" },
    { href: "/skeleton", label: "骨格タイプチェック", icon: "🧬" },
    { href: "/core", label: "体幹チェック", icon: "💪" },
  ].filter((i) => i.href !== current);
  return (
    <section>
      <h2 className="text-center text-sm font-black text-navy-700">ほかのチェックもやってみる</h2>
      <ul className="mt-3 grid grid-cols-3 gap-2">
        {items.map((i) => (
          <li key={i.href}>
            <Link href={i.href} className="flex h-full flex-col items-center gap-1 rounded-2xl bg-white p-3 text-center text-xs font-bold text-navy-900">
              <span className="text-2xl" aria-hidden="true">
                {i.icon}
              </span>
              {i.label}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function Disclaimer({ children }: { children?: React.ReactNode }) {
  return (
    <p className="rounded-2xl bg-white/70 p-4 text-xs leading-relaxed text-slate-600">
      {children ?? "本チェックは医療診断ではありません。身体の状態を知るための目安です。痛みや気になる症状がある場合は、専門家にご相談ください。"}
    </p>
  );
}
