"use client";

/**
 * 結果画面の「来院特典」と「友達・家族にシェア」
 * ・特典：結果画面を受付で見せてもらう。特典コード（紹介コード）とチェック日で、院のスタッフが確認できます
 * ・シェア：LINEで送る／ほかのアプリで送る／URLをコピー。シェアされた人は、LINE友だち追加をしてからチェックを始めます
 */
import { useState } from "react";
import { siteConfig } from "@/config/site";
import { Card, cx } from "@/components/ui";
import { buttonStyles } from "@/components/styles";
import { shareCodeOf, type CheckState } from "@/lib/storage";
import { sendTally, shareUrlFor } from "@/lib/tally";
import type { BodyAgeResult } from "@/lib/bodyAge";

export function BenefitCard({ state, date }: { state: CheckState; date: string }) {
  const code = shareCodeOf(state.sessionId).slice(0, 6).toUpperCase();
  return (
    <section aria-labelledby="benefit-heading" className="rounded-[2rem] border-2 border-sun-400 bg-sun-100 p-5 text-navy-900">
      <p className="text-xs font-bold tracking-widest text-sun-500">PRESENT</p>
      <h2 id="benefit-heading" className="mt-1 text-xl font-black">
        🎁 {state.ref ? "ご紹介の" : ""}{siteConfig.benefit.title}
      </h2>
      <p className="mt-2 text-[15px] font-bold leading-relaxed">{siteConfig.benefit.text}</p>
      <div className="mt-3 rounded-2xl bg-white p-3 text-center">
        <p className="text-xs font-bold text-slate-600">受付でこの画面をお見せください</p>
        <p className="mt-1 text-sm font-black">
          {state.profile.nickname ? `${state.profile.nickname} さん・` : ""}チェック日 {date}
        </p>
        <p className="mt-1 font-black tracking-[0.3em] text-brand-700" aria-label={`特典コード ${code}`}>
          特典コード {code}
        </p>
      </div>
      {siteConfig.benefit.note && <p className="mt-2 text-xs text-slate-700">{siteConfig.benefit.note}</p>}
    </section>
  );
}

/** シェアする文章（ニックネームがあれば「〇〇さんの」） */
export function buildShareText(nickname: string | null | undefined, bodyAge: BodyAgeResult | null, url: string): string {
  const who = nickname ? `${nickname}さんの` : "わたしの";
  const head = bodyAge ? `${who}姿勢・体幹年齢は「${bodyAge.age}歳」でした！` : `${who}カラダ年齢チェック、やってみました！`;
  return `${head}\nあなたの姿勢・体幹は何歳？\n片足立ち・プランク・前屈・スクワットで、スマホで約3分・無料でチェックできます👇\n${url}`;
}

export function ShareSection({ state, bodyAge }: { state: CheckState; bodyAge: BodyAgeResult | null }) {
  const [copied, setCopied] = useState(false);
  const url = shareUrlFor(shareCodeOf(state.sessionId));
  const text = buildShareText(state.profile.nickname, bodyAge, url);
  const counted = () => void sendTally("share", state);
  const canNativeShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  return (
    <Card>
      <h2 className="text-xl font-black">📣 結果を友達・家族にシェア</h2>
      <p className="mt-1 text-sm leading-relaxed text-slate-700">
        大切な人の姿勢・体幹年齢も、一緒にチェックしてみませんか？シェアされた方は、LINEの友だち追加をしてからチェックできます。
        {siteConfig.benefit.title ? "シェアから来院された方にも特典があります。" : ""}
      </p>
      <div className="mt-4 space-y-3">
        <a
          href={`https://line.me/R/share?text=${encodeURIComponent(text)}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={counted}
          className={cx(buttonStyles.primary, "!bg-[#06C755]")}
        >
          LINEで送る
          <span className="sr-only">（新しいタブで開きます）</span>
        </a>
        {canNativeShare && (
          <button
            type="button"
            className={buttonStyles.secondary}
            onClick={() => {
              counted();
              void navigator.share({ text }).catch(() => {});
            }}
          >
            ほかのアプリで送る
          </button>
        )}
        <button
          type="button"
          className={buttonStyles.ghost + " w-full"}
          onClick={() => {
            counted();
            navigator.clipboard?.writeText(text).then(() => setCopied(true)).catch(() => setCopied(false));
          }}
        >
          {copied ? "✓ コピーしました" : "文章とURLをコピー"}
        </button>
      </div>
    </Card>
  );
}
