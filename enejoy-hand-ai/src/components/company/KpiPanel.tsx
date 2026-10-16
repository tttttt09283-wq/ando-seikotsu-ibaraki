"use client";

import { ArrowDown, ArrowUp, LoaderCircle, PencilLine, Plus, RotateCcw, Trash2 } from "lucide-react";
import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { KpiCell } from "@/lib/engine/kpi-metrics";
import type { KpiDef, KpiUnit } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Message, type Msg } from "./SheetImport";
import { useClinics, useCompany } from "./StateProvider";

const UNIT_LABEL: Record<KpiUnit, string> = { yen: "円", count: "件・人", percent: "%", person: "人（施術者）" };
const ym = (m: string) => `${m.slice(0, 4)}年${Number(m.slice(5))}月`;

export function formatKpi(v: number | null | undefined, unit: KpiUnit): string {
  if (v == null) return "—";
  if (unit === "yen") return Math.abs(v) >= 10_000 ? `${(Math.round(v / 1_000) / 10).toLocaleString("ja-JP")}万` : `${Math.round(v).toLocaleString("ja-JP")}円`;
  if (unit === "percent") return `${v}%`;
  if (unit === "person") return `${v}人`;
  return v.toLocaleString("ja-JP");
}

/** 達成度の色（数字も併記する） */
const tone = (a: number | null) =>
  a == null ? "" : a >= 100 ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300" : a < 90 ? "bg-amber-50 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300" : "";

function Cell({ c, unit }: { c: KpiCell | undefined; unit: KpiUnit }) {
  if (!c) return <span className="text-muted-foreground">—</span>;
  return (
    <span className={cn("block rounded px-1 py-0.5", tone(c.a))} title={c.t != null ? `目標 ${formatKpi(c.t, unit)}・達成度 ${c.a ?? "—"}%` : undefined}>
      <span className="text-sm">{formatKpi(c.v, unit)}</span>
      {c.t != null && (
        <span className="block text-[10px] opacity-80">
          目標 {formatKpi(c.t, unit)}
          {c.a != null ? `・${c.a}%` : ""}
        </span>
      )}
    </span>
  );
}

type DefForm = {
  id?: string;
  name: string;
  unit: KpiUnit;
  kind: "series" | "ratio" | "manual";
  key: string;
  numerator: string;
  denominator: string;
  direction: "up" | "down";
  targetKind: "none" | "value" | "series";
  targetValue: string;
  targetKey: string;
  note: string;
};

const emptyForm: DefForm = {
  name: "",
  unit: "count",
  kind: "series",
  key: "newPatients",
  numerator: "salesActual",
  denominator: "totalVisits",
  direction: "up",
  targetKind: "none",
  targetValue: "",
  targetKey: "budget",
  note: "",
};

function toForm(d: KpiDef): DefForm {
  return {
    id: d.id,
    name: d.name,
    unit: d.unit,
    kind: d.calc.kind,
    key: d.calc.kind === "series" ? d.calc.key : emptyForm.key,
    numerator: d.calc.kind === "ratio" ? d.calc.numerator : emptyForm.numerator,
    denominator: d.calc.kind === "ratio" ? d.calc.denominator : emptyForm.denominator,
    direction: d.direction,
    targetKind: d.target?.kind ?? "none",
    targetValue: d.target?.kind === "value" ? String(d.target.value) : "",
    targetKey: d.target?.kind === "series" ? d.target.key : "budget",
    note: d.note ?? "",
  };
}

function DefEditor({ initial, onClose }: { initial: DefForm; onClose: () => void }) {
  const { snapshot, mutate } = useCompany();
  const series = snapshot.kpi.series;
  const [f, setF] = React.useState<DefForm>(initial);
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<Msg>(null);
  const sel = (value: string, onChange: (v: string) => void, label: string) => (
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className="bg-background mt-1 block h-8 max-w-56 rounded-md border px-1 text-sm">
      {series.filter((s) => s.key !== f.id).map((s) => (
        <option key={s.key} value={s.key}>
          {s.label}
        </option>
      ))}
    </select>
  );
  const save = async () => {
    setBusy(true);
    const r = await mutate("/api/kpis", {
      action: "save",
      def: {
        id: f.id,
        name: f.name,
        unit: f.unit,
        calc: f.kind === "series" ? { kind: "series", key: f.key } : f.kind === "ratio" ? { kind: "ratio", numerator: f.numerator, denominator: f.denominator } : { kind: "manual" },
        direction: f.direction,
        target: f.targetKind === "value" && f.targetValue ? { kind: "value", value: Number(f.targetValue) } : f.targetKind === "series" ? { kind: "series", key: f.targetKey } : undefined,
        note: f.note || undefined,
      },
    });
    setBusy(false);
    if (!r.ok) setMsg({ ok: false, text: r.error });
    else onClose();
  };
  return (
    <div className="bg-secondary/40 space-y-3 rounded-lg border p-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs font-medium">
          名前
          <input value={f.name} maxLength={40} onChange={(e) => setF({ ...f, name: e.target.value })} className="bg-background mt-1 block h-8 w-44 rounded-md border px-2 text-sm" />
        </label>
        <label className="text-xs font-medium">
          単位
          <select value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value as KpiUnit })} className="bg-background mt-1 block h-8 rounded-md border px-1 text-sm">
            {(Object.keys(UNIT_LABEL) as KpiUnit[]).map((u) => (
              <option key={u} value={u}>
                {UNIT_LABEL[u]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium">
          良い方向
          <select value={f.direction} onChange={(e) => setF({ ...f, direction: e.target.value as "up" | "down" })} className="bg-background mt-1 block h-8 rounded-md border px-1 text-sm">
            <option value="up">高いほど良い</option>
            <option value="down">低いほど良い</option>
          </select>
        </label>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs font-medium">
          計算
          <select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as DefForm["kind"] })} className="bg-background mt-1 block h-8 rounded-md border px-1 text-sm">
            <option value="series">数字をそのまま</option>
            <option value="ratio">割り算（A ÷ B）</option>
            <option value="manual">手入力</option>
          </select>
        </label>
        {f.kind === "series" && <label className="text-xs font-medium">数字{sel(f.key, (v) => setF({ ...f, key: v }), "使う数字")}</label>}
        {f.kind === "ratio" && (
          <>
            <label className="text-xs font-medium">A（分子）{sel(f.numerator, (v) => setF({ ...f, numerator: v }), "分子")}</label>
            <label className="text-xs font-medium">B（分母）{sel(f.denominator, (v) => setF({ ...f, denominator: v }), "分母")}</label>
          </>
        )}
        {f.kind === "manual" && <span className="text-muted-foreground text-xs">院・月ごとに、この画面の下で入力します。</span>}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs font-medium">
          目標
          <select value={f.targetKind} onChange={(e) => setF({ ...f, targetKind: e.target.value as DefForm["targetKind"] })} className="bg-background mt-1 block h-8 rounded-md border px-1 text-sm">
            <option value="none">なし</option>
            <option value="value">決まった値（1院あたり）</option>
            <option value="series">別の数字（例：予算）</option>
          </select>
        </label>
        {f.targetKind === "value" && (
          <label className="text-xs font-medium">
            値
            <input inputMode="decimal" value={f.targetValue} onChange={(e) => setF({ ...f, targetValue: e.target.value.replace(/[^\d.]/g, "") })} className="bg-background mt-1 block h-8 w-28 rounded-md border px-2 text-right text-sm" />
          </label>
        )}
        {f.targetKind === "series" && <label className="text-xs font-medium">数字{sel(f.targetKey, (v) => setF({ ...f, targetKey: v }), "目標にする数字")}</label>}
        <label className="min-w-0 flex-1 text-xs font-medium">
          メモ
          <input value={f.note} maxLength={200} onChange={(e) => setF({ ...f, note: e.target.value })} className="bg-background mt-1 block h-8 w-full rounded-md border px-2 text-sm" />
        </label>
      </div>
      <div className="flex gap-2">
        <Button size="sm" disabled={busy || !f.name.trim()} onClick={save}>
          {busy && <LoaderCircle className="animate-spin" aria-hidden />} 保存
        </Button>
        <Button size="sm" variant="ghost" onClick={onClose}>
          やめる
        </Button>
      </div>
      <Message msg={msg} />
    </div>
  );
}

function ManualInput() {
  const { snapshot, mutate } = useCompany();
  const clinics = useClinics();
  const manual = snapshot.kpi.defs.filter((d) => d.calc.kind === "manual");
  const [kpiId, setKpiId] = React.useState(manual[0]?.id ?? "");
  const [month, setMonth] = React.useState(snapshot.kpi.defaultMonth);
  const [values, setValues] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<Msg>(null);
  if (!manual.length) return null;
  const def = manual.find((d) => d.id === kpiId) ?? manual[0];
  const row = snapshot.kpi.cells[def.id]?.[month] ?? {};
  const save = async () => {
    setBusy(true);
    for (const [clinicId, v] of Object.entries(values)) {
      const r = await mutate("/api/kpis", { action: "value", kpiId: def.id, month, clinicId, value: v === "" ? null : Number(v) });
      if (!r.ok) {
        setBusy(false);
        setMsg({ ok: false, text: r.error });
        return;
      }
    }
    setBusy(false);
    setValues({});
    setMsg({ ok: true, text: "保存しました" });
  };
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>手入力の管理項目</CardTitle>
          <CardDescription>日計表にない数字（例：回数券の販売数・紹介数）を院・月ごとに入力します。</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <select aria-label="管理項目" value={def.id} onChange={(e) => { setKpiId(e.target.value); setValues({}); }} className="bg-background h-9 rounded-md border px-2 text-sm">
            {manual.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <select aria-label="月" value={month} onChange={(e) => { setMonth(e.target.value); setValues({}); }} className="bg-background h-9 rounded-md border px-2 text-sm">
            {snapshot.kpi.months.map((m) => (
              <option key={m} value={m}>
                {ym(m)}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {clinics.map((c) => (
            <label key={c.id} className="text-xs">
              {c.name}
              <input
                inputMode="decimal"
                value={values[c.id] ?? (row[c.id]?.v != null ? String(row[c.id]!.v) : "")}
                onChange={(e) => setValues((v) => ({ ...v, [c.id]: e.target.value.replace(/[^\d.-]/g, "") }))}
                className="focus-visible:ring-ring/50 mt-1 block h-9 w-full rounded-md border bg-transparent px-2 text-right text-sm outline-none focus-visible:ring-[3px]"
              />
            </label>
          ))}
        </div>
        <Button size="sm" disabled={busy || !Object.keys(values).length} onClick={save}>
          {busy && <LoaderCircle className="animate-spin" aria-hidden />} 保存
        </Button>
        <Message msg={msg} />
      </CardContent>
    </Card>
  );
}

export function KpiPanel() {
  const { snapshot, mutate } = useCompany();
  const k = snapshot.kpi;
  const [month, setMonth] = React.useState(k.defaultMonth);
  const [view, setView] = React.useState<"clinics" | "trend">("clinics");
  const [col, setCol] = React.useState("all");
  const [editing, setEditing] = React.useState(false);
  const [form, setForm] = React.useState<DefForm | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<Msg>(null);
  const columns = k.columns;
  const call = async (body: Record<string, unknown>, ok?: string) => {
    setBusy(true);
    const r = await mutate("/api/kpis", body);
    setBusy(false);
    setMsg(r.ok ? (ok ? { ok: true, text: ok } : null) : { ok: false, text: r.error });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex-wrap">
          <div>
            <CardTitle>管理項目（院・ブロック・全院）</CardTitle>
            <CardDescription>
              日計表・予算・組織図・手入力の数字から、毎月の管理項目と目標に対する達成度を出します。100%以上は緑、90%未満は黄色。ブロックは「院の設定」または組織図のブロックマネージャーから入ります。
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex gap-1" role="group" aria-label="表示">
              {(
                [
                  ["clinics", "院別"],
                  ["trend", "月の推移"],
                ] as const
              ).map(([v, l]) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={view === v}
                  onClick={() => setView(v)}
                  className={cn("rounded-full px-3 py-1 text-xs", view === v ? "bg-primary text-primary-foreground" : "bg-secondary hover:bg-accent")}
                >
                  {l}
                </button>
              ))}
            </div>
            {view === "clinics" ? (
              <select aria-label="表示する月" value={month} onChange={(e) => setMonth(e.target.value)} className="bg-background h-8 rounded-md border px-2 text-sm">
                {k.months.map((m) => (
                  <option key={m} value={m}>
                    {ym(m)}
                    {m === k.currentMonth ? "（途中）" : ""}
                  </option>
                ))}
              </select>
            ) : (
              <select aria-label="院・ブロック" value={col} onChange={(e) => setCol(e.target.value)} className="bg-background h-8 rounded-md border px-2 text-sm">
                {columns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="-mx-1 overflow-x-auto">
            <table className="w-full min-w-[56rem] text-xs">
              <thead>
                <tr className="text-muted-foreground border-b">
                  <th scope="col" className="bg-card sticky left-0 z-10 py-2 pr-2 pl-1 text-left font-medium">管理項目</th>
                  {view === "clinics"
                    ? columns.map((c) => (
                        <th key={c.id} scope="col" className={cn("px-1.5 py-2 text-right font-medium whitespace-nowrap", c.kind !== "clinic" && "bg-secondary/60 text-foreground")}>
                          {c.label}
                        </th>
                      ))
                    : k.months.map((m) => (
                        <th key={m} scope="col" className="px-1.5 py-2 text-right font-medium">
                          {Number(m.slice(5))}月{m === k.currentMonth && <span className="block text-[10px] font-normal">途中</span>}
                        </th>
                      ))}
                </tr>
              </thead>
              <tbody>
                {k.defs.map((d) => (
                  <tr key={d.id} className="border-b">
                    <th scope="row" className="bg-card sticky left-0 z-10 py-1.5 pr-2 pl-1 text-left text-sm font-medium whitespace-nowrap">
                      {d.name}
                      {d.direction === "down" && <span className="text-muted-foreground ml-1 text-[10px]">（低いほど良い）</span>}
                      {d.calc.kind === "manual" && <Badge variant="outline" className="ml-1 px-1 py-0 text-[10px]">手入力</Badge>}
                    </th>
                    {view === "clinics"
                      ? columns.map((c) => (
                          <td key={c.id} className={cn("px-1 py-1 text-right tabular-nums", c.kind !== "clinic" && "bg-secondary/30 font-semibold")}>
                            <Cell c={k.cells[d.id]?.[month]?.[c.id]} unit={d.unit} />
                          </td>
                        ))
                      : k.months.map((m) => (
                          <td key={m} className="px-1 py-1 text-right tabular-nums">
                            <Cell c={k.cells[d.id]?.[m]?.[col]} unit={d.unit} />
                          </td>
                        ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-muted-foreground text-[11px]">
            金額は「万」＝万円。施術者数は組織図（その月以前で最新の実際の配置）、なければ確定予算の人員。昨対比は前年同月の売上（年間予算表・進捗表の昨年の数字）と比べます。
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-wrap">
          <div>
            <CardTitle>管理項目の設定</CardTitle>
            <CardDescription>項目の追加・変更・並べ替え。目標は「決まった値」（1院あたり）か「別の数字」（例：売上の目標＝予算）を選べます。</CardDescription>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setEditing((e) => !e)}>
              <PencilLine aria-hidden /> {editing ? "設定を閉じる" : "設定を開く"}
            </Button>
          </div>
        </CardHeader>
        {editing && (
          <CardContent className="space-y-3">
            <ul className="divide-y rounded-lg border">
              {k.defs.map((d, i) => (
                <li key={d.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{d.name}</span>
                    <span className="text-muted-foreground ml-2 text-xs">
                      {d.calc.kind === "series"
                        ? k.series.find((s) => s.key === (d.calc as { key: string }).key)?.label
                        : d.calc.kind === "ratio"
                          ? `${k.series.find((s) => s.key === (d.calc as { numerator: string }).numerator)?.label} ÷ ${k.series.find((s) => s.key === (d.calc as { denominator: string }).denominator)?.label}`
                          : "手入力"}
                      {d.target ? `・目標 ${d.target.kind === "value" ? formatKpi(d.target.value, d.unit) : k.series.find((s) => s.key === (d.target as { key: string }).key)?.label}` : ""}
                    </span>
                  </span>
                  <Button size="icon" variant="ghost" aria-label={`${d.name}を上へ`} disabled={busy || i === 0} onClick={() => call({ action: "move", id: d.id, dir: -1 })}>
                    <ArrowUp aria-hidden />
                  </Button>
                  <Button size="icon" variant="ghost" aria-label={`${d.name}を下へ`} disabled={busy || i === k.defs.length - 1} onClick={() => call({ action: "move", id: d.id, dir: 1 })}>
                    <ArrowDown aria-hidden />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setForm(toForm(d))}>
                    変更
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`${d.name}を外す`}
                    disabled={busy}
                    onClick={async () => {
                      if (!window.confirm(`「${d.name}」を管理項目から外しますか？（入力した記録は残ります）`)) return;
                      await call({ action: "remove", id: d.id }, `「${d.name}」を外しました`);
                    }}
                  >
                    <Trash2 aria-hidden />
                  </Button>
                </li>
              ))}
            </ul>
            {form ? (
              <DefEditor key={form.id ?? "new"} initial={form} onClose={() => setForm(null)} />
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => setForm(emptyForm)}>
                  <Plus aria-hidden /> 管理項目を追加
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={async () => {
                    if (!window.confirm("管理項目を会社の標準に戻しますか？（追加した項目は外れます。入力した記録は残ります）")) return;
                    await call({ action: "reset" }, "標準の管理項目に戻しました");
                  }}
                >
                  <RotateCcw aria-hidden /> 標準に戻す
                </Button>
              </div>
            )}
            <Message msg={msg} />
          </CardContent>
        )}
      </Card>

      <ManualInput />
    </div>
  );
}
