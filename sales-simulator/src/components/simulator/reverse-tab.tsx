"use client";

import { useMemo } from "react";
import { ArrowRight, CalendarDays, Check, ClipboardList, Footprints, Target, UserRound, Users, X } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  formatInt,
  formatOneDecimal,
  formatSigned,
  reverseCalculate,
  type ReverseCase,
  type SimInput,
} from "@/lib/sim";
import { cn } from "@/lib/utils";
import { NumberField } from "./number-field";

type Update = (mutate: (draft: SimInput) => void) => void;

export function ReverseTab({ input, update }: { input: SimInput; update: Update }) {
  const r = useMemo(() => reverseCalculate(input), [input]);
  const achieved = r.gap <= 0;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <span className="grid size-9 place-items-center rounded-xl bg-navy-50 text-navy-700 [&_svg]:size-5">
            <Target />
          </span>
          <div>
            <CardTitle>目標売上を入力</CardTitle>
            <CardDescription>現在の構成比・単価・来院頻度をもとに、必要な数字を逆算します</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <NumberField
            label="月間目標売上"
            unit="円"
            step={50_000}
            value={input.basic.targetSales}
            sliderMax={15_000_000}
            onChange={(v) => update((d) => { d.basic.targetSales = v; })}
          />
          <div
            className={cn(
              "rounded-xl p-4",
              achieved ? "bg-acu-soft text-green-900" : "bg-red-50 text-red-900",
            )}
          >
            <p className="text-sm font-semibold">{achieved ? "現状で目標を達成しています" : "現状と目標の差"}</p>
            <p className="num mt-1 text-3xl font-extrabold">
              {achieved ? formatSigned(-r.gap, "円") : `あと ${formatInt(r.gap)}円`}
            </p>
            <p className="num mt-1 text-xs opacity-80">
              現状 {formatInt(r.currentSales)}円 → 目標 {formatInt(r.targetSales)}円
            </p>
          </div>
        </CardContent>
      </Card>

      <section>
        <h2 className="mb-2 px-1 text-sm font-bold text-slate-700">カルテ数で達成する場合に必要な数字</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <Metric icon={<ClipboardList />} label="必要稼働カルテ数" value={formatInt(r.requiredKarte)} unit="枚" big />
          <Metric
            icon={<ClipboardList />}
            label="追加で必要なカルテ数"
            value={r.additionalKarte === null ? "—" : `+${formatInt(r.additionalKarte)}`}
            unit="枚"
            big
            tone={r.additionalKarte ? "alert" : "ok"}
          />
          <Metric icon={<Footprints />} label="必要延べ来院数" value={formatInt(r.requiredVisits)} unit="回" />
          <Metric icon={<CalendarDays />} label="1日平均必要来院数" value={formatOneDecimal(r.requiredVisitsPerDay)} unit="回" />
          <Metric icon={<Users />} label="スタッフ1人あたり必要売上" value={formatInt(r.requiredSalesPerStaff)} unit="円" />
          <Metric icon={<UserRound />} label="スタッフ1人あたり現状売上" value={formatInt(r.currentSalesPerStaff)} unit="円" />
        </div>
        {r.requiredKarte === null && (
          <p className="mt-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
            来院数に連動する売上が0のため、カルテ数を増やしても目標に届きません。
          </p>
        )}
      </section>

      <Card>
        <CardContent className="grid gap-3 pt-4 sm:grid-cols-3 sm:pt-5">
          <Split label="固定売上（物販・その他）" value={r.fixedSales} note="カルテ数が変わっても一定" />
          <Split label="連動売上（保険・自費施術・EMS）" value={r.variableSales} note="来院数に比例して増減" />
          <Split
            label="カルテ1枚あたり連動売上"
            value={r.variablePerKarte}
            note="必要カルテ数は端数を含めて1枚ずつ探索"
          />
        </CardContent>
      </Card>

      <section>
        <h2 className="mb-1 px-1 text-sm font-bold text-slate-700">4つの改善策を比較</h2>
        <p className="mb-2 px-1 text-xs text-slate-500">
          それぞれ「その項目だけ」を変えた場合に、目標を達成する最小の値です（他の条件は現状のまま）。
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {r.cases.map((c) => (
            <CaseCard key={c.key} c={c} />
          ))}
        </div>
      </section>
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
  unit,
  big,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  unit: string;
  big?: boolean;
  tone?: "alert" | "ok";
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 [&_svg]:size-4">
        {icon}
        {label}
      </div>
      <div
        className={cn(
          "num mt-1 font-extrabold leading-tight text-slate-900",
          big ? "text-3xl" : "text-2xl",
          tone === "alert" && "text-red-600",
          tone === "ok" && "text-acu",
        )}
      >
        {value}
        {value !== "—" && <span className="ml-1 text-sm font-bold text-slate-500">{unit}</span>}
      </div>
    </div>
  );
}

function Split({ label, value, note }: { label: string; value: number | null; note: string }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className="num text-xl font-extrabold text-slate-900">
        {formatInt(value)}
        {value !== null && <span className="ml-0.5 text-xs font-bold text-slate-500">円</span>}
      </p>
      <p className="text-xs text-slate-400">{note}</p>
    </div>
  );
}

function fmt(c: ReverseCase, v: number | null) {
  if (v === null) return "—";
  return c.key === "visits" || c.key === "acuRate" ? formatOneDecimal(v) : formatInt(v);
}

function CaseCard({ c }: { c: ReverseCase }) {
  const decimals = c.key === "visits" || c.key === "acuRate";
  const unitLabel = c.key === "acuRate" ? "pt" : c.unit;
  const status = !c.achievable ? "ng" : c.alreadyAchieved ? "done" : "ok";

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-bold text-slate-900">{c.label}</p>
          <p className="text-xs text-slate-500">{c.description}</p>
        </div>
        <span
          className={cn(
            "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold [&_svg]:size-3.5",
            status === "ng" && "bg-slate-100 text-slate-600",
            status === "ok" && "bg-navy-50 text-navy-700",
            status === "done" && "bg-acu-soft text-acu",
          )}
        >
          {status === "ng" ? <X /> : <Check />}
          {status === "ng" ? "これだけでは届かない" : status === "done" ? "達成済み" : "達成可能"}
        </span>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <div className="flex-1 rounded-xl bg-slate-50 p-2.5 text-center">
          <p className="text-xs text-slate-500">現在</p>
          <p className="num text-lg font-bold text-slate-700">
            {fmt(c, c.current)}
            <span className="ml-0.5 text-xs">{c.unit}</span>
          </p>
        </div>
        <ArrowRight className="size-5 shrink-0 text-slate-400" />
        <div className={cn("flex-1 rounded-xl p-2.5 text-center", c.achievable ? "bg-navy-800 text-white" : "bg-slate-100")}>
          <p className={cn("text-xs", c.achievable ? "text-navy-100" : "text-slate-500")}>必要</p>
          <p className="num text-lg font-extrabold">
            {fmt(c, c.required)}
            {c.required !== null && <span className="ml-0.5 text-xs">{c.unit}</span>}
          </p>
        </div>
      </div>

      {c.achievable ? (
        <p className="num mt-2 text-sm text-slate-600">
          差：<span className="font-bold text-slate-900">{formatSigned(c.delta, unitLabel, decimals)}</span>
          <span className="ml-2 text-xs text-slate-500">（試算売上 {formatInt(c.resultingSales)}円）</span>
        </p>
      ) : (
        <p className="mt-2 text-sm text-slate-500">{c.note}</p>
      )}
    </div>
  );
}
