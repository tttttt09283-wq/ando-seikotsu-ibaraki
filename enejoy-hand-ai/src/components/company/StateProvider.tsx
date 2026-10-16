"use client";

import * as React from "react";
import type { RuntimeInfo } from "@/lib/server/runtime";
import type { CompanySnapshot } from "@/lib/view";

type Selection = { kind: "member"; id: string } | { kind: "task"; id: string } | null;

type Ctx = {
  snapshot: CompanySnapshot;
  runtime: RuntimeInfo;
  /** サーバーとの最終同期時刻 */
  syncedAt: number;
  connectionError: string | null;
  refresh: () => Promise<void>;
  /** 状態を変更するAPIを呼び、成功時はスナップショットを反映する */
  mutate: (path: string, body?: unknown) => Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; error: string }>;
  selection: Selection;
  openMember: (id: string) => void;
  openTask: (id: string) => void;
  closePanel: () => void;
};

const CompanyContext = React.createContext<Ctx | null>(null);

export function useCompany(): Ctx {
  const ctx = React.useContext(CompanyContext);
  if (!ctx) throw new Error("useCompany must be used inside <CompanyStateProvider>");
  return ctx;
}

const FAST_MS = 1200;
const SLOW_MS = 6000;

export function CompanyStateProvider({
  initialSnapshot,
  initialRuntime,
  children,
}: {
  initialSnapshot: CompanySnapshot;
  initialRuntime: RuntimeInfo;
  children: React.ReactNode;
}) {
  const [snapshot, setSnapshot] = React.useState(initialSnapshot);
  const [runtime, setRuntime] = React.useState(initialRuntime);
  const [syncedAt, setSyncedAt] = React.useState(() => Date.now());
  const [connectionError, setConnectionError] = React.useState<string | null>(null);
  const [selection, setSelection] = React.useState<Selection>(null);
  const busyRef = React.useRef(initialSnapshot.busy);

  const apply = React.useCallback((data: { snapshot?: CompanySnapshot; runtime?: RuntimeInfo }) => {
    if (data.snapshot) {
      setSnapshot(data.snapshot);
      busyRef.current = data.snapshot.busy;
    }
    if (data.runtime) setRuntime(data.runtime);
    setSyncedAt(Date.now());
    setConnectionError(null);
  }, []);

  const refresh = React.useCallback(async () => {
    try {
      const res = await fetch("/api/state", { cache: "no-store" });
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      apply(await res.json());
    } catch {
      setConnectionError("サーバーと通信できません。自動で再接続します。");
    }
  }, [apply]);

  // ポーリング：処理中は速く、待機中はゆっくり。タブが非表示の間は止める。
  React.useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;
    const loop = async () => {
      if (stopped) return;
      if (document.visibilityState === "visible") await refresh();
      timer = setTimeout(loop, busyRef.current ? FAST_MS : SLOW_MS);
    };
    timer = setTimeout(loop, busyRef.current ? FAST_MS : SLOW_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  const mutate = React.useCallback<Ctx["mutate"]>(
    async (path, body) => {
      try {
        const res = await fetch(path, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body ?? {}),
        });
        const data = await res.json().catch(() => ({}));
        if (res.status === 401) {
          window.location.href = "/login";
          return { ok: false, error: "ログインが必要です" };
        }
        if (!res.ok) return { ok: false, error: (data as { error?: string }).error ?? `エラー（${res.status}）` };
        apply(data);
        return { ok: true, data };
      } catch {
        return { ok: false, error: "通信に失敗しました。もう一度お試しください。" };
      }
    },
    [apply],
  );

  const value = React.useMemo<Ctx>(
    () => ({
      snapshot,
      runtime,
      syncedAt,
      connectionError,
      refresh,
      mutate,
      selection,
      openMember: (id) => setSelection({ kind: "member", id }),
      openTask: (id) => setSelection({ kind: "task", id }),
      closePanel: () => setSelection(null),
    }),
    [snapshot, runtime, syncedAt, connectionError, refresh, mutate, selection],
  );

  return <CompanyContext.Provider value={value}>{children}</CompanyContext.Provider>;
}

/** 相対時刻表示のために1秒ごとに再描画する */
export function useNow(intervalMs = 1000): Date {
  const [now, setNow] = React.useState(() => new Date());
  React.useEffect(() => {
    const t = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
