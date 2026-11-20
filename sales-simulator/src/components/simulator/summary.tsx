import { Target, TrendingUp, Wallet, AlertCircle, CheckCircle2 } from "lucide-react";
import { formatInt, formatPercent, type SimInput, type SimResult } from "@/lib/sim";
import { cn } from "@/lib/utils";

/** 画面上部の4つの重要指標 */
export function SummaryCards({ input, result }: { input: SimInput; result: SimResult }) {
  const achieved = result.achievementRate !== null && result.achievementRate >= 100;
  const rate = result.achievementRate;

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Kpi
        icon={<Wallet />}
        label="月間総売上"
        value={formatInt(result.totalSales)}
        unit="円"
        className="col-span-2 bg-navy-800 text-white lg:col-span-1"
        labelClass="text-navy-100"
        unitClass="text-navy-100"
      />
      <Kpi icon={<Target />} label="目標売上" value={formatInt(input.basic.targetSales)} unit="円" />
      <Kpi
        icon={<TrendingUp />}
        label="目標達成率"
        value={rate === null ? "—" : formatPercent(rate).replace("%", "")}
        unit={rate === null ? "" : "%"}
        footer={
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200" aria-hidden>
            <div
              className={cn("h-full rounded-full", achieved ? "bg-acu" : "bg-navy-700")}
              style={{ width: `${Math.min(100, rate ?? 0)}%` }}
            />
          </div>
        }
      />
      <Kpi
        icon={achieved ? <CheckCircle2 /> : <AlertCircle />}
        label={achieved ? "目標超過額" : "目標までの不足"}
        value={formatInt(achieved ? result.surplus : result.shortfall)}
        unit="円"
        valueClass={achieved ? "text-acu" : result.shortfall > 0 ? "text-red-600" : undefined}
        className="col-span-2 sm:col-span-1 lg:col-span-1"
      />
    </div>
  );
}

function Kpi({
  icon,
  label,
  value,
  unit,
  footer,
  className,
  labelClass,
  unitClass,
  valueClass,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  unit: string;
  footer?: React.ReactNode;
  className?: string;
  labelClass?: string;
  unitClass?: string;
  valueClass?: string;
}) {
  return (
    <div className={cn("rounded-2xl border border-slate-200 bg-white p-4 shadow-sm", className)}>
      <div className={cn("flex items-center gap-1.5 text-xs font-semibold text-slate-500 [&_svg]:size-4", labelClass)}>
        {icon}
        {label}
      </div>
      <div className={cn("num mt-1 text-2xl font-extrabold leading-tight sm:text-3xl", valueClass)}>
        {value}
        <span className={cn("ml-1 text-sm font-bold text-slate-500", unitClass)}>{unit}</span>
      </div>
      {footer}
    </div>
  );
}

/** ヘッダー直下に常に表示する細いバー（スクロールしても総売上が見える） */
export function StickyTotal({ result }: { result: SimResult }) {
  const rate = result.achievementRate;
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="text-navy-100">総売上</span>
      <span className="num text-lg font-extrabold text-white">
        {formatInt(result.totalSales)}
        <span className="ml-0.5 text-xs font-semibold text-navy-100">円</span>
      </span>
      <span className="ml-auto text-navy-100">達成率</span>
      <span className={cn("num font-extrabold", rate !== null && rate >= 100 ? "text-green-300" : "text-white")}>
        {formatPercent(rate)}
      </span>
    </div>
  );
}
