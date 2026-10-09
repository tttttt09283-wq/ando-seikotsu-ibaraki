"use client";

/**
 * チェック全体の進行役
 * 「今どの画面か」を管理し、回答をブラウザ内に保存しながら次の画面へ進めます。
 */
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CHECK_META } from "@/config/checks";
import { siteConfig } from "@/config/site";
import { CheckIllustration } from "@/components/Illustrations";
import { buttonStyles, Spinner } from "@/components/ui";
import { createInitialState, loadState, saveState, type CheckState } from "@/lib/storage";
import type { Answers, CheckId } from "@/types";
import { ConsentContent, SafetyContent, StopNotice } from "./SafetyParts";
import { StepShell } from "./StepShell";
import { BalanceStep, ConditionStep, FlexibilityStep, LegsStep, ProfileStep, ShoulderStep } from "./steps";

type StepKey = "profile" | "consent" | "safety" | CheckId;

const CHECK_LEADS: Record<CheckId, string> = {
  balance: "壁や椅子など、すぐに支えられる場所で片足立ちをしてみましょう",
  legs: "安定した椅子に座り、30秒間で何回立ち上がれるか数えてください",
  flexibility: "立ったまま前屈をして、手がどこまで届くか確かめましょう",
  shoulder: "両腕をゆっくり上げて、肩の動きを確かめましょう",
  condition: "最近の身体の状態について、当てはまるものを選んでください",
};

export function CheckFlow() {
  const router = useRouter();
  const [state, setState] = useState<CheckState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stopped, setStopped] = useState(false);
  const [finishing, setFinishing] = useState(false);

  const steps = useMemo<StepKey[]>(
    () => [
      "profile",
      ...(siteConfig.statsEnabled ? (["consent"] as const) : []),
      "safety",
      "balance",
      "legs",
      "flexibility",
      "shoulder",
      "condition",
    ],
    [],
  );

  // 最初に、保存されている途中データを読み込む（結果まで終わっている場合は新しく始める）
  useEffect(() => {
    const saved = loadState();
    setState(saved && !saved.completedAt ? saved : saveState(createInitialState()));
  }, []);

  const update = useCallback((patch: Partial<CheckState>) => {
    setState((prev) => (prev ? saveState({ ...prev, ...patch }) : prev));
  }, []);

  if (!state || finishing) return <Spinner label={finishing ? "採点しています…" : "読み込み中…"} />;
  if (stopped) return <StopNotice onResume={() => setStopped(false)} />;

  // 安全確認に同意していないのにチェック画面に進んでいたら、安全確認に戻す
  const safetyIndex = steps.indexOf("safety");
  let stepIndex = Math.min(state.step, steps.length - 1);
  if (stepIndex > safetyIndex && !state.safetyAgreed) stepIndex = safetyIndex;
  const key = steps[stepIndex];

  const goTo = (index: number) => {
    setError(null);
    update({ step: index });
  };
  const goNext = () => goTo(stepIndex + 1);
  const goBack = () => {
    if (stepIndex === 0) router.push("/");
    else goTo(stepIndex - 1);
  };

  const finish = (answers: Answers) => {
    setFinishing(true);
    update({ answers, completedAt: new Date().toISOString() });
    router.push("/result");
  };

  const saveAnswer = <K extends CheckId>(id: K, answer: NonNullable<Answers[K]>) => {
    const answers = { ...state.answers, [id]: answer };
    if (stepIndex === steps.length - 1) finish(answers);
    else {
      setError(null);
      update({ answers, step: stepIndex + 1 });
    }
  };

  const checkKeys = steps.filter((s): s is CheckId => s in CHECK_META);
  const common = {
    stepNumber: stepIndex + 1,
    totalSteps: steps.length,
    onBack: goBack,
    error,
    onInput: () => setError(null),
  };

  /** 子の画面から「中身」と「次へ押下時の検証処理」を受け取り、共通の枠で包む */
  const shell =
    (props: Omit<React.ComponentProps<typeof StepShell>, "children" | keyof typeof common | "onNext">) =>
    (content: React.ReactNode, tryNext: () => string | null) => (
      <StepShell {...common} {...props} onNext={() => setError(tryNext())}>
        {content}
      </StepShell>
    );

  switch (key) {
    case "profile":
      return (
        <ProfileStep
          key="profile"
          initial={state.profile}
          onSubmit={(profile) => {
            setError(null);
            update({ profile, step: stepIndex + 1 });
          }}
          render={shell({ progressLabel: "はじめに", badge: "STEP 0", title: "あなたについて教えてください" })}
        />
      );

    case "consent":
      return (
        <StepShell {...common} progressLabel="はじめに" title="データの利用について" hideNext>
          <ConsentContent />
          <div className="space-y-3">
            <button
              type="button"
              className={buttonStyles.primary}
              onClick={() => {
                update({ consent: "granted", step: stepIndex + 1 });
              }}
            >
              同意して進む
            </button>
            <button
              type="button"
              className={buttonStyles.secondary}
              onClick={() => {
                update({ consent: "denied", step: stepIndex + 1 });
              }}
            >
              同意しないで進む
            </button>
          </div>
        </StepShell>
      );

    case "safety":
      return (
        <StepShell
          {...common}
          progressLabel="はじめに"
          title="安全にチェックするために"
          lead="はじめる前に、必ずお読みください。"
          nextLabel="チェック開始"
          onNext={() => {
            if (!state.safetyAgreed) setError("注意事項を確認して、チェックを入れてください");
            else goNext();
          }}
        >
          <SafetyContent agreed={state.safetyAgreed} onAgreeChange={(v) => update({ safetyAgreed: v })} onStop={() => setStopped(true)} />
        </StepShell>
      );

    default: {
      const id = key;
      const meta = CHECK_META[id];
      const isLast = stepIndex === steps.length - 1;
      const render = shell({
        progressLabel: `CHECK ${checkKeys.indexOf(id) + 1} / ${checkKeys.length}`,
        badge: `CHECK ${meta.number}`,
        title: meta.title,
        illustration: <CheckIllustration id={id} className="w-28" />,
        lead: CHECK_LEADS[id],
        nextLabel: isLast ? "結果を見る" : "次へ",
        onSkip: () => saveAnswer(id, { status: "skipped" }),
        onStop: () => setStopped(true),
      });
      switch (id) {
        case "balance":
          return <BalanceStep key={id} initial={state.answers.balance} onSubmit={(a) => saveAnswer("balance", a)} render={render} />;
        case "legs":
          return <LegsStep key={id} initial={state.answers.legs} onSubmit={(a) => saveAnswer("legs", a)} render={render} />;
        case "flexibility":
          return <FlexibilityStep key={id} initial={state.answers.flexibility} onSubmit={(a) => saveAnswer("flexibility", a)} render={render} />;
        case "shoulder":
          return <ShoulderStep key={id} initial={state.answers.shoulder} onSubmit={(a) => saveAnswer("shoulder", a)} render={render} />;
        case "condition":
          return <ConditionStep key={id} initial={state.answers.condition} onSubmit={(a) => saveAnswer("condition", a)} render={render} />;
      }
    }
  }
}
