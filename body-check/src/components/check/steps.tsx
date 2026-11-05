"use client";

/**
 * 各ステップの中身（入力欄）
 * 入力内容はいったんこの画面の中だけで持ち、「次へ」を押したときに検証してから保存します。
 */
import { useCallback, useState } from "react";
import {
  AGE_INPUT,
  ageGroupOf,
  BALANCE_OPTIONS,
  FLEXIBILITY_OPTIONS,
  LEGS_INPUT,
  PLANK_INPUT,
  SYMPTOMS,
} from "@/config/checks";
import { SEX_OPTIONS, type SexId } from "@/config/bodyAge";
import { balanceOptionIdForSeconds, isValidLegsCount, isValidPlankSeconds, parseCount } from "@/lib/scoring";
import { Card, OptionCard } from "@/components/ui";
import type { BalanceValue, CheckAnswer, Profile, SymptomId } from "@/types";
import { Stopwatch } from "./Stopwatch";

/** 各ステップから親に渡す「次へ」処理。検証エラーなら文字列を返す */
export type Submit<T> = (answer: T) => void;

export interface StepRenderProps<T> {
  /** 画面の中身。footer 用に「次へを押したときの処理」を登録する */
  render: (content: React.ReactNode, tryNext: () => string | null) => React.ReactNode;
  initial: T | undefined;
  onSubmit: Submit<T>;
}

function Fieldset({ legend, hint, children }: { legend: string; hint?: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-2">
      <legend className="mb-2 text-lg font-black">
        {legend}
        {hint && <span className="ml-2 text-sm font-bold text-slate-600">{hint}</span>}
      </legend>
      {children}
    </fieldset>
  );
}

// ---------------------------------------------------------------------------
// 事前アンケート
// ---------------------------------------------------------------------------

export function ProfileStep({ initial, onSubmit, render }: StepRenderProps<Profile>) {
  const [ageText, setAgeText] = useState(initial?.age != null ? String(initial.age) : "");
  const [sex, setSex] = useState<SexId | null>(initial?.sex ?? null);
  const [symptoms, setSymptoms] = useState<SymptomId[]>(initial?.symptoms ?? []);

  const toggleSymptom = (id: string) => {
    const sid = id as SymptomId;
    setSymptoms((prev) => {
      if (prev.includes(sid)) return prev.filter((s) => s !== sid);
      // 「特になし」と他の症状は同時に選べない
      if (sid === "none") return ["none"];
      return [...prev.filter((s) => s !== "none"), sid];
    });
  };

  const tryNext = () => {
    const age = parseCount(ageText);
    if (ageText.trim() === "") return "年齢を入力してください";
    if (age === null || age < AGE_INPUT.min || age > AGE_INPUT.max) return `年齢は${AGE_INPUT.min}〜${AGE_INPUT.max}の数字で入力してください`;
    if (!sex) return "性別を選んでください（「回答しない」も選べます）";
    if (symptoms.length === 0) return "気になる症状を1つ以上選んでください（ない場合は「特になし」）";
    onSubmit({ age, ageGroup: ageGroupOf(age), sex, symptoms });
    return null;
  };

  return render(
    <div className="space-y-6">
      <Card>
        <label htmlFor="age" className="mb-2 block text-lg font-black">
          年齢
        </label>
        <div className="flex items-end justify-center gap-1">
          <input
            id="age"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="off"
            maxLength={2}
            value={ageText}
            onChange={(e) => setAgeText(e.target.value)}
            placeholder="45"
            aria-describedby="age-hint"
            className="h-16 w-24 rounded-2xl border-2 border-slate-300 bg-white text-center text-4xl font-black tabular-nums focus:border-brand-500 focus:outline-none"
          />
          <span className="pb-2 text-lg font-bold">歳</span>
        </div>
        <p id="age-hint" className="mt-2 text-center text-xs text-slate-600">結果の「姿勢・体幹年齢」と、実年齢を比べるために使います。</p>
      </Card>
      <Card>
        <Fieldset legend="性別">
          <div className="grid grid-cols-3 gap-2">
            {SEX_OPTIONS.map((o) => (
              <OptionCard
                key={o.id}
                type="radio"
                name="sex"
                value={o.id}
                label={o.label}
                checked={sex === o.id}
                onChange={(v) => setSex(v as SexId)}
                compact
              />
            ))}
          </div>
          <p className="text-xs text-slate-600">姿勢・体幹年齢の判定で、性別ごとの目安と比べるために使います。</p>
        </Fieldset>
      </Card>
      <Card>
        <Fieldset legend="身体で気になる症状" hint="（複数選択OK）">
          <div className="grid grid-cols-2 gap-2">
            {SYMPTOMS.map((s) => (
              <OptionCard
                key={s.id}
                type="checkbox"
                name="symptoms"
                value={s.id}
                label={s.label}
                checked={symptoms.includes(s.id)}
                onChange={toggleSymptom}
                compact
              />
            ))}
          </div>
        </Fieldset>
      </Card>
      <p className="text-center text-xs text-slate-600">お名前・電話番号・メールアドレスの入力は不要です。</p>
    </div>,
    tryNext,
  );
}

// ---------------------------------------------------------------------------
// CHECK 1：バランス力（片足立ち）
// ---------------------------------------------------------------------------

const NOT_DONE = "not_done";

export function BalanceStep({ initial, onSubmit, render }: StepRenderProps<CheckAnswer<BalanceValue>>) {
  const init = initial?.status === "answered" ? initial.value : null;
  const [left, setLeft] = useState<string | null>(init ? (init.left ?? NOT_DONE) : null);
  const [right, setRight] = useState<string | null>(init ? (init.right ?? NOT_DONE) : null);
  const [measured, setMeasured] = useState<number | null>(null);

  const onStop = useCallback((sec: number) => setMeasured(sec), []);

  const tryNext = () => {
    if (!left || !right) return "左足・右足それぞれの結果を選んでください（できなかった側は「実施しない」）";
    const value: BalanceValue = { left: left === NOT_DONE ? null : left, right: right === NOT_DONE ? null : right };
    if (!value.left && !value.right) {
      return "左右とも「実施しない」の場合は、下の「この項目をスキップする」を押してください";
    }
    onSubmit({ status: "answered", value });
    return null;
  };

  const sides = [
    { key: "left", label: "左足で立ったとき", value: left, set: setLeft },
    { key: "right", label: "右足で立ったとき", value: right, set: setRight },
  ] as const;

  const measuredId = measured !== null ? balanceOptionIdForSeconds(measured) : null;

  return render(
    <div className="space-y-5">
      <HowTo
        steps={[
          "壁や椅子など、すぐに支えられる場所の近くに立ちます（目は開けたまま）。",
          "両手を腰に当て、片足を床から5cmほど浮かせます。",
          "足が床についたり、支えにつかまったら終了です（最大60秒）。左右それぞれ測ります。",
        ]}
      />
      <Stopwatch mode="countup" seconds={60} onStop={onStop}>
        {(elapsed) =>
          elapsed !== null &&
          measuredId && (
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" className="min-h-11 rounded-full border-2 border-white/60 px-2 text-sm font-bold" onClick={() => setLeft(measuredId)}>
                左足の結果にする
              </button>
              <button type="button" className="min-h-11 rounded-full border-2 border-white/60 px-2 text-sm font-bold" onClick={() => setRight(measuredId)}>
                右足の結果にする
              </button>
            </div>
          )
        }
      </Stopwatch>
      {sides.map((side) => (
        <Card key={side.key}>
          <Fieldset legend={side.label}>
            {BALANCE_OPTIONS.map((o) => (
              <OptionCard
                key={o.id}
                type="radio"
                name={`balance-${side.key}`}
                value={o.id}
                label={o.label}
                checked={side.value === o.id}
                onChange={side.set}
                compact
              />
            ))}
            <OptionCard
              type="radio"
              name={`balance-${side.key}`}
              value={NOT_DONE}
              label="この足は実施しない"
              checked={side.value === NOT_DONE}
              onChange={side.set}
              compact
            />
          </Fieldset>
        </Card>
      ))}
    </div>,
    tryNext,
  );
}

// ---------------------------------------------------------------------------
// CHECK 4：瞬発力（30秒スクワット・椅子を使って）
// ---------------------------------------------------------------------------

export function LegsStep({ initial, onSubmit, render }: StepRenderProps<CheckAnswer<number>>) {
  const [text, setText] = useState(initial?.status === "answered" ? String(initial.value) : "");

  const adjust = (delta: number) => {
    const current = parseCount(text) ?? 0;
    const next = Math.min(LEGS_INPUT.max, Math.max(LEGS_INPUT.min, current + delta));
    setText(String(next));
  };

  const tryNext = () => {
    if (text.trim() === "") return "スクワットできた回数を入力してください";
    const count = parseCount(text);
    if (count === null || !isValidLegsCount(count)) {
      return `回数は${LEGS_INPUT.min}〜${LEGS_INPUT.max}の数字で入力してください`;
    }
    onSubmit({ status: "answered", value: count });
    return null;
  };

  return render(
    <div className="space-y-5">
      <HowTo
        steps={[
          "壁につけるなどして動かないようにした、安定した椅子の前に立ちます。",
          "腕を胸の前で組みます（不安な方は膝に手を添えてもOK）。",
          "「スタート」を押して、椅子にお尻が軽く触れるまでしゃがみ、まっすぐ立ち上がります。",
          "しゃがんで立つまでを1回とし、30秒間で何回できるか数えます。",
        ]}
      />
      <Stopwatch mode="countdown" seconds={LEGS_INPUT.durationSeconds} />
      <Card>
        <label htmlFor="legs-count" className="block text-center text-lg font-black">
          スクワットできた回数
        </label>
        <div className="mt-3 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => adjust(-1)}
            className="size-14 shrink-0 rounded-full bg-brand-100 text-3xl font-black text-brand-800 active:bg-brand-200"
            aria-label="1回減らす"
          >
            −
          </button>
          <div className="flex items-end gap-1">
            <input
              id="legs-count"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="off"
              maxLength={3}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="0"
              aria-describedby="legs-count-hint"
              className="h-16 w-24 rounded-2xl border-2 border-slate-300 bg-white text-center text-4xl font-black tabular-nums focus:border-brand-500 focus:outline-none"
            />
            <span className="pb-2 text-lg font-bold">回</span>
          </div>
          <button
            type="button"
            onClick={() => adjust(1)}
            className="size-14 shrink-0 rounded-full bg-brand-100 text-3xl font-black text-brand-800 active:bg-brand-200"
            aria-label="1回増やす"
          >
            ＋
          </button>
        </div>
        <p id="legs-count-hint" className="mt-2 text-center text-sm text-slate-600">
          {LEGS_INPUT.min}〜{LEGS_INPUT.max}回の範囲で入力してください
        </p>
      </Card>
    </div>,
    tryNext,
  );
}

// ---------------------------------------------------------------------------
// CHECK 2：体幹の強さ（プランク）
// ---------------------------------------------------------------------------

export function PlankStep({ initial, onSubmit, render }: StepRenderProps<CheckAnswer<number>>) {
  const [text, setText] = useState(initial?.status === "answered" ? String(initial.value) : "");
  const onStop = useCallback((sec: number) => setText(String(Math.floor(sec))), []);

  const tryNext = () => {
    if (text.trim() === "") return "キープできた秒数を入力してください（ストップウォッチを止めると自動で入ります）";
    const sec = parseCount(text);
    if (sec === null || !isValidPlankSeconds(sec)) return `秒数は${PLANK_INPUT.min}〜${PLANK_INPUT.max}の数字で入力してください`;
    onSubmit({ status: "answered", value: sec });
    return null;
  };

  return render(
    <div className="space-y-5">
      <HowTo
        steps={[
          "うつ伏せになり、両ひじを肩の真下について、つま先を立てます。",
          "お尻を持ち上げて、頭からかかとまでを一直線にします。",
          "「スタート」を押してキープ。腰が落ちる・お尻が上がる・ひざがついたら「ストップ」。",
          "腰や肩に痛みが出たら、すぐにやめてください。",
        ]}
      />
      <Stopwatch mode="countup" seconds={PLANK_INPUT.stopwatchMax} onStop={onStop} />
      <Card>
        <label htmlFor="plank-sec" className="block text-center text-lg font-black">
          キープできた秒数
        </label>
        <div className="mt-3 flex items-end justify-center gap-1">
          <input
            id="plank-sec"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="off"
            maxLength={3}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="0"
            aria-describedby="plank-sec-hint"
            className="h-16 w-28 rounded-2xl border-2 border-slate-300 bg-white text-center text-4xl font-black tabular-nums focus:border-brand-500 focus:outline-none"
          />
          <span className="pb-2 text-lg font-bold">秒</span>
        </div>
        <p id="plank-sec-hint" className="mt-2 text-center text-sm text-slate-600">
          ストップウォッチを止めると自動で入ります（手で入力してもOK）
        </p>
      </Card>
    </div>,
    tryNext,
  );
}

// ---------------------------------------------------------------------------
// CHECK 3：選択式（柔軟性）
// ---------------------------------------------------------------------------

function ChoiceStep({
  name,
  legend,
  options,
  howTo,
  initial,
  onSubmit,
  render,
}: StepRenderProps<CheckAnswer<string>> & {
  name: string;
  legend: string;
  options: { id: string; label: string }[];
  howTo: string[];
}) {
  const [value, setValue] = useState<string | null>(initial?.status === "answered" ? initial.value : null);
  const tryNext = () => {
    if (!value) return "当てはまるものを1つ選んでください";
    onSubmit({ status: "answered", value });
    return null;
  };
  return render(
    <div className="space-y-5">
      <HowTo steps={howTo} />
      <Card>
        <Fieldset legend={legend}>
          {options.map((o) => (
            <OptionCard key={o.id} type="radio" name={name} value={o.id} label={o.label} checked={value === o.id} onChange={setValue} />
          ))}
        </Fieldset>
      </Card>
    </div>,
    tryNext,
  );
}

export function FlexibilityStep(props: StepRenderProps<CheckAnswer<string>>) {
  return (
    <ChoiceStep
      {...props}
      name="flexibility"
      legend="どこまで届きましたか？"
      options={FLEXIBILITY_OPTIONS}
      howTo={[
        "足をそろえて、膝を伸ばしたまま立ちます。",
        "息を吐きながら、ゆっくり上体を前に倒します。",
        "反動はつけず、痛みのない範囲で止めましょう。",
      ]}
    />
  );
}

// ---------------------------------------------------------------------------

function HowTo({ steps }: { steps: string[] }) {
  return (
    <Card className="bg-white/80">
      <h2 className="mb-2 text-sm font-black tracking-wider text-brand-700">やりかた</h2>
      <ol className="space-y-2">
        {steps.map((s, i) => (
          <li key={s} className="flex gap-3 text-base leading-relaxed">
            <span
              aria-hidden="true"
              className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-500 text-xs font-black text-white"
            >
              {i + 1}
            </span>
            <span>{s}</span>
          </li>
        ))}
      </ol>
    </Card>
  );
}
