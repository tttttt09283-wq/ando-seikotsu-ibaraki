import "server-only";
// AI 経営参謀：Claude API をサーバー側だけで呼ぶ（API キーはブラウザに出さない）
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { AdvisorOutputSchema } from "../schemas";
import type { AdvisorOutput, InsightKind } from "../types";
import type { AdvisorPayload } from "../domain/advisor";
import { env } from "./env";

export const KIND_LABEL: Record<InsightKind, string> = {
  weekly: "週間振り返り",
  monthly: "月間経営レビュー",
  gap: "目標と実績の差分分析",
  bottleneck: "ボトルネック特定",
  timing: "独立時期の見直し",
  time: "時間配分の改善提案",
};

// 毎回同じ文面にしてプロンプトキャッシュを効かせる（日付などの可変情報はユーザーメッセージ側に置く）
const SYSTEM = `あなたは、鍼灸・整体の自費施術とAI業務改善事業の「二刀流」で、従業員を雇わずに独立を目指す個人事業主の経営参謀です。
渡されるのは事業KPI・目標・独立条件の判定結果・タスク名だけです。患者の個人情報は含まれていませんし、推測もしないでください。

方針：
- 必ず渡された数値を使って説明する。数値がない項目は「データ不足」と明記し、推測で埋めない。
- 家族時間と健康を犠牲にする提案はしない。週の労働時間の上限を守る。
- 退職や独立を勧めたり、決定したりしない。判断材料を示すにとどめる。
- 税金・社会保険・法的要件は概算・一般論にとどめ、専門家（税理士・保健所など）への確認を促す。
- 医療効果を保証する表現（「必ず治る」など）を使った集客は提案しない。

出力（日本語）：
- current（現状）：数値を使って現在地を3〜5文で説明
- issues（最大の課題）：重要な問題を最大2つ。title と detail
- actions（推奨行動）：今週実行する行動をちょうど3つ。title・purpose・estimate_minutes（5〜240）・due_in_days（1〜14）・mandala_code（関連するマンダラのコード例 "A8"。該当なしは ""）・done_criteria
- expected（期待する変化）：数値目標と検証方法
- cautions（注意点）：仮定・不確実性・不足データ`;

export async function runAdvisor(payload: AdvisorPayload, kind: InsightKind): Promise<{ output: AdvisorOutput; model: string }> {
  if (!env.anthropicKey) throw new Error("ANTHROPIC_API_KEY が設定されていません");
  const client = new Anthropic({ apiKey: env.anthropicKey, timeout: 120_000, maxRetries: 2 });
  let res;
  try {
    res = await client.beta.messages.parse({
      model: env.anthropicModel,
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      output_config: { effort: "medium", format: betaZodOutputFormat(AdvisorOutputSchema) },
      // 安全分類器で断られた場合にサーバー側で別モデルに切り替える
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      cache_control: { type: "ephemeral" },
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: `分析の種類：${KIND_LABEL[kind]}\n\n以下のデータ（JSON）をもとに分析してください。\n${JSON.stringify(payload)}`,
        },
      ],
    });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw new Error("AI API キーが無効です。設定を確認してください");
    if (e instanceof Anthropic.RateLimitError) throw new Error("AI API の利用上限に達しました。しばらくしてから再実行してください");
    if (e instanceof Anthropic.BadRequestError) throw new Error(`AI API へのリクエストが不正です（${e.message}）`);
    if (e instanceof Anthropic.APIError) throw new Error(`AI API でエラーが発生しました（${e.status ?? ""}）`);
    throw new Error("AI API に接続できませんでした");
  }
  if (res.stop_reason === "refusal") throw new Error("AI が回答を控えました。入力内容を見直して再実行してください");
  if (res.stop_reason === "max_tokens") throw new Error("AI の回答が長すぎて途中で終わりました。もう一度実行してください");
  const parsed = AdvisorOutputSchema.safeParse(res.parsed_output);
  if (!parsed.success) throw new Error("AI の回答を読み取れませんでした。もう一度実行してください");
  const o = parsed.data;
  return {
    model: res.model,
    output: {
      current: o.current,
      issues: o.issues.slice(0, 2),
      actions: o.actions.slice(0, 3).map((a) => ({ ...a, estimate_minutes: Math.max(5, Math.min(240, Math.round(a.estimate_minutes))), due_in_days: Math.max(1, Math.min(14, Math.round(a.due_in_days))) })),
      expected: o.expected.slice(0, 5),
      cautions: o.cautions.slice(0, 6),
    },
  };
}
