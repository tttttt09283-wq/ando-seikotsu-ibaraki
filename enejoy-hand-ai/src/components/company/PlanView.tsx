"use client";

import { useSearchParams } from "next/navigation";
import { FileUp, LoaderCircle, Trash2 } from "lucide-react";
import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/time";
import type { OrgCounts, StaffRole } from "@/lib/types";
import { cn } from "@/lib/utils";
import { TENANT } from "@/tenant";
import { KpiPanel } from "./KpiPanel";
import { MidPlanPanel } from "./MidPlanPanel";
import { Message, PlanSheetImport, SourcePicker, sourceBody, sourceReady, type Msg, type SourceValue } from "./SheetImport";
import { useClinics, useCompany } from "./StateProvider";

const ym = (m: string) => `${m.slice(0, 4)}年${Number(m.slice(5))}月`;

const ROLE_COLS: { label: string; roles: StaffRole[] }[] = [
  { label: "院長・副院長", roles: ["director", "deputy"] },
  { label: "施術者", roles: ["therapist"] },
  { label: "時短", roles: ["short"] },
  { label: "アルバイト", roles: ["part"] },
  { label: "受付", roles: ["reception", "receptionPart"] },
];
const countOf = (c: OrgCounts, roles: StaffRole[]) => roles.reduce((n, r) => n + (c[r] ?? 0), 0);

function OrgPanel() {
  const { snapshot, mutate } = useCompany();
  const clinics = useClinics();
  const snaps = [...snapshot.org.snapshots].sort((a, b) => b.month.localeCompare(a.month) || b.importedAt.localeCompare(a.importedAt));
  const months = React.useMemo(() => {
    const out: string[] = [];
    const [y0, m0] = TENANT.revenueTarget.fromMonth.split("-").map(Number);
    for (let i = 0; i < 12 * (TENANT.fiscal.planYears + 1); i++) {
      const d = new Date(Date.UTC(y0, m0 - 1 + i, 1));
      out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
    }
    return out;
  }, []);
  const [src, setSrc] = React.useState<SourceValue>({ mode: "url", url: "" });
  const [month, setMonth] = React.useState(snapshot.revenue.currentMonth);
  const [kind, setKind] = React.useState<"actual" | "plan">("actual");
  const [label, setLabel] = React.useState("");
  const [busy, setBusy] = React.useState<string | null>(null);
  const [msg, setMsg] = React.useState<Msg>(null);
  const [target, setTarget] = React.useState<Record<string, { scenarioId: string; fyStart: string }>>({});
  const scenarios = snapshot.plan.scenarios.map((s) => s.scenario);
  const planFys = snapshot.plan.fyStarts.slice(1);

  const call = async (k: string, body: Record<string, unknown>, ok: (data: Record<string, unknown>) => string) => {
    setBusy(k);
    const r = await mutate("/api/org", body);
    setBusy(null);
    setMsg(r.ok ? { ok: true, text: ok(r.data) } : { ok: false, text: r.error });
    return r.ok;
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div>
            <CardTitle>組織図の取り込み（人員）</CardTitle>
            <CardDescription>
              組織図（行＝院長・施術者・時短・アルバイト・受付、列＝院）から、院ごとの人数と施術者の換算人数（時短・アルバイトは0.5人、受付は0人）を数えます。
              <strong>スタッフの名前は保存しません。</strong>ブロックマネージャーの行は院のブロックとして入ります。
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <SourcePicker value={src} onChange={setSrc} disabled={busy !== null} idPrefix="org-import" />
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs">
              この配置になる月
              <select value={month} onChange={(e) => setMonth(e.target.value)} className="bg-background mt-1 block h-8 rounded-md border px-2 text-sm">
                {months.map((m) => (
                  <option key={m} value={m}>
                    {ym(m)}〜
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs">
              種類
              <select value={kind} onChange={(e) => setKind(e.target.value as "actual" | "plan")} className="bg-background mt-1 block h-8 rounded-md border px-2 text-sm">
                <option value="actual">実際の配置</option>
                <option value="plan">計画（出店時・理想など）</option>
              </select>
            </label>
            <label className="text-xs">
              名前（任意）
              <input
                value={label}
                maxLength={60}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="例 2026.10（香里園出店時）"
                className="focus-visible:ring-ring/50 mt-1 block h-8 w-56 rounded-md border bg-transparent px-2 text-sm outline-none focus-visible:ring-[3px]"
              />
            </label>
            <Button
              size="sm"
              variant="outline"
              disabled={busy !== null || !sourceReady(src)}
              onClick={async () => {
                const body = await sourceBody(src);
                if (!body) return;
                const ok = await call("import", { action: "import", ...body, month, kind, label: label.trim() || undefined }, (d) => {
                  const r = d.result as { clinics: number; fte: number; unmatched: string[]; blocksChanged: number; warnings: string[] };
                  return `取り込みました：${r.clinics}院・施術者 換算${r.fte}人${r.blocksChanged ? `・ブロック ${r.blocksChanged}院を更新` : ""}${r.unmatched.length ? `（院として未登録の列：${r.unmatched.join("、")}）` : ""}${r.warnings.length ? ` ${r.warnings.join(" ")}` : ""}`;
                });
                if (ok) {
                  setLabel("");
                  if (src.mode === "file") setSrc({ mode: "file", file: null });
                }
              }}
            >
              {busy === "import" ? <LoaderCircle className="animate-spin" aria-hidden /> : <FileUp aria-hidden />} 取り込む
            </Button>
          </div>
          <Message msg={msg} />
        </CardContent>
      </Card>

      {snaps.length === 0 && <p className="text-muted-foreground text-sm">まだ組織図を取り込んでいません。</p>}
      {snaps.map((s) => {
        const total = s.clinics.reduce((n, c) => n + c.fte, 0) + s.unmatched.reduce((n, c) => n + c.fte, 0);
        const t = target[s.id] ?? { scenarioId: scenarios[0]?.id ?? "", fyStart: planFys[0] };
        return (
          <Card key={s.id}>
            <CardHeader className="flex-wrap">
              <div>
                <CardTitle className="flex flex-wrap items-center gap-2">
                  {s.label}
                  <Badge variant={s.kind === "actual" ? "secondary" : "outline"}>{s.kind === "actual" ? `実際・${ym(s.month)}〜` : `計画・${ym(s.month)}〜`}</Badge>
                </CardTitle>
                <CardDescription>
                  施術者 換算 {Math.round(total * 10) / 10}人・{formatDateTime(s.importedAt)} 取り込み
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="-mx-1 overflow-x-auto">
                <table className="w-full min-w-[34rem] text-sm">
                  <thead>
                    <tr className="text-muted-foreground border-b text-xs">
                      <th scope="col" className="py-2 pl-1 text-left font-medium">院</th>
                      {ROLE_COLS.map((r) => (
                        <th key={r.label} scope="col" className="px-2 py-2 text-right font-medium">
                          {r.label}
                        </th>
                      ))}
                      <th scope="col" className="px-2 py-2 text-right font-medium">施術者 換算</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...s.clinics.map((c) => ({ key: c.clinicId, name: clinics.find((x) => x.id === c.clinicId)?.name ?? c.clinicId, c, unknown: false })), ...s.unmatched.map((c) => ({ key: `u-${c.label}`, name: c.label, c, unknown: true }))].map((row) => (
                      <tr key={row.key} className="border-b last:border-0">
                        <th scope="row" className={cn("py-1.5 pl-1 text-left font-medium", row.unknown && "text-muted-foreground italic")}>
                          {row.name}
                          {row.unknown && <span className="ml-1 text-[10px] not-italic">（院として未登録）</span>}
                        </th>
                        {ROLE_COLS.map((r) => (
                          <td key={r.label} className="px-2 py-1.5 text-right tabular-nums">
                            {countOf(row.c.counts, r.roles) || ""}
                          </td>
                        ))}
                        <td className="px-2 py-1.5 text-right font-semibold tabular-nums">{row.c.fte}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap items-end gap-2 border-t pt-3">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy !== null || Boolean(snapshot.budget.pendingApprovalId)}
                  onClick={async () => {
                    if (!window.confirm(`この人数（換算）を、予算の案の人員に入れますか？（${ym(s.month)}から${s.kind === "actual" ? "次の組織図の前の月まで" : "年度末まで"}）`)) return;
                    await call(`b-${s.id}`, { action: "apply_budget", id: s.id }, (d) => {
                      const r = d.result as { cells: number; from: string; to: string };
                      return `予算の案の人員に入れました（${ym(r.from)}〜${ym(r.to)}・${r.cells}件）。「数字（院別）→ 予算」で「人員から金額を計算」できます。`;
                    });
                  }}
                >
                  予算の案の人員に入れる
                </Button>
                {scenarios.length > 0 && (
                  <>
                    <select
                      aria-label="中期計画のシナリオ"
                      value={t.scenarioId}
                      onChange={(e) => setTarget((x) => ({ ...x, [s.id]: { ...t, scenarioId: e.target.value } }))}
                      className="bg-background h-8 rounded-md border px-2 text-sm"
                    >
                      {scenarios.map((sc) => (
                        <option key={sc.id} value={sc.id}>
                          {sc.name}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label="年度"
                      value={t.fyStart}
                      onChange={(e) => setTarget((x) => ({ ...x, [s.id]: { ...t, fyStart: e.target.value } }))}
                      className="bg-background h-8 rounded-md border px-2 text-sm"
                    >
                      {planFys.map((fy) => (
                        <option key={fy} value={fy}>
                          {snapshot.plan.base.years.find((y) => y.fyStart === fy)?.term}
                        </option>
                      ))}
                    </select>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy !== null || !t.scenarioId}
                      onClick={() => call(`p-${s.id}`, { action: "apply_plan", id: s.id, scenarioId: t.scenarioId, fyStart: t.fyStart }, () => "中期計画の施術者数に入れました")}
                    >
                      中期計画の人数に入れる
                    </Button>
                  </>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy !== null}
                  aria-label={`${s.label}を削除`}
                  onClick={async () => {
                    if (!window.confirm(`「${s.label}」を削除しますか？`)) return;
                    await call(`r-${s.id}`, { action: "remove", id: s.id }, () => "削除しました");
                  }}
                >
                  <Trash2 aria-hidden />
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function ImportPanel() {
  const { snapshot } = useCompany();
  const scenarios = snapshot.plan.scenarios.map((s) => s.scenario);
  const [scenarioId, setScenarioId] = React.useState(scenarios[0]?.id ?? "");
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>年間予算・進捗のシートを取り込む</CardTitle>
          <CardDescription>取り込み・反映の操作はすべて監査ログに記録されます。数字はこのパソコンの中（.data フォルダ）に保存され、外部のAIには送信しません。</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="text-muted-foreground list-disc space-y-1 pl-5 text-xs">
          <li>
            <strong className="text-foreground">年間予算表</strong>：今期のタブ（例「R8-R9」）→ 今期の予算の案・人員・昨年の実績。来期の新案のタブ（例「R9-R10 新案」）→ 中期計画（成長率も読み取ります）。
          </li>
          <li>
            <strong className="text-foreground">進捗売上実績</strong>：「院」タブ → 予算・実績・昨対。「BM」タブはブロックで自動集計するので不要です。
            「個人」タブ（スタッフ個人の売上）は評価に関わる機密データのため、ここでは取り込みません（評価の仕組みとつなぐときに、代表の承認を得てから行います）。
          </li>
          <li>
            <strong className="text-foreground">組織図</strong>：月ごとのタブを「人員（組織図）」のメニューから取り込みます。
          </li>
          <li>Googleスプレッドシートは、URL（タブを開いた状態）で直接読めます。非公開のシートは、サービスアカウントの設定（README参照）が必要です。</li>
        </ul>
        {scenarios.length > 1 && (
          <label className="text-xs">
            来期以降の計画を入れるシナリオ
            <select value={scenarioId} onChange={(e) => setScenarioId(e.target.value)} className="bg-background mt-1 block h-8 rounded-md border px-2 text-sm">
              {scenarios.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <PlanSheetImport disabled={Boolean(snapshot.budget.pendingApprovalId)} scenarioId={scenarioId || undefined} />
        {snapshot.budget.pendingApprovalId && <p className="text-xs text-amber-700 dark:text-amber-400">予算の確定が承認待ちのため、承認の判断が終わるまで取り込めません。</p>}
      </CardContent>
    </Card>
  );
}

const PLAN_TABS = [
  { id: "plan", label: "中期計画" },
  { id: "kpi", label: "管理項目" },
  { id: "org", label: "人員（組織図）" },
  { id: "import", label: "シートの取り込み" },
] as const;

export function PlanView() {
  const { snapshot } = useCompany();
  const params = useSearchParams();
  const [tab, setTab] = React.useState<(typeof PLAN_TABS)[number]["id"]>(PLAN_TABS.find((t) => t.id === params.get("tab"))?.id ?? "plan");
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">事業計画</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          今期（{snapshot.plan.base.years[0].term}）の見込みと、{snapshot.plan.base.years[snapshot.plan.base.years.length - 1].term}までの中期計画・管理項目・人員。<strong>本番の数字</strong>です（AI部門のデモの数字は含みません）。
        </p>
      </div>
      <div className="flex gap-1 overflow-x-auto pb-1 [scrollbar-width:none]" role="tablist" aria-label="事業計画のメニュー">
        {PLAN_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn("shrink-0 rounded-full px-3.5 py-1.5 text-sm transition", tab === t.id ? "bg-primary text-primary-foreground" : "bg-secondary hover:bg-accent")}
          >
            {t.label}
            {t.id === "plan" && snapshot.plan.pendingApprovalId && <span className="ml-1.5 rounded-full bg-amber-500 px-1.5 text-xs font-bold text-white">承認待ち</span>}
          </button>
        ))}
      </div>
      {tab === "plan" && <MidPlanPanel />}
      {tab === "kpi" && <KpiPanel />}
      {tab === "org" && <OrgPanel />}
      {tab === "import" && <ImportPanel />}
    </div>
  );
}
