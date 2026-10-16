"use client";

import { CircleAlert, CircleCheck, FileUp, Link2, LoaderCircle, PencilLine, RefreshCw } from "lucide-react";
import { useSearchParams } from "next/navigation";
import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { monthsBetween, monthTotals, planSalesByMonth } from "@/lib/engine/metrics";
import type { MetricDef } from "@/lib/tenant-types";
import { formatDateTime, formatJpy } from "@/lib/time";
import { cn } from "@/lib/utils";
import { TENANT } from "@/tenant";
import { BudgetView } from "./BudgetView";
import { formatOku, monthLabel, MonthStrip } from "./RevenuePanel";
import { useCompany } from "./StateProvider";

const MONTHS = monthsBetween(TENANT.revenueTarget.fromMonth, TENANT.revenueTarget.toMonth);
const GROUPS = [...new Set(TENANT.metrics.map((m) => m.group))];
const inputCls =
  "h-10 w-full rounded-md border bg-transparent px-3 text-base outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:text-sm";
const ymLabel = (m: string) => `${m.slice(0, 4)}年${Number(m.slice(5))}月`;

function fmt(v: number | undefined | null, unit: MetricDef["unit"]): string {
  if (v == null) return "—";
  if (unit === "yen") return formatJpy(v);
  if (unit === "percent") return `${v.toLocaleString("ja-JP", { maximumFractionDigits: 1 })}%`;
  return v.toLocaleString("ja-JP", { maximumFractionDigits: 1 });
}

/** 院別の表：行＝院（＋全院合計）、列＝選んだグループの指標 */
function ClinicTable({ month }: { month: string }) {
  const { snapshot } = useCompany();
  const [group, setGroup] = React.useState(GROUPS[0]);
  const metrics = TENANT.metrics.filter((m) => m.group === group);
  const records = snapshot.clinicMonths.filter((r) => r.month === month);
  const totals = monthTotals({ clinicMonths: snapshot.clinicMonths }, month);
  const planData = { plan: snapshot.clinicPlan };
  const showSales = group === "売上";
  const rows = TENANT.clinics.map((c) => ({
    id: c.id,
    name: c.name,
    tags: c.tags,
    notOpen: c.openedMonth != null && month < c.openedMonth,
    rec: records.find((r) => r.clinicId === c.id),
    plan: planSalesByMonth(planData, month, c.id),
  }));
  const totalPlan = rows.reduce((n, r) => n + (r.plan ?? 0), 0);
  const budgetRows = snapshot.budget.confirmed.rows;
  const mi = snapshot.budget.confirmed.months.indexOf(month);
  const budgetOf = (clinicId: string) => (mi >= 0 ? budgetRows.find((r) => r.clinicId === clinicId)?.cells[mi]?.budget : undefined);
  const totalBudget = mi >= 0 ? snapshot.budget.confirmed.monthTotals[mi].budget : undefined;
  const budgetRate = (v: Record<string, number> | undefined, b?: number) => {
    const basis = month < snapshot.revenue.currentMonth ? v?.salesActual : (v?.salesForecast ?? v?.salesActual);
    return b && basis != null ? Math.round((basis / b) * 1000) / 10 : null;
  };
  const rate = (v: Record<string, number> | undefined, plan?: number) => {
    const t = v?.salesTarget ?? plan;
    const f = v?.salesForecast;
    return t && f != null ? Math.round((f / t) * 1000) / 10 : null;
  };

  return (
    <Card>
      <CardHeader className="flex-wrap">
        <div>
          <CardTitle>院別の数字（{ymLabel(month)}）</CardTitle>
          <CardDescription>
            {records.length ? `取り込み：${records[0].sourceLabel ?? records[0].source}・${formatDateTime(records[0].updatedAt)}` : "この月の数字はまだありません"}
          </CardDescription>
        </div>
        <div className="flex flex-wrap gap-1" role="group" aria-label="指標の種類">
          {GROUPS.map((g) => (
            <button
              key={g}
              type="button"
              aria-pressed={g === group}
              onClick={() => setGroup(g)}
              className={cn("rounded-full px-3 py-1 text-xs transition", g === group ? "bg-primary text-primary-foreground" : "bg-secondary hover:bg-accent")}
            >
              {g}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        <div className="-mx-1 overflow-x-auto">
          <table className="w-full min-w-[34rem] text-sm">
            <thead>
              <tr className="text-muted-foreground border-b text-xs">
                <th scope="col" className="py-2 pr-2 pl-1 text-left font-medium">院</th>
                {showSales && <th scope="col" className="px-2 py-2 text-right font-medium">予算</th>}
                {showSales && <th scope="col" className="px-2 py-2 text-right font-medium">事業計画</th>}
                {metrics.map((m) => (
                  <th key={m.key} scope="col" className="px-2 py-2 text-right font-medium whitespace-nowrap">
                    {m.label}
                  </th>
                ))}
                {showSales && <th scope="col" className="px-2 py-2 text-right font-medium">着地率</th>}
                {showSales && <th scope="col" className="px-2 py-2 text-right font-medium">予算比</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const rr = rate(r.rec?.values, r.plan);
                return (
                  <tr key={r.id} className={cn("border-b last:border-0", r.notOpen && "text-muted-foreground")}>
                    <th scope="row" className="py-2 pr-2 pl-1 text-left font-medium whitespace-nowrap">
                      {r.name}
                      {r.tags?.map((t) => (
                        <Badge key={t} variant="outline" className="ml-1 px-1 py-0 text-[10px] font-normal">
                          {t}
                        </Badge>
                      ))}
                      {r.notOpen && <span className="ml-1 text-[10px]">開院前</span>}
                    </th>
                    {showSales && <td className="px-2 py-2 text-right tabular-nums">{fmt(budgetOf(r.id) || undefined, "yen")}</td>}
                    {showSales && <td className="px-2 py-2 text-right tabular-nums">{fmt(r.plan, "yen")}</td>}
                    {metrics.map((m) => (
                      <td key={m.key} className="px-2 py-2 text-right tabular-nums whitespace-nowrap">
                        {fmt(r.rec?.values[m.key], m.unit)}
                      </td>
                    ))}
                    {showSales && (
                      <td className={cn("px-2 py-2 text-right font-semibold tabular-nums", rr != null && rr < 90 && "text-amber-700 dark:text-amber-400")}>
                        {rr != null ? `${rr}%` : "—"}
                      </td>
                    )}
                    {showSales && (() => {
                      const br = budgetRate(r.rec?.values, budgetOf(r.id));
                      return (
                        <td className={cn("px-2 py-2 text-right font-semibold tabular-nums", br != null && br < 90 && "text-amber-700 dark:text-amber-400", br != null && br >= 100 && "text-emerald-700 dark:text-emerald-400")}>
                          {br != null ? `${br}%` : "—"}
                        </td>
                      );
                    })()}
                  </tr>
                );
              })}
              <tr className="bg-secondary/60 font-semibold">
                <th scope="row" className="py-2 pr-2 pl-1 text-left">全院合計</th>
                {showSales && <td className="px-2 py-2 text-right tabular-nums">{totalBudget ? formatJpy(totalBudget) : "—"}</td>}
                {showSales && <td className="px-2 py-2 text-right tabular-nums">{totalPlan ? formatJpy(totalPlan) : "—"}</td>}
                {metrics.map((m) => (
                  <td key={m.key} className="px-2 py-2 text-right tabular-nums whitespace-nowrap">
                    {fmt(totals.values[m.key], m.unit)}
                  </td>
                ))}
                {showSales && <td className="px-2 py-2 text-right tabular-nums">{(() => { const v = rate(totals.values, totalPlan || undefined); return v != null ? `${v}%` : "—"; })()}</td>}
                {showSales && <td className="px-2 py-2 text-right tabular-nums">{(() => { const v = budgetRate(totals.values, totalBudget); return v != null ? `${v}%` : "—"; })()}</td>}
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-muted-foreground mt-2 text-xs">
          全院合計は日計表の全院の行を優先し、ない項目は院の合計です（率・単価・LTVは全院の行がある場合のみ）。着地率＝着地予想÷目標売上（目標がなければ事業計画）。予算比＝実績（今月は着地予想）÷院別の売上予算。
        </p>
      </CardContent>
    </Card>
  );
}

function AnnualCard() {
  const { snapshot } = useCompany();
  const r = snapshot.revenue;
  return (
    <Card>
      <CardHeader className="flex-wrap">
        <div>
          <CardTitle>年間（{r.label}）</CardTitle>
          <CardDescription>{r.scope}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["累計の実績", formatOku(r.actualJpy), `目標の${r.percent}%`],
            ["年間の着地見込み", formatOku(r.landingJpy), `目標の${r.landingPercent}%`],
            ["事業計画の年間合計", r.hasPlan ? formatOku(r.planTotalJpy) : "未取り込み", r.hasPlan ? `目標の${Math.round((r.planTotalJpy / r.targetJpy) * 1000) / 10}%` : ""],
            ["残りで必要な月平均", formatOku(r.requiredMonthlyJpy), `残り${r.totalMonths - r.elapsedMonths}か月`],
          ].map(([k, v, sub]) => (
            <div key={k}>
              <dt className="text-muted-foreground text-xs">{k}</dt>
              <dd className="text-xl font-bold tabular-nums">{v}</dd>
              <dd className="text-muted-foreground text-xs">{sub}</dd>
            </div>
          ))}
        </dl>
        <MonthStrip r={r} />
      </CardContent>
    </Card>
  );
}

function PlanCard() {
  const { snapshot } = useCompany();
  const rows = snapshot.planRows;
  if (rows.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>損益（事業計画書）</CardTitle>
          <CardDescription>
            {snapshot.dataSources.planLabel ?? "事業計画書"}・{snapshot.dataSources.planImportedAt ? formatDateTime(snapshot.dataSources.planImportedAt) : ""} 取り込み
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <div className="-mx-1 overflow-x-auto">
          <table className="w-full min-w-[56rem] text-xs">
            <thead>
              <tr className="text-muted-foreground border-b">
                <th scope="col" className="py-2 pr-2 pl-1 text-left font-medium">科目</th>
                {MONTHS.map((m) => (
                  <th key={m} scope="col" className="px-1.5 py-2 text-right font-medium">
                    {monthLabel(m)}
                  </th>
                ))}
                <th scope="col" className="px-1.5 py-2 text-right font-medium">年間</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.label} className="border-b last:border-0">
                  <th scope="row" className="py-1.5 pr-2 pl-1 text-left font-medium whitespace-nowrap">{row.label}</th>
                  {row.byMonth.map((v, i) => (
                    <td key={MONTHS[i]} className={cn("px-1.5 py-1.5 text-right tabular-nums", v != null && v < 0 && "text-red-600")}>
                      {v != null ? Math.round(v / 10_000).toLocaleString("ja-JP") : "—"}
                    </td>
                  ))}
                  <td className="px-1.5 py-1.5 text-right font-semibold tabular-nums">
                    {Math.round(row.byMonth.reduce<number>((n, v) => n + (v ?? 0), 0) / 10_000).toLocaleString("ja-JP")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-muted-foreground mt-2 text-xs">単位：万円。事業計画書の値をそのまま表示しています（実績の月は事業計画書側の実績値）。</p>
      </CardContent>
    </Card>
  );
}

async function readFileText(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    // Excel で保存した CSV は Shift_JIS のことが多い
    return new TextDecoder("shift_jis").decode(buf);
  }
}

function Message({ msg }: { msg: { ok: boolean; text: string } | null }) {
  if (!msg) return null;
  return (
    <p role={msg.ok ? "status" : "alert"} className={cn("flex items-start gap-1.5 text-xs", msg.ok ? "text-emerald-700 dark:text-emerald-400" : "text-red-600")}>
      {msg.ok ? <CircleCheck className="mt-px size-3.5 shrink-0" aria-hidden /> : <CircleAlert className="mt-px size-3.5 shrink-0" aria-hidden />}
      {msg.text}
    </p>
  );
}

function SheetsPanel() {
  const { snapshot, runtime, mutate } = useCompany();
  const [month, setMonth] = React.useState(snapshot.revenue.currentMonth);
  const [url, setUrl] = React.useState("");
  const [pending, setPending] = React.useState<string | null>(null);
  const [msg, setMsg] = React.useState<{ ok: boolean; text: string } | null>(null);
  const sheets = snapshot.dataSources.sheets;

  const syncText = (data: Record<string, unknown>) =>
    ((data.sync as { month: string; ok: boolean; message: string }[] | undefined) ?? [])
      .map((x) => `${monthLabel(x.month)}：${x.message}`)
      .join(" ／ ");

  const register = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending("register");
    const r = await mutate("/api/numbers/sheets", { month, url });
    setPending(null);
    if (!r.ok) return setMsg({ ok: false, text: r.error });
    const failed = ((r.data.sync as { ok: boolean }[] | undefined) ?? []).some((x) => !x.ok);
    setMsg({ ok: !failed, text: syncText(r.data) || "登録しました" });
    if (!failed) setUrl("");
  };
  const sync = async (all: boolean) => {
    setPending(all ? "all" : "now");
    const r = await mutate("/api/numbers/sync", { all });
    setPending(null);
    if (!r.ok) return setMsg({ ok: false, text: r.error });
    const t = syncText(r.data);
    setMsg({ ok: !((r.data.sync as { ok: boolean }[]) ?? []).some((x) => !x.ok), text: t || "読み取る対象（今月・未取得の月）はありませんでした" });
  };
  const remove = async (m: string) => {
    if (!window.confirm(`${ymLabel(m)}の日計表の登録を外しますか？（取り込み済みの数字は残ります）`)) return;
    const r = await mutate("/api/numbers/sheets", { month: m, url: "" });
    setMsg(r.ok ? { ok: true, text: `${ymLabel(m)}の登録を外しました` } : { ok: false, text: r.error });
  };

  return (
    <section className="space-y-3">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold">
        <Link2 className="size-4" aria-hidden /> 日計表（Googleスプレッドシート）
      </h3>
      <p className="text-muted-foreground text-xs leading-relaxed">
        月ごとのファイルを登録すると、TOPシートの院別の数字を読み取ります（書き込みはしません）。アプリの起動中は、今月のファイルを{runtime.sheetSyncMinutes}分ごとに自動で読み直します。
      </p>
      {runtime.sheetsAuth === "public_link" && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
          今は「リンクを知っている全員」に共有されたシートを読む方式です。経営数値が誰でも見られる状態になるため、シートの共有を「制限付き」に戻し、サービスアカウントで読む方式（README参照）への切り替えをおすすめします。公開リンクでは先頭のシート（URLに #gid= があればそのシート）を読みます。
        </p>
      )}
      <form onSubmit={register} className="grid gap-2 sm:grid-cols-[9rem_1fr_auto]">
        <select value={month} onChange={(e) => setMonth(e.target.value)} className={inputCls} aria-label="対象月">
          {MONTHS.map((m) => (
            <option key={m} value={m}>
              {ymLabel(m)}
            </option>
          ))}
        </select>
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/…" className={inputCls} aria-label="スプレッドシートのURL" required />
        <Button type="submit" disabled={pending !== null}>
          {pending === "register" && <LoaderCircle className="animate-spin" aria-hidden />}
          登録して読み取る
        </Button>
      </form>
      {sheets.length > 0 && (
        <ul className="divide-y rounded-lg border text-sm">
          {sheets.map((s) => (
            <li key={s.month} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
              <span className="w-24 font-medium">{ymLabel(s.month)}</span>
              <span className={cn("text-xs", s.lastStatus === "error" ? "text-red-600" : "text-muted-foreground")}>
                {s.lastStatus === "ok" ? "✓ " : s.lastStatus === "error" ? "✕ " : ""}
                {s.lastSyncAt ? `${formatDateTime(s.lastSyncAt)}：${s.lastMessage ?? ""}` : "未取得"}
              </span>
              <a className="text-brand ml-auto text-xs hover:underline" href={`https://docs.google.com/spreadsheets/d/${s.spreadsheetId}/edit${s.gid ? `#gid=${s.gid}` : ""}`} target="_blank" rel="noreferrer">
                開く
              </a>
              <button type="button" className="text-muted-foreground text-xs hover:underline" onClick={() => remove(s.month)}>
                登録を外す
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={pending !== null || sheets.length === 0} onClick={() => sync(false)}>
          <RefreshCw className={cn(pending === "now" && "animate-spin")} aria-hidden /> 今月を今すぐ読み取る
        </Button>
        <Button size="sm" variant="ghost" disabled={pending !== null || sheets.length === 0} onClick={() => sync(true)}>
          {pending === "all" && <LoaderCircle className="animate-spin" aria-hidden />}
          登録した全月を読み直す
        </Button>
      </div>
      <Message msg={msg} />
    </section>
  );
}

function CsvPanel() {
  const { snapshot, mutate } = useCompany();
  const [kind, setKind] = React.useState<"daily" | "plan">("daily");
  const [month, setMonth] = React.useState(snapshot.revenue.currentMonth);
  const [pending, setPending] = React.useState(false);
  const [msg, setMsg] = React.useState<{ ok: boolean; text: string } | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return setMsg({ ok: false, text: "ファイルを選んでください" });
    if (file.size > 2_000_000) return setMsg({ ok: false, text: "ファイルが大きすぎます（2MBまで）" });
    setPending(true);
    const csv = await readFileText(file);
    const r = await mutate("/api/numbers/import", { kind, month: kind === "daily" ? month : undefined, fileName: file.name, csv });
    setPending(false);
    if (!r.ok) return setMsg({ ok: false, text: r.error });
    const res = r.data.result as Record<string, unknown>;
    if (kind === "daily") {
      const unmatched = res.unmatched as string[];
      const warnings = res.warnings as string[];
      setMsg({
        ok: true,
        text: `${ymLabel(month)}：${(res.clinics as string[]).length}行・指標${res.metrics}項目を取り込みました。${unmatched.length ? `院が分からない行：${unmatched.join("、")}。` : ""}${warnings.join(" ")}`,
      });
    } else {
      setMsg({ ok: true, text: `事業計画書：院${res.clinicRows}行・損益${res.plRows}行（${(res.months as string[]).length}か月分）を取り込みました。${(res.warnings as string[]).join(" ")}` });
    }
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <section className="space-y-3">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold">
        <FileUp className="size-4" aria-hidden /> CSVの取り込み
      </h3>
      <ul className="text-muted-foreground list-disc space-y-1 pl-4 text-xs leading-relaxed">
        <li>日計表：TOPシートを開き「ファイル → ダウンロード → カンマ区切り形式（.csv）」で保存したもの。7月〜9月の確定分はこちらでも取り込めます。</li>
        <li>事業計画書：Excelで「CSV」形式で保存したもの（「7月」「8月」…の見出し行がある表）。取り込むたびに前回の計画を置き換えます。</li>
        <li>サロエボ2のCSVは、項目を確認してから対応します（患者個人の情報は取り込みません）。</li>
      </ul>
      <form onSubmit={submit} className="grid gap-2 sm:grid-cols-[10rem_9rem_1fr_auto]">
        <select value={kind} onChange={(e) => setKind(e.target.value as "daily" | "plan")} className={inputCls} aria-label="ファイルの種類">
          <option value="daily">日計表（TOP）</option>
          <option value="plan">事業計画書</option>
        </select>
        <select value={month} onChange={(e) => setMonth(e.target.value)} className={inputCls} aria-label="対象月" disabled={kind === "plan"}>
          {MONTHS.map((m) => (
            <option key={m} value={m}>
              {ymLabel(m)}
            </option>
          ))}
        </select>
        <input ref={fileRef} type="file" accept=".csv,text/csv" className="text-sm file:mr-2 file:rounded-md file:border file:bg-transparent file:px-2 file:py-1.5" aria-label="CSVファイル" />
        <Button type="submit" disabled={pending}>
          {pending && <LoaderCircle className="animate-spin" aria-hidden />}
          取り込む
        </Button>
      </form>
      <Message msg={msg} />
    </section>
  );
}

const MANUAL_KEYS = ["salesTarget", "salesActual", "salesForecast", "newPatients", "totalVisits", "makiSales", "jibaiSales"];

function ManualPanel() {
  const { snapshot, mutate } = useCompany();
  const [month, setMonth] = React.useState(snapshot.revenue.currentMonth);
  const [clinicId, setClinicId] = React.useState(TENANT.clinics[0].id);
  const [vals, setVals] = React.useState<Record<string, string>>({});
  const [pending, setPending] = React.useState(false);
  const [msg, setMsg] = React.useState<{ ok: boolean; text: string } | null>(null);
  const existing = snapshot.clinicMonths.find((r) => r.month === month && r.clinicId === clinicId);
  const defs = MANUAL_KEYS.map((k) => TENANT.metrics.find((m) => m.key === k)).filter((m): m is MetricDef => Boolean(m));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const values: Record<string, number> = {};
    for (const [k, v] of Object.entries(vals)) {
      if (v.trim() === "") continue;
      const n = Number(v.replace(/[,，¥\s]/g, ""));
      if (!Number.isFinite(n)) return setMsg({ ok: false, text: "数字で入力してください" });
      values[k] = n;
    }
    if (Object.keys(values).length === 0) return setMsg({ ok: false, text: "変更する項目を入力してください" });
    setPending(true);
    const r = await mutate("/api/numbers/manual", { month, clinicId, values });
    setPending(false);
    setMsg(r.ok ? { ok: true, text: "保存しました（変更は監査ログに残ります）" } : { ok: false, text: r.error });
    if (r.ok) setVals({});
  };

  return (
    <section className="space-y-3">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold">
        <PencilLine className="size-4" aria-hidden /> 手入力（日計表がない月・院の補完）
      </h3>
      <form onSubmit={submit} className="space-y-2">
        <div className="grid grid-cols-2 gap-2 sm:w-96">
          <select value={month} onChange={(e) => setMonth(e.target.value)} className={inputCls} aria-label="対象月">
            {MONTHS.map((m) => (
              <option key={m} value={m}>
                {ymLabel(m)}
              </option>
            ))}
          </select>
          <select value={clinicId} onChange={(e) => setClinicId(e.target.value)} className={inputCls} aria-label="院">
            {TENANT.clinics.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {defs.map((m) => (
            <label key={m.key} className="space-y-1 text-xs font-medium">
              {m.label}
              <input
                inputMode="numeric"
                value={vals[m.key] ?? ""}
                onChange={(e) => setVals((v) => ({ ...v, [m.key]: e.target.value }))}
                placeholder={existing?.values[m.key] != null ? String(existing.values[m.key]) : ""}
                className={inputCls}
              />
            </label>
          ))}
        </div>
        <Button type="submit" size="sm" disabled={pending}>
          保存
        </Button>
      </form>
      <Message msg={msg} />
    </section>
  );
}

const NUMBER_TABS = [
  { id: "clinics", label: "院別の数字" },
  { id: "budget", label: "予算" },
  { id: "annual", label: "年間・損益" },
  { id: "import", label: "データの取り込み" },
] as const;

export function NumbersView() {
  const { snapshot } = useCompany();
  const params = useSearchParams();
  const current = snapshot.revenue.currentMonth;
  const [month, setMonth] = React.useState(MONTHS.includes(current) ? current : MONTHS[0]);
  const initialTab = NUMBER_TABS.find((t) => t.id === params.get("tab"))?.id ?? "clinics";
  const [tab, setTab] = React.useState<(typeof NUMBER_TABS)[number]["id"]>(initialTab);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">数字（院別）</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            日計表・事業計画書・予算・手入力の<strong>本番の数字</strong>です。AI部門のデモの成果物の数字は含みません。
          </p>
        </div>
        {tab === "clinics" && (
          <label className="text-sm">
            <span className="text-muted-foreground mr-2 text-xs">表示する月</span>
            <select value={month} onChange={(e) => setMonth(e.target.value)} className="h-9 rounded-md border bg-transparent px-2">
              {MONTHS.map((m) => (
                <option key={m} value={m}>
                  {ymLabel(m)}
                  {snapshot.clinicMonths.some((r) => r.month === m) ? "" : "（なし）"}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <div className="flex gap-1 overflow-x-auto pb-1 [scrollbar-width:none]" role="tablist" aria-label="数字のメニュー">
        {NUMBER_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn("shrink-0 rounded-full px-3.5 py-1.5 text-sm transition", tab === t.id ? "bg-primary text-primary-foreground" : "bg-secondary hover:bg-accent")}
          >
            {t.label}
            {t.id === "budget" && snapshot.budget.pendingApprovalId && <span className="ml-1.5 rounded-full bg-amber-500 px-1.5 text-xs font-bold text-white">承認待ち</span>}
          </button>
        ))}
      </div>
      {tab === "clinics" && <ClinicTable month={month} />}
      {tab === "budget" && <BudgetView />}
      {tab === "annual" && (
        <>
          <AnnualCard />
          <PlanCard />
        </>
      )}
      {tab === "import" && (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>データの取り込み</CardTitle>
              <CardDescription>取り込み・登録・手入力の操作はすべて監査ログに記録されます。数字はこのパソコンの中（.data フォルダ）に保存され、外部のAIには送信しません。</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-8">
            <SheetsPanel />
            <CsvPanel />
            <ManualPanel />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
