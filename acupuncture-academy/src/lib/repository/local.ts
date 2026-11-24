import { emptyState, type LearningRepository, type LearningState } from "./types";

const KEY = "acu-academy:learning-state:v1";

/**
 * 旧バージョンの保存データを現行の形に変換する。
 * v1 → v2：「経絡とは何か」を第2章第1講（c2-l1）から第1章第1講（c1-l1）へ移動。
 */
export function migrate(state: Partial<LearningState> & { version?: number }): Partial<LearningState> {
  if ((state.version ?? 1) >= 2) return state;
  const json = JSON.stringify(state).replace(/\bc2-l1(?=["-])/g, "c1-l1");
  return { ...(JSON.parse(json) as Partial<LearningState>), version: 2 };
}

/** ブラウザの localStorage に保存する実装（初期版の既定） */
export const localRepository: LearningRepository = {
  label: "この端末（ローカル保存）",
  async load() {
    try {
      const raw = window.localStorage.getItem(KEY);
      if (!raw) return emptyState();
      const parsed = migrate(JSON.parse(raw) as Partial<LearningState> & { version?: number });
      return { ...emptyState(), ...parsed, version: 2 };
    } catch {
      return emptyState();
    }
  },
  async save(state: LearningState) {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      // 容量超過・プライベートモードなどでは保存できない。画面は動作を続ける。
    }
  },
  async clear() {
    try {
      window.localStorage.removeItem(KEY);
    } catch {
      /* noop */
    }
  },
};
