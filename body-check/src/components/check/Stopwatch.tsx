"use client";

/**
 * 計測用タイマー
 *  - countup：片足立ちの秒数を計る（ストップウォッチ）
 *  - countdown：30秒椅子立ち上がりの残り時間を表示
 */
import { useEffect, useRef, useState } from "react";
import { cx } from "@/components/ui";

type Mode = "countup" | "countdown";

export function Stopwatch({
  mode,
  seconds = 30,
  onStop,
  children,
}: {
  mode: Mode;
  /** countdown の秒数 / countup の上限 */
  seconds?: number;
  /** 計測を止めたときに経過秒数を渡す */
  onStop?: (elapsedSeconds: number) => void;
  children?: (elapsed: number | null) => React.ReactNode;
}) {
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState<number | null>(null);
  const startRef = useRef(0);
  const announcedRef = useRef<string>("");
  const [announce, setAnnounce] = useState("");

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => {
      const e = (Date.now() - startRef.current) / 1000;
      if (e >= seconds) {
        setElapsed(seconds);
        setRunning(false);
        if (mode === "countdown") {
          setAnnounce("終了！回数を入力してください");
          navigator.vibrate?.([200, 100, 200]);
        }
        onStop?.(seconds);
        return;
      }
      setElapsed(e);
      // 読み上げは10秒ごとだけ（うるさくならないように）
      const mark = `${Math.floor(e / 10)}`;
      if (mode === "countdown" && mark !== announcedRef.current && Math.floor(e) % 10 === 0 && e > 1) {
        announcedRef.current = mark;
        setAnnounce(`残り${Math.ceil(seconds - e)}秒`);
      }
    }, 100);
    return () => window.clearInterval(timer);
  }, [running, seconds, mode, onStop]);

  const start = () => {
    startRef.current = Date.now();
    announcedRef.current = "";
    setElapsed(0);
    setAnnounce(mode === "countdown" ? "スタート！" : "計測スタート");
    setRunning(true);
  };

  const stop = () => {
    const e = (Date.now() - startRef.current) / 1000;
    setRunning(false);
    setElapsed(e);
    setAnnounce(`${Math.floor(e)}秒で停止しました`);
    onStop?.(e);
  };

  const display =
    elapsed === null
      ? mode === "countdown"
        ? seconds
        : 0
      : mode === "countdown"
        ? Math.max(0, Math.ceil(seconds - elapsed))
        : Math.floor(elapsed);

  const finished = mode === "countdown" && elapsed !== null && elapsed >= seconds && !running;

  return (
    <div className="rounded-3xl bg-navy-900 p-5 text-center text-white">
      <p className="text-xs font-bold tracking-widest text-sun-300">{mode === "countdown" ? "のこり時間" : "ストップウォッチ"}</p>
      <p className={cx("my-1 font-black tabular-nums", finished ? "text-4xl text-sun-300" : "text-6xl")} aria-hidden="true">
        {finished ? "終了！" : display}
        {!finished && <span className="ml-1 text-2xl">秒</span>}
      </p>
      <p className="sr-only" aria-live="polite">
        {announce}
      </p>
      {running ? (
        <button
          type="button"
          onClick={stop}
          className="mt-2 min-h-12 w-full rounded-full bg-sun-400 px-6 text-lg font-black text-navy-900 active:bg-sun-500"
        >
          {mode === "countdown" ? "途中でやめる" : "ストップ"}
        </button>
      ) : (
        <button
          type="button"
          onClick={start}
          className="mt-2 min-h-12 w-full rounded-full bg-white px-6 text-lg font-black text-navy-900 active:bg-brand-100"
        >
          {elapsed === null ? "スタート" : "もう一度はかる"}
        </button>
      )}
      {children?.(running ? null : elapsed)}
    </div>
  );
}
