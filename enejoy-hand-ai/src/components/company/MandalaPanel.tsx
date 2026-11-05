"use client";

import { Copy, LoaderCircle, PencilLine, Plus, Printer, Save, Trash2, Undo2 } from "lucide-react";
import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/time";
import type { MandalaChart, MandalaStatus, MandalaTheme } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Message, type Msg } from "./SheetImport";
import { useCompany } from "./StateProvider";

const SCOPE_LABEL: Record<MandalaChart["scope"], string> = { company: "会社全体", department: "部門", clinic: "院", other: "その他" };
const STATUS_LABEL: Record<MandalaStatus, string> = { todo: "未着手", doing: "進行中", done: "完了" };
const NEXT: Record<MandalaStatus, MandalaStatus> = { todo: "doing", doing: "done", done: "todo" };
/** 3×3 のマスの並び（中央=4 を除く）。テーマ・行動の 1〜8 番目をこの順に置く */
const RING = [0, 1, 2, 3, 5, 6, 7, 8];

const statusCls = (s: MandalaStatus) =>
  s === "done" ? "bg-emerald-50 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200" : s === "doing" ? "bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200" : "";

function progressOf(themes: MandalaTheme[]) {
  const xs = themes.flatMap((t) => t.items).filter((i) => i.text.trim());
  return { total: xs.length, done: xs.filter((i) => i.status === "done").length, doing: xs.filter((i) => i.status === "doing").length };
}

type Draft = { center: string; themes: MandalaTheme[] };

function Cell({
  value,
  editing,
  onChange,
  label,
  kind,
  status,
  onStatus,
}: {
  value: string;
  editing: boolean;
  onChange: (v: string) => void;
  label: string;
  kind: "center" | "theme" | "item";
  status?: MandalaStatus;
  onStatus?: () => void;
}) {
  const base = cn(
    "flex min-h-[5.5rem] items-center justify-center border p-1 text-center text-[11px] leading-snug break-words",
    kind === "center" && "bg-primary text-primary-foreground text-xs font-bold",
    kind === "theme" && "bg-brand/15 font-semibold",
    kind === "item" && status && statusCls(status),
  );
  if (editing) {
    return (
      <div className={cn(base, "p-0.5")}>
        <textarea
          aria-label={label}
          value={value}
          maxLength={60}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            "h-full min-h-[5.2rem] w-full resize-none rounded-sm bg-transparent p-1 text-center text-[11px] outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
            kind === "center" && "placeholder:text-primary-foreground/60 text-xs font-bold",
          )}
          placeholder={kind === "center" ? "中心の目標" : kind === "theme" ? "テーマ" : ""}
        />
      </div>
    );
  }
  if (kind === "item" && value.trim() && onStatus) {
    return (
      <button type="button" onClick={onStatus} title={`${STATUS_LABEL[status ?? "todo"]}（押すと切り替え）`} aria-label={`${label}：${value}（${STATUS_LABEL[status ?? "todo"]}）`} className={cn(base, "hover:ring-ring/40 w-full hover:ring-2")}>
        <span>
          {value}
          {status === "done" && <span className="block text-[10px] font-semibold">✓ 完了</span>}
          {status === "doing" && <span className="block text-[10px] font-semibold">進行中</span>}
        </span>
      </button>
    );
  }
  return <div className={cn(base, !value.trim() && "text-muted-foreground/50")}>{value || "—"}</div>;
}

/** 9×9 のマンダラチャート（PC・タブレット） */
function Grid({ draft, editing, set, cycle }: { draft: Draft; editing: boolean; set: (d: Draft) => void; cycle: (t: number, i: number) => void }) {
  const setTheme = (t: number, title: string) => set({ ...draft, themes: draft.themes.map((x, k) => (k === t ? { ...x, title } : x)) });
  const setItem = (t: number, i: number, text: string) =>
    set({ ...draft, themes: draft.themes.map((x, k) => (k === t ? { ...x, items: x.items.map((y, j) => (j === i ? { ...y, text } : y)) } : x)) });
  return (
    <div className="-mx-1 overflow-x-auto">
      <div className="grid min-w-[44rem] grid-cols-3 gap-1.5" role="group" aria-label="マンダラチャート">
        {Array.from({ length: 9 }, (_, block) => {
          const t = RING.indexOf(block);
          return (
            <div key={block} className={cn("grid grid-cols-3 overflow-hidden rounded-md border-2", block === 4 ? "border-primary" : "border-border")}>
              {Array.from({ length: 9 }, (_, pos) => {
                if (block === 4) {
                  if (pos === 4) return <Cell key={pos} kind="center" value={draft.center} editing={editing} onChange={(v) => set({ ...draft, center: v })} label="中心の目標" />;
                  const k = RING.indexOf(pos);
                  return <Cell key={pos} kind="theme" value={draft.themes[k].title} editing={editing} onChange={(v) => setTheme(k, v)} label={`テーマ${k + 1}`} />;
                }
                if (pos === 4) return <Cell key={pos} kind="theme" value={draft.themes[t].title} editing={editing} onChange={(v) => setTheme(t, v)} label={`テーマ${t + 1}`} />;
                const i = RING.indexOf(pos);
                const item = draft.themes[t].items[i];
                return (
                  <Cell
                    key={pos}
                    kind="item"
                    value={item.text}
                    status={item.status}
                    editing={editing}
                    onChange={(v) => setItem(t, i, v)}
                    onStatus={() => cycle(t, i)}
                    label={`${draft.themes[t].title || `テーマ${t + 1}`}の行動${i + 1}`}
                  />
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** スマホ：中心の目標と、テーマごとに開いて見る一覧 */
function List({ draft, editing, set, cycle }: { draft: Draft; editing: boolean; set: (d: Draft) => void; cycle: (t: number, i: number) => void }) {
  const input = "focus-visible:ring-ring/50 w-full rounded-md border bg-transparent px-2 py-1.5 text-sm outline-none focus-visible:ring-[3px]";
  return (
    <div className="space-y-2">
      <div className="bg-primary text-primary-foreground rounded-lg p-3 text-center">
        <p className="text-xs opacity-80">中心の目標</p>
        {editing ? (
          <input aria-label="中心の目標" value={draft.center} maxLength={60} onChange={(e) => set({ ...draft, center: e.target.value })} className={cn(input, "text-primary-foreground mt-1 border-white/40 text-center font-bold")} />
        ) : (
          <p className="font-bold">{draft.center || "—"}</p>
        )}
      </div>
      {draft.themes.map((th, t) => {
        const filled = th.items.filter((i) => i.text.trim());
        return (
          <details key={t} className="rounded-lg border" open={editing && t === 0}>
            <summary className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2.5 text-sm font-semibold">
              <span>
                {t + 1}. {th.title || "（テーマ未入力）"}
              </span>
              <span className="text-muted-foreground text-xs font-normal">
                完了 {filled.filter((i) => i.status === "done").length}/{filled.length}
              </span>
            </summary>
            <div className="space-y-1.5 border-t px-3 py-2">
              {editing && (
                <input
                  aria-label={`テーマ${t + 1}`}
                  value={th.title}
                  maxLength={60}
                  placeholder="テーマ"
                  onChange={(e) => set({ ...draft, themes: draft.themes.map((x, k) => (k === t ? { ...x, title: e.target.value } : x)) })}
                  className={cn(input, "font-semibold")}
                />
              )}
              {th.items.map((it, i) =>
                editing ? (
                  <input
                    key={i}
                    aria-label={`${th.title || `テーマ${t + 1}`}の行動${i + 1}`}
                    value={it.text}
                    maxLength={60}
                    placeholder={`行動${i + 1}`}
                    onChange={(e) => set({ ...draft, themes: draft.themes.map((x, k) => (k === t ? { ...x, items: x.items.map((y, j) => (j === i ? { ...y, text: e.target.value } : y)) } : x)) })}
                    className={input}
                  />
                ) : it.text.trim() ? (
                  <button key={i} type="button" onClick={() => cycle(t, i)} className={cn("flex w-full items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-left text-sm", statusCls(it.status))}>
                    <span>{it.text}</span>
                    <span className="shrink-0 text-[11px]">{STATUS_LABEL[it.status]}</span>
                  </button>
                ) : null,
              )}
            </div>
          </details>
        );
      })}
    </div>
  );
}

export function MandalaPanel() {
  const { snapshot, mutate } = useCompany();
  const charts = snapshot.mandala.charts;
  const [selected, setSelected] = React.useState<string | null>(charts.find((c) => c.scope === "company")?.id ?? charts[0]?.id ?? null);
  const chart = charts.find((c) => c.id === selected) ?? charts[0] ?? null;
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState<Draft | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [msg, setMsg] = React.useState<Msg>(null);
  const [form, setForm] = React.useState({ title: "", scope: "company" as MandalaChart["scope"], scopeLabel: "", template: "company" as "company" | "blank" | "copy" });

  // 選んでいるチャートが変わったら、編集中でない限り表示を最新にする
  React.useEffect(() => {
    if (!editing) setDraft(chart ? { center: chart.center, themes: chart.themes } : null);
  }, [chart, editing]);

  const call = async (k: string, body: Record<string, unknown>, ok: string) => {
    setBusy(k);
    const r = await mutate("/api/mandala", body);
    setBusy(null);
    setMsg(r.ok ? { ok: true, text: ok } : { ok: false, text: r.error });
    return r;
  };

  const create = async () => {
    const title = form.title.trim() || (form.scope === "company" ? "会社のマンダラチャート" : `${form.scopeLabel || SCOPE_LABEL[form.scope]}のマンダラチャート`);
    const r = await call(
      "create",
      {
        action: "create",
        title,
        scope: form.scope,
        scopeLabel: form.scopeLabel || undefined,
        template: form.template === "company" ? "company" : "blank",
        copyFrom: form.template === "copy" ? chart?.id : undefined,
      },
      `「${title}」を作りました`,
    );
    if (r.ok) {
      setSelected(r.data.chartId as string);
      setForm({ ...form, title: "", scopeLabel: "" });
      setEditing(form.template === "blank");
    }
  };

  /** 表示中に行動を押すと「未着手 → 進行中 → 完了」と切り替えて、すぐ保存する */
  const cycle = async (t: number, i: number) => {
    if (!chart || !draft || editing) return;
    const themes = draft.themes.map((x, k) => (k === t ? { ...x, items: x.items.map((y, j) => (j === i ? { ...y, status: NEXT[y.status] } : y)) } : x));
    setDraft({ ...draft, themes });
    await call("status", { action: "update", id: chart.id, themes }, `「${themes[t].items[i].text}」を${STATUS_LABEL[themes[t].items[i].status]}にしました`);
  };

  const save = async () => {
    if (!chart || !draft) return;
    const r = await call("save", { action: "update", id: chart.id, center: draft.center, themes: draft.themes }, "保存しました");
    if (r.ok) setEditing(false);
  };

  const p = draft ? progressOf(draft.themes) : null;

  return (
    <div className="space-y-6">
      <Card className="print:hidden">
        <CardHeader className="flex-wrap">
          <div>
            <CardTitle>マンダラチャート</CardTitle>
            <CardDescription>
              中心に目標、周りに目標を支える8つのテーマ、テーマごとに8つの行動を書きます（9×9＝81マス）。会社全体・部門・院ごとに作れます。表示中に行動のマスを押すと「未着手 → 進行中 → 完了」と切り替わります。
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {charts.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {charts.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={chart?.id === c.id}
                  disabled={editing}
                  onClick={() => setSelected(c.id)}
                  className={cn("rounded-full px-3 py-1 text-sm disabled:opacity-50", chart?.id === c.id ? "bg-primary text-primary-foreground" : "bg-secondary hover:bg-accent")}
                >
                  {c.title}
                  <span className="ml-1 text-xs opacity-75">（{c.scopeLabel || SCOPE_LABEL[c.scope]}）</span>
                </button>
              ))}
            </div>
          )}
          <div className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed p-3">
            <label className="text-xs font-medium">
              名前
              <input
                value={form.title}
                maxLength={40}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="例 第10期 会社のマンダラチャート"
                className="focus-visible:ring-ring/50 mt-1 block h-9 w-60 rounded-md border bg-transparent px-2 text-sm outline-none focus-visible:ring-[3px]"
              />
            </label>
            <label className="text-xs font-medium">
              対象
              <select value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value as MandalaChart["scope"] })} className="bg-background mt-1 block h-9 rounded-md border px-2 text-sm">
                {Object.entries(SCOPE_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            {form.scope !== "company" && (
              <label className="text-xs font-medium">
                部門・院の名前
                <input
                  value={form.scopeLabel}
                  maxLength={30}
                  onChange={(e) => setForm({ ...form, scopeLabel: e.target.value })}
                  placeholder="例 茨木院"
                  className="focus-visible:ring-ring/50 mt-1 block h-9 w-36 rounded-md border bg-transparent px-2 text-sm outline-none focus-visible:ring-[3px]"
                />
              </label>
            )}
            <label className="text-xs font-medium">
              最初の中身
              <select value={form.template} onChange={(e) => setForm({ ...form, template: e.target.value as typeof form.template })} className="bg-background mt-1 block h-9 rounded-md border px-2 text-sm">
                <option value="company">会社のたたき台を入れる</option>
                <option value="blank">白紙</option>
                {chart && <option value="copy">表示中のチャートをコピー</option>}
              </select>
            </label>
            <Button size="sm" disabled={busy !== null || editing} onClick={create}>
              {busy === "create" ? <LoaderCircle className="animate-spin" aria-hidden /> : <Plus aria-hidden />} 作る
            </Button>
          </div>
          <Message msg={msg} />
        </CardContent>
      </Card>

      {chart && draft ? (
        <Card className="print:border-0 print:shadow-none">
          <CardHeader className="flex-wrap">
            <div>
              <CardTitle className="flex flex-wrap items-center gap-2">
                {chart.title}
                <Badge variant="secondary">{chart.scopeLabel || SCOPE_LABEL[chart.scope]}</Badge>
                {editing && <Badge className="bg-amber-500 text-white">編集中</Badge>}
              </CardTitle>
              <CardDescription>
                {p && p.total > 0 ? `行動 ${p.total}件のうち 完了 ${p.done}件・進行中 ${p.doing}件（${Math.round((p.done / p.total) * 100)}%）` : "まだ行動が入っていません"}・最終更新 {formatDateTime(chart.updatedAt)}
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2 print:hidden">
              {editing ? (
                <>
                  <Button size="sm" disabled={busy !== null} onClick={save}>
                    {busy === "save" ? <LoaderCircle className="animate-spin" aria-hidden /> : <Save aria-hidden />} 保存
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setEditing(false);
                      setDraft({ center: chart.center, themes: chart.themes });
                    }}
                  >
                    <Undo2 aria-hidden /> やめる
                  </Button>
                </>
              ) : (
                <>
                  <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                    <PencilLine aria-hidden /> 書き込む
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => window.print()}>
                    <Printer aria-hidden /> 印刷
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy !== null}
                    onClick={() => setForm({ ...form, template: "copy", title: `${chart.title}のコピー` })}
                    title="上の「作る」の欄にコピーの設定を入れます"
                  >
                    <Copy aria-hidden /> コピーして作る
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy !== null}
                    aria-label={`${chart.title}を削除`}
                    onClick={async () => {
                      if (!window.confirm(`「${chart.title}」を削除しますか？`)) return;
                      const r = await call("remove", { action: "remove", id: chart.id }, "削除しました");
                      if (r.ok) setSelected(null);
                    }}
                  >
                    <Trash2 aria-hidden />
                  </Button>
                </>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="hidden sm:block print:block">
              <Grid draft={draft} editing={editing} set={setDraft} cycle={cycle} />
            </div>
            <div className="sm:hidden print:hidden">
              <List draft={draft} editing={editing} set={setDraft} cycle={cycle} />
            </div>
            <ul className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs print:hidden" aria-label="色の意味">
              <li className="flex items-center gap-1.5">
                <span className="bg-primary inline-block size-3 rounded-sm" />
                中心の目標
              </li>
              <li className="flex items-center gap-1.5">
                <span className="bg-brand/30 inline-block size-3 rounded-sm" />
                テーマ
              </li>
              <li className="flex items-center gap-1.5">
                <span className="inline-block size-3 rounded-sm bg-amber-200" />
                進行中
              </li>
              <li className="flex items-center gap-1.5">
                <span className="inline-block size-3 rounded-sm bg-emerald-200" />
                完了
              </li>
            </ul>
            {editing && <p className="text-muted-foreground text-xs">1マス60文字まで。「会社のたたき台」は例なので、会議で話し合った内容に書き換えてください。</p>}
          </CardContent>
        </Card>
      ) : (
        <p className="text-muted-foreground text-sm">まだマンダラチャートがありません。上の「作る」から始めてください（「会社のたたき台を入れる」を選ぶと、目標と8つのテーマの例が入ります）。</p>
      )}
    </div>
  );
}
