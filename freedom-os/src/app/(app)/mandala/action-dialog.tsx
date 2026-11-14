"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/common/field";
import { SimNote, SourceTag, StatusBadge, STATUS_BAR } from "@/components/common/parts";
import { TaskCheck } from "@/components/common/task-check";
import { useAction } from "@/components/common/use-action";
import { KPI_SOURCES, KPI_SOURCE_MAP } from "@/lib/domain/mandala";
import { generatePlan, type DraftTask } from "@/lib/domain/generator";
import { LEVEL_LABEL, TASK_STATUS_LABEL } from "@/lib/domain/tasks";
import { ActionSchema, type ActionInput } from "@/lib/schemas";
import { cn } from "@/lib/utils";
import { saveAction, saveGeneratedPlanAction } from "../actions";
import type { BoardAction } from "./board";

export function ActionDialog({ action: a, today, open, onOpenChange }: { action: BoardAction; today: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{a.code}</Badge>
            <StatusBadge status={a.eval.status} />
            <span className="num text-muted-foreground text-xs">進捗 {a.eval.progress}%</span>
          </div>
          <DialogTitle>{a.title || "（未設定）"}</DialogTitle>
          {a.description && <DialogDescription>{a.description}</DialogDescription>}
        </DialogHeader>
        <Progress value={a.eval.progress} indicatorClassName={STATUS_BAR[a.eval.status]} />
        <Tabs defaultValue="link">
          <TabsList className="w-full">
            <TabsTrigger value="link">現状と必要な行動</TabsTrigger>
            <TabsTrigger value="edit">編集</TabsTrigger>
            <TabsTrigger value="plan">行動計画</TabsTrigger>
          </TabsList>
          <TabsContent value="link">
            <LinkagePanel a={a} />
          </TabsContent>
          <TabsContent value="edit">
            <EditForm a={a} onDone={() => onOpenChange(false)} />
          </TabsContent>
          <TabsContent value="plan">
            <PlanPanel a={a} today={today} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function LinkagePanel({ a }: { a: BoardAction }) {
  const l = a.linkage;
  return (
    <div className="space-y-4">
      {l.lines.length > 0 && (
        <dl className="divide-y rounded-lg border">
          {l.lines.map((x, i) => (
            <div key={i} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <dt className="text-muted-foreground flex items-center gap-1.5">
                <SourceTag kind={x.kind} />
                {x.label}
              </dt>
              <dd className="num text-right font-semibold">{x.value}</dd>
            </div>
          ))}
        </dl>
      )}
      <div className={cn("rounded-lg p-3 text-sm", l.onTrack === true ? "bg-status-green/10" : l.onTrack === false ? "bg-status-red/10" : "bg-muted")}>
        <div className="mb-1 text-xs font-semibold">達成見込み</div>
        {l.outlook}
      </div>
      {l.projectionMonth && <SimNote />}
      {a.eval.kpiActualSource === "auto" && <p className="text-muted-foreground text-xs">実績値は「月次実績」から自動取得しています（タスクの完了だけでは変わりません）。</p>}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold">関連する行動（{a.eval.taskDone}/{a.eval.taskTotal} 完了）</h3>
          <Link href={`/tasks?action=${a.id}`} className="text-primary text-xs">タスク画面で見る</Link>
        </div>
        {a.tasks.length === 0 ? (
          <p className="text-muted-foreground text-sm">関連タスクはまだありません。「行動計画」タブから自動生成できます。</p>
        ) : (
          <ul className="space-y-1.5">
            {a.tasks.slice(0, 12).map((t) => (
              <li key={t.id} className="flex items-start gap-2 text-sm">
                <TaskCheck id={t.id} done={t.status === "done"} label={t.title} />
                <span className={cn("flex-1", t.status === "done" && "text-muted-foreground line-through")}>{t.title}</span>
                <span className="text-muted-foreground shrink-0 text-[11px]">{LEVEL_LABEL[t.level]}{t.due_date ? `・${t.due_date}` : ""}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function EditForm({ a, onDone }: { a: BoardAction; onDone: () => void }) {
  const { pending, exec } = useAction();
  const form = useForm<ActionInput>({
    resolver: zodResolver(ActionSchema),
    defaultValues: {
      title: a.title,
      description: a.description,
      category: a.category,
      priority: a.priority,
      due_date: a.due_date ?? "",
      kpi_name: a.kpi_name,
      kpi_target: a.kpi_target ?? "",
      kpi_actual: a.kpi_actual ?? "",
      kpi_unit: a.kpi_unit,
      kpi_direction: a.kpi_direction,
      kpi_source: a.kpi_source,
      progress: a.progress,
      status: a.status,
      completed_at: a.completed_at ?? "",
      memo: a.memo,
    } as ActionInput,
  });
  const { register, handleSubmit, watch, setValue, formState } = form;
  const err = (k: keyof ActionInput) => formState.errors[k]?.message as string | undefined;
  const source = watch("kpi_source");
  const auto = source && source !== "manual";
  const hasKpi = String(watch("kpi_target") ?? "") !== "";

  return (
    <form
      className="space-y-4"
      onSubmit={handleSubmit((v) => exec(() => saveAction(a.id, v), { onOk: onDone }))}
    >
      <Field label="項目名" htmlFor="title" error={err("title")}>
        <Input id="title" {...register("title")} />
      </Field>
      <Field label="説明" htmlFor="description">
        <Textarea id="description" {...register("description")} rows={2} />
      </Field>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Field label="カテゴリ" htmlFor="category"><Input id="category" {...register("category")} /></Field>
        <Field label="優先順位" htmlFor="priority">
          <NativeSelect id="priority" {...register("priority")}>
            <option value={1}>高</option>
            <option value={2}>中</option>
            <option value={3}>低</option>
          </NativeSelect>
        </Field>
        <Field label="期限" htmlFor="due_date" error={err("due_date")}><Input id="due_date" type="date" {...register("due_date")} /></Field>
      </div>

      <fieldset className="space-y-3 rounded-lg border p-3">
        <legend className="px-1 text-xs font-semibold">KPI（数値目標）</legend>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Field label="KPI名称" htmlFor="kpi_name" className="col-span-2 sm:col-span-1"><Input id="kpi_name" {...register("kpi_name")} /></Field>
          <Field label="目標値" htmlFor="kpi_target" error={err("kpi_target")}><Input id="kpi_target" inputMode="decimal" {...register("kpi_target")} /></Field>
          <Field label="単位" htmlFor="kpi_unit"><Input id="kpi_unit" {...register("kpi_unit")} placeholder="円・人・社・%" /></Field>
        </div>
        <Field label="実績値の取得元" htmlFor="kpi_source" hint="月次実績から自動取得すると、実績を入力したときに自動で更新されます">
          <NativeSelect
            id="kpi_source"
            {...register("kpi_source", {
              onChange: (e) => {
                const s = KPI_SOURCE_MAP.get(e.target.value);
                if (s && s.key !== "manual") {
                  setValue("kpi_direction", s.direction);
                  if (!form.getValues("kpi_unit")) setValue("kpi_unit", s.unit);
                }
              },
            })}
          >
            {KPI_SOURCES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </NativeSelect>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="実績値（手入力）" htmlFor="kpi_actual" hint={auto ? `自動取得中：${a.eval.kpiActual ?? "未入力"}` : undefined} error={err("kpi_actual")}>
            <Input id="kpi_actual" inputMode="decimal" disabled={!!auto} {...register("kpi_actual")} />
          </Field>
          <Field label="達成の向き" htmlFor="kpi_direction">
            <NativeSelect id="kpi_direction" {...register("kpi_direction")}>
              <option value="higher">多いほど良い</option>
              <option value="lower">少ないほど良い</option>
            </NativeSelect>
          </Field>
        </div>
      </fieldset>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Field label="ステータス" htmlFor="status" hint="期限を過ぎて未達成なら自動で「目標未達」">
          <NativeSelect id="status" {...register("status")}>
            <option value="not_started">未着手</option>
            <option value="in_progress">進行中</option>
            <option value="achieved" disabled={hasKpi}>達成{hasKpi ? "（KPIの実績で判定）" : ""}</option>
            <option value="missed">目標未達</option>
          </NativeSelect>
        </Field>
        <Field label="進捗率（%）" htmlFor="progress" hint={hasKpi ? "KPIがある項目は実績値から自動計算" : "タスク完了率より大きい場合に使用"} error={err("progress")}>
          <Input id="progress" type="number" min={0} max={100} disabled={hasKpi} {...register("progress")} />
        </Field>
        <Field label="完了日" htmlFor="completed_at" error={err("completed_at")}><Input id="completed_at" type="date" {...register("completed_at")} /></Field>
      </div>
      <Field label="メモ" htmlFor="memo"><Textarea id="memo" {...register("memo")} rows={3} /></Field>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone}>キャンセル</Button>
        <Button type="submit" disabled={pending}>{pending ? "保存中…" : "保存"}</Button>
      </div>
    </form>
  );
}

function PlanPanel({ a, today }: { a: BoardAction; today: string }) {
  const drafts = useMemo<DraftTask[]>(() => generatePlan(a, a.code, today, a.eval.kpiActual), [a, today]);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(drafts.map((d) => d.tempId)));
  const { pending, exec } = useAction();
  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };
  // 親を外したら、その子の親参照は外して保存する
  const save = () => {
    const keep = drafts.filter((d) => selected.has(d.tempId)).map((d) => ({ ...d, parentTempId: d.parentTempId && selected.has(d.parentTempId) ? d.parentTempId : null }));
    if (!keep.length) return;
    exec(() => saveGeneratedPlanAction(a.id, keep), { onOk: (n) => void n });
  };
  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-sm">
        この行動を「年間 → 四半期 → 月間 → 週間 → 今日」に分解した案です。不要な行のチェックを外して登録してください（登録後もタスク画面で編集できます）。
        {a.kpi_target != null && " 中間目標は現在値から期限までの直線で配分しています。"}
      </p>
      <ul className="max-h-[45vh] space-y-1.5 overflow-y-auto">
        {drafts.map((d) => (
          <li key={d.tempId} className="flex items-start gap-2 rounded-md border p-2 text-sm" style={{ marginLeft: `${["long", "year", "quarter", "month", "week", "day"].indexOf(d.level) * 8}px` }}>
            <Checkbox checked={selected.has(d.tempId)} onCheckedChange={() => toggle(d.tempId)} aria-label={`${d.title}を登録する`} className="mt-0.5" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant="secondary">{LEVEL_LABEL[d.level]}</Badge>
                <span className="text-muted-foreground text-[11px]">〜{d.due_date}{d.estimate_minutes ? `・${d.estimate_minutes}分` : ""}</span>
              </div>
              <div className="mt-0.5">{d.title}</div>
            </div>
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground text-xs">{selected.size}件を登録</span>
        <Button onClick={save} disabled={pending || selected.size === 0}>{pending ? "登録中…" : "タスクとして登録"}</Button>
      </div>
      {a.tasks.length > 0 && <p className="text-muted-foreground text-xs">※ すでに関連タスクが {a.tasks.length} 件あります（{Object.entries(TASK_STATUS_LABEL).map(([k, v]) => `${v} ${a.tasks.filter((t) => t.status === k).length}`).join("・")}）。</p>}
    </div>
  );
}
