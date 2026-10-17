"use client";

import { useState } from "react";
import { CORE_TESTS } from "@/config/core";
import { judgeCore, type CoreAnswers } from "@/lib/core";
import { buttonStyles, cx } from "@/components/styles";
import { Card, ProgressBar } from "@/components/ui";
import { Stopwatch } from "@/components/check/Stopwatch";
import { Disclaimer, OtherChecks, ToolHeader, ToolResultCta } from "./ToolParts";

const SAFETY = [
  "腰・首・肩などに痛みがある方、妊娠中の方、血圧が高い方、手術後まもない方は行わないでください。",
  "床にマットやタオルを敷き、まわりに物がない場所で行ってください。",
  "息を止めず、痛みや違和感が出たらすぐに中止してください。",
  "つらい項目は「スキップ」できます（点数には入りません）。",
];

/** 秒数を測る（左右あるときは2つ） */
function TimeInput({ max, onDone }: { max: number; onDone: (sec: number) => void }) {
  const [sec, setSec] = useState<number | null>(null);
  return (
    <Stopwatch mode="countup" seconds={max} onStop={(e) => setSec(e)}>
      {(elapsed) =>
        elapsed !== null && sec !== null ? (
          <button type="button" onClick={() => onDone(sec)} className="mt-3 min-h-12 w-full rounded-full border-2 border-white px-6 font-bold">
            {Math.floor(sec)}秒で記録する
          </button>
        ) : null
      }
    </Stopwatch>
  );
}

export function CoreCheck() {
  const [agreed, setAgreed] = useState(false);
  const [started, setStarted] = useState(false);
  const [index, setIndex] = useState(0);
  const [side, setSide] = useState<"left" | "right">("left");
  const [answers, setAnswers] = useState<CoreAnswers>({});
  const [done, setDone] = useState(false);
  const total = CORE_TESTS.length;

  const advance = (next: CoreAnswers) => {
    setAnswers(next);
    setSide("left");
    if (index + 1 >= total) setDone(true);
    else setIndex(index + 1);
    window.scrollTo({ top: 0 });
  };

  if (!started) {
    return (
      <main className="flex flex-1 flex-col">
        <ToolHeader icon="💪" title="体幹チェック" sub="おうちでできる4つのテストで、体を支える力をチェック（約5分）" />
        <div className="space-y-5 px-5 py-6">
          <Card>
            <h2 className="text-lg font-black">チェックする4つのテスト</h2>
            <ol className="mt-3 space-y-2">
              {CORE_TESTS.map((t, i) => (
                <li key={t.id} className="flex gap-2 text-base font-bold text-navy-900">
                  <span className="text-brand-600">{i + 1}.</span>
                  {t.name}
                </li>
              ))}
            </ol>
          </Card>
          <Card className="border-2 border-sun-400">
            <h2 className="text-lg font-black">⚠️ はじめる前に</h2>
            <ul className="mt-3 space-y-2 text-sm leading-relaxed">
              {SAFETY.map((s) => (
                <li key={s}>・{s}</li>
              ))}
            </ul>
            <label className="mt-4 flex cursor-pointer items-center gap-3 rounded-2xl bg-sun-100 p-3 font-bold">
              <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="size-6 accent-brand-600" />
              上記の注意事項を確認しました
            </label>
          </Card>
          <button type="button" disabled={!agreed} onClick={() => setStarted(true)} className={buttonStyles.primary}>
            チェックをはじめる ▶
          </button>
          <Disclaimer />
        </div>
      </main>
    );
  }

  if (done) {
    const r = judgeCore(answers);
    return (
      <main className="flex flex-1 flex-col">
        <ToolHeader icon="💪" title="体幹チェックの結果" />
        <div className="space-y-5 px-5 py-6">
          {!r ? (
            <Card className="text-center">
              <p className="font-bold">すべての項目がスキップされたため、結果を出せませんでした。</p>
            </Card>
          ) : (
            <>
              <Card className="text-center">
                <p className="text-sm font-bold text-slate-500">体幹スコア</p>
                <p className="text-6xl font-black text-brand-600">
                  {r.score}
                  <span className="text-2xl">点</span>
                </p>
                <p className="mt-1 inline-block rounded-full bg-navy-900 px-4 py-1 text-lg font-black text-white">{r.rank.title}</p>
                <p className="mt-3 text-sm leading-relaxed text-slate-700">{r.rank.message}</p>
              </Card>
              <Card>
                <h2 className="font-black">項目ごとの結果</h2>
                <ul className="mt-3 space-y-3">
                  {r.items.map((i) => (
                    <li key={i.id}>
                      <div className="flex items-center justify-between text-sm font-bold">
                        <span>{i.name}</span>
                        <span className="text-slate-600">{i.detail}</span>
                      </div>
                      <div className="mt-1 h-3 overflow-hidden rounded-full bg-slate-100">
                        <div className={cx("h-full rounded-full", i.points >= 3 ? "bg-brand-500" : "bg-sun-400")} style={{ width: `${i.points * 25}%` }} />
                      </div>
                      {i.asymmetry && <p className="mt-1 text-xs font-bold text-red-700">⚠ {i.asymmetry}</p>}
                    </li>
                  ))}
                </ul>
              </Card>
              {r.weak.length > 0 && (
                <Card className="space-y-3">
                  <h2 className="font-black">気をつけたいところ</h2>
                  {r.weak.slice(0, 3).map((w) => (
                    <p key={w.id} className="rounded-2xl bg-sun-100 p-3 text-sm leading-relaxed">
                      <b>{w.name}：</b>
                      {CORE_TESTS.find((t) => t.id === w.id)!.weakText}
                    </p>
                  ))}
                </Card>
              )}
              {r.selfcare.length > 0 && (
                <Card className="space-y-3">
                  <h2 className="font-black">🧘 おすすめのセルフケア</h2>
                  {r.selfcare.map((s) => (
                    <div key={s.title} className="rounded-2xl bg-brand-50 p-3">
                      <p className="font-black text-brand-800">{s.title}</p>
                      <p className="mt-1 text-sm leading-relaxed">{s.text}</p>
                    </div>
                  ))}
                  <p className="text-xs text-slate-600">痛みが出る場合は中止し、専門家にご相談ください。</p>
                </Card>
              )}
              <ToolResultCta
                summary={`体幹チェック ${r.score}点・${r.rank.title}${r.weak.length ? `（弱め：${r.weak.map((w) => w.name.replace(/（.*）/, "")).join("・")}）` : ""}`}
                lead="体幹の弱いところや左右差の原因を、専門スタッフが実際の動きで確認します。"
              />
            </>
          )}
          <button
            type="button"
            className={buttonStyles.secondary}
            onClick={() => {
              setAnswers({});
              setIndex(0);
              setDone(false);
              setStarted(false);
              setAgreed(false);
            }}
          >
            もう一度チェックする
          </button>
          <OtherChecks current="/core" />
          <Disclaimer />
        </div>
      </main>
    );
  }

  const t = CORE_TESTS[index];
  const current = answers[t.id];
  const recordSide = (v: number) => {
    const prev = current && !("skipped" in current) ? current : {};
    if (t.bothSides && side === "left") {
      setAnswers({ ...answers, [t.id]: { ...prev, left: v } });
      setSide("right");
      window.scrollTo({ top: 0 });
      return;
    }
    advance({ ...answers, [t.id]: t.bothSides ? { ...prev, right: v } : { value: v } });
  };
  return (
    <main className="flex flex-1 flex-col">
      <ToolHeader icon="💪" title={`TEST ${index + 1}　${t.name}`} sub={t.bothSides ? (side === "left" ? "まずは左側から" : "つぎは右側") : undefined} />
      <div className="space-y-5 px-5 py-6">
        <ProgressBar current={index + 1} total={total} label="テスト" />
        <Card>
          <h2 className="font-black">やり方</h2>
          <ol className="mt-2 space-y-1.5 text-base leading-relaxed">
            {t.howTo.map((h, i) => (
              <li key={h}>
                {i + 1}. {h}
              </li>
            ))}
          </ol>
        </Card>
        {t.options ? (
          <Card>
            <h2 className="font-black">{t.bothSides ? (side === "left" ? "左脚" : "右脚") : ""}でやってみて、近いものを選んでください</h2>
            <div className="mt-3 space-y-2">
              {t.options.map((o) => (
                <button key={o.label} type="button" onClick={() => recordSide(o.points)} className="flex min-h-14 w-full items-center rounded-2xl border-2 border-slate-200 bg-white px-4 py-3 text-left font-bold active:bg-brand-50">
                  {o.label}
                </button>
              ))}
            </div>
          </Card>
        ) : (
          <TimeInput key={`${t.id}-${side}`} max={t.maxSeconds ?? 60} onDone={recordSide} />
        )}
        <div className="flex justify-between">
          <button
            type="button"
            className={buttonStyles.ghost}
            onClick={() => {
              if (t.bothSides && side === "right") setSide("left");
              else if (index > 0) setIndex(index - 1);
              else setStarted(false);
            }}
          >
            ◀ 戻る
          </button>
          <button type="button" className={buttonStyles.ghost} onClick={() => advance({ ...answers, [t.id]: { skipped: true } })}>
            このテストをスキップする
          </button>
        </div>
      </div>
    </main>
  );
}
