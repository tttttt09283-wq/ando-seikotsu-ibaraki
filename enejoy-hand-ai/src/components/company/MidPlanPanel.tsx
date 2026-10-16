"use client";

import Link from "next/link";
import { CircleCheck, Copy, LoaderCircle, Plus, Save, Send, Trash2 } from "lucide-react";
import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { MidPlanTable } from "@/lib/engine/midplan-metrics";
import { formatDateTime } from "@/lib/time";
import type { MidPlanScenario } from "@/lib/types";
import { cn } from "@/lib/utils";
import { TENANT } from "@/tenant";
import { formatOku } from "./RevenuePanel";
import { Message, type Msg } from "./SheetImport";
import { useClinics, useCompany } from "./StateProvider";

const man = (n: number | null | undefined) => (n == null ? "—" : `${Math.round(n / 10_000).toLocaleString("ja-JP")}`);
const pct = (r: number | null | undefined) => (r == null ? "" : String(Math.round(r * 1000) / 10));
const num = (s: string) => s.replace(/[^\d.]/g, "");
const ym = (m: string) => `${m.slice(0, 4)}年${Number(m.slice(5))}月`;

const inputCls = "focus-visible:ring-ring/50 h-8 rounded-md border bg-transparent px-1.5 text-right text-sm outline-none focus-visible:ring-[3px]";

/** 年度ごとの比較表（売上・前年比・院数・人員・1人あたり・利益の目安） */
function SummaryTable({ t }: { t: MidPlanTable }) {
  const cols = [
    ...(t.previous ? [{ key: "prev", head: t.previous.term, sub: `${t.previous.era}・実績`, y: null as MidPlanTable["years"][number] | null }] : []),
    ...t.years.map((y) => ({ key: y.fyStart, head: y.term, sub: `${y.era}・${y.kind === "current" ? "見込み" : "計画"}`, y })),
  ];
  type Row = { label: string; cell: (y: MidPlanTable["years"][number]) => React.ReactNode; prev?: React.ReactNode; strong?: boolean };
  const rows: Row[] = [
    { label: "売上", cell: (y) => formatOku(y.revenue), prev: t.previous ? formatOku(t.previous.revenue) : "", strong: true },
    { label: "前年比", cell: (y) => (y.yoy != null ? `${y.yoy}%` : "—") },
    { label: "うち既存店", cell: (y) => formatOku(y.existingRevenue) },
    { label: "うち新店", cell: (y) => (y.newRevenue ? formatOku(y.newRevenue) : "—") },
    { label: "売上目標", cell: (y) => (y.targetJpy != null ? formatOku(y.targetJpy) : "—") },
    {
      label: "目標との差",
      cell: (y) =>
        y.gap == null ? (
          "—"
        ) : (
          <span className={y.gap > 0 ? "text-amber-700 dark:text-amber-400" : "text-emerald-700 dark:text-emerald-400"}>
            {y.gap > 0 ? `−${formatOku(y.gap)}` : `+${formatOku(-y.gap)}`}
          </span>
        ),
    },
    { label: "院数（期末）", cell: (y) => `${y.clinicsOpen}院` },
    { label: "施術者（年平均・換算）", cell: (y) => (y.staffAvg != null ? `${y.staffAvg}人` : "—") },
    { label: "施術者1人あたり月売上", cell: (y) => (y.perStaffMonthly != null ? `${man(y.perStaffMonthly)}万円` : "—") },
    { label: "人件費の目安", cell: (y) => (y.laborJpy != null ? formatOku(y.laborJpy) : "—") },
    { label: "その他経費の目安", cell: (y) => (y.otherJpy != null ? formatOku(y.otherJpy) : "—") },
    {
      label: "営業利益の目安",
      cell: (y) => (y.profitJpy != null ? `${formatOku(y.profitJpy)}（${y.margin}%）` : "—"),
      strong: true,
    },
  ];
  return (
    <div className="-mx-1 overflow-x-auto">
      <table className="w-full min-w-[40rem] text-sm">
        <thead>
          <tr className="border-b">
            <th scope="col" className="bg-card sticky left-0 py-2 pr-2 pl-1 text-left text-xs font-medium" />
            {cols.map((c) => (
              <th key={c.key} scope="col" className={cn("px-2 py-2 text-right", c.y?.kind === "current" && "bg-brand/5")}>
                <span className="block font-semibold">{c.head}</span>
                <span className="text-muted-foreground block text-[11px] font-normal">{c.sub}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-b last:border-0">
              <th scope="row" className="bg-card sticky left-0 py-1.5 pr-2 pl-1 text-left text-xs font-medium whitespace-nowrap">
                {r.label}
              </th>
              {cols.map((c) => (
                <td key={c.key} className={cn("px-2 py-1.5 text-right tabular-nums", r.strong && "font-semibold", c.y?.kind === "current" && "bg-brand/5")}>
                  {c.y ? r.cell(c.y) : (r.prev ?? "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** 年度ごとの売上の棒（目標の線つき）。数字は表にもあるので、ここは見た目の比較だけ */
function Bars({ t }: { t: MidPlanTable }) {
  const items = [...(t.previous ? [{ key: "prev", label: t.previous.term, v: t.previous.revenue, target: null as number | null, kind: "prev" }] : []), ...t.years.map((y) => ({ key: y.fyStart, label: y.term, v: y.revenue, target: y.targetJpy, kind: y.kind }))];
  const max = Math.max(...items.map((i) => Math.max(i.v, i.target ?? 0)), 1);
  return (
    <div className="flex h-40 items-end gap-3" aria-hidden>
      {items.map((i) => (
        <div key={i.key} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
          <span className="text-[11px] font-medium tabular-nums">{formatOku(i.v)}</span>
          <div className="relative w-full max-w-16 flex-1">
            <div
              className={cn("absolute inset-x-0 bottom-0 rounded-t-md", i.kind === "prev" ? "bg-muted-foreground/30" : i.kind === "current" ? "bg-brand" : "bg-brand/50")}
              style={{ height: `${(i.v / max) * 100}%` }}
            />
            {i.target != null && <div className="absolute inset-x-[-4px] border-t-2 border-dashed border-amber-500" style={{ bottom: `${(i.target / max) * 100}%` }} />}
          </div>
          <span className="text-muted-foreground text-[11px]">{i.label}</span>
        </div>
      ))}
    </div>
  );
}

/** 院ごとの年間売上（万円）と成長率・人員 */
function ClinicYears({ t }: { t: MidPlanTable }) {
  const ids = [...new Set(t.years.flatMap((y) => y.rows.map((r) => r.id)))];
  return (
    <div className="-mx-1 overflow-x-auto">
      <table className="w-full min-w-[40rem] text-xs">
        <thead>
          <tr className="text-muted-foreground border-b">
            <th scope="col" className="bg-card sticky left-0 py-2 pr-2 pl-1 text-left font-medium">院</th>
            {t.years.map((y) => (
              <th key={y.fyStart} scope="col" className="px-2 py-2 text-right font-medium">
                {y.term}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ids.map((id) => {
            const name = t.years.flatMap((y) => y.rows).find((r) => r.id === id)!.name;
            return (
              <tr key={id} className="border-b">
                <th scope="row" className="bg-card sticky left-0 py-1.5 pr-2 pl-1 text-left text-sm font-medium whitespace-nowrap">
                  {name}
                </th>
                {t.years.map((y) => {
                  const r = y.rows.find((x) => x.id === id);
                  return (
                    <td key={y.fyStart} className="px-2 py-1.5 text-right tabular-nums">
                      {r ? (
                        <>
                          <span className="text-sm">{man(r.annual)}</span>
                          <span className="text-muted-foreground block text-[10px]">
                            {r.isNew && y.kind === "plan" && !r.growth ? "新店" : r.imported ? "取り込んだ計画" : r.growth ? `×${pct(r.growth)}%` : y.kind === "current" ? "見込み" : ""}
                            {r.staff != null ? `・${r.staff}人` : ""}
                          </span>
                        </>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="text-muted-foreground mt-1 text-[11px]">単位：万円（年間）。今期は実績＋今月の着地予想＋これからの月の確定予算。</p>
    </div>
  );
}

type YearForm = { growth: string; target: string; note: string; clinicGrowth: Record<string, string>; staff: Record<string, string>; clear: string[] };
type StoreForm = { id?: string; name: string; openMonth: string; start: string; mature: string; ramp: string; staff: string };
type Form = { name: string; note: string; labor: string; other: string; years: Record<string, YearForm>; stores: StoreForm[] };

function toForm(s: MidPlanScenario, fys: string[]): Form {
  const years: Record<string, YearForm> = {};
  for (const fy of fys) {
    const y = s.years.find((x) => x.fyStart === fy);
    years[fy] = {
      growth: pct(y?.growthRate ?? TENANT.fiscal.defaultGrowth),
      target: y?.targetJpy != null ? String(Math.round(y.targetJpy / 10_000)) : "",
      note: y?.note ?? "",
      clinicGrowth: Object.fromEntries(Object.entries(y?.clinicGrowth ?? {}).map(([k, v]) => [k, pct(v)])),
      staff: Object.fromEntries(Object.entries(y?.staff ?? {}).map(([k, v]) => [k, String(v)])),
      clear: [],
    };
  }
  return {
    name: s.name,
    note: s.note ?? "",
    labor: s.laborPerStaffYearJpy != null ? String(Math.round(s.laborPerStaffYearJpy / 10_000)) : "",
    other: s.otherCostRate != null ? String(s.otherCostRate) : "",
    years,
    stores: s.newStores.map((n) => ({
      id: n.id,
      name: n.name,
      openMonth: n.openMonth,
      start: String(Math.round(n.startJpy / 10_000)),
      mature: String(Math.round(n.matureJpy / 10_000)),
      ramp: String(n.rampMonths),
      staff: String(n.staff),
    })),
  };
}

function Editor({ scenario, table, fys, report }: { scenario: MidPlanScenario; table: MidPlanTable; fys: string[]; report: (m: Msg) => void }) {
  const { mutate } = useCompany();
  const clinics = useClinics();
  const [form, setForm] = React.useState<Form>(() => toForm(scenario, fys));
  const [busy, setBusy] = React.useState(false);
  const setMsg = report;
  const planMonths = React.useMemo(() => {
    const out: string[] = [];
    const [y0, m0] = TENANT.revenueTarget.fromMonth.split("-").map(Number);
    for (let i = 0; i < 12 * (TENANT.fiscal.planYears + 1); i++) {
      const d = new Date(Date.UTC(y0, m0 - 1 + i, 1));
      out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
    }
    return out;
  }, []);
  const setYear = (fy: string, patch: Partial<YearForm>) => setForm((f) => ({ ...f, years: { ...f.years, [fy]: { ...f.years[fy], ...patch } } }));
  const planYears = table.years.filter((y) => y.kind === "plan");
  const existing = clinics.filter((c) => planYears.some((y) => y.rows.some((r) => r.id === c.id)));

  const save = async () => {
    const yen = (s: string) => (s.trim() ? Math.round(Number(s) * 10_000) : null);
    const rate = (s: string) => (s.trim() ? Number(s) / 100 : null);
    for (const st of form.stores) {
      if (!st.name.trim() || !st.openMonth) {
        setMsg({ ok: false, text: "新店の名前と開院月を入れてください" });
        return;
      }
    }
    setBusy(true);
    const r = await mutate("/api/plan", {
      action: "update",
      id: scenario.id,
      name: form.name.trim() || scenario.name,
      note: form.note,
      laborPerStaffYearJpy: yen(form.labor),
      otherCostRate: form.other.trim() ? Number(form.other) : null,
      years: fys.map((fy) => {
        const y = form.years[fy];
        return {
          fyStart: fy,
          growthRate: rate(y.growth) ?? TENANT.fiscal.defaultGrowth,
          clinicGrowth: Object.fromEntries(existing.map((c) => [c.id, rate(y.clinicGrowth[c.id] ?? "")])),
          staff: Object.fromEntries(existing.map((c) => [c.id, y.staff[c.id]?.trim() ? Number(y.staff[c.id]) : null])),
          targetJpy: yen(y.target),
          note: y.note,
          clearMonthly: y.clear,
        };
      }),
      newStores: form.stores.map((s) => ({
        id: s.id,
        name: s.name.trim(),
        openMonth: s.openMonth,
        startJpy: yen(s.start) ?? 0,
        matureJpy: yen(s.mature) ?? 0,
        rampMonths: Number(s.ramp) || 0,
        staff: Number(s.staff) || 0,
      })),
    });
    setBusy(false);
    setMsg(r.ok ? { ok: true, text: "計画を保存しました（上の表に反映しました）" } : { ok: false, text: r.error });
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-medium">
          シナリオの名前
          <input
            value={form.name}
            maxLength={30}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="focus-visible:ring-ring/50 mt-1 block h-9 w-full rounded-md border bg-transparent px-2 text-sm outline-none focus-visible:ring-[3px]"
          />
        </label>
        <label className="text-xs font-medium">
          前提・メモ
          <input
            value={form.note}
            maxLength={500}
            placeholder="例 2027年秋に8店舗目、毎年 新卒2名"
            onChange={(e) => setForm({ ...form, note: e.target.value })}
            className="focus-visible:ring-ring/50 mt-1 block h-9 w-full rounded-md border bg-transparent px-2 text-sm outline-none focus-visible:ring-[3px]"
          />
        </label>
      </div>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">年度ごとの前提</h3>
        <div className="-mx-1 overflow-x-auto">
          <table className="w-full min-w-[36rem] text-sm">
            <thead>
              <tr className="text-muted-foreground border-b text-xs">
                <th scope="col" className="py-2 pl-1 text-left font-medium" />
                {planYears.map((y) => (
                  <th key={y.fyStart} scope="col" className="px-2 py-2 text-right font-medium">
                    {y.term}
                    <span className="block text-[10px] font-normal">{y.era}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="border-b">
                <th scope="row" className="py-1.5 pl-1 text-left text-xs font-medium">既存店の成長率（前年比 %）</th>
                {planYears.map((y) => (
                  <td key={y.fyStart} className="px-2 py-1.5 text-right">
                    <input
                      inputMode="decimal"
                      aria-label={`${y.term}の既存店の成長率（%）`}
                      value={form.years[y.fyStart]?.growth ?? ""}
                      onChange={(e) => setYear(y.fyStart, { growth: num(e.target.value) })}
                      className={cn(inputCls, "w-20")}
                    />
                  </td>
                ))}
              </tr>
              <tr className="border-b">
                <th scope="row" className="py-1.5 pl-1 text-left text-xs font-medium">売上目標（万円・任意）</th>
                {planYears.map((y) => (
                  <td key={y.fyStart} className="px-2 py-1.5 text-right">
                    <input
                      inputMode="numeric"
                      aria-label={`${y.term}の売上目標（万円）`}
                      placeholder="例 35000"
                      value={form.years[y.fyStart]?.target ?? ""}
                      onChange={(e) => setYear(y.fyStart, { target: num(e.target.value) })}
                      className={cn(inputCls, "w-24")}
                    />
                  </td>
                ))}
              </tr>
              <tr>
                <th scope="row" className="py-1.5 pl-1 text-left text-xs font-medium">メモ</th>
                {planYears.map((y) => (
                  <td key={y.fyStart} className="px-2 py-1.5 text-right">
                    <input
                      aria-label={`${y.term}のメモ`}
                      maxLength={300}
                      placeholder="例 新卒3名入社"
                      value={form.years[y.fyStart]?.note ?? ""}
                      onChange={(e) => setYear(y.fyStart, { note: e.target.value })}
                      className={cn(inputCls, "w-36 text-left")}
                    />
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">院ごとの成長率・施術者数</h3>
        <p className="text-muted-foreground text-xs">
          空欄の成長率は上の「既存店の成長率」、空欄の人数は前年のまま。取り込んだ計画（年間予算表の新案など）がある院は、その数字を使います。
        </p>
        <div className="-mx-1 overflow-x-auto">
          <table className="w-full min-w-[44rem] text-xs">
            <thead>
              <tr className="text-muted-foreground border-b">
                <th scope="col" className="bg-card sticky left-0 py-2 pr-2 pl-1 text-left font-medium">院</th>
                {planYears.map((y) => (
                  <th key={y.fyStart} scope="col" className="px-2 py-2 text-right font-medium">
                    {y.term}
                    <span className="block text-[10px] font-normal">成長率％ ／ 人数</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {existing.map((c) => (
                <tr key={c.id} className="border-b">
                  <th scope="row" className="bg-card sticky left-0 py-1.5 pr-2 pl-1 text-left text-sm font-medium whitespace-nowrap">
                    {c.name}
                  </th>
                  {planYears.map((y) => {
                    const row = y.rows.find((r) => r.id === c.id);
                    const f = form.years[y.fyStart];
                    if (!row || !f) return <td key={y.fyStart} className="text-muted-foreground px-2 text-right">—</td>;
                    const cleared = f.clear.includes(c.id);
                    return (
                      <td key={y.fyStart} className="px-2 py-1.5 text-right whitespace-nowrap">
                        {row.imported && !cleared ? (
                          <label className="text-muted-foreground mr-1 inline-flex items-center gap-1 text-[10px]">
                            <input type="checkbox" onChange={(e) => setYear(y.fyStart, { clear: e.target.checked ? [...f.clear, c.id] : f.clear.filter((x) => x !== c.id) })} />
                            取込を外す
                          </label>
                        ) : (
                          <input
                            inputMode="decimal"
                            aria-label={`${c.name} ${y.term}の成長率（%）`}
                            placeholder={f.growth}
                            value={f.clinicGrowth[c.id] ?? ""}
                            onChange={(e) => setYear(y.fyStart, { clinicGrowth: { ...f.clinicGrowth, [c.id]: num(e.target.value) } })}
                            className={cn(inputCls, "w-16")}
                          />
                        )}
                        <input
                          inputMode="decimal"
                          aria-label={`${c.name} ${y.term}の施術者数`}
                          placeholder={row.staff != null && !f.staff[c.id] ? String(row.staff) : "人"}
                          value={f.staff[c.id] ?? ""}
                          onChange={(e) => setYear(y.fyStart, { staff: { ...f.staff, [c.id]: num(e.target.value) } })}
                          className={cn(inputCls, "ml-1 w-14")}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">新店（出店計画）</h3>
        <p className="text-muted-foreground text-xs">開院月の月商から、立ち上がり期間をかけて成熟時の月商まで伸びる前提で計算します。開院が決まったら「数字（院別）→ 予算 → 院の設定」で院として追加してください。</p>
        {form.stores.map((s, i) => {
          const set = (patch: Partial<StoreForm>) => setForm((f) => ({ ...f, stores: f.stores.map((x, j) => (j === i ? { ...x, ...patch } : x)) }));
          return (
            <div key={s.id ?? `n${i}`} className="flex flex-wrap items-end gap-2 rounded-lg border p-2">
              <label className="text-xs">
                名前
                <input value={s.name} maxLength={40} onChange={(e) => set({ name: e.target.value })} className={cn(inputCls, "mt-1 block w-32 text-left")} />
              </label>
              <label className="text-xs">
                開院月
                <select value={s.openMonth} onChange={(e) => set({ openMonth: e.target.value })} className="bg-background mt-1 block h-8 rounded-md border px-1 text-sm">
                  <option value="">選ぶ</option>
                  {planMonths.map((m) => (
                    <option key={m} value={m}>
                      {ym(m)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs">
                開院時の月商（万円）
                <input inputMode="numeric" value={s.start} onChange={(e) => set({ start: num(e.target.value) })} className={cn(inputCls, "mt-1 block w-24")} />
              </label>
              <label className="text-xs">
                成熟時の月商（万円）
                <input inputMode="numeric" value={s.mature} onChange={(e) => set({ mature: num(e.target.value) })} className={cn(inputCls, "mt-1 block w-24")} />
              </label>
              <label className="text-xs">
                立ち上がり（か月）
                <input inputMode="numeric" value={s.ramp} onChange={(e) => set({ ramp: num(e.target.value) })} className={cn(inputCls, "mt-1 block w-16")} />
              </label>
              <label className="text-xs">
                施術者（人）
                <input inputMode="decimal" value={s.staff} onChange={(e) => set({ staff: num(e.target.value) })} className={cn(inputCls, "mt-1 block w-16")} />
              </label>
              <Button size="sm" variant="ghost" aria-label={`${s.name || "新店"}を外す`} onClick={() => setForm((f) => ({ ...f, stores: f.stores.filter((_, j) => j !== i) }))}>
                <Trash2 aria-hidden />
              </Button>
            </div>
          );
        })}
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            setForm((f) => ({
              ...f,
              stores: [
                ...f.stores,
                { name: `新店${f.stores.length + 1}`, openMonth: "", start: "150", mature: String(Math.round(TENANT.budget.standardPerClinicJpy / 10_000)), ramp: "6", staff: "3" },
              ],
            }))
          }
        >
          <Plus aria-hidden /> 新店を追加
        </Button>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">利益の目安（任意）</h3>
        <div className="flex flex-wrap gap-3">
          <label className="text-xs">
            施術者1人あたりの年間人件費（万円）
            <input inputMode="numeric" placeholder="例 400" value={form.labor} onChange={(e) => setForm({ ...form, labor: num(e.target.value) })} className={cn(inputCls, "mt-1 block w-28")} />
          </label>
          <label className="text-xs">
            その他の経費率（売上に対する %）
            <input inputMode="decimal" placeholder="例 35" value={form.other} onChange={(e) => setForm({ ...form, other: num(e.target.value) })} className={cn(inputCls, "mt-1 block w-28")} />
          </label>
        </div>
        <p className="text-muted-foreground text-xs">受付・本部の人件費、家賃などは「その他の経費率」に含めてください。事業計画書の損益（「数字（院別）→ 年間・損益」）と見比べて調整します。</p>
      </section>

      <div className="flex flex-wrap items-center gap-2 border-t pt-4">
        <Button size="sm" disabled={busy} onClick={save}>
          {busy ? <LoaderCircle className="animate-spin" aria-hidden /> : <Save aria-hidden />} 計画を保存
        </Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => setForm(toForm(scenario, fys))}>
          入力を元に戻す
        </Button>
      </div>
    </div>
  );
}

export function MidPlanPanel() {
  const { snapshot, mutate } = useCompany();
  const p = snapshot.plan;
  const [selected, setSelected] = React.useState<string | null>(p.scenarios[0]?.scenario.id ?? null);
  const [newName, setNewName] = React.useState("");
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState<string | null>(null);
  const [msg, setMsg] = React.useState<Msg>(null);
  const [editMsg, setEditMsg] = React.useState<Msg>(null);
  const current = p.scenarios.find((s) => s.scenario.id === selected) ?? p.scenarios[0] ?? null;
  const table = current?.table ?? p.base;
  const fys = p.fyStarts.slice(1);

  const call = async (k: string, body: Record<string, unknown>, ok: string) => {
    setBusy(k);
    const r = await mutate("/api/plan", body);
    setBusy(null);
    setMsg(r.ok ? { ok: true, text: ok } : { ok: false, text: r.error });
    return r;
  };
  const create = async (copyFrom?: string) => {
    const name = newName.trim() || (copyFrom ? `${current?.scenario.name ?? ""}のコピー` : p.scenarios.length ? `シナリオ${p.scenarios.length + 1}` : "標準");
    const r = await call("create", { action: "create", name, copyFrom }, `「${name}」を作りました`);
    if (r.ok) {
      setSelected(r.data.scenarioId as string);
      setNewName("");
    }
  };

  return (
    <div className="space-y-6">
      {p.adopted && (
        <Card className="border-emerald-300 dark:border-emerald-800">
          <CardHeader>
            <div>
              <CardTitle className="flex flex-wrap items-center gap-2">
                <CircleCheck className="size-5 text-emerald-600" aria-hidden /> 採用中の中期計画：{p.adopted.name}
              </CardTitle>
              <CardDescription>
                {formatDateTime(p.adopted.at)} に承認されて採用。
                {p.adopted.years.map((y) => `${y.term} ${formatOku(y.revenue)}`).join(" → ")}
                {p.adopted.note ? `（${p.adopted.note}）` : ""}
              </CardDescription>
            </div>
          </CardHeader>
        </Card>
      )}

      <Card>
        <CardHeader className="flex-wrap">
          <div>
            <CardTitle>中期事業計画（{table.years[0].term}〜{table.years[table.years.length - 1].term}）</CardTitle>
            <CardDescription>
              今期は実績・着地予想・確定予算から見込みを出し、来期以降は「前年 × 既存店の成長率 ＋ 新店」で計算します。シナリオ（標準・理想・保守など）を複数作って比べられます。採用は承認（予算変更・代表の決裁を推奨）で決まります。
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {p.scenarios.map((s) => (
              <button
                key={s.scenario.id}
                type="button"
                aria-pressed={current?.scenario.id === s.scenario.id}
                onClick={() => setSelected(s.scenario.id)}
                className={cn("rounded-full px-3 py-1 text-sm", current?.scenario.id === s.scenario.id ? "bg-primary text-primary-foreground" : "bg-secondary hover:bg-accent")}
              >
                {s.scenario.name}
                {p.adopted?.name === s.scenario.name && <span className="ml-1 text-xs">（採用中）</span>}
              </button>
            ))}
            {!p.scenarios.length && <span className="text-muted-foreground text-sm">シナリオはまだありません（既定の成長率 {pct(TENANT.fiscal.defaultGrowth)}% で計算しています）</span>}
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              maxLength={30}
              placeholder="新しいシナリオの名前"
              aria-label="新しいシナリオの名前"
              className="focus-visible:ring-ring/50 h-8 w-40 rounded-md border bg-transparent px-2 text-sm outline-none focus-visible:ring-[3px]"
            />
            <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => create()}>
              <Plus aria-hidden /> シナリオを作る
            </Button>
            {current && (
              <>
                <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => create(current.scenario.id)}>
                  <Copy aria-hidden /> コピー
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy !== null}
                  onClick={async () => {
                    if (!window.confirm(`シナリオ「${current.scenario.name}」を削除しますか？（採用中の計画は残ります）`)) return;
                    const r = await call("remove", { action: "remove", id: current.scenario.id }, "削除しました");
                    if (r.ok) setSelected(null);
                  }}
                >
                  <Trash2 aria-hidden /> 削除
                </Button>
              </>
            )}
          </div>
          <Message msg={msg} />
          <Bars t={table} />
          <SummaryTable t={table} />
          {current && (
            <div className="flex flex-wrap items-end gap-2 border-t pt-4">
              {p.pendingApprovalId ? (
                <Link href="/approvals" className="text-brand text-sm font-medium hover:underline">
                  事業計画の採用が承認待ちです → 承認画面へ
                </Link>
              ) : (
                <>
                  <label className="min-w-0 flex-1 text-xs font-medium">
                    採用の理由・補足（承認者に伝わります・任意）
                    <input
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      maxLength={300}
                      className="focus-visible:ring-ring/50 mt-1 block h-9 w-full rounded-md border bg-transparent px-2 text-sm outline-none focus-visible:ring-[3px]"
                    />
                  </label>
                  <Button
                    size="sm"
                    disabled={busy !== null}
                    onClick={async () => {
                      if (!window.confirm(`「${current.scenario.name}」の採用を承認依頼しますか？`)) return;
                      const r = await call("adopt", { action: "request_adopt", id: current.scenario.id, note: note.trim() || undefined }, "採用の承認を依頼しました。承認画面で判断してください（代表へ回すこともできます）。");
                      if (r.ok) setNote("");
                    }}
                  >
                    {busy === "adopt" ? <LoaderCircle className="animate-spin" aria-hidden /> : <Send aria-hidden />} この計画の採用を承認依頼
                  </Button>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>院別の年間売上</CardTitle>
            <CardDescription>院ごとの年間売上と、使った成長率・施術者数。</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <ClinicYears t={table} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle className="flex items-center gap-2">
              計画の前提を編集{current && <Badge variant="secondary">{current.scenario.name}</Badge>}
            </CardTitle>
            <CardDescription>{current ? `最終更新 ${formatDateTime(current.scenario.updatedAt)}` : "シナリオを作ると、成長率・新店・人員・利益の前提を編集できます。"}</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {current ? (
            <div className="space-y-3">
              <Editor key={`${current.scenario.id}-${current.scenario.updatedAt}`} scenario={current.scenario} table={current.table} fys={fys} report={setEditMsg} />
              <Message msg={editMsg} />
            </div>
          ) : (
            <Button size="sm" disabled={busy !== null} onClick={() => create()}>
              <Plus aria-hidden /> 「標準」シナリオを作る
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
