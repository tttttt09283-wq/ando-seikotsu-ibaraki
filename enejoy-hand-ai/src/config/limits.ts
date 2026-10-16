/** 安全制限。AI社員が自分の判断で無制限に処理を実行しないための上限値。 */

function intEnv(name: string, fallback: number, min = 0, max = 1_000_000): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export type Limits = {
  dailyBudgetJpy: number;
  monthlyBudgetJpy: number;
  /** 会社全体で同時に動けるTask数 */
  maxConcurrentTasks: number;
  /** 1人のAI社員が同時に持てる実行中Task数 */
  maxConcurrentPerAgent: number;
  maxCommandsPerDay: number;
  /** 同時に進行できる指示の数 */
  maxActiveCommands: number;
  maxTasksPerCommand: number;
  /** エラー時の再試行上限 */
  maxAttempts: number;
  /** レビュー差し戻しの上限（無限ループ防止） */
  maxRevisions: number;
  /** 1回の処理サイクルで行う状態遷移の上限（無限ループ防止） */
  maxTransitionsPerTick: number;
  /** 連続失敗がこの回数に達したら会社全体を安全停止 */
  haltAfterConsecutiveFailures: number;
  /** 処理リースの有効期間（タイムアウト後は他のワーカーが再取得できる） */
  leaseMs: number;
};

export function getLimits(): Limits {
  return {
    dailyBudgetJpy: intEnv("EH_DAILY_BUDGET_JPY", 500, 0),
    monthlyBudgetJpy: intEnv("EH_MONTHLY_BUDGET_JPY", 10_000, 0),
    maxConcurrentTasks: intEnv("EH_MAX_CONCURRENT_TASKS", 3, 1, 20),
    maxConcurrentPerAgent: 1,
    maxCommandsPerDay: intEnv("EH_MAX_COMMANDS_PER_DAY", 30, 1, 500),
    maxActiveCommands: 3,
    maxTasksPerCommand: 8,
    maxAttempts: 3,
    maxRevisions: 2,
    maxTransitionsPerTick: 40,
    haltAfterConsecutiveFailures: 3,
    leaseMs: 60_000,
  };
}

/** デモの各工程にかける時間（ミリ秒）。画面で流れが追える程度の速さ。 */
export const DEMO_TIMING = {
  analyzeMs: 2000,
  thinkMs: 1200,
  workMs: 3000,
  reviewMs: 1800,
  reportMs: 2000,
} as const;
