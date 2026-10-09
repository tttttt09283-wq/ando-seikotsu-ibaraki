/**
 * ===== 採点ロジック =====
 * 画面（UI）とは切り離した「計算だけ」を行うファイルです。
 * 採点の基準値は src/config/checks.ts と src/config/scoring.ts から読み込みます。
 * スキップした項目は採点から除外し、0点扱いにはしません。
 */
import {
  BALANCE_MIN_SECONDS,
  BALANCE_OPTIONS,
  CHECK_META,
  CHECK_ORDER,
  CONDITION_OFTEN_OPTION_ID,
  CONDITION_OPTIONS,
  CONDITION_PAIN_QUESTION_ID,
  CONDITION_QUESTIONS,
  FLEXIBILITY_OPTIONS,
  LEGS_INPUT,
  LEGS_THRESHOLDS,
  MAX_POINTS_PER_CHECK,
  SHOULDER_OPTIONS,
  SHOULDER_PAIN_OPTION_ID,
  type ChoiceOption,
} from "@/config/checks";
import { RANKS, SCORING_CONFIG } from "@/config/scoring";
import type { Answers, BalanceValue, CheckId, CheckScore, ConditionValue, RankId, ScoreResult } from "@/types";

function findOption(options: ChoiceOption[], id: string | null | undefined): ChoiceOption | undefined {
  return id ? options.find((o) => o.id === id) : undefined;
}

function clampPoints(points: number): number {
  return Math.max(0, Math.min(MAX_POINTS_PER_CHECK, points));
}

/** 30秒椅子立ち上がりの回数が有効な値か（0〜50の整数） */
export function isValidLegsCount(count: unknown): count is number {
  return (
    typeof count === "number" &&
    Number.isInteger(count) &&
    count >= LEGS_INPUT.min &&
    count <= LEGS_INPUT.max
  );
}

/** バランス：左右それぞれの点数の平均（片側のみなら片側の点数）。どちらも無ければ null */
export function scoreBalance(value: BalanceValue): number | null {
  const points = [value.left, value.right]
    .map((id) => findOption(BALANCE_OPTIONS, id)?.points)
    .filter((p): p is number => typeof p === "number");
  if (points.length === 0) return null;
  return clampPoints(points.reduce((a, b) => a + b, 0) / points.length);
}

/** 片足立ちの秒数 → 該当する選択肢ID */
export function balanceOptionIdForSeconds(seconds: number): string | null {
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  const hit = [...BALANCE_OPTIONS]
    .sort((a, b) => (BALANCE_MIN_SECONDS[b.id] ?? 0) - (BALANCE_MIN_SECONDS[a.id] ?? 0))
    .find((o) => seconds >= (BALANCE_MIN_SECONDS[o.id] ?? 0));
  return hit?.id ?? null;
}

/** 全角数字などを半角に直してから、回数として読み取る（読めなければ null） */
export function parseCount(input: string): number | null {
  const normalized = input.trim().replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  if (!/^\d+$/.test(normalized)) return null;
  return Number(normalized);
}

export function scoreLegs(count: number): number | null {
  if (!isValidLegsCount(count)) return null;
  const hit = LEGS_THRESHOLDS.find((t) => count >= t.min);
  return hit ? clampPoints(hit.points) : null;
}

export function scoreChoice(options: ChoiceOption[], id: string): number | null {
  const opt = findOption(options, id);
  return opt ? clampPoints(opt.points) : null;
}

/** コンディション：全問回答で各設問の合計点。1問でも欠けていれば null */
export function scoreCondition(value: ConditionValue): number | null {
  let sum = 0;
  for (const q of CONDITION_QUESTIONS) {
    const opt = findOption(CONDITION_OPTIONS, value[q.id]);
    if (!opt) return null;
    sum += opt.points;
  }
  return clampPoints(sum);
}

/** 点数から S〜C ランクを決める */
export function getRank(total: number): RankId {
  const hit = RANKS.find((r) => total >= r.min);
  return (hit ?? RANKS[RANKS.length - 1]).id;
}

function labelOf(options: ChoiceOption[], id: string | null | undefined): string {
  return findOption(options, id)?.label ?? "未回答";
}

function scoreItem(id: CheckId, answers: Answers): CheckScore {
  const skipped: CheckScore = { id, score: null, summary: "今回は測定していません（採点から除外）" };
  switch (id) {
    case "balance": {
      const a = answers.balance;
      if (a?.status !== "answered") return skipped;
      const score = scoreBalance(a.value);
      if (score === null) return skipped;
      const side = (sideId: string | null) => (sideId ? labelOf(BALANCE_OPTIONS, sideId) : "未実施");
      return { id, score, summary: `左 ${side(a.value.left)} ／ 右 ${side(a.value.right)}` };
    }
    case "legs": {
      const a = answers.legs;
      if (a?.status !== "answered") return skipped;
      const score = scoreLegs(a.value);
      return score === null ? skipped : { id, score, summary: `30秒で ${a.value}回` };
    }
    case "flexibility": {
      const a = answers.flexibility;
      if (a?.status !== "answered") return skipped;
      const score = scoreChoice(FLEXIBILITY_OPTIONS, a.value);
      return score === null ? skipped : { id, score, summary: labelOf(FLEXIBILITY_OPTIONS, a.value) };
    }
    case "shoulder": {
      const a = answers.shoulder;
      if (a?.status !== "answered") return skipped;
      const score = scoreChoice(SHOULDER_OPTIONS, a.value);
      return score === null ? skipped : { id, score, summary: labelOf(SHOULDER_OPTIONS, a.value) };
    }
    case "condition": {
      const a = answers.condition;
      if (a?.status !== "answered") return skipped;
      const score = scoreCondition(a.value);
      if (score === null) return skipped;
      const often = CONDITION_QUESTIONS.filter((q) => a.value[q.id] === CONDITION_OFTEN_OPTION_ID).length;
      return { id, score, summary: often > 0 ? `「よくある」が${often}問` : "大きな不調は少なめ" };
    }
  }
}

/** すべての回答から結果を計算する（このアプリの採点の中心） */
export function calculateResult(answers: Answers): ScoreResult {
  const items = CHECK_ORDER.map((id) => scoreItem(id, answers));
  const answered = items.filter((i): i is CheckScore & { score: number } => i.score !== null);

  const total =
    answered.length === 0
      ? null
      : Math.round(
          (answered.reduce((sum, i) => sum + i.score, 0) / (answered.length * MAX_POINTS_PER_CHECK)) * 100,
        );

  const order = (id: CheckId) => CHECK_ORDER.indexOf(id);
  const strengths = answered
    .filter((i) => i.score >= SCORING_CONFIG.strengthMinPoints)
    .sort((a, b) => b.score - a.score || order(a.id) - order(b.id))
    .map((i) => i.id);
  const improvements = answered
    .filter((i) => i.score <= SCORING_CONFIG.improvementMaxPoints)
    .sort((a, b) => a.score - b.score || order(a.id) - order(b.id))
    .map((i) => i.id);

  const shoulder = answers.shoulder;
  const condition = answers.condition;

  return {
    items,
    total,
    rank: total === null ? null : getRank(total),
    answeredCount: answered.length,
    insufficient: answered.length < SCORING_CONFIG.minAnsweredForReliable,
    strengths,
    improvements,
    painFlags: {
      shoulderPain: shoulder?.status === "answered" && shoulder.value === SHOULDER_PAIN_OPTION_ID,
      dailyPainOften:
        condition?.status === "answered" &&
        condition.value[CONDITION_PAIN_QUESTION_ID] === CONDITION_OFTEN_OPTION_ID,
    },
  };
}

/** 「柔軟性と下半身の筋持久力」のように、項目名を自然な日本語でつなげる */
export function joinCheckNames(ids: CheckId[]): string {
  const names = ids.map((id) => CHECK_META[id].resultName);
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join("、")}と${names[names.length - 1]}`;
}

/** 結果画面のメッセージ文を作る */
export function buildResultMessages(result: ScoreResult): { headline: string; detail: string; closing: string } {
  if (result.total === null) {
    return {
      headline: "今回は採点できる項目がありませんでした",
      detail: "体調のよいときに、できる項目だけでも試してみてください。",
      closing: "無理をせず、ご自分のペースで大丈夫です。",
    };
  }
  const headline = `あなたのカラダコンディションは${result.total}点！`;
  const focus = result.improvements.slice(0, SCORING_CONFIG.maxImprovementsInMessage);
  let detail: string;
  if (focus.length > 0) {
    detail = `今回のチェックでは、${joinCheckNames(focus)}に改善の余地が見られました。`;
  } else if (result.strengths.length > 0) {
    detail = `今回のチェックでは、${joinCheckNames(result.strengths.slice(0, 2))}が特に良好でした。`;
  } else {
    detail = "今回のチェックでは、全体的にバランスのとれた結果でした。";
  }
  const closing =
    focus.length > 0 ? "まずは無理のないセルフケアから始めてみましょう！" : "今の良い状態をキープしていきましょう！";
  return { headline, detail, closing };
}
