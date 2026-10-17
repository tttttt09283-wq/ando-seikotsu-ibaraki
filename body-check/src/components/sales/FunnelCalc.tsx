"use client";

/** 活用手順ページの「見込み計算」：チェック数と各段階の割合から、月の新規来院・成約の目安を出す */
import { useState } from "react";

const FIELDS = [
  { key: "checks", label: "1か月のチェック実施数", unit: "人", min: 0, max: 2000, step: 10 },
  { key: "bookRate", label: "結果からの予約率", unit: "%", min: 0, max: 100, step: 1 },
  { key: "visitRate", label: "予約からの来院率", unit: "%", min: 0, max: 100, step: 1 },
  { key: "contractRate", label: "来院からの継続・成約率", unit: "%", min: 0, max: 100, step: 1 },
  { key: "unitPrice", label: "成約1件あたりの売上", unit: "円", min: 0, max: 1000000, step: 1000 },
] as const;
type Key = (typeof FIELDS)[number]["key"];

export function FunnelCalc() {
  const [v, setV] = useState<Record<Key, number>>({ checks: 100, bookRate: 10, visitRate: 80, contractRate: 50, unitPrice: 30000 });
  const books = Math.round(v.checks * v.bookRate / 100 * 10) / 10;
  const visits = Math.round(books * v.visitRate / 100 * 10) / 10;
  const contracts = Math.round(visits * v.contractRate / 100 * 10) / 10;
  const sales = Math.round(contracts * v.unitPrice);
  return (
    <div className="rounded-3xl bg-white p-5">
      <div className="grid gap-3 sm:grid-cols-5">
        {FIELDS.map((f) => (
          <label key={f.key} className="block text-xs font-bold text-navy-700">
            {f.label}
            <span className="mt-1 flex items-center gap-1">
              <input
                type="number"
                inputMode="numeric"
                min={f.min}
                max={f.max}
                step={f.step}
                value={v[f.key]}
                onChange={(e) => setV({ ...v, [f.key]: Math.max(f.min, Math.min(f.max, Number(e.target.value) || 0)) })}
                className="w-full rounded-xl border-2 border-slate-200 px-2 py-1.5 text-right text-base font-bold text-navy-900"
              />
              <span>{f.unit}</span>
            </span>
          </label>
        ))}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ["予約", books, "件"],
          ["来院", visits, "人"],
          ["継続・成約", contracts, "人"],
          ["売上の目安", sales.toLocaleString("ja-JP"), "円"],
        ].map(([l, n, u]) => (
          <div key={String(l)} className="rounded-2xl bg-brand-50 p-3 text-center">
            <p className="text-xs font-bold text-brand-700">{l}</p>
            <p className="text-2xl font-black text-navy-900">
              {n}
              <span className="text-sm">{u}</span>
            </p>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs leading-relaxed text-slate-600">
        ※ 初期値は計算の例です（実績や効果を保証するものではありません）。貴院の数字を入れて、目標づくりにお使いください。
      </p>
    </div>
  );
}
