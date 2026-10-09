"use client";

/**
 * 各ステップの中身（入力欄）
 * 入力内容はいったんこの画面の中だけで持ち、「次へ」を押したときに検証してから保存します。
 */
import { useCallback, useState } from "react";
import {
  AGE_GROUPS,
  BALANCE_OPTIONS,
  CONDITION_OPTIONS,
  CONDITION_QUESTIONS,
  FLEXIBILITY_OPTIONS,
  LEGS_INPUT,
  SHOULDER_OPTIONS,
  SYMPTOMS,
} from "@/config/checks";
import { balanceOptionIdForSeconds, isValidLegsCount, parseCount } from "@/lib/scoring";
import { Card, cx, OptionCard } from "@/components/ui";
import type { AgeGroupId, BalanceValue, CheckAnswer, ConditionValue, Profile, SymptomId } from "@/types";
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
  const [ageGroup, setAgeGroup] = useState<AgeGroupId | null>(initial?.ageGroup ?? null);
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
    if (!ageGroup) return "年代を選んでください";
    if (symptoms.length === 0) return "気になる症状を1つ以上選んでください（ない場合は「特になし」）";
    onSubmit({ ageGroup, symptoms });
    return null;
  };

  return render(
    <div className="space-y-6">
      <Card>
        <Fieldset legend="年代">
          <div className="grid grid-cols-2 gap-2">
            {AGE_GROUPS.map((a) => (
              <OptionCard
                key={a.id}
                type="radio"
                name="ageGroup"
                value={a.id}
                label={a.label}
                checked={ageGroup === a.id}
                onChange={(v) => setAgeGroup(v as AgeGroupId)}
                compact
              />
            ))}
          </div>
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
// CHECK 1：バランス
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
          "壁や椅子など、すぐに支えられる場所の近くに立ちます。",
          "両手を腰に当て、片足を床から5cmほど浮かせます。",
          "足が床についたり、支えにつかまったら終了です。",
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
// CHECK 2：下半身
// ---------------------------------------------------------------------------

export function LegsStep({ initial, onSubmit, render }: StepRenderProps<CheckAnswer<number>>) {
  const [text, setText] = useState(initial?.status === "answered" ? String(initial.value) : "");

  const adjust = (delta: number) => {
    const current = parseCount(text) ?? 0;
    const next = Math.min(LEGS_INPUT.max, Math.max(LEGS_INPUT.min, current + delta));
    setText(String(next));
  };

  const tryNext = () => {
    if (text.trim() === "") return "立ち上がれた回数を入力してください";
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
          "壁につけるなどして動かないようにした、安定した椅子に座ります。",
          "腕を胸の前で組みます（不安な方は膝に手を添えてもOK）。",
          "「スタート」を押して、30秒間で何回立ち上がれるか数えます。",
          "しっかり立ち上がって、しっかり座るまでを1回と数えます。",
        ]}
      />
      <Stopwatch mode="countdown" seconds={LEGS_INPUT.durationSeconds} />
      <Card>
        <label htmlFor="legs-count" className="block text-center text-lg font-black">
          立ち上がれた回数
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
// CHECK 3・4：選択式（柔軟性・肩の動き）
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

export function ShoulderStep(props: StepRenderProps<CheckAnswer<string>>) {
  return (
    <ChoiceStep
      {...props}
      name="shoulder"
      legend="両腕を上げてみてどうでしたか？"
      options={SHOULDER_OPTIONS}
      howTo={[
        "背すじを伸ばして、立つか椅子に座ります。",
        "手のひらを内側に向け、両腕を前からゆっくりバンザイします。",
        "耳の横まで無理なく上がるか、左右差がないかを確かめます。",
      ]}
    />
  );
}

// ---------------------------------------------------------------------------
// CHECK 5：コンディション
// ---------------------------------------------------------------------------

export function ConditionStep({ initial, onSubmit, render }: StepRenderProps<CheckAnswer<ConditionValue>>) {
  const [values, setValues] = useState<ConditionValue>(initial?.status === "answered" ? initial.value : {});
  const unanswered = CONDITION_QUESTIONS.filter((q) => !values[q.id]);

  const tryNext = () => {
    if (unanswered.length > 0) {
      const numbers = unanswered.map((q) => `Q${CONDITION_QUESTIONS.indexOf(q) + 1}`).join("・");
      return `${numbers} が未回答です`;
    }
    onSubmit({ status: "answered", value: values });
    return null;
  };

  return render(
    <div className="space-y-4">
      {CONDITION_QUESTIONS.map((q, index) => (
        <Card key={q.id}>
          <fieldset>
            <legend className="mb-3 text-base font-black leading-snug">
              <span className="mr-1 text-brand-600">Q{index + 1}.</span>
              {q.text}
            </legend>
            <div className="grid grid-cols-3 gap-2">
              {CONDITION_OPTIONS.map((o) => {
                const checked = values[q.id] === o.id;
                return (
                  <label
                    key={o.id}
                    className={cx(
                      "flex min-h-14 cursor-pointer items-center justify-center rounded-2xl border-2 px-1 text-center text-sm font-bold leading-tight transition",
                      "has-[:focus-visible]:outline has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-sun-500",
                      checked ? "border-brand-500 bg-brand-500 text-white" : "border-slate-200 bg-white",
                    )}
                  >
                    <input
                      type="radio"
                      name={q.id}
                      value={o.id}
                      checked={checked}
                      onChange={() => setValues((prev) => ({ ...prev, [q.id]: o.id }))}
                      className="sr-only"
                    />
                    {o.label}
                  </label>
                );
              })}
            </div>
          </fieldset>
        </Card>
      ))}
    </div>,
    tryNext,
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
