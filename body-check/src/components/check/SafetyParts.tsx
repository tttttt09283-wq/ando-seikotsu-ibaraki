"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { buttonStyles, Card, OptionCard } from "@/components/ui";

export const SAFETY_ITEMS = [
  "痛みが出る動作は、無理に行わないでください。",
  "転倒の危険がある場合は、実施しないでください。",
  "椅子は、キャスター（車輪）のない安定したものを使ってください。",
  "運動を制限されている方は、事前に医師などの医療者に確認してください。",
  "不安がある項目は、スキップできます（スキップした項目は採点に含めません）。",
];

export function SafetyContent({ agreed, onAgreeChange, onStop }: { agreed: boolean; onAgreeChange: (v: boolean) => void; onStop: () => void }) {
  return (
    <div className="space-y-5">
      <Card>
        <ul className="space-y-3">
          {SAFETY_ITEMS.map((t) => (
            <li key={t} className="flex gap-3 text-base leading-relaxed">
              <span aria-hidden="true" className="mt-0.5 text-lg text-brand-600">
                ✔
              </span>
              <span>{t}</span>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="border-2 border-red-200 bg-red-50">
        <h2 className="text-base font-black text-red-800">次のような場合は、チェックを行わないでください</h2>
        <p className="mt-2 text-base leading-relaxed text-red-900">
          強い痛み、急な麻痺（手足が動かしにくい・しびれ）、息苦しさ、胸の痛み、めまいなどがある場合は、チェックを中止して医療機関にご相談ください。
        </p>
        <button type="button" onClick={onStop} className="mt-3 min-h-12 w-full rounded-full border-2 border-red-300 bg-white font-bold text-red-800">
          当てはまるので中止する
        </button>
      </Card>

      <OptionCard
        type="checkbox"
        name="safety"
        value="agree"
        checked={agreed}
        onChange={() => onAgreeChange(!agreed)}
        label="上記の注意事項を確認しました"
      />
    </div>
  );
}

/** チェックを中止したときの案内画面 */
export function StopNotice({ onResume }: { onResume: () => void }) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    window.scrollTo({ top: 0 });
    headingRef.current?.focus();
  }, []);

  return (
    <main className="flex flex-1 animate-rise-in flex-col gap-5 px-5 py-8">
      <div className="text-center">
        <p className="text-5xl" aria-hidden="true">
          🏥
        </p>
        <h1 ref={headingRef} tabIndex={-1} className="mt-3 text-2xl font-black outline-none">
          チェックを中止しましょう
        </h1>
      </div>
      <Card className="space-y-3 text-base leading-relaxed">
        <p>
          強い痛み、急な麻痺やしびれ、息苦しさ、胸の痛みなどがある場合は、
          <strong>無理をせず、医療機関へご相談ください。</strong>
        </p>
        <p className="rounded-2xl bg-red-50 p-3 font-bold text-red-800">
          命に関わるような強い症状があるときは、迷わず <a href="tel:119" className="underline">119番</a> に連絡してください。
        </p>
        <p className="text-sm text-slate-700">
          救急車を呼ぶか迷うときは、救急安心センター（<a href="tel:%237119" className="underline">#7119</a>
          ）に電話で相談できます。
        </p>
      </Card>
      <Link href="/" className={buttonStyles.primary}>
        トップページに戻る
      </Link>
      <button type="button" onClick={onResume} className={buttonStyles.secondary}>
        症状がないので、チェックに戻る
      </button>
    </main>
  );
}

/** 匿名統計への同意（NEXT_PUBLIC_STATS_ENABLED=true のときだけ表示） */
export function ConsentContent() {
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-4">
      <Card className="space-y-3 text-base leading-relaxed">
        <p>サービス改善のため、チェック結果を<strong>個人が特定できない形</strong>で集計させてください。</p>
        <div>
          <h2 className="font-black">利用する情報</h2>
          <p className="text-sm text-slate-700">回答日時・年代・気になる症状・各チェックの結果・スコア・ランク・予約ボタンを押したかどうか</p>
        </div>
        <div>
          <h2 className="font-black">利用目的</h2>
          <p className="text-sm text-slate-700">サービスの改善、利用状況の把握（例：年代別の利用者数、平均スコアなど）</p>
        </div>
        <p className="text-sm text-slate-700">お名前・電話番号・メールアドレス・LINEのアカウント情報は取得しません。</p>
        <button type="button" className="text-sm font-bold text-brand-700 underline underline-offset-4" onClick={() => setOpen(!open)} aria-expanded={open}>
          {open ? "閉じる" : "もっと詳しく"}
        </button>
        {open && (
          <p className="text-sm text-slate-700">
            同意しない場合も、チェックはすべてご利用いただけます。その場合、結果はお使いのスマホの中だけで計算・表示され、外部には送信されません。詳しくは
            <Link href="/privacy" className="underline">
              プライバシーと利用目的について
            </Link>
            をご覧ください。
          </p>
        )}
      </Card>
    </div>
  );
}
