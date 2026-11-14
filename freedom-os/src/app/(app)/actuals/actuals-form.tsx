"use client";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronLeft, ChevronRight, Trash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/common/field";
import { useAction } from "@/components/common/use-action";
import { addMonths } from "@/lib/date";
import { calcOverall } from "@/lib/domain/calc";
import { monthJa, pct, yen } from "@/lib/format";
import { MonthlyActualsSchema, type MonthlyActualsInput } from "@/lib/schemas";
import { deleteMonthlyActualsAction, saveMonthlyActualsAction } from "../actions";

type Group = "revenue" | "expenses" | "clinic" | "ai" | "household";
const FIELDS: Record<Group, { key: string; label: string; unit: "円" | "件" | "人" | "社" | "日" | "時間" | "個" }[]> = {
  revenue: [
    { key: "clinic_treatment", label: "施術売上", unit: "円" },
    { key: "clinic_other", label: "施術その他（物販など）", unit: "円" },
    { key: "ai_initial", label: "AI 初期導入売上", unit: "円" },
    { key: "ai_recurring", label: "AI 月額売上", unit: "円" },
    { key: "ai_product", label: "AI デジタル商品売上", unit: "円" },
    { key: "ai_other", label: "AI その他売上", unit: "円" },
  ],
  expenses: [
    { key: "clinic_consumables", label: "施術：消耗品費", unit: "円" },
    { key: "clinic_advertising", label: "施術：広告費", unit: "円" },
    { key: "clinic_payment_fees", label: "施術：決済手数料", unit: "円" },
    { key: "clinic_rent", label: "施術：家賃・光熱費（按分）", unit: "円" },
    { key: "clinic_equipment", label: "施術：設備・備品", unit: "円" },
    { key: "clinic_other", label: "施術：その他", unit: "円" },
    { key: "ai_server", label: "AI：サーバー費", unit: "円" },
    { key: "ai_ai_api", label: "AI：API 利用料", unit: "円" },
    { key: "ai_outsourcing", label: "AI：外注費", unit: "円" },
    { key: "ai_other", label: "AI：その他", unit: "円" },
    { key: "common_advertising", label: "共通：広告・発信", unit: "円" },
    { key: "common_other", label: "共通：その他（通信・学習など）", unit: "円" },
  ],
  clinic: [
    { key: "sessions", label: "施術件数", unit: "件" },
    { key: "new_patients", label: "新患数", unit: "人" },
    { key: "active_patients", label: "継続患者数（月末時点）", unit: "人" },
    { key: "cancellations", label: "キャンセル数", unit: "件" },
    { key: "available_slots", label: "予約枠数", unit: "件" },
    { key: "work_days", label: "営業日数", unit: "日" },
    { key: "inquiries", label: "問い合わせ数", unit: "件" },
    { key: "sns_inflow", label: "SNS からの流入数", unit: "件" },
    { key: "referrals", label: "紹介数", unit: "件" },
  ],
  ai: [
    { key: "new_contracts", label: "新規契約数", unit: "社" },
    { key: "active_contracts", label: "継続契約数（月末時点）", unit: "社" },
    { key: "churned_contracts", label: "解約数", unit: "社" },
    { key: "products_sold", label: "デジタル商品販売数", unit: "個" },
    { key: "maintenance_hours", label: "保守時間", unit: "時間" },
    { key: "dev_hours", label: "開発時間", unit: "時間" },
  ],
  household: [
    { key: "employment_income_net", label: "本業の手取り", unit: "円" },
    { key: "other_income", label: "その他の収入", unit: "円" },
    { key: "living_cost", label: "家計の生活費", unit: "円" },
    { key: "emergency_fund_balance", label: "生活防衛資金の残高（月末）", unit: "円" },
  ],
};

const n = (v: unknown) => (v === "" || v == null ? 0 : Number(v) || 0);

export function ActualsForm({
  month,
  thisMonth,
  values,
  prevActive,
  prevContracts,
  taxRate,
  defaults,
}: {
  month: string;
  thisMonth: string;
  values: Record<string, unknown>;
  prevActive: number | null;
  prevContracts: number | null;
  taxRate: number;
  defaults: { employment: number; living: number };
}) {
  const router = useRouter();
  const { pending, exec } = useAction();
  const form = useForm<MonthlyActualsInput>({ resolver: zodResolver(MonthlyActualsSchema), defaultValues: values as MonthlyActualsInput });
  const { register, handleSubmit, control, formState, setValue } = form;
  const w = useWatch({ control }) as Record<string, Record<string, unknown>>;
  const clinicRev = n(w.revenue?.clinic_treatment) + n(w.revenue?.clinic_other);
  const aiRev = n(w.revenue?.ai_initial) + n(w.revenue?.ai_recurring) + n(w.revenue?.ai_product) + n(w.revenue?.ai_other);
  const exp = Object.values(w.expenses ?? {}).reduce<number>((s, v) => s + n(v), 0);
  const o = calcOverall({ clinicRevenue: clinicRev, aiRevenue: aiRev, expenses: exp, taxSocialRate: taxRate, livingCost: n(w.household?.living_cost), employmentIncome: n(w.household?.employment_income_net), otherIncome: n(w.household?.other_income) });
  const go = (m: string) => router.push(`/actuals?month=${m.slice(0, 7)}`);
  const errOf = (g: Group, k: string) => (formState.errors as Record<string, Record<string, { message?: string }>>)[g]?.[k]?.message;

  const section = (g: Group, title: string, desc?: string) => (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        {desc && <CardDescription>{desc}</CardDescription>}
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {FIELDS[g].map((f) => (
          <Field key={f.key} label={`${f.label}（${f.unit}）`} htmlFor={`${g}.${f.key}`} error={errOf(g, f.key)}>
            <Input id={`${g}.${f.key}`} inputMode={f.unit === "時間" ? "decimal" : "numeric"} placeholder="未入力" className="num text-right" {...register(`${g}.${f.key}` as never)} />
          </Field>
        ))}
      </CardContent>
    </Card>
  );

  return (
    <form onSubmit={handleSubmit((v) => exec(() => saveMonthlyActualsAction(v)))} className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="icon" onClick={() => go(addMonths(month, -1))} aria-label="前の月"><ChevronLeft /></Button>
        <Input type="month" value={month.slice(0, 7)} onChange={(e) => e.target.value && go(`${e.target.value}-01`)} className="w-44" aria-label="対象月" />
        <Button type="button" variant="outline" size="icon" onClick={() => go(addMonths(month, 1))} aria-label="次の月"><ChevronRight /></Button>
        {month !== thisMonth && <Button type="button" variant="ghost" size="sm" onClick={() => go(thisMonth)}>今月へ</Button>}
        <span className="text-lg font-semibold">{monthJa(month)}</span>
      </div>

      {/* 入力中の集計（実績） */}
      <div className="bg-card sticky top-[52px] z-20 grid grid-cols-2 gap-2 rounded-xl border p-3 text-sm shadow-sm sm:grid-cols-5 lg:top-2">
        <Sum label="施術売上" v={yen(clinicRev)} />
        <Sum label="AI売上" v={yen(aiRev)} />
        <Sum label="事業経費" v={`${yen(exp)}${o.expenseRatio != null ? `（${pct(o.expenseRatio)}）` : ""}`} />
        <Sum label="事業利益" v={yen(o.profit)} strong />
        <Sum label="税引後手取り（概算）" v={yen(o.disposableBusiness)} />
      </div>

      {section("revenue", "売上", "施術とAI事業を分けて入力します")}
      {section("expenses", "事業経費")}
      {section("clinic", "施術指標", prevActive != null ? `前月の継続患者数 ${prevActive}人（継続率の計算に使います）` : "継続患者数と新患数を毎月入れると、継続率を自動計算します")}
      {section("ai", "AI事業指標", prevContracts != null ? `前月の継続契約 ${prevContracts}社（解約率の計算に使います）` : undefined)}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">家計</CardTitle>
          <CardDescription>生活防衛資金・本業収入は独立判定に使います</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {FIELDS.household.map((f) => (
              <Field key={f.key} label={`${f.label}（円）`} htmlFor={`household.${f.key}`} error={errOf("household", f.key)}>
                <Input id={`household.${f.key}`} inputMode="numeric" placeholder="未入力" className="num text-right" {...register(`household.${f.key}` as never)} />
              </Field>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => { setValue("household.employment_income_net", defaults.employment as never); setValue("household.living_cost", defaults.living as never); }}>
              設定の値（手取り {yen(defaults.employment)}・生活費 {yen(defaults.living)}）を入れる
            </Button>
          </div>
          <Field label="メモ" htmlFor="household.note"><Textarea id="household.note" rows={2} {...register("household.note")} /></Field>
        </CardContent>
      </Card>

      <div className="flex flex-wrap justify-between gap-2">
        <Button
          type="button"
          variant="ghost"
          className="text-status-red"
          onClick={() => confirm(`${monthJa(month)}の実績をすべて削除しますか？`) && exec(() => deleteMonthlyActualsAction(month), { onOk: () => router.refresh() })}
        >
          <Trash />この月を削除
        </Button>
        <Button type="submit" size="lg" disabled={pending}>{pending ? "保存中…" : `${monthJa(month)}の実績を保存`}</Button>
      </div>
    </form>
  );
}

function Sum({ label, v, strong }: { label: string; v: string; strong?: boolean }) {
  return (
    <div>
      <div className="text-muted-foreground text-[11px]">{label}</div>
      <div className={`num ${strong ? "text-base font-bold" : "font-semibold"}`}>{v}</div>
    </div>
  );
}
