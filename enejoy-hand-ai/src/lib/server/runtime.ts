import "server-only";
import { DEMO_TIMING, getLimits } from "@/config/limits";
import { DemoExecutor } from "@/lib/engine/demo-executor";
import { syncSheets, type EngineDeps } from "@/lib/engine/engine";
import { fetchSheetGrid, sheetsAuthMode } from "@/lib/import/google-sheets";
import type { Usage } from "@/lib/engine/executor";
import { getStore } from "@/lib/store/store";
import type { DataMode } from "@/lib/types";

/**
 * 実行モードの判定。
 * 第1段階では Claude API 接続が未実装のため、常に DEMO MODE で動作する。
 * APIキーが設定されていても、本番エンジンが実装されるまでは本番データ（AIの成果物）を作らない。
 */
export type RuntimeInfo = {
  mode: DataMode;
  reason: string;
  claudeKeyConfigured: boolean;
  supabaseConfigured: boolean;
  passcodeConfigured: boolean;
  storage: string;
  /** 日計表の読み取り方法 */
  sheetsAuth: "service_account" | "public_link";
  /** 日計表の自動同期の間隔（分） */
  sheetSyncMinutes: number;
};

function sheetSyncMinutes(): number {
  const n = Number.parseInt(process.env.EH_SHEET_SYNC_MINUTES ?? "5", 10);
  return Number.isFinite(n) && n >= 1 ? Math.min(n, 1440) : 5;
}

export function getRuntimeInfo(): RuntimeInfo {
  const claudeKeyConfigured = Boolean(process.env.ANTHROPIC_API_KEY);
  const supabaseConfigured = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
  return {
    mode: "demo",
    reason: claudeKeyConfigured
      ? "Claude APIキーは設定済みですが、本番エンジン（Claude API連携）が未実装のためDEMO MODEで動作しています。"
      : "Claude APIキー・Supabaseが未設定のため、DEMO MODEで動作しています。",
    claudeKeyConfigured,
    supabaseConfigured,
    passcodeConfigured: Boolean(process.env.OPERATOR_PASSCODE),
    storage: getStore().description,
    sheetsAuth: sheetsAuthMode(),
    sheetSyncMinutes: sheetSyncMinutes(),
  };
}

/** デモの推定単価（円/トークン）。実際の請求額ではない。 */
const DEMO_JPY_PER_INPUT_TOKEN = 0.00045;
const DEMO_JPY_PER_OUTPUT_TOKEN = 0.00225;

function demoCost(u: Usage): number {
  return Math.round((u.inputTokens * DEMO_JPY_PER_INPUT_TOKEN + u.outputTokens * DEMO_JPY_PER_OUTPUT_TOKEN) * 100) / 100;
}

const globalForDeps = globalThis as unknown as { __ehDeps?: EngineDeps; __ehSheetTimer?: ReturnType<typeof setInterval> };

/**
 * 日計表の自動同期。アプリが起動している間、一定間隔で「今月」の日計表を読み取る（読み取りのみ）。
 * 過去の月は確定済みのため、手動の「全月を再取得」でのみ読み直す。
 */
function startSheetSync(deps: EngineDeps) {
  if (globalForDeps.__ehSheetTimer || process.env.VITEST || process.env.NEXT_PHASE === "phase-production-build") return;
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      await syncSheets(deps, fetchSheetGrid);
    } catch (e) {
      console.error("[enejoy-hand-ai] sheet sync failed", e);
    } finally {
      running = false;
    }
  };
  globalForDeps.__ehSheetTimer = setInterval(run, sheetSyncMinutes() * 60_000);
  globalForDeps.__ehSheetTimer.unref?.();
  setTimeout(run, 3_000).unref?.();
}

export function getEngineDeps(): EngineDeps {
  if (!globalForDeps.__ehDeps) {
    globalForDeps.__ehDeps = {
      store: getStore(),
      executor: new DemoExecutor(),
      limits: getLimits(),
      timing: DEMO_TIMING,
      now: () => new Date(),
      costOf: demoCost,
      workerId: `pid${process.pid}`,
    };
    startSheetSync(globalForDeps.__ehDeps);
  }
  return globalForDeps.__ehDeps;
}
