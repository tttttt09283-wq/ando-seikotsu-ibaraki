"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { AGE_GROUPS, CHECK_META, MAX_POINTS_PER_CHECK } from "@/config/checks";
import { RANKS, SCORING_CONFIG } from "@/config/scoring";
import { siteConfig } from "@/config/site";
import { CheckIllustration } from "@/components/Illustrations";
import { buttonStyles, Card, cx, Footer, MedicalDisclaimer, Spinner } from "@/components/ui";
import { buildResultMessages, calculateResult } from "@/lib/scoring";
import { recommendSelfCare } from "@/lib/selfcare";
import { buildCompletionEvent, sendStats } from "@/lib/stats";
import { clearState, loadState, saveState, type CheckState } from "@/lib/storage";
import type { CheckId, ScoreResult } from "@/types";
import { RadarScoreChart } from "./RadarScoreChart";
import { SelfCareCard } from "./SelfCareCard";

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
}

export function ResultView() {
  const router = useRouter();
  const [state, setState] = useState<CheckState | null | undefined>(undefined);
  const sentRef = useRef(false);

  useEffect(() => {
    setState(loadState());
  }, []);

  const result = useMemo(() => (state?.completedAt ? calculateResult(state.answers) : null), [state]);

  // 同意がある場合のみ、匿名統計を1回だけ送信
  useEffect(() => {
    if (!state || !result || sentRef.current) return;
    if (!siteConfig.statsEnabled || state.consent !== "granted" || state.statsSent) return;
    sentRef.current = true;
    sendStats(buildCompletionEvent(state.sessionId, state.profile.ageGroup, state.profile.symptoms, result)).then((ok) => {
      if (ok) setState((prev) => (prev ? saveState({ ...prev, statsSent: true }) : prev));
    });
  }, [state, result]);

  if (state === undefined) return <Spinner label="結果を準備しています…" />;

  if (!state?.completedAt || !result) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-5 px-5 py-16 text-center">
        <p className="text-5xl" aria-hidden="true">
          🔍
        </p>
        <h1 className="text-2xl font-black">結果が見つかりませんでした</h1>
        <p className="text-base text-slate-700">チェックが完了していないか、保存期間（7日間）が過ぎた可能性があります。</p>
        <Link href="/" className={buttonStyles.primary}>
          トップページへ
        </Link>
      </main>
    );
  }

  const restart = () => {
    clearState();
    router.push("/check");
  };

  const onBookingClick = () => {
    if (!state.bookingClicked) setState(saveState({ ...state, bookingClicked: true }));
    if (siteConfig.statsEnabled && state.consent === "granted") {
      void sendStats({ type: "booking_click", sessionId: state.sessionId });
    }
  };

  return (
    <main className="flex flex-1 flex-col">
      <div className="space-y-6 px-5 pb-6 pt-6">
        <ScoreCard result={result} date={formatDate(state.completedAt)} ageLabel={AGE_GROUPS.find((a) => a.id === state.profile.ageGroup)?.label} />
        <Messages result={result} />
        <ItemList result={result} />
        <StrengthsAndImprovements result={result} />
        <SelfCareSection result={result} />
        <BookingSection onClick={onBookingClick} />

        <div className="space-y-3 pt-2">
          <button type="button" onClick={restart} className={buttonStyles.secondary}>
            もう一度チェックする
          </button>
          <Link href="/" className={cx(buttonStyles.ghost, "w-full")}>
            トップページへ
          </Link>
        </div>

        <ScoreDisclaimer />
      </div>
      <Footer />
    </main>
  );
}

// ---------------------------------------------------------------------------

function ScoreGauge({ total }: { total: number }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative mx-auto size-40">
      <svg viewBox="0 0 120 120" className="size-full -rotate-90" aria-hidden="true">
        <circle cx="60" cy="60" r={r} fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="10" />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke="#ffd866"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - total / 100)}
          className="transition-[stroke-dashoffset] duration-1000"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-6xl font-black leading-none tabular-nums">{total}</span>
        <span className="text-sm font-bold">/ 100点</span>
      </div>
    </div>
  );
}

/** スクリーンショットしたくなる、メインの結果カード */
function ScoreCard({ result, date, ageLabel }: { result: ScoreResult; date: string; ageLabel?: string }) {
  const rank = RANKS.find((r) => r.id === result.rank);
  return (
    <section
      aria-labelledby="score-heading"
      className="relative animate-rise-in overflow-hidden rounded-[2rem] bg-gradient-to-br from-brand-500 via-brand-600 to-navy-900 p-6 text-white shadow-[0_12px_30px_rgba(14,136,147,0.35)]"
    >
      <div aria-hidden="true" className="absolute -right-12 -top-12 size-44 rounded-full bg-white/10" />
      <div aria-hidden="true" className="absolute -bottom-16 -left-10 size-40 rounded-full bg-white/10" />

      <div className="relative flex items-start justify-between gap-2 text-[11px] font-bold">
        <span>{siteConfig.serviceName}</span>
        <span className="whitespace-nowrap">{date}</span>
      </div>
      <h1 id="score-heading" className="relative mt-4 text-center text-base font-bold tracking-wider">
        カラダコンディションスコア
      </h1>

      {result.total === null ? (
        <p className="relative my-8 text-center text-2xl font-black">未測定</p>
      ) : (
        <div className="relative mt-3">
          <ScoreGauge total={result.total} />
          {rank && (
            <div className="mt-3 flex flex-col items-center">
              <span
                className="animate-pop-in flex size-20 items-center justify-center rounded-full border-4 border-white text-4xl font-black shadow-lg"
                style={{ background: rank.id === "S" ? "linear-gradient(135deg,#ffd866,#f5b301)" : "#ffffff", color: rank.id === "S" ? "#1e3a5f" : rank.color }}
                aria-hidden="true"
              >
                {rank.id}
              </span>
              <p className="mt-2 text-2xl font-black">
                <span className="sr-only">{rank.title}：</span>
                {rank.message}
              </p>
            </div>
          )}
        </div>
      )}

      {result.insufficient && (
        <p role="note" className="relative mt-4 rounded-2xl bg-white/15 p-3 text-center text-sm font-bold">
          ⚠️ 参考情報が不足しています
          <span className="block text-xs font-medium">
            （測定できた項目：5項目中{result.answeredCount}項目。{SCORING_CONFIG.minAnsweredForReliable}項目以上の測定で、より参考になる結果になります）
          </span>
        </p>
      )}

      {result.total !== null && (
        <div className="relative mt-4 rounded-3xl bg-white/10 px-1 py-2">
          <RadarScoreChart items={result.items} light />
        </div>
      )}

      <p className="relative mt-3 text-center text-[11px] opacity-80">
        {ageLabel ? `${ageLabel}・` : ""}
        {siteConfig.clinicName}
      </p>
    </section>
  );
}

function Messages({ result }: { result: ScoreResult }) {
  const m = buildResultMessages(result);
  return (
    <Card className="text-center">
      <p className="text-xl font-black leading-snug text-brand-700">{m.headline}</p>
      <p className="mt-3 text-base leading-relaxed">{m.detail}</p>
      <p className="mt-2 text-base font-bold leading-relaxed">{m.closing}</p>
      <p className="mt-4 rounded-2xl bg-brand-50 p-2 text-xs text-slate-700">📸 スクリーンショットで保存しておくと、次回の結果と比べられます</p>
    </Card>
  );
}

function ItemList({ result }: { result: ScoreResult }) {
  return (
    <section aria-labelledby="items-heading">
      <h2 id="items-heading" className="mb-3 text-xl font-black">
        項目別の評価
      </h2>
      <ul className="space-y-3">
        {result.items.map((item) => {
          const meta = CHECK_META[item.id];
          const percent = item.score === null ? 0 : (item.score / MAX_POINTS_PER_CHECK) * 100;
          return (
            <li key={item.id}>
              <Card className="flex items-center gap-3 p-4">
                <CheckIllustration id={item.id} className="size-14 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="font-black">
                      <span className="mr-1 text-xs text-brand-700">CHECK{meta.number}</span>
                      {meta.title}
                    </p>
                    {item.score === null ? (
                      <span className="shrink-0 rounded-full bg-slate-200 px-2 py-0.5 text-xs font-bold text-slate-700">未測定</span>
                    ) : (
                      <span className="shrink-0 font-black tabular-nums text-brand-700">
                        {Math.round(item.score * 10) / 10}
                        <span className="text-xs text-slate-600">/{MAX_POINTS_PER_CHECK}</span>
                      </span>
                    )}
                  </div>
                  {item.score !== null && (
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-brand-100" aria-hidden="true">
                      <div className="h-full rounded-full bg-gradient-to-r from-brand-400 to-brand-600" style={{ width: `${percent}%` }} />
                    </div>
                  )}
                  <p className="mt-1 truncate text-sm text-slate-700">{item.summary}</p>
                </div>
              </Card>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function NameChips({ ids, tone }: { ids: CheckId[]; tone: "good" | "grow" }) {
  return (
    <ul className="mt-2 flex flex-wrap gap-2">
      {ids.map((id) => (
        <li
          key={id}
          className={cx(
            "rounded-full px-3 py-1 text-sm font-bold",
            tone === "good" ? "bg-sun-100 text-navy-900" : "bg-brand-100 text-brand-800",
          )}
        >
          {CHECK_META[id].resultName}
        </li>
      ))}
    </ul>
  );
}

function StrengthsAndImprovements({ result }: { result: ScoreResult }) {
  return (
    <div className="grid gap-3">
      <Card>
        <h2 className="text-lg font-black">
          <span aria-hidden="true">👍 </span>得意な項目
        </h2>
        {result.strengths.length > 0 ? (
          <NameChips ids={result.strengths} tone="good" />
        ) : (
          <p className="mt-1 text-sm text-slate-700">今回は目立って得意な項目はありませんでした。これからの伸びしろです！</p>
        )}
      </Card>
      <Card>
        <h2 className="text-lg font-black">
          <span aria-hidden="true">🌱 </span>改善の余地がある項目
        </h2>
        {result.improvements.length > 0 ? (
          <NameChips ids={result.improvements} tone="grow" />
        ) : (
          <p className="mt-1 text-sm text-slate-700">大きく気になる項目はありませんでした。今の調子をキープしましょう！</p>
        )}
      </Card>
    </div>
  );
}

function SelfCareSection({ result }: { result: ScoreResult }) {
  const rec = recommendSelfCare(result);
  return (
    <section aria-labelledby="selfcare-heading">
      <h2 id="selfcare-heading" className="text-xl font-black">
        あなたへのおすすめセルフケア
      </h2>
      <p className="mb-3 mt-1 text-sm text-slate-700">今回の結果から、優先して取り組みたいものを選びました。</p>
      {rec.notes.map((n) => (
        <p key={n} role="note" className="mb-3 rounded-2xl border-2 border-sun-300 bg-sun-100 p-3 text-sm leading-relaxed">
          {n}
        </p>
      ))}
      <div className="space-y-3">
        {rec.items.map((item, i) => (
          <SelfCareCard key={item.id} item={item} index={i} />
        ))}
      </div>
    </section>
  );
}

function BookingSection({ onClick }: { onClick: () => void }) {
  const url = siteConfig.bookingUrl;
  return (
    <section aria-labelledby="booking-heading" className="rounded-[2rem] border-2 border-brand-200 bg-white p-6 text-center">
      <p className="text-3xl" aria-hidden="true">
        🤝
      </p>
      <h2 id="booking-heading" className="mt-1 text-xl font-black leading-snug">
        自分の身体を
        <br />
        もっと詳しく知りたい方へ
      </h2>
      <p className="mt-3 text-base leading-relaxed text-slate-700">
        セルフチェックでは分からない身体の動きや状態を、専門スタッフが確認します。
      </p>
      {url ? (
        <a href={url} target="_blank" rel="noopener noreferrer" onClick={onClick} className={cx(buttonStyles.accent, "mt-5")}>
          身体の相談・WEB予約はこちら
          <span className="sr-only">（新しいタブで開きます）</span>
        </a>
      ) : (
        <>
          <button type="button" disabled className={cx(buttonStyles.primary, "mt-5")} aria-describedby="booking-unavailable">
            身体の相談・WEB予約はこちら
          </button>
          <p id="booking-unavailable" className="mt-2 text-sm text-slate-600">
            WEB予約は現在準備中です。
          </p>
        </>
      )}
      <p className="mt-3 text-xs text-slate-600">ご予約は任意です。セルフケアだけでも、ぜひ続けてみてください。</p>
    </section>
  );
}

function ScoreDisclaimer() {
  return (
    <div className="space-y-2 text-xs leading-relaxed text-slate-600">
      <MedicalDisclaimer className="text-xs" />
      <p>
        ※スコアとランクは「あんど式」独自の参考指標です。医学的に検証された基準ではなく、疾病のリスクや健康状態を判定するものではありません。
      </p>
      <p>※年齢別の基準による「身体年齢」は、信頼できる研究データに基づく基準を準備中のため、現在は表示していません。</p>
      <p>※結果はお使いのスマホの中だけで計算・保存されています（7日間）。</p>
    </div>
  );
}
