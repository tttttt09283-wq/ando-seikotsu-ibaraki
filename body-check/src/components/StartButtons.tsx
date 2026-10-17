"use client";

/**
 * トップページの開始ボタン。
 * 前回の途中データがあれば「続きから再開」を、結果があれば「前回の結果を見る」を表示します。
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { clearState, hasDraft, loadState, type CheckState } from "@/lib/storage";
import { buttonStyles } from "./ui";

export function StartButtons() {
  const router = useRouter();
  const [saved, setSaved] = useState<CheckState | null>(null);

  useEffect(() => {
    setSaved(loadState());
  }, []);

  const startFresh = () => {
    clearState();
    router.push("/check");
  };

  return (
    <div className="space-y-3">
      {hasDraft(saved) && (
        <div className="rounded-3xl border-2 border-dashed border-brand-300 bg-white p-4 text-center" role="status">
          <p className="text-sm font-bold text-navy-900">前回の途中から再開できます</p>
          <Link href="/check" className={`${buttonStyles.secondary} mt-3`}>
            続きから再開する
          </Link>
        </div>
      )}
      {saved?.completedAt && (
        <Link href="/result" className={buttonStyles.secondary}>
          前回の結果を見る
        </Link>
      )}
      <button type="button" onClick={startFresh} className={buttonStyles.primary}>
        無料でチェックする
        <span aria-hidden="true">▶</span>
      </button>
    </div>
  );
}

/** メニュー画面用：カラダ年齢チェックの「続きから」「前回の結果」だけを小さく出す */
export function ResumeLinks() {
  const [saved, setSaved] = useState<CheckState | null>(null);
  useEffect(() => {
    setSaved(loadState());
  }, []);
  if (!hasDraft(saved) && !saved?.completedAt) return null;
  return (
    <div className="flex flex-wrap items-center justify-center gap-2 rounded-2xl bg-white p-3 text-sm font-bold">
      <span className="text-navy-700">🧍 カラダ年齢チェック：</span>
      {hasDraft(saved) && (
        <Link href="/check" className="rounded-full bg-brand-50 px-3 py-1 text-brand-700 underline-offset-4">
          続きから再開
        </Link>
      )}
      {saved?.completedAt && (
        <Link href="/result" className="rounded-full bg-brand-50 px-3 py-1 text-brand-700 underline-offset-4">
          前回の結果を見る
        </Link>
      )}
    </div>
  );
}
