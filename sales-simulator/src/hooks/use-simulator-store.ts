"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  cloneInput,
  createInitialState,
  DEFAULT_INPUT,
  inputsEqual,
  parseStoredState,
  serializeState,
  STORAGE_KEY,
  type ScenarioId,
  type SimInput,
  type StoredState,
} from "@/lib/sim";

type Drafts = Record<ScenarioId, SimInput>;

function draftsFrom(state: StoredState): Drafts {
  return {
    current: cloneInput(state.scenarios.current.input),
    improve: cloneInput(state.scenarios.improve.input),
    challenge: cloneInput(state.scenarios.challenge.input),
  };
}

function readStorage(): StoredState {
  try {
    return parseStoredState(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return createInitialState();
  }
}

function writeStorage(state: StoredState): boolean {
  try {
    window.localStorage.setItem(STORAGE_KEY, serializeState(state));
    return true;
  } catch {
    return false;
  }
}

/**
 * 3パターン（現在値・改善案・挑戦目標）の状態管理。
 * - drafts: 画面で編集中の値（パターンを切り替えても保持）
 * - saved: 保存ボタンで localStorage に書き込んだ値（再読み込み後も保持）
 */
export function useSimulatorStore() {
  const [saved, setSaved] = useState<StoredState>(createInitialState);
  const [drafts, setDrafts] = useState<Drafts>(() => draftsFrom(createInitialState()));
  const [active, setActiveState] = useState<ScenarioId>("current");
  const [hydrated, setHydrated] = useState(false);

  // SSRとの不一致を避けるため、localStorage はマウント後に読む
  useEffect(() => {
    const stored = readStorage();
    setSaved(stored);
    setDrafts(draftsFrom(stored));
    setActiveState(stored.active);
    setHydrated(true);
  }, []);

  const input = drafts[active];

  const update = useCallback(
    (mutate: (draft: SimInput) => void) => {
      setDrafts((prev) => {
        const next = cloneInput(prev[active]);
        mutate(next);
        return { ...prev, [active]: next };
      });
    },
    [active],
  );

  const setActive = useCallback((id: ScenarioId) => {
    setActiveState(id);
    setSaved((prev) => {
      const next = { ...prev, active: id };
      writeStorage(next);
      return next;
    });
  }, []);

  /** 表示中のパターンを保存。成功したら true */
  const save = useCallback((): boolean => {
    const next: StoredState = {
      ...saved,
      active,
      scenarios: {
        ...saved.scenarios,
        [active]: { input: cloneInput(drafts[active]), savedAt: new Date().toISOString() },
      },
    };
    const ok = writeStorage(next);
    if (ok) setSaved(next);
    return ok;
  }, [saved, drafts, active]);

  /** 表示中のパターンを初期値（デモ値）に戻す。保存はしない */
  const reset = useCallback(() => {
    setDrafts((prev) => ({ ...prev, [active]: cloneInput(DEFAULT_INPUT) }));
  }, [active]);

  /** 別パターンの内容を表示中のパターンにコピー */
  const copyFrom = useCallback(
    (from: ScenarioId) => {
      setDrafts((prev) => ({ ...prev, [active]: cloneInput(prev[from]) }));
    },
    [active],
  );

  const dirty = useMemo(
    () => ({
      current: !inputsEqual(drafts.current, saved.scenarios.current.input),
      improve: !inputsEqual(drafts.improve, saved.scenarios.improve.input),
      challenge: !inputsEqual(drafts.challenge, saved.scenarios.challenge.input),
    }),
    [drafts, saved],
  );

  return { input, drafts, saved, active, setActive, update, save, reset, copyFrom, dirty, hydrated };
}

export type SimulatorStore = ReturnType<typeof useSimulatorStore>;
