"use client";

import Link from "next/link";
import { LoaderCircle, PencilLine, Plus, Send, Trash2, Undo2, Users } from "lucide-react";
import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { BudgetTable } from "@/lib/engine/budget-metrics";
import { formatDateTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { TENANT } from "@/tenant";
import { formatOku, monthLabel } from "./RevenuePanel";
import { Message, PlanSheetImport, type Msg } from "./SheetImport";
import { useClinics, useCompany } from "./StateProvider";

const man = (n: number | null | undefined) => (n == null ? "—" : `${Math.round(n / 10_000).toLocaleString("ja-JP")}`);
const signedMan = (n: number) => (n === 0 ? "±0" : `${n > 0 ? "+" : "−"}${man(Math.abs(n))}`);
const ym = (m: string) => `${m.slice(0, 4)}年${Number(m.slice(5))}月`;
const digits = (s: string) => s.replace(/[^\d.]/g, "");

/** 達成率の文字色（色だけに頼らず数字も出す） */
const rateCls = (r: number | null) =>
  r == null ? "text-muted-foreground" : r >= 100 ? "text-emerald-700 dark:text-emerald-400" : r < 90 ? "text-amber-700 dark:text-amber-400" : "";

const inputCls =
  "focus-visible:ring-ring/50 rounded-md border bg-transparent px-1 text-right text-sm outline-none focus-visible:ring-[3px]";

function Summary({ t, label }: { t: BudgetTable; label: string }) {
  const short = t.gapToTarget > 0;
  const diff = t.originalTotal != null ? t.totalBudget - t.originalTotal : 0;
  return (
    <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <div className="bg-card rounded-xl border p-4">
        <dt className="text-muted-foreground text-xs">{label}の年間合計</dt>
        <dd className="text-2xl font-bold tabular-nums">{formatOku(t.totalBudget)}</dd>
        <dd className="text-muted-foreground text-xs">
          院・月 {t.clinicMonthSlots}枠 × 平均 {man(t.averagePerClinicMonth)}万円
        </dd>
        {t.originalTotal != null && diff !== 0 && (
          <dd className="text-muted-foreground text-xs">
            当初予算との差 <strong className="text-foreground tabular-nums">{signedMan(diff)}万円</strong>
          </dd>
        )}
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
          {t.rateToDate != null
            ? `予算 ${formatOku(t.budgetToDate)} に対し 実績＋今月の着地予想 ${formatOku(t.landingToDate)}`
            : "日計表などの実績を取り込むと表示されます"}
        </dd>
      </div>
    </dl>
  );
}

type View = "rate" | "budget" | "staff";
type EditField = "amount" | "staff";
/** 入力中の値。キーは `${field}|${month}|${clinicId}`、値は文字列（金額は万円、人員は人） */
type Pending = Record<string, string>;
const key = (f: EditField, month: string, clinicId: string) => `${f}|${month}|${clinicId}`;

function Grid({
  t,
  view,
  editing,
  field,
  pending,
  setPending,
  compare,
}: {
  t: BudgetTable;
  view: View;
  editing: boolean;
  field: EditField;
  pending: Pending;
  setPending: React.Dispatch<React.SetStateAction<Pending>>;
  compare: boolean;
}) {
  const showStaff = editing ? field === "staff" : view === "staff";
  const valueOf = (month: string, clinicId: string, budget: number, staff: number | null) =>
    pending[key(field, month, clinicId)] ?? (field === "amount" ? String(Math.round(budget / 10_000)) : staff != null ? String(staff) : "");
  const rowFill = (clinicId: string, v: string) =>
    setPending((d) => {
      const n = { ...d };
      for (const c of t.rows.find((r) => r.clinicId === clinicId)!.cells) if (c.open) n[key(field, c.month, clinicId)] = v;
      return n;
    });
  const unit = showStaff ? "人" : "万円";
  return (
    <div className="-mx-1 overflow-x-auto">
      <table className="w-full min-w-[64rem] text-xs">
        <thead>
          <tr className="text-muted-foreground border-b">
            <th scope="col" className="bg-card sticky left-0 z-10 py-2 pr-2 pl-1 text-left font-medium">院</th>
            {t.months.map((m) => (
              <th key={m} scope="col" className={cn("px-1.5 py-2 text-right font-medium", m === t.currentMonth && "text-foreground")}>
                {monthLabel(m)}
                {m === t.currentMonth && <span className="block text-[10px] font-normal">今月</span>}
              </th>
            ))}
            <th scope="col" className="px-1.5 py-2 text-right font-medium">{showStaff ? "1人あたり" : "年間"}</th>
            <th scope="col" className="px-1.5 py-2 text-right font-medium">月平均</th>
            {compare && !showStaff && <th scope="col" className="px-1.5 py-2 text-right font-medium">当初との差</th>}
            {editing && <th scope="col" className="px-1.5 py-2 text-right font-medium">全月に入れる</th>}
          </tr>
        </thead>
        <tbody>
          {t.rows.map((r) => {
            const staffed = r.cells.filter((c) => c.open && c.staff != null);
            const avgStaff = staffed.length ? Math.round((staffed.reduce((n, c) => n + (c.staff ?? 0), 0) / staffed.length) * 10) / 10 : null;
            const perStaff = staffed.length ? staffed.reduce((n, c) => n + c.budget, 0) / staffed.reduce((n, c) => n + (c.staff ?? 0), 0) : null;
            return (
              <tr key={r.clinicId} className="border-b">
                <th scope="row" className="bg-card sticky left-0 z-10 py-1.5 pr-2 pl-1 text-left text-sm font-medium whitespace-nowrap">
                  {r.name}
                  {r.added && (
                    <Badge variant="outline" className="ml-1 border-sky-400 px-1 py-0 text-[10px] text-sky-800 dark:text-sky-300">
                      新店
                    </Badge>
                  )}
                </th>
                {r.cells.map((c) => {
                  const k = key(field, c.month, r.clinicId);
                  const closed = !c.open && r.closedMonth != null && c.month > r.closedMonth;
                  return (
                    <td key={c.month} className={cn("px-1 py-1.5 text-right tabular-nums", c.month === t.currentMonth && "bg-brand/5")}>
                      {!c.open ? (
                        <span className="text-muted-foreground text-[10px]">{closed ? "閉院" : "開院前"}</span>
                      ) : editing ? (
                        <input
                          inputMode="decimal"
                          aria-label={`${r.name} ${c.month} の${field === "amount" ? "予算（万円）" : "人員（人）"}`}
                          value={valueOf(c.month, r.clinicId, c.budget, c.staff)}
                          placeholder={field === "staff" ? "—" : undefined}
                          onChange={(e) => setPending((d) => ({ ...d, [k]: digits(e.target.value) }))}
                          className={cn(inputCls, "h-8 w-14", k in pending && "border-sky-500 bg-sky-50 dark:bg-sky-950/50")}
                        />
                      ) : view === "budget" ? (
                        man(c.budget)
                      ) : view === "staff" ? (
                        c.staff != null ? (
                          <span title={`予算 ${man(c.budget)}万円・1人あたり ${man(c.perStaff)}万円`}>{c.staff}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )
                      ) : (
                        <span
                          className={rateCls(c.rate)}
                          title={`予算 ${man(c.budget)}万円 ／ ${c.status === "past" ? "実績" : "着地予想"} ${man(c.status === "past" ? c.actual : c.forecast)}万円`}
                        >
                          {c.status === "future" ? <span className="text-muted-foreground">{man(c.budget)}</span> : c.rate != null ? `${c.rate}%` : "—"}
                        </span>
                      )}
                    </td>
                  );
                })}
                <td className="px-1.5 py-1.5 text-right font-semibold tabular-nums">{showStaff ? (perStaff != null ? man(perStaff) : "—") : man(r.totalBudget)}</td>
                <td className="px-1.5 py-1.5 text-right tabular-nums">{showStaff ? (avgStaff ?? "—") : man(r.averageBudget)}</td>
                {compare && !showStaff && (
                  <td className="px-1.5 py-1.5 text-right tabular-nums">{r.diffFromOriginal != null ? signedMan(r.diffFromOriginal) : "—"}</td>
                )}
                {editing && (
                  <td className="px-1 py-1.5 text-right">
                    <input
                      inputMode="decimal"
                      placeholder={field === "amount" ? "例 400" : "例 4"}
                      aria-label={`${r.name}の全月に同じ${field === "amount" ? "予算を入れる（万円）" : "人員を入れる（人）"}`}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          const v = digits((e.target as HTMLInputElement).value);
                          if (v) rowFill(r.clinicId, v);
                        }
                      }}
                      onBlur={(e) => {
                        const v = digits(e.target.value);
                        if (v) rowFill(r.clinicId, v);
                      }}
                      className={cn(inputCls, "h-8 w-16 border-dashed")}
                    />
                  </td>
                )}
              </tr>
            );
          })}
          <tr className="bg-secondary/60 font-semibold">
            <th scope="row" className="bg-secondary sticky left-0 z-10 py-2 pr-2 pl-1 text-left text-sm">
              全院合計<span className="text-muted-foreground block text-[10px] font-normal">（営業している院の数）</span>
            </th>
            {t.monthTotals.map((m) => (
              <td key={m.month} className="px-1.5 py-2 text-right tabular-nums">
                {showStaff ? (
                  (m.staff ?? "—")
                ) : view === "rate" && !editing && m.status !== "future" ? (
                  <span className={rateCls(m.rate)}>{m.rate != null ? `${m.rate}%` : "—"}</span>
                ) : (
                  man(m.budget)
                )}
                <span className="text-muted-foreground block text-[10px] font-normal">{m.openClinics}院</span>
              </td>
            ))}
            <td className="px-1.5 py-2 text-right tabular-nums">{showStaff ? "" : man(t.totalBudget)}</td>
            <td className="px-1.5 py-2 text-right tabular-nums">{showStaff ? "" : man(t.averagePerClinicMonth)}</td>
            {compare && !showStaff && (
              <td className="px-1.5 py-2 text-right tabular-nums">{t.originalTotal != null ? signedMan(t.totalBudget - t.originalTotal) : "—"}</td>
            )}
            {editing && <td />}
          </tr>
        </tbody>
      </table>
      <p className="text-muted-foreground mt-1 text-[11px]">単位：{unit}</p>
    </div>
  );
}

/** 店舗展開：院の追加・開院月／閉院月 */
function ClinicSettings() {
  const { mutate } = useCompany();
  const clinics = useClinics();
  const months = React.useMemo(() => {
    const out: string[] = [];
    // 前年度〜翌年度まで選べるようにする
    const [fy, fm] = TENANT.revenueTarget.fromMonth.split("-").map(Number);
    for (let i = -12; i < 36; i++) {
      const d = new Date(Date.UTC(fy, fm - 1 + i, 1));
      out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
    }
    return out;
  }, []);
  const [name, setName] = React.useState("");
  const [opened, setOpened] = React.useState("");
  const [makizume, setMakizume] = React.useState(false);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [msg, setMsg] = React.useState<Msg>(null);

  const call = async (k: string, body: Record<string, unknown>, ok: string) => {
    setBusy(k);
    const r = await mutate("/api/clinics", body);
    setBusy(null);
    setMsg(r.ok ? { ok: true, text: ok } : { ok: false, text: r.error });
    return r.ok;
  };

  const MonthSelect = ({ value, label, onChange, emptyLabel }: { value: string | undefined; label: string; onChange: (v: string | null) => void; emptyLabel: string }) => (
    <select
      aria-label={label}
      value={value ?? ""}
      disabled={busy !== null}
      onChange={(e) => onChange(e.target.value || null)}
      className="bg-background h-8 rounded-md border px-1 text-xs"
    >
      <option value="">{emptyLabel}</option>
      {months.map((m) => (
        <option key={m} value={m}>
          {ym(m)}
        </option>
      ))}
    </select>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>院の設定（店舗展開）</CardTitle>
        <CardDescription>
          新しい院を追加すると、開院月から予算の表に入ります（予算は基準額で仮置き）。ブロックは管理項目でブロックごとに集計する単位です（組織図を取り込むとブロックマネージャーの行から自動で入ります）。閉院する場合は最終営業月を入れると、その翌月から予算は0円になります。変更は予算の案・確定予算の計算にすぐ反映されます。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="-mx-1 overflow-x-auto">
          <table className="w-full min-w-[38rem] text-sm">
            <thead>
              <tr className="text-muted-foreground border-b text-xs">
                <th scope="col" className="py-2 pl-1 text-left font-medium">院</th>
                <th scope="col" className="py-2 text-left font-medium">開院月</th>
                <th scope="col" className="py-2 text-left font-medium">閉院（最終営業月）</th>
                <th scope="col" className="py-2 text-left font-medium">ブロック</th>
                <th scope="col" className="py-2" />
              </tr>
            </thead>
            <tbody>
              {clinics.map((c) => (
                <tr key={c.id} className="border-b">
                  <th scope="row" className="py-1.5 pl-1 text-left font-medium">
                    {c.name}
                    {c.added && (
                      <Badge variant="outline" className="ml-1 border-sky-400 px-1 py-0 text-[10px] text-sky-800 dark:text-sky-300">
                        新店
                      </Badge>
                    )}
                  </th>
                  <td className="py-1.5">
                    <MonthSelect
                      value={c.openedMonth}
                      label={`${c.name}の開院月`}
                      emptyLabel="以前から営業"
                      onChange={(v) => call(`o-${c.id}`, { action: "update", id: c.id, openedMonth: v }, `${c.name}の開院月を${v ? ym(v) : "「以前から営業」"}にしました`)}
                    />
                  </td>
                  <td className="py-1.5">
                    <MonthSelect
                      value={c.closedMonth}
                      label={`${c.name}の最終営業月（閉院）`}
                      emptyLabel="営業中"
                      onChange={(v) => {
                        if (v && !window.confirm(`${c.name}を${ym(v)}末で閉院として扱いますか？翌月からの予算は0円になります。`)) return;
                        void call(`c-${c.id}`, { action: "update", id: c.id, closedMonth: v }, v ? `${c.name}を${ym(v)}末で閉院にしました` : `${c.name}を営業中に戻しました`);
                      }}
                    />
                  </td>
                  <td className="py-1.5">
                    <input
                      key={`${c.id}-${c.block ?? ""}`}
                      defaultValue={c.block ?? ""}
                      maxLength={20}
                      placeholder="例 北"
                      aria-label={`${c.name}のブロック`}
                      disabled={busy !== null}
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if (v === (c.block ?? "")) return;
                        void call(`b-${c.id}`, { action: "update", id: c.id, block: v || null }, v ? `${c.name}を「${v}」ブロックにしました` : `${c.name}のブロックを外しました`);
                      }}
                      className="focus-visible:ring-ring/50 h-8 w-24 rounded-md border bg-transparent px-2 text-xs outline-none focus-visible:ring-[3px]"
                    />
                  </td>
                  <td className="py-1.5 text-right">
                    {c.added && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy !== null}
                        aria-label={`${c.name}を削除`}
                        onClick={async () => {
                          if (!window.confirm(`${c.name}を削除しますか？（数字や予算が入っている院は削除できません。閉院（最終営業月）を入れてください）`)) return;
                          await call(`r-${c.id}`, { action: "remove", id: c.id }, `${c.name}を削除しました`);
                        }}
                      >
                        <Trash2 aria-hidden />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <form
          className="flex flex-wrap items-end gap-2 border-t pt-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!name.trim()) return;
            const ok = await call(
              "add",
              { action: "add", name: name.trim(), openedMonth: opened || undefined, tags: makizume ? ["巻き爪"] : undefined },
              `${name.trim()}を追加しました。予算の表に入りました（基準額で仮置き）。`,
            );
            if (ok) {
              setName("");
              setOpened("");
              setMakizume(false);
            }
          }}
        >
          <label className="text-xs font-medium">
            新しい院の名前
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例 吹田院"
              maxLength={40}
              className="focus-visible:ring-ring/50 mt-1 block h-9 w-40 rounded-md border bg-transparent px-2 text-sm outline-none focus-visible:ring-[3px]"
            />
          </label>
          <label className="text-xs font-medium">
            開院月
            <select value={opened} onChange={(e) => setOpened(e.target.value)} className="bg-background mt-1 block h-9 rounded-md border px-2 text-sm">
              <option value="">以前から営業</option>
              {months.map((m) => (
                <option key={m} value={m}>
                  {ym(m)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex h-9 items-center gap-1.5 text-xs">
            <input type="checkbox" checked={makizume} onChange={(e) => setMakizume(e.target.checked)} /> 巻き爪あり
          </label>
          <Button type="submit" size="sm" disabled={busy !== null || !name.trim()}>
            {busy === "add" ? <LoaderCircle className="animate-spin" aria-hidden /> : <Plus aria-hidden />} 院を追加
          </Button>
        </form>
        <Message msg={msg} />
      </CardContent>
    </Card>
  );
}

export function BudgetView() {
  const { snapshot, mutate } = useCompany();
  const b = snapshot.budget;
  const [view, setView] = React.useState<View>("rate");
  const [editing, setEditing] = React.useState(false);
  const [field, setField] = React.useState<EditField>("amount");
  const [pending, setPending] = React.useState<Pending>({});
  const base = b.draft ?? b.confirmed;
  const [standard, setStandard] = React.useState(String(Math.round(base.standardJpy / 10_000)));
  const [perStaff, setPerStaff] = React.useState(String(Math.round(base.perStaffJpy / 10_000)));
  const [note, setNote] = React.useState("");
  const [compare, setCompare] = React.useState(false);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [msg, setMsg] = React.useState<Msg>(null);
  const locked = Boolean(b.pendingApprovalId);
  const shown = b.draft && (editing || view !== "rate") ? b.draft : b.confirmed;
  const changes = Object.keys(pending).length;
  const canCompare = b.confirmed.versions.length > 0;

  const call = async (k: string, body: Record<string, unknown>, ok: string) => {
    setBusy(k);
    const r = await mutate("/api/budget", body);
    setBusy(null);
    setMsg(r.ok ? { ok: true, text: ok } : { ok: false, text: r.error });
    return r;
  };

  const editBody = () => {
    const cells = new Map<string, { month: string; clinicId: string; amountJpy?: number; staff?: number | null }>();
    for (const [k, v] of Object.entries(pending)) {
      const [f, month, clinicId] = k.split("|");
      const cell = cells.get(`${month}|${clinicId}`) ?? { month, clinicId };
      if (f === "amount") {
        if (v === "") continue;
        cell.amountJpy = Math.round(Number(v) * 10_000);
      } else {
        // 人員を空にしたら「人員なし」に戻す
        cell.staff = v === "" ? null : Number(v);
      }
      cells.set(`${month}|${clinicId}`, cell);
    }
    const std = Number(standard) * 10_000;
    const ps = Number(perStaff) * 10_000;
    return {
      action: "edit",
      cells: [...cells.values()],
      standardJpy: Number.isFinite(std) && std > 0 ? std : undefined,
      perStaffJpy: Number.isFinite(ps) && ps > 0 ? ps : undefined,
    };
  };

  const save = async (close: boolean) => {
    const r = await call("save", editBody(), "案を保存しました（まだ確定ではありません）");
    if (r.ok) {
      setPending({});
      if (close) {
        setEditing(false);
        setView("budget");
      }
    }
    return r.ok;
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex-wrap">
          <div>
            <CardTitle className="flex flex-wrap items-center gap-2">
              院別の売上予算（{ym(TENANT.revenueTarget.fromMonth)}〜{ym(TENANT.revenueTarget.toMonth)}）
              {b.confirmed.confirmed ? (
                <Badge variant="secondary">
                  {b.confirmed.confirmed.label}・{formatDateTime(b.confirmed.confirmed.at)} 確定
                </Badge>
              ) : (
                <Badge variant="outline">未確定（基準額で計算中）</Badge>
              )}
              {b.draft && <Badge variant="outline" className="border-sky-400 text-sky-800 dark:text-sky-300">修正中の案あり</Badge>}
              {locked && <Badge className="bg-amber-500 text-white">確定の承認待ち</Badge>}
            </CardTitle>
            <CardDescription>
              会社の基準：{TENANT.budget.label}。予算は院・月ごとに何度でも修正でき、人員の増減や新店の開院・閉院に合わせて調整できます。修正は「案」として作り、承認（予算変更）されると新しい版として確定します。
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Summary t={shown} label={shown === b.draft ? "修正案" : b.confirmed.confirmed ? b.confirmed.confirmed.label : "基準額での予算"} />
          {b.draft && shown !== b.draft && (
            <p className="text-xs text-sky-800 dark:text-sky-300">
              修正中の案：年間合計 {formatOku(b.draft.totalBudget)}（今の予算との差 {signedMan(b.draft.totalBudget - b.confirmed.totalBudget)}万円）・院平均{" "}
              {man(b.draft.averagePerClinicMonth)}万円（{b.draftUpdatedAt ? formatDateTime(b.draftUpdatedAt) : ""} 更新）。「予算」「人員」表示では案を表示します。
            </p>
          )}
          {b.confirmed.versions.length > 0 && (
            <p className="text-muted-foreground text-xs">
              確定の履歴：
              {b.confirmed.versions.map((v, i) => (
                <span key={v.index}>
                  {i > 0 && " → "}
                  {v.label}（{formatDateTime(v.at)}
                  {v.note ? `・${v.note}` : ""}）
                </span>
              ))}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-wrap">
          <div>
            <CardTitle>
              {editing
                ? `予算の案を修正（${field === "amount" ? "金額・万円" : "人員・人"}）`
                : view === "rate"
                  ? "予算達成率（院別・月別）"
                  : view === "staff"
                    ? `人員（施術者の人数）${shown === b.draft ? "・案" : ""}`
                    : `予算${shown === b.draft ? "の案" : ""}（単位：万円）`}
            </CardTitle>
            <CardDescription>
              {editing
                ? field === "amount"
                  ? "セルを直接書き換えるか、右端の「全月に入れる」に金額を入れて Enter。変えたセルは青くなります。"
                  : "院・月ごとの施術者の人数を入れて「人員から金額を計算」を押すと、人数 × 1人あたりの売上で予算を出します（半人は 0.5）。空にすると人員なしに戻ります。"
                : view === "rate"
                  ? "過ぎた月は実績÷予算、今月は着地予想÷予算。これからの月は予算額（灰色）。100%以上は緑、90%未満は黄色。"
                  : view === "staff"
                    ? "院・月ごとの人員。右の列は人員1人あたりの予算です。"
                    : "院ごと・月ごとの売上予算。"}
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {editing ? (
              <div className="flex gap-1" role="group" aria-label="修正する項目">
                {(
                  [
                    ["amount", "金額"],
                    ["staff", "人員"],
                  ] as const
                ).map(([v, l]) => (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={field === v}
                    onClick={() => setField(v)}
                    className={cn("rounded-full px-3 py-1 text-xs", field === v ? "bg-primary text-primary-foreground" : "bg-secondary hover:bg-accent")}
                  >
                    {l}
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex gap-1" role="group" aria-label="表示">
                {(
                  [
                    ["rate", "達成率"],
                    ["budget", "予算"],
                    ["staff", "人員"],
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
            {canCompare && (
              <label className="flex items-center gap-1 text-xs">
                <input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} /> 当初予算と比べる
              </label>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Grid t={editing ? base : shown} view={view} editing={editing} field={field} pending={pending} setPending={setPending} compare={compare && canCompare} />

          {editing ? (
            <div className="space-y-4 border-t pt-4">
              <div className="flex flex-wrap items-end gap-3">
                <label className="text-xs font-medium">
                  基準額（1院あたり月・万円）
                  <input
                    inputMode="numeric"
                    value={standard}
                    onChange={(e) => setStandard(digits(e.target.value))}
                    className={cn(inputCls, "mt-1 block h-9 w-28 px-2")}
                  />
                </label>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy !== null || !standard}
                  onClick={async () => {
                    if (!window.confirm(`すべての院・月の金額を ${standard}万円 にしますか？（人員はそのまま。入力中の変更は消えます）`)) return;
                    if ((await call("fill", { action: "fill_standard", standardJpy: Number(standard) * 10_000 }, `すべての院・月を${standard}万円で埋めました`)).ok) setPending({});
                  }}
                >
                  基準額で全部埋める
                </Button>
                <label className="text-xs font-medium">
                  人員1人あたりの月の売上（万円）
                  <input
                    inputMode="numeric"
                    value={perStaff}
                    onChange={(e) => setPerStaff(digits(e.target.value))}
                    className={cn(inputCls, "mt-1 block h-9 w-28 px-2")}
                  />
                </label>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy !== null || !perStaff}
                  onClick={async () => {
                    if (!window.confirm(`人員を入れた院・月の金額を「人数 × ${perStaff}万円」で計算し直しますか？`)) return;
                    if (changes > 0 && !(await save(false))) return;
                    const r = await call("staff", { action: "apply_staff", perStaffJpy: Number(perStaff) * 10_000 }, "人員から金額を計算しました");
                    if (r.ok) {
                      const changed = (r.data.result as { changed: number } | undefined)?.changed ?? 0;
                      setMsg({ ok: true, text: `人員から金額を計算しました（${changed}件が変わりました）` });
                    }
                  }}
                >
                  {busy === "staff" ? <LoaderCircle className="animate-spin" aria-hidden /> : <Users aria-hidden />} 人員から金額を計算
                </Button>
              </div>
              <PlanSheetImport disabled={busy !== null} onDone={() => setPending({})} />
              <div className="flex flex-wrap gap-2">
                <Button size="sm" disabled={busy !== null} onClick={() => save(true)}>
                  {busy === "save" && <LoaderCircle className="animate-spin" aria-hidden />}
                  案を保存{changes ? `（${changes}件の変更）` : ""}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    if (changes && !window.confirm("保存していない変更を捨てますか？")) return;
                    setPending({});
                    setEditing(false);
                  }}
                >
                  編集をやめる
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3 border-t pt-4">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={locked}
                  onClick={() => {
                    setStandard(String(Math.round(base.standardJpy / 10_000)));
                    setPerStaff(String(Math.round(base.perStaffJpy / 10_000)));
                    setEditing(true);
                  }}
                >
                  <PencilLine aria-hidden /> {b.draft ? "案の編集を続ける" : "予算を修正する（案を作る）"}
                </Button>
                {b.draft && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={locked || busy !== null}
                    onClick={async () => {
                      if (!window.confirm("修正中の案を破棄しますか？（確定済みの予算は変わりません）")) return;
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
              {!locked && (b.draft || !b.confirmed.confirmed) && (
                <div className="flex flex-wrap items-end gap-2">
                  <label className="min-w-0 flex-1 text-xs font-medium">
                    修正の理由（承認者に伝わります・任意）
                    <textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      maxLength={300}
                      rows={2}
                      placeholder="例 10月に香里園院を開院、茨木院の施術者が1名増えるため"
                      className="focus-visible:ring-ring/50 mt-1 block w-full rounded-md border bg-transparent px-2 py-1 text-sm outline-none focus-visible:ring-[3px]"
                    />
                  </label>
                  <Button
                    size="sm"
                    disabled={busy !== null}
                    onClick={async () => {
                      const what = b.draft ? "修正中の案" : `基準額（1院 月${man(b.confirmed.standardJpy)}万円）の予算`;
                      if (!window.confirm(`${what}の確定を承認依頼しますか？承認されるまでは確定しません。`)) return;
                      const r = await call("request", { action: "request", note: note.trim() || undefined }, "確定の承認を依頼しました。承認画面で判断してください（代表へ回すこともできます）。");
                      if (r.ok) setNote("");
                    }}
                  >
                    {busy === "request" ? <LoaderCircle className="animate-spin" aria-hidden /> : <Send aria-hidden />}
                    {b.draft ? "案の確定を承認依頼" : "基準額のまま確定を承認依頼"}
                  </Button>
                </div>
              )}
            </div>
          )}
          <Message msg={msg} />
        </CardContent>
      </Card>

      <ClinicSettings />
    </div>
  );
}
