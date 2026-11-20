"use client";

import { Building2, HandCoins, Hand, Sparkles, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { formatInt, formatOneDecimal, formatPercent, type SimInput, type SimResult } from "@/lib/sim";
import { cn } from "@/lib/utils";
import { ComputedRow, NumberField } from "./number-field";
import { SummaryCards } from "./summary";

type Update = (mutate: (draft: SimInput) => void) => void;

interface Props {
  input: SimInput;
  result: SimResult;
  update: Update;
}

export function SimulatorTab({ input, result, update }: Props) {
  return (
    <div className="space-y-4">
      <SummaryCards input={input} result={result} />

      {result.warnings.length > 0 && (
        <div className="space-y-1 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          {result.warnings.map((w) => (
            <p key={w} className="flex gap-2">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              {w}
            </p>
          ))}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <BasicCard input={input} result={result} update={update} />
        <JudoCard input={input} result={result} update={update} />
        <AcuCard input={input} result={result} update={update} />
        <SelfCard input={input} result={result} update={update} />
      </div>
    </div>
  );
}

function SectionCard({
  icon,
  title,
  description,
  total,
  tone,
  children,
  results,
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
  total?: number;
  tone: "navy" | "judo" | "acu" | "self";
  children: React.ReactNode;
  results: React.ReactNode;
}) {
  const toneMap = {
    navy: { bar: "bg-navy-700", icon: "bg-navy-50 text-navy-700", box: "bg-navy-50", badge: "bg-navy-100 text-navy-800" },
    judo: { bar: "bg-judo", icon: "bg-judo-soft text-judo", box: "bg-judo-soft", badge: "bg-judo-soft text-judo" },
    acu: { bar: "bg-acu", icon: "bg-acu-soft text-acu", box: "bg-acu-soft", badge: "bg-acu-soft text-acu" },
    self: { bar: "bg-self", icon: "bg-self-soft text-self", box: "bg-self-soft", badge: "bg-self-soft text-self" },
  }[tone];

  return (
    <Card className="overflow-hidden">
      <div className={cn("h-1", toneMap.bar)} />
      <CardHeader>
        <span className={cn("grid size-9 place-items-center rounded-xl [&_svg]:size-5", toneMap.icon)}>{icon}</span>
        <div className="min-w-0 flex-1">
          <CardTitle>{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </div>
        {total !== undefined && (
          <Badge className={cn("num text-sm", toneMap.badge)}>{formatInt(total)}円</Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-5">
        {children}
        <div className={cn("divide-y divide-white/80 rounded-xl px-3 py-1", toneMap.box)}>{results}</div>
      </CardContent>
    </Card>
  );
}

function BasicCard({ input, result, update }: Props) {
  const b = input.basic;
  return (
    <SectionCard
      icon={<Building2 />}
      title="基本設定"
      description="患者数と来院頻度"
      tone="navy"
      results={
        <>
          <ComputedRow label="月間延べ来院数（自動計算）" value={formatInt(result.totalVisits)} unit="回" strong />
          <ComputedRow
            label="1日あたり平均来院数"
            value={formatOneDecimal(result.visitsPerDay)}
            unit="回"
          />
        </>
      }
    >
      <NumberField label="稼働カルテ数" unit="枚" value={b.karteCount} sliderMax={500} onChange={(v) => update((d) => { d.basic.karteCount = v; })} />
      <NumberField
        label="1カルテあたり月間平均来院回数"
        unit="回"
        decimal
        step={0.1}
        max={31}
        value={b.visitsPerKarte}
        sliderMax={15}
        onChange={(v) => update((d) => { d.basic.visitsPerKarte = v; })}
      />
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <NumberField label="診療日数" unit="日" max={31} value={b.workingDays} sliderMax={31} onChange={(v) => update((d) => { d.basic.workingDays = v; })} />
        <NumberField label="スタッフ人数" unit="人" value={b.staffCount} sliderMax={20} onChange={(v) => update((d) => { d.basic.staffCount = v; })} />
      </div>
      <NumberField
        label="月間目標売上"
        unit="円"
        step={50_000}
        value={b.targetSales}
        sliderMax={15_000_000}
        onChange={(v) => update((d) => { d.basic.targetSales = v; })}
      />
    </SectionCard>
  );
}

function JudoCard({ input, result, update }: Props) {
  const j = input.judo;
  return (
    <SectionCard
      icon={<Hand />}
      title="柔整保険"
      description="延べ来院数のうち柔整保険で対応した割合"
      total={result.judo.total}
      tone="judo"
      results={
        <>
          <ComputedRow label="柔整保険 延べ対応数" value={formatInt(result.judo.count)} unit="回" />
          <ComputedRow label="柔整保険 窓口売上" value={formatInt(result.judo.copaySales)} unit="円" />
          <ComputedRow label="柔整保険 請求売上" value={formatInt(result.judo.claimSales)} unit="円" />
          <ComputedRow label="柔整保険 合計売上" value={formatInt(result.judo.total)} unit="円" strong />
        </>
      }
    >
      <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2">
        <div>
          <p className="text-sm font-semibold text-slate-700">延べ対応数を直接入力</p>
          <p className="text-xs text-slate-500">オフ：対応率から自動計算</p>
        </div>
        <Switch
          checked={j.useManualCount}
          aria-label="柔整保険の延べ対応数を直接入力する"
          onCheckedChange={(checked) =>
            update((d) => {
              d.judo.useManualCount = checked;
              // 切替時は今の件数を引き継ぐ（数字が急に変わらないように）
              if (checked) d.judo.manualCount = result.judo.count;
              else if (result.totalVisits > 0)
                d.judo.rate = Math.round((result.judo.count / result.totalVisits) * 1000) / 10;
            })
          }
        />
      </div>
      {j.useManualCount ? (
        <NumberField
          label="柔整保険 延べ対応数"
          unit="回"
          accent="judo"
          value={j.manualCount}
          sliderMax={Math.max(result.totalVisits, 1)}
          hint={`対応率 ${formatPercent(result.judo.effectiveRate)}（延べ来院数 ${formatInt(result.totalVisits)}回に対して）`}
          onChange={(v) => update((d) => { d.judo.manualCount = v; })}
        />
      ) : (
        <NumberField
          label="柔整保険 対応率"
          unit="%"
          accent="judo"
          decimal
          max={100}
          value={j.rate}
          sliderMax={100}
          onChange={(v) => update((d) => { d.judo.rate = v; })}
        />
      )}
      <NumberField label="1対応あたり平均窓口負担額" unit="円" accent="judo" step={10} value={j.copay} sliderMax={3_000} onChange={(v) => update((d) => { d.judo.copay = v; })} />
      <NumberField label="1対応あたり平均保険者請求額" unit="円" accent="judo" step={10} value={j.claim} sliderMax={6_000} onChange={(v) => update((d) => { d.judo.claim = v; })} />
    </SectionCard>
  );
}

function AcuCard({ input, result, update }: Props) {
  const a = input.acu;
  return (
    <SectionCard
      icon={<HandCoins />}
      title="鍼灸保険"
      description="柔整との併用も可（来院数は重複して数えません）"
      total={result.acu.total}
      tone="acu"
      results={
        <>
          <ComputedRow label="鍼灸保険 延べ対応数" value={formatInt(result.acu.count)} unit="回" />
          <ComputedRow label="内訳（1術 / 2術）" value={`${formatInt(result.acu.oneCount)} / ${formatInt(result.acu.twoCount)}`} unit="回" />
          <ComputedRow label="鍼灸保険 窓口売上" value={formatInt(result.acu.copaySales)} unit="円" />
          <ComputedRow label="鍼灸保険 請求売上" value={formatInt(result.acu.claimSales)} unit="円" />
          <ComputedRow label="鍼灸保険 合計売上" value={formatInt(result.acu.total)} unit="円" strong />
        </>
      }
    >
      <NumberField label="鍼灸保険 対応率" unit="%" accent="acu" decimal max={100} value={a.rate} sliderMax={100} onChange={(v) => update((d) => { d.acu.rate = v; })} />

      <div className="space-y-2 rounded-xl border border-slate-200 p-3">
        <div className="flex items-center justify-between text-sm font-semibold text-slate-700">
          <span>1術・2術の構成比</span>
          <span className="text-xs font-normal text-slate-500">合計100%</span>
        </div>
        <div className="flex h-7 overflow-hidden rounded-lg text-xs font-bold text-white" aria-hidden>
          <div className="grid place-items-center bg-acu/60 transition-all" style={{ width: `${result.acu.oneRate}%` }}>
            {result.acu.oneRate >= 12 && `1術 ${formatPercent(result.acu.oneRate)}`}
          </div>
          <div className="grid place-items-center bg-acu transition-all" style={{ width: `${result.acu.twoRate}%` }}>
            {result.acu.twoRate >= 12 && `2術 ${formatPercent(result.acu.twoRate)}`}
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 pt-1 sm:grid-cols-2">
          <NumberField label="1術 対応率" unit="%" accent="acu" decimal max={100} value={a.oneRate} sliderMax={100} onChange={(v) => update((d) => { d.acu.oneRate = v; })} />
          <NumberField
            label="2術 対応率"
            unit="%"
            accent="acu"
            decimal
            max={100}
            value={result.acu.twoRate}
            sliderMax={100}
            onChange={(v) => update((d) => { d.acu.oneRate = Math.round((100 - v) * 10) / 10; })}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div className="space-y-4">
          <p className="text-xs font-bold text-acu">1術</p>
          <NumberField label="平均窓口負担額" unit="円" accent="acu" step={10} value={a.one.copay} sliderMax={2_000} onChange={(v) => update((d) => { d.acu.one.copay = v; })} />
          <NumberField label="平均保険者請求額" unit="円" accent="acu" step={10} value={a.one.claim} sliderMax={5_000} onChange={(v) => update((d) => { d.acu.one.claim = v; })} />
        </div>
        <div className="space-y-4">
          <p className="text-xs font-bold text-acu">2術</p>
          <NumberField label="平均窓口負担額" unit="円" accent="acu" step={10} value={a.two.copay} sliderMax={2_000} onChange={(v) => update((d) => { d.acu.two.copay = v; })} />
          <NumberField label="平均保険者請求額" unit="円" accent="acu" step={10} value={a.two.claim} sliderMax={5_000} onChange={(v) => update((d) => { d.acu.two.claim = v; })} />
        </div>
      </div>
    </SectionCard>
  );
}

function SelfCard({ input, result, update }: Props) {
  const s = input.self;
  return (
    <SectionCard
      icon={<Sparkles />}
      title="自費売上"
      description="自費施術・EMS・物販・その他は別々に1回だけ計上"
      total={result.self.total}
      tone="self"
      results={
        <>
          <ComputedRow label="自費施術 売上" value={formatInt(result.self.treatmentSales)} unit="円" />
          <ComputedRow label="EMS 利用件数" value={formatInt(result.self.emsCount)} unit="件" />
          <ComputedRow label="EMS 売上" value={formatInt(result.self.emsSales)} unit="円" />
          <ComputedRow label="物販・その他" value={formatInt(s.productSales + s.otherSales)} unit="円" />
          <ComputedRow label="自費売上 合計" value={formatInt(result.self.total)} unit="円" strong />
        </>
      }
    >
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <NumberField label="自費施術 延べ件数" unit="件" accent="self" value={s.treatmentCount} sliderMax={Math.max(500, result.totalVisits)} onChange={(v) => update((d) => { d.self.treatmentCount = v; })} />
        <NumberField label="自費施術 平均単価" unit="円" accent="self" step={100} value={s.treatmentPrice} sliderMax={15_000} onChange={(v) => update((d) => { d.self.treatmentPrice = v; })} />
      </div>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <NumberField label="EMS 利用率" unit="%" accent="self" decimal max={100} value={s.emsRate} sliderMax={100} hint="延べ来院数に対する割合" onChange={(v) => update((d) => { d.self.emsRate = v; })} />
        <NumberField label="EMS 平均単価" unit="円" accent="self" step={100} value={s.emsPrice} sliderMax={10_000} onChange={(v) => update((d) => { d.self.emsPrice = v; })} />
      </div>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <NumberField label="物販売上" unit="円" accent="self" step={10_000} value={s.productSales} sliderMax={1_000_000} onChange={(v) => update((d) => { d.self.productSales = v; })} />
        <NumberField label="その他売上" unit="円" accent="self" step={10_000} value={s.otherSales} sliderMax={1_000_000} onChange={(v) => update((d) => { d.self.otherSales = v; })} />
      </div>
    </SectionCard>
  );
}
