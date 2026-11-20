import { cloneInput, DEFAULT_INPUT } from "./defaults";
import { sanitizeInput } from "./sanitize";
import type { SimInput } from "./types";

export type ScenarioId = "current" | "improve" | "challenge";

export const SCENARIOS: { id: ScenarioId; label: string; short: string }[] = [
  { id: "current", label: "現在値", short: "現在" },
  { id: "improve", label: "改善案", short: "改善" },
  { id: "challenge", label: "挑戦目標", short: "挑戦" },
];

export interface SavedScenario {
  input: SimInput;
  /** ISO 日時。一度も保存していなければ null */
  savedAt: string | null;
}

export interface StoredState {
  version: 1;
  active: ScenarioId;
  scenarios: Record<ScenarioId, SavedScenario>;
}

export const STORAGE_KEY = "seikotsu-sales-simulator:v1";

export function createInitialState(): StoredState {
  return {
    version: 1,
    active: "current",
    scenarios: {
      current: { input: cloneInput(DEFAULT_INPUT), savedAt: null },
      improve: { input: cloneInput(DEFAULT_INPUT), savedAt: null },
      challenge: { input: cloneInput(DEFAULT_INPUT), savedAt: null },
    },
  };
}

const isScenarioId = (v: unknown): v is ScenarioId =>
  v === "current" || v === "improve" || v === "challenge";

/** JSON文字列から状態を復元。壊れていても必ず有効な状態を返す */
export function parseStoredState(json: string | null): StoredState {
  const initial = createInitialState();
  if (!json) return initial;
  try {
    const raw = JSON.parse(json) as Partial<StoredState> | null;
    if (!raw || typeof raw !== "object") return initial;
    const scenarios = { ...initial.scenarios };
    for (const { id } of SCENARIOS) {
      const s = raw.scenarios?.[id];
      if (s && typeof s === "object") {
        scenarios[id] = {
          input: sanitizeInput(s.input, DEFAULT_INPUT),
          savedAt: typeof s.savedAt === "string" ? s.savedAt : null,
        };
      }
    }
    return { version: 1, active: isScenarioId(raw.active) ? raw.active : "current", scenarios };
  } catch {
    return initial;
  }
}

export function serializeState(state: StoredState): string {
  return JSON.stringify(state);
}

export function inputsEqual(a: SimInput, b: SimInput): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
