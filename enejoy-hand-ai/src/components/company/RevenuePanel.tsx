"use client";

import { CircleAlert, CircleCheck, PencilLine } from "lucide-react";
import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { formatJpy } from "@/lib/time";
import { TENANT } from "@/tenant";
import { useCompany } from "./StateProvider";

/** 億・万の単位で短く表示（例：1.25億円、3,400万円） */
export function formatOku(n: number): string {
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(2).replace(/\.?0+$/, "")}億円`;
  if (n >= 10_000) return `${Math.round(n / 10_000).toLocaleString("ja-JP")}万円`;
  return formatJpy(n);
}

const monthLabel = (m: string) => `${Number(m.slice(5))}月`;

function SalesForm({ onDone }: { onDone: () => void }) {
  const { mutate, snapshot } = useCompany();
  const r = snapshot.revenue;
  const lastEnterable = r.byMonth.filter((m) => r.missingMonths.includes(m.month)).at(-1)?.month ?? r.byMonth.find((m) => m.entered)?.month;
  const [month, setMonth] = React.useState(lastEnterable ?? TENANT.revenueTarget.fromMonth);
  const [unitId, setUnitId] = React.useState(TENANT.businessUnits[0].id);
  const existing = snapshot.sales.find((s) => s.month === month && s.unitId === unitId);
  const [amount, setAmount] = React.useState("");
  const [newP, setNewP] = React.useState("");
  const [repeatP, setRepeatP] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [msg, setMsg] = React.useState<{ ok: boolean; text: string } | null>(null);

  React.useEffect(() => {
    setAmount(existing ? String(existing.amountJpy) : "");
    setNewP(existing?.newPatients != null ? String(existing.newPatients) : "");
    setRepeatP(existing?.repeatPatients != null ? String(existing.repeatPatients) : "");
  }, [existing]);

  const num = (s: string) => (s.trim() === "" ? undefined : Number(s.replace(/[,，\s]/g, "")));
  const inputCls = "h-10 w-full rounded-md border bg-transparent px-3 text-base outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountJpy = num(amount);
    if (amountJpy == null || !Number.isInteger(amountJpy) || amountJpy < 0) {
      setMsg({ ok: false, text: "売上は0以上の整数（円）で入力してください" });
      return;
    }
    setPending(true);
    const res = await mutate("/api/sales", { month, unitId, amountJpy, newPatients: num(newP), repeatPatients: num(repeatP) });
    setPending(false);
    setMsg(res.ok ? { ok: true, text: "保存しました（変更は監査ログに記録されます）" } : { ok: false, text: res.error });
    if (res.ok) onDone();
  };

  return (
    <form onSubmit={submit} className="space-y-3 rounded-lg border p-3">
      <p className="text-muted-foreground text-xs">
        月ごと・部門ごとの実績を入力します。同じ月・部門は上書きされます。入力した数字は本番の実績として扱い、デモの成果物とは混ぜません。
      </p>
      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1 text-xs font-medium">
          対象月
          <select value={month} onChange={(e) => setMonth(e.target.value)} className={inputCls}>
            {r.byMonth.map((m) => (
              <option key={m.month} value={m.month}>
                {m.month.replace("-", "年")}月{m.entered ? "（入力済）" : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-xs font-medium">
          部門
          <select value={unitId} onChange={(e) => setUnitId(e.target.value)} className={inputCls}>
            {TENANT.businessUnits.map((u) => (
              <option key={u.id} value={u.id}>
                {u.short}
              </option>
            ))}
          </select>
        </label>
        <label className="col-span-2 space-y-1 text-xs font-medium">
          売上（円）
          <input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="例：9800000" className={inputCls} required />
        </label>
        <label className="space-y-1 text-xs font-medium">
          新規患者数（任意）
          <input inputMode="numeric" value={newP} onChange={(e) => setNewP(e.target.value)} className={inputCls} />
        </label>
        <label className="space-y-1 text-xs font-medium">
          リピート患者数（任意）
          <input inputMode="numeric" value={repeatP} onChange={(e) => setRepeatP(e.target.value)} className={inputCls} />
        </label>
      </div>
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {existing ? "上書き保存" : "保存"}
        </Button>
        {msg && (
          <span role={msg.ok ? "status" : "alert"} className={msg.ok ? "text-xs text-emerald-700 dark:text-emerald-400" : "text-xs text-red-600"}>
            {msg.text}
          </span>
        )}
      </div>
    </form>
  );
}

export function RevenueCard() {
  const { snapshot } = useCompany();
  const r = snapshot.revenue;
  const [editing, setEditing] = React.useState(false);
  const onPace = r.actualJpy >= r.paceTargetJpy;
  const maxMonth = Math.max(1, ...r.byMonth.map((m) => m.totalJpy), r.targetJpy / r.totalMonths);
  const monthlyTarget = r.targetJpy / r.totalMonths;

  return (
    <Card>
      <CardHeader className="flex-wrap">
        <div>
          <CardTitle>売上目標の進捗（{r.label}）</CardTitle>
          <CardDescription>
            {r.fromMonth.replace("-", "年")}月〜{r.toMonth.replace("-", "年")}月 ・ {r.scope}
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">実績（手入力）</Badge>
          <Button size="sm" variant="outline" onClick={() => setEditing((v) => !v)} aria-expanded={editing}>
            <PencilLine aria-hidden /> {editing ? "閉じる" : "実績を入力"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {editing && <SalesForm onDone={() => undefined} />}

        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <div className="text-muted-foreground text-xs">累計の実績</div>
            <div className="text-2xl font-bold tabular-nums">{formatOku(r.actualJpy)}</div>
            <div className="text-muted-foreground text-xs">目標 {formatOku(r.targetJpy)} の {r.percent}%</div>
          </div>
          <div>
            <div className="text-muted-foreground text-xs">ここまでの目標ペース（{r.elapsedMonths}/{r.totalMonths}か月）</div>
            <div className="text-2xl font-bold tabular-nums">{formatOku(r.paceTargetJpy)}</div>
            {r.hasData && (
              <div className={onPace ? "flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400" : "flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400"}>
                {onPace ? <CircleCheck className="size-3.5" aria-hidden /> : <CircleAlert className="size-3.5" aria-hidden />}
                {onPace ? "ペース以上" : `ペースまで あと${formatOku(r.paceTargetJpy - r.actualJpy)}`}
              </div>
            )}
          </div>
          <div>
            <div className="text-muted-foreground text-xs">残り期間で必要な月平均</div>
            <div className="text-2xl font-bold tabular-nums">{formatOku(r.requiredMonthlyJpy)}</div>
            <div className="text-muted-foreground text-xs">{r.currentScale}</div>
          </div>
        </div>
        <Progress value={r.percent} aria-label={`年間目標に対する達成率 ${r.percent}%`} />

        {!r.hasData ? (
          <p className="text-muted-foreground rounded-lg border border-dashed p-4 text-center text-sm">
            まだ売上の実績が入力されていません。「実績を入力」から部門別の月次売上を入れると、進捗が実データで表示されます。
          </p>
        ) : (
          r.missingMonths.length > 0 && (
            <p className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400">
              <CircleAlert className="size-3.5" aria-hidden />
              未入力の月：{r.missingMonths.map(monthLabel).join("・")}（未入力の月は0円として計算しています）
            </p>
          )
        )}

        <section aria-label="部門別の実績">
          <h3 className="text-muted-foreground mb-2 text-xs font-semibold">部門別（期間累計）</h3>
          <ul className="space-y-2.5">
            {r.byUnit.map((u) => {
              const share = r.actualJpy ? Math.round((u.actualJpy / r.actualJpy) * 100) : 0;
              return (
                <li key={u.unitId} className="space-y-1">
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="font-medium">{u.name}</span>
                    <span className="tabular-nums">
                      {formatOku(u.actualJpy)}
                      <span className="text-muted-foreground ml-1 text-xs">
                        {u.targetJpy ? `／目標 ${formatOku(u.targetJpy)}` : `（構成比 ${share}%・部門目標は未設定）`}
                      </span>
                    </span>
                  </div>
                  <Progress
                    value={u.targetJpy ? (u.actualJpy / u.targetJpy) * 100 : share}
                    aria-label={`${u.name}の実績`}
                    className="h-1.5"
                  />
                  {(u.newPatients > 0 || u.repeatPatients > 0) && (
                    <div className="text-muted-foreground text-xs">
                      新規 {u.newPatients.toLocaleString("ja-JP")}人 ・ リピート {u.repeatPatients.toLocaleString("ja-JP")}人
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        {r.hasData && (
          <section aria-label="月別の売上">
            <h3 className="text-muted-foreground mb-2 text-xs font-semibold">月別の売上（点線＝月平均の目標 {formatOku(monthlyTarget)}）</h3>
            <div className="relative flex h-28 items-end gap-1 border-b">
              <div
                aria-hidden
                className="border-muted-foreground/50 pointer-events-none absolute inset-x-0 border-t border-dashed"
                style={{ bottom: `${(monthlyTarget / maxMonth) * 100}%` }}
              />
              {r.byMonth.map((m) => (
                <div key={m.month} className="group relative flex h-full flex-1 items-end" title={`${m.month}：${m.entered ? formatJpy(m.totalJpy) : "未入力"}`}>
                  <div
                    className={m.entered ? "bg-brand w-full rounded-t-[4px] group-hover:opacity-80" : "w-full"}
                    style={{ height: `${(m.totalJpy / maxMonth) * 100}%` }}
                  />
                </div>
              ))}
            </div>
            <div className="text-muted-foreground mt-1 flex gap-1 text-[10px]">
              {r.byMonth.map((m) => (
                <span key={m.month} className="flex-1 text-center">
                  {monthLabel(m.month)}
                </span>
              ))}
            </div>
            <table className="sr-only">
              <caption>月別の売上</caption>
              <tbody>
                {r.byMonth.map((m) => (
                  <tr key={m.month}>
                    <th>{m.month}</th>
                    <td>{m.entered ? formatJpy(m.totalJpy) : "未入力"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </CardContent>
    </Card>
  );
}
