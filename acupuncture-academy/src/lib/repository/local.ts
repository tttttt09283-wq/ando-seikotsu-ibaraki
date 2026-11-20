import { emptyState, type LearningRepository, type LearningState } from "./types";

const KEY = "acu-academy:learning-state:v1";

/** ブラウザの localStorage に保存する実装（初期版の既定） */
export const localRepository: LearningRepository = {
  label: "この端末（ローカル保存）",
  async load() {
    try {
      const raw = window.localStorage.getItem(KEY);
      if (!raw) return emptyState();
      const parsed = JSON.parse(raw) as Partial<LearningState>;
      return { ...emptyState(), ...parsed, version: 1 };
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
