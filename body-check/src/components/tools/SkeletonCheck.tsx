"use client";

import { useState } from "react";
import { SKELETON_QUESTIONS, SKELETON_TYPES, type SkeletonTypeId } from "@/config/skeleton";
import { judgeSkeleton } from "@/lib/skeleton";
import { buttonStyles, cx } from "@/components/styles";
import { Card, ProgressBar } from "@/components/ui";
import { Disclaimer, OtherChecks, ToolHeader, ToolResultCta } from "./ToolParts";

export function SkeletonCheck() {
  const [answers, setAnswers] = useState<Record<string, SkeletonTypeId>>({});
  const [index, setIndex] = useState(0);
  const [done, setDone] = useState(false);
  const total = SKELETON_QUESTIONS.length;

  if (done) {
    const r = judgeSkeleton(answers);
    const t = SKELETON_TYPES[r.main];
    const sub = r.sub ? SKELETON_TYPES[r.sub] : null;
    return (
      <main className="flex flex-1 flex-col">
        <ToolHeader icon="🧬" title="骨格タイプチェックの結果" />
        <div className="space-y-5 px-5 py-6">
          <Card className="text-center">
            <p className="text-sm font-bold text-slate-500">あなたの骨格タイプ</p>
            <p className="mt-1 text-3xl font-black" style={{ color: t.color }}>
              {r.label}
            </p>
            <div className="mt-4 grid grid-cols-3 gap-2">
              {(["S", "W", "N"] as SkeletonTypeId[]).map((k) => (
                <div key={k} className="rounded-2xl p-2" style={{ background: SKELETON_TYPES[k].soft, color: SKELETON_TYPES[k].color }}>
                  <p className="text-xs font-bold">{SKELETON_TYPES[k].name}</p>
                  <p className="text-xl font-black">{r.pct[k]}%</p>
                </div>
              ))}
            </div>
          </Card>
          <Card className="space-y-3 text-sm leading-relaxed">
            <p>
              <b>体の特徴：</b>
              {t.summary}
            </p>
            <p>
              <b>似合う服：</b>
              {t.fashion}
            </p>
            <p>
              <b>体のケアのポイント：</b>
              {t.care}
              {sub && <span className="mt-1 block text-slate-600">（{sub.name}の要素：{sub.care}）</span>}
            </p>
          </Card>
          <ToolResultCta
            summary={`骨格タイプチェック ${r.label}`}
            lead="骨格タイプに合わせて、姿勢や体のバランスの整え方を専門スタッフがご提案します。"
          />
          <button
            type="button"
            className={buttonStyles.secondary}
            onClick={() => {
              setAnswers({});
              setIndex(0);
              setDone(false);
            }}
          >
            もう一度チェックする
          </button>
          <OtherChecks current="/skeleton" />
          <Disclaimer>本チェックは体つきの傾向を知るための目安で、医療的な判定ではありません。</Disclaimer>
        </div>
      </main>
    );
  }

  const q = SKELETON_QUESTIONS[index];
  const choose = (k: SkeletonTypeId) => {
    const next = { ...answers, [q.id]: k };
    setAnswers(next);
    if (index + 1 >= total) setDone(true);
    else setIndex(index + 1);
    window.scrollTo({ top: 0 });
  };
  return (
    <main className="flex flex-1 flex-col">
      <ToolHeader icon="🧬" title="骨格タイプチェック" sub="10の質問で、ストレート／ウェーブ／ナチュラルが分かります（約2分）" />
      <div className="space-y-5 px-5 py-6">
        <ProgressBar current={index + 1} total={total} label="質問" />
        <Card>
          <h2 className="text-lg font-black">
            Q{index + 1}. {q.q}
          </h2>
          <div className="mt-4 space-y-3">
            {q.options.map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => choose(k)}
                className={cx(
                  "flex min-h-14 w-full items-center rounded-2xl border-2 px-4 py-3 text-left text-base font-bold transition",
                  answers[q.id] === k ? "border-brand-500 bg-brand-50 text-brand-800" : "border-slate-200 bg-white text-navy-900 active:bg-brand-50",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </Card>
        {index > 0 && (
          <button type="button" className={buttonStyles.ghost} onClick={() => setIndex(index - 1)}>
            ◀ ひとつ前の質問へ
          </button>
        )}
      </div>
    </main>
  );
}
