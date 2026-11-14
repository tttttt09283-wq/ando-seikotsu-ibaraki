"use client";
import { useForm } from "react-hook-form";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/common/field";
import { useAction } from "@/components/common/use-action";
import { SettingsSchema } from "@/lib/schemas";
import type { Profile, UserSettings } from "@/lib/types";
import { saveProfile, saveSettings } from "../actions";

type FormValues = Record<string, string>;

const GROUPS: { title: string; desc?: string; fields: { k: keyof UserSettings; label: string; type?: "date" | "percent" | "text"; hint?: string }[] }[] = [
  {
    title: "現在の本業",
    fields: [
      { k: "employment_annual_income", label: "本業の年収（額面・円）" },
      { k: "employment_monthly_takehome", label: "本業の手取り（月・円）", hint: "独立前の試算に使用" },
      { k: "employment_weekly_hours", label: "本業の労働時間（週・時間）" },
    ],
  },
  {
    title: "目標",
    desc: "売上（月商）・事業所得（利益）・税引後手取りは区別して扱います",
    fields: [
      { k: "target_monthly_revenue", label: "最終目標の月商（円）" },
      { k: "target_clinic_revenue", label: "施術売上の目標（月・円）" },
      { k: "target_ai_revenue", label: "AI事業売上の目標（月・円）" },
      { k: "target_annual_business_income", label: "年間事業所得の目標（円）" },
      { k: "target_year", label: "目標年" },
      { k: "independence_target_date", label: "目標独立判断日", type: "date" },
    ],
  },
  {
    title: "家計・税金（概算）",
    fields: [
      { k: "living_cost_monthly", label: "家計の生活費（月・円）" },
      { k: "tax_social_rate", label: "税金・社会保険の概算負担率（%）", type: "percent", hint: "事業利益に掛ける概算。正確な申告計算ではありません" },
      { k: "emergency_fund_months_min", label: "生活防衛資金の最低月数" },
      { k: "emergency_fund_months_target", label: "生活防衛資金の目標月数" },
    ],
  },
  {
    title: "働き方・時間",
    fields: [
      { k: "max_weekly_work_hours", label: "独立後の労働時間の上限（週・時間）" },
      { k: "work_days_per_week", label: "理想の勤務日数（週）" },
      { k: "family_hours_weekly_target", label: "家族時間の目標（週・時間）" },
      { k: "weekly_discretionary_hours", label: "睡眠・身支度以外の時間（週・時間）", hint: "家族時間の推計 = この時間 − 労働時間" },
      { k: "daily_available_minutes", label: "1日に使える時間（分）", hint: "今日の最重要1＋補助2の合計がこの時間を超えないように提案" },
    ],
  },
  {
    title: "ロードマップの表示範囲",
    fields: [
      { k: "roadmap_start", label: "開始日", type: "date" },
      { k: "roadmap_end", label: "終了日", type: "date" },
    ],
  },
];

export function SettingsForm({ settings, profile }: { settings: UserSettings; profile: Profile | null }) {
  const { pending, exec } = useAction();
  const defaults: FormValues = {};
  for (const g of GROUPS) for (const f of g.fields) defaults[f.k] = f.type === "percent" ? String(Math.round(Number(settings[f.k]) * 1000) / 10) : String(settings[f.k] ?? "");
  defaults.core_values = settings.core_values.join("、");
  const { register, handleSubmit } = useForm<FormValues>({ defaultValues: defaults });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [name, setName] = useState(profile?.display_name ?? "");
  const [occupation, setOccupation] = useState(profile?.occupation ?? "");

  const submit = (v: FormValues) => {
    const payload: Record<string, unknown> = { ...v, tax_social_rate: Number(v.tax_social_rate) / 100, core_values: v.core_values.split(/[、,，\s]+/).map((x) => x.trim()).filter(Boolean) };
    const p = SettingsSchema.safeParse(payload);
    if (!p.success) {
      setErrors(Object.fromEntries(p.error.issues.map((i) => [String(i.path[0]), i.message])));
      return;
    }
    setErrors({});
    exec(() => saveSettings(p.data));
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base">プロフィール</CardTitle></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <Field label="表示名" htmlFor="pname"><Input id="pname" value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="現在の職業" htmlFor="pocc"><Input id="pocc" value={occupation} onChange={(e) => setOccupation(e.target.value)} /></Field>
          <Button variant="outline" disabled={pending} onClick={() => exec(() => saveProfile({ display_name: name, occupation }))}>保存</Button>
        </CardContent>
      </Card>
      <form onSubmit={handleSubmit(submit)} className="space-y-4">
        {GROUPS.map((g) => (
          <Card key={g.title}>
            <CardHeader>
              <CardTitle className="text-base">{g.title}</CardTitle>
              {g.desc && <CardDescription>{g.desc}</CardDescription>}
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {g.fields.map((f) => (
                <Field key={f.k} label={f.label} htmlFor={f.k} hint={f.hint} error={errors[f.k]}>
                  <Input id={f.k} type={f.type === "date" ? "date" : "text"} inputMode={f.type === "date" ? undefined : "decimal"} className={f.type === "date" ? "" : "num text-right"} {...register(f.k)} />
                </Field>
              ))}
            </CardContent>
          </Card>
        ))}
        <Card>
          <CardHeader><CardTitle className="text-base">大切にする価値観</CardTitle></CardHeader>
          <CardContent>
            <Field label="「、」区切りで入力" htmlFor="core_values" error={errors.core_values}><Input id="core_values" {...register("core_values")} /></Field>
          </CardContent>
        </Card>
        <div className="flex justify-end"><Button type="submit" size="lg" disabled={pending}>{pending ? "保存中…" : "設定を保存"}</Button></div>
      </form>
    </div>
  );
}
