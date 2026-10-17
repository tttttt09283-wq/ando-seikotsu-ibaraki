"use client";

/** 導入チェックリスト（チェックした状態はこのブラウザに保存） */
import { useEffect, useState } from "react";

const KEY = "ando-body-check:sales-checklist:v1";

export function Checklist({ items }: { items: string[] }) {
  const [done, setDone] = useState<Record<string, boolean>>({});
  useEffect(() => {
    try {
      setDone(JSON.parse(window.localStorage.getItem(KEY) || "{}") || {});
    } catch {
      // 保存できない環境でも使えるようにする
    }
  }, []);
  const toggle = (k: string) =>
    setDone((prev) => {
      const next = { ...prev, [k]: !prev[k] };
      try {
        window.localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        // 保存できなくても表示は続ける
      }
      return next;
    });
  const count = items.filter((i) => done[i]).length;
  return (
    <div className="rounded-3xl bg-white p-5">
      <p className="text-sm font-black text-navy-900">
        進み具合：{count} / {items.length}
      </p>
      <ul className="mt-3 space-y-2">
        {items.map((it) => (
          <li key={it}>
            <label className="flex cursor-pointer items-start gap-3 rounded-2xl border-2 border-slate-100 p-3 has-[:checked]:border-brand-300 has-[:checked]:bg-brand-50">
              <input type="checkbox" checked={!!done[it]} onChange={() => toggle(it)} className="mt-0.5 size-5 accent-brand-600" />
              <span className="text-sm leading-relaxed text-navy-900">{it}</span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}
