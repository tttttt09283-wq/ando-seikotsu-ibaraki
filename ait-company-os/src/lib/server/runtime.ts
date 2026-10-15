import "server-only";
import { DEMO_TIMING, getLimits } from "@/config/limits";
import { DemoExecutor } from "@/lib/engine/demo-executor";
import type { EngineDeps } from "@/lib/engine/engine";
import type { Usage } from "@/lib/engine/executor";
import { getStore } from "@/lib/store/store";
import type { DataMode } from "@/lib/types";

/**
 * 実行モードの判定。
 * PHASE 1 では Claude API 接続（PHASE 3）が未実装のため、常に DEMO MODE で動作する。
 * APIキーが設定されていても、本番エンジンが実装されるまでは本番データを作らない。
 */
export type RuntimeInfo = {
  mode: DataMode;
  reason: string;
  claudeKeyConfigured: boolean;
  supabaseConfigured: boolean;
  passcodeConfigured: boolean;
  storage: string;
};

export function getRuntimeInfo(): RuntimeInfo {
  const claudeKeyConfigured = Boolean(process.env.ANTHROPIC_API_KEY);
  const supabaseConfigured = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
  return {
    mode: "demo",
    reason: claudeKeyConfigured
      ? "Claude APIキーは設定済みですが、本番エンジン（PHASE 3）が未実装のためDEMO MODEで動作しています。"
      : "Claude APIキー・Supabaseが未設定のため、DEMO MODEで動作しています。",
    claudeKeyConfigured,
    supabaseConfigured,
    passcodeConfigured: Boolean(process.env.CEO_PASSCODE),
    storage: getStore().description,
  };
}

/** デモの推定単価（円/トークン）。実際の請求額ではない。 */
const DEMO_JPY_PER_INPUT_TOKEN = 0.00045;
const DEMO_JPY_PER_OUTPUT_TOKEN = 0.00225;

function demoCost(u: Usage): number {
  return Math.round((u.inputTokens * DEMO_JPY_PER_INPUT_TOKEN + u.outputTokens * DEMO_JPY_PER_OUTPUT_TOKEN) * 100) / 100;
}

const globalForDeps = globalThis as unknown as { __aitDeps?: EngineDeps };

export function getEngineDeps(): EngineDeps {
  if (!globalForDeps.__aitDeps) {
    globalForDeps.__aitDeps = {
      store: getStore(),
      executor: new DemoExecutor(),
      limits: getLimits(),
      timing: DEMO_TIMING,
      now: () => new Date(),
      costOf: demoCost,
      workerId: `pid${process.pid}`,
    };
  }
  return globalForDeps.__aitDeps;
}
