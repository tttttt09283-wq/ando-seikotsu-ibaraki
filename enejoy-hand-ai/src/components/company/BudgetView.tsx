"use client";

import Link from "next/link";
import { CircleAlert, CircleCheck, LoaderCircle, PencilLine, Send, Undo2 } from "lucide-react";
import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { BudgetTable } from "@/lib/engine/budget-metrics";
import { formatDateTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { TENANT } from "@/tenant";
import { formatOku, monthLabel } from "./RevenuePanel";
import { useCompany } from "./StateProvider";

const man = (n: number | null | undefined) => (n == null ? "—" : `${Math.round(n / 10_000).toLocaleString("ja-JP")}`);

function Msg({ msg }: { msg: { ok: boolean; text: string } | null }) {
  if (!msg) return null;
  return (
    <p role={msg.ok ? "status" : "alert"} className={cn("flex items-start gap-1.5 text-xs", msg.ok ? "text-emerald-700 dark:text-emerald-400" : "text-red-600")}>
      {msg.ok ? <CircleCheck className="mt-px size-3.5 shrink-0" aria-hidden /> : <CircleAlert className="mt-px size-3.5 shrink-0" aria-hidden />}
      {msg.text}
    </p>
  );
}

/** 達成率の文字色（色だけに頼らず数字も出す） */
const rateCls = (r: number | null) =>
  r == null ? "text-muted-foreground" : r >= 100 ? "text-emerald-700 dark:text-emerald-400" : r < 90 ? "text-amber-700 dark:text-amber-400" : "";

function Summary({ t, label }: { t: BudgetTable; label: string }) {
  const short = t.gapToTarget > 0;
  return (
    <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <div className="bg-card rounded-xl border p-4">
        <dt className="text-muted-foreground text-xs">{label}の年間合計</dt>
        <dd className="text-2xl font-bold tabular-nums">{formatOku(t.totalBudget)}</dd>
        <dd className="text-muted-foreground text-xs">
          院・月 {t.clinicMonthSlots}枠 × 平均 {man(t.averagePerClinicMonth)}万円
        </dd>
      </div>
      <div className={cn("bg-card rounded-xl border p-4", short && "border-amber-300 bg-amber-50/60 dark:border-amber-700 dark:bg-amber-950/40")}>
        <dt className="text-muted-foreground text-xs">目標3億円との差</dt>
        <dd className="text-2xl font-bold tabular-nums">{short ? `−${formatOku(t.gapToTarget)}` : `+${formatOku(-t.gapToTarget)}`}</dd>
        <dd className="text-muted-foreground text-xs">{short ? "予算のままでは3億円に届きません" : "予算で3億円に届きます"}</dd>
      </div>
      <div className="bg-card rounded-xl border p-4">
        <dt className="text-muted-foreground text-xs">1院あたりの月平均</dt>
        <dd className="text-2xl font-bold tabular-nums">{man(t.averagePerClinicMonth)}万円</dd>
        <dd className="text-muted-foreground text-xs">
          基準 {man(t.standardJpy)}万円・3億円には <strong className="text-foreground">{man(t.requiredAverageForTarget)}万円</strong> が必要
        </dd>
      </div>
      <div className="bg-card rounded-xl border p-4">
        <dt className="text-muted-foreground text-xs">ここまでの予算達成見込み（数字のある月）</dt>
        <dd className={cn("text-2xl font-bold tabular-nums", rateCls(t.rateToDate))}>{t.rateToDate != null ? `${t.rateToDate}%` : "—"}</dd>
        <dd className="text-muted-foreground text-xs">
          予算 {formatOku(t.budgetToDate)} に対し 実績＋今月の着地予想 {formatOku(t.landingToDate)}
        </dd>
      </div>
    </dl>
  );
}

type Draft = Record<string, string>;
const key = (month: string, clinicId: string) => `${month}|${clinicId}`;

/** 院×月の表。view = 予算 / 達成率。editing のときは予算を入力できる（単位：万円） */
function Grid({
  t,
  view,
  editing,
  draft,
  setDraft,
}: {
  t: BudgetTable;
  view: "budget" | "rate";
  editing: boolean;
  draft: Draft;
  setDraft: React.Dispatch<React.SetStateAction<Draft>>;
}) {
  const valueOf = (month: string, clinicId: string, fallback: number) => draft[key(month, clinicId)] ?? String(Math.round(fallback / 10_000));
  const rowFill = (clinicId: string, v: string) =>
    setDraft((d) => {
      const n = { ...d };
      for (const c of t.rows.find((r) => r.clinicId === clinicId)!.cells) if (c.open) n[key(c.month, clinicId)] = v;
      return n;
    });
  return (
    <div className="-mx-1 overflow-x-auto">
      <table className="w-full min-w-[64rem] text-xs">
        <thead>
          <tr className="text-muted-foreground border-b">
            <th scope="col" className="sticky left-0 z-10 bg-card py-2 pr-2 pl-1 text-left font-medium">院</th>
            {t.months.map((m) => (
              <th key={m} scope="col" className={cn("px-1.5 py-2 text-right font-medium", m === t.currentMonth && "text-foreground")}>
                {monthLabel(m)}
                {m === t.currentMonth && <span className="block text-[10px] font-normal">今月</span>}
              </th>
            ))}
            <th scope="col" className="px-1.5 py-2 text-right font-medium">年間</th>
            <th scope="col" className="px-1.5 py-2 text-right font-medium">月平均</th>
            {editing && <th scope="col" className="px-1.5 py-2 text-right font-medium">全月に入れる</th>}
          </tr>
        </thead>
        <tbody>
          {t.rows.map((r) => (
            <tr key={r.clinicId} className="border-b">
              <th scope="row" className="sticky left-0 z-10 bg-card py-1.5 pr-2 pl-1 text-left text-sm font-medium whitespace-nowrap">{r.name}</th>
              {r.cells.map((c) => (
                <td key={c.month} className={cn("px-1 py-1.5 text-right tabular-nums", c.month === t.currentMonth && "bg-brand/5")}>
                  {!c.open ? (
                    <span className="text-muted-foreground text-[10px]">開院前</span>
                  ) : editing ? (
                    <input
                      inputMode="numeric"
                      aria-label={`${r.name} ${c.month} の予算（万円）`}
                      value={valueOf(c.month, r.clinicId, c.budget)}
                      onChange={(e) => setDraft((d) => ({ ...d, [key(c.month, r.clinicId)]: e.target.value.replace(/[^\d]/g, "") }))}
                      className="focus-visible:ring-ring/50 h-8 w-14 rounded-md border bg-transparent px-1 text-right text-sm outline-none focus-visible:ring-[3px]"
                    />
                  ) : view === "budget" ? (
                    man(c.budget)
                  ) : (
                    <span className={rateCls(c.rate)} title={`予算 ${man(c.budget)}万円 ／ ${c.status === "past" ? "実績" : "着地予想"} ${man(c.status === "past" ? c.actual : c.forecast)}万円`}>
                      {c.status === "future" ? <span className="text-muted-foreground">{man(c.budget)}</span> : c.rate != null ? `${c.rate}%` : "—"}
                    </span>
                  )}
                </td>
              ))}
              <td className="px-1.5 py-1.5 text-right font-semibold tabular-nums">{man(r.totalBudget)}</td>
              <td className="px-1.5 py-1.5 text-right tabular-nums">{man(r.averageBudget)}</td>
              {editing && (
                <td className="px-1 py-1.5 text-right">
                  <input
                    inputMode="numeric"
                    placeholder="例 400"
                    aria-label={`${r.name}の全月に同じ予算を入れる（万円）`}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        const v = (e.target as HTMLInputElement).value.replace(/[^\d]/g, "");
                        if (v) rowFill(r.clinicId, v);
                      }
                    }}
                    onBlur={(e) => {
                      const v = e.target.value.replace(/[^\d]/g, "");
                      if (v) rowFill(r.clinicId, v);
                    }}
                    className="focus-visible:ring-ring/50 h-8 w-16 rounded-md border border-dashed bg-transparent px-1 text-right text-sm outline-none focus-visible:ring-[3px]"
                  />
                </td>
              )}
            </tr>
          ))}
          <tr className="bg-secondary/60 font-semibold">
            <th scope="row" className="bg-secondary sticky left-0 z-10 py-2 pr-2 pl-1 text-left text-sm">全院合計</th>
            {t.monthTotals.map((m) => (
              <td key={m.month} className="px-1.5 py-2 text-right tabular-nums">
                {view === "rate" && !editing && m.status !== "future" ? <span className={rateCls(m.rate)}>{m.rate != null ? `${m.rate}%` : "—"}</span> : man(m.budget)}
              </td>
            ))}
            <td className="px-1.5 py-2 text-right tabular-nums">{man(t.totalBudget)}</td>
            <td className="px-1.5 py-2 text-right tabular-nums">{man(t.averagePerClinicMonth)}</td>
            {editing && <td />}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export function BudgetView() {
  const { snapshot, mutate } = useCompany();
  const b = snapshot.budget;
  const [view, setView] = React.useState<"budget" | "rate">("rate");
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState<Draft>({});
  const [standard, setStandard] = React.useState(String(Math.round((b.draft ?? b.confirmed).standardJpy / 10_000)));
  const [pending, setPending] = React.useState<string | null>(null);
  const [msg, setMsg] = React.useState<{ ok: boolean; text: string } | null>(null);
  const locked = Boolean(b.pendingApprovalId);
  const shown = b.draft && (editing || view === "budget") ? b.draft : b.confirmed;
  const dirty = Object.keys(draft).length > 0;

  const call = async (k: string, body: Record<string, unknown>, ok: string) => {
    setPending(k);
    const r = await mutate("/api/budget", body);
    setPending(null);
    setMsg(r.ok ? { ok: true, text: ok } : { ok: false, text: r.error });
    return r.ok;
  };

  const save = async () => {
    const cells = Object.entries(draft)
      .filter(([, v]) => v !== "")
      .map(([k, v]) => {
        const [month, clinicId] = k.split("|");
        return { month, clinicId, amountJpy: Number(v) * 10_000 };
      });
    const std = Number(standard) * 10_000;
    if (await call("save", { action: "edit", cells, standardJpy: Number.isFinite(std) && std > 0 ? std : undefined }, "案を保存しました")) {
      setDraft({});
      setEditing(false);
      setView("budget");
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex-wrap">
          <div>
            <CardTitle className="flex flex-wrap items-center gap-2">
              院別の売上予算（{TENANT.revenueTarget.fromMonth.replace("-", "年")}月〜{TENANT.revenueTarget.toMonth.replace("-", "年")}月）
              {b.confirmed.confirmed ? (
                <Badge variant="secondary">確定済み・{formatDateTime(b.confirmed.confirmed.at)}</Badge>
              ) : (
                <Badge variant="outline">未確定（基準額で計算中）</Badge>
              )}
              {b.draft && <Badge variant="outline" className="border-sky-400 text-sky-800 dark:text-sky-300">編集中の案あり</Badge>}
              {locked && <Badge className="bg-amber-500 text-white">確定の承認待ち</Badge>}
            </CardTitle>
            <CardDescription>
              会社の基準：{TENANT.budget.label}。予算を決めていない院・月は基準額で計算し、開院前の月は0円です。予算の確定には承認（予算変更）が必要です。
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Summary t={shown} label={shown === b.draft ? "案" : b.confirmed.confirmed ? "確定予算" : "基準額での予算"} />
          {b.draft && shown !== b.draft && (
            <p className="text-xs text-sky-800 dark:text-sky-300">
              編集中の案：年間合計 {formatOku(b.draft.totalBudget)}・院平均 {man(b.draft.averagePerClinicMonth)}万円（{b.draftUpdatedAt ? formatDateTime(b.draftUpdatedAt) : ""} 更新）。「予算」表示に切り替えると案を表示します。
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-wrap">
          <div>
            <CardTitle>{editing ? "予算の案を編集（単位：万円）" : view === "rate" ? "予算達成率（院別・月別）" : `${shown === b.draft ? "予算の案" : "予算"}（単位：万円）`}</CardTitle>
            <CardDescription>
              {editing
                ? "セルを直接書き換えるか、右端の「全月に入れる」に金額を入れて Enter。保存しても確定ではありません。"
                : view === "rate"
                  ? "過ぎた月は実績÷予算、今月は着地予想÷予算。これからの月は予算額（灰色）。100%以上は緑、90%未満は黄色。"
                  : "院ごと・月ごとの売上予算。"}
            </CardDescription>
          </div>
          {!editing && (
            <div className="flex gap-1" role="group" aria-label="表示">
              {(
                [
                  ["rate", "達成率"],
                  ["budget", "予算"],
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
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <Grid t={editing ? (b.draft ?? b.confirmed) : shown} view={view} editing={editing} draft={draft} setDraft={setDraft} />

          {editing ? (
            <div className="space-y-3 border-t pt-4">
              <div className="flex flex-wrap items-end gap-2">
                <label className="text-xs font-medium">
                  基準額（1院あたり月・万円）
                  <input
                    inputMode="numeric"
                    value={standard}
                    onChange={(e) => setStandard(e.target.value.replace(/[^\d]/g, ""))}
                    className="focus-visible:ring-ring/50 mt-1 block h-9 w-28 rounded-md border bg-transparent px-2 text-right text-sm outline-none focus-visible:ring-[3px]"
                  />
                </label>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending !== null || !standard}
                  onClick={async () => {
                    if (!window.confirm(`すべての院・月を ${standard}万円 にしますか？（入力中の変更は消えます）`)) return;
                    if (await call("fill", { action: "fill_standard", standardJpy: Number(standard) * 10_000 }, `すべての院・月を${standard}万円で埋めました`)) setDraft({});
                  }}
                >
                  基準額で全部埋める
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" disabled={pending !== null} onClick={save}>
                  {pending === "save" && <LoaderCircle className="animate-spin" aria-hidden />}
                  案を保存{dirty ? `（${Object.keys(draft).length}件の変更）` : ""}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setDraft({});
                    setEditing(false);
                  }}
                >
                  編集をやめる
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2 border-t pt-4">
              <Button size="sm" variant="outline" disabled={locked} onClick={() => setEditing(true)}>
                <PencilLine aria-hidden /> 予算の案を編集
              </Button>
              {(b.draft || !b.confirmed.confirmed) && (
              <Button
                size="sm"
                disabled={locked || pending !== null}
                onClick={async () => {
                  const what = b.draft ? "編集中の案" : `基準額（1院 月${man(b.confirmed.standardJpy)}万円）の予算`;
                  if (!window.confirm(`${what}の確定を承認依頼しますか？承認されるまでは確定しません。`)) return;
                  await call("request", { action: "request" }, "確定の承認を依頼しました。承認画面で判断してください（代表へ回すこともできます）。");
                }}
              >
                {pending === "request" ? <LoaderCircle className="animate-spin" aria-hidden /> : <Send aria-hidden />}
                {b.draft ? "案の確定を承認依頼" : "基準額のまま確定を承認依頼"}
              </Button>
              )}
              {b.draft && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={locked || pending !== null}
                  onClick={async () => {
                    if (!window.confirm("編集中の案を破棄しますか？（確定済みの予算は変わりません）")) return;
                    await call("discard", { action: "discard" }, "案を破棄しました");
                  }}
                >
                  <Undo2 aria-hidden /> 案を破棄
                </Button>
              )}
              {locked && (
                <Link href="/approvals" className="text-brand text-xs font-medium hover:underline">
                  確定の承認待ちです → 承認画面へ
                </Link>
              )}
            </div>
          )}
          <Msg msg={msg} />
        </CardContent>
      </Card>
    </div>
  );
}
