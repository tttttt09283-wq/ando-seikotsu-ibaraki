"use client";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Trash, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/common/field";
import { useAction } from "@/components/common/use-action";
import { LEVEL_LABEL } from "@/lib/domain/tasks";
import { TaskSchema, type TaskInput } from "@/lib/schemas";
import { addDependencyAction, createTaskAction, deleteTaskAction, removeDependencyAction, updateTaskAction } from "../actions";
import type { TaskRow } from "./tasks-view";

export function TaskDialog({
  task,
  tasks,
  actionOptions,
  defaultActionId,
  today,
  onClose,
}: {
  task: TaskRow | null;
  tasks: TaskRow[];
  actionOptions: { id: string; label: string }[];
  defaultActionId: string;
  today: string;
  onClose: () => void;
}) {
  const { pending, exec } = useAction();
  const [depPick, setDepPick] = useState("");
  const form = useForm<TaskInput>({
    resolver: zodResolver(TaskSchema),
    defaultValues: (task
      ? {
          title: task.title,
          purpose: task.purpose,
          mandala_action_id: task.mandala_action_id ?? "",
          parent_id: task.parent_id ?? "",
          level: task.level,
          start_date: task.start_date ?? "",
          due_date: task.due_date ?? "",
          estimate_minutes: task.estimate_minutes,
          actual_minutes: task.actual_minutes ?? "",
          priority: task.priority,
          status: task.status,
          deliverable: task.deliverable,
          done_criteria: task.done_criteria,
        }
      : {
          title: "",
          purpose: "",
          mandala_action_id: defaultActionId,
          parent_id: "",
          level: "week",
          start_date: today,
          due_date: "",
          estimate_minutes: 30,
          actual_minutes: "",
          priority: 2,
          status: "todo",
          deliverable: "",
          done_criteria: "",
        }) as TaskInput,
  });
  const { register, handleSubmit, formState } = form;
  const err = (k: keyof TaskInput) => formState.errors[k]?.message as string | undefined;
  const parents = tasks.filter((t) => t.id !== task?.id && ["long", "year", "quarter", "month", "week"].includes(t.level) && t.status !== "done");
  const others = tasks.filter((t) => t.id !== task?.id && !task?.dependsOn.includes(t.id) && t.status !== "done");
  const byId = new Map(tasks.map((t) => [t.id, t]));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{task ? "タスクを編集" : "タスクを追加"}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={handleSubmit((v) => exec<unknown>(() => (task ? updateTaskAction(task.id, v) : createTaskAction(v)), { onOk: onClose }))}
        >
          <Field label="タスク名" htmlFor="t-title" error={err("title")}><Input id="t-title" {...register("title")} autoFocus={!task} /></Field>
          <Field label="目的" htmlFor="t-purpose"><Input id="t-purpose" {...register("purpose")} placeholder="何のためにやるか" /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="対象マンダラ項目" htmlFor="t-action">
              <NativeSelect id="t-action" {...register("mandala_action_id")}>
                <option value="">（紐づけない）</option>
                {actionOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </NativeSelect>
            </Field>
            <Field label="上位の目標・タスク" htmlFor="t-parent" error={err("parent_id")}>
              <NativeSelect id="t-parent" {...register("parent_id")}>
                <option value="">（なし）</option>
                {parents.map((p) => <option key={p.id} value={p.id}>{`[${LEVEL_LABEL[p.level]}] ${p.title}`}</option>)}
              </NativeSelect>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field label="階層" htmlFor="t-level">
              <NativeSelect id="t-level" {...register("level")}>
                {Object.entries(LEVEL_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </NativeSelect>
            </Field>
            <Field label="優先順位" htmlFor="t-priority">
              <NativeSelect id="t-priority" {...register("priority")}>
                <option value={1}>高</option>
                <option value={2}>中</option>
                <option value={3}>低</option>
              </NativeSelect>
            </Field>
            <Field label="ステータス" htmlFor="t-status">
              <NativeSelect id="t-status" {...register("status")}>
                <option value="todo">未着手</option>
                <option value="doing">進行中</option>
                <option value="done">完了</option>
                <option value="blocked">保留</option>
              </NativeSelect>
            </Field>
            <Field label="所要時間（分）" htmlFor="t-est" error={err("estimate_minutes")}><Input id="t-est" type="number" min={0} inputMode="numeric" {...register("estimate_minutes")} /></Field>
            <Field label="開始日" htmlFor="t-start" error={err("start_date")}><Input id="t-start" type="date" {...register("start_date")} /></Field>
            <Field label="期限" htmlFor="t-due" error={err("due_date")}><Input id="t-due" type="date" {...register("due_date")} /></Field>
            <Field label="実績時間（分）" htmlFor="t-act" error={err("actual_minutes")}><Input id="t-act" type="number" min={0} inputMode="numeric" {...register("actual_minutes")} /></Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="成果物" htmlFor="t-deliv"><Textarea id="t-deliv" rows={2} {...register("deliverable")} /></Field>
            <Field label="完了条件" htmlFor="t-done"><Textarea id="t-done" rows={2} {...register("done_criteria")} /></Field>
          </div>
          <p className="text-muted-foreground text-xs">※ タスクを完了しても売上などの数値KPIは達成扱いになりません。数値は「月次実績」で入力してください。</p>

          {task && (
            <fieldset className="space-y-2 rounded-lg border p-3">
              <legend className="px-1 text-xs font-semibold">依存関係（このタスクの前に終わらせるタスク）</legend>
              {task.dependsOn.length === 0 && <p className="text-muted-foreground text-xs">なし</p>}
              <ul className="space-y-1">
                {task.dependsOn.map((d) => (
                  <li key={d} className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate">{byId.get(d)?.title ?? "（削除済み）"}{byId.get(d)?.status === "done" ? "（完了）" : ""}</span>
                    <Button type="button" size="sm" variant="ghost" onClick={() => exec(() => removeDependencyAction(task.id, d), { silent: true })} aria-label="依存関係を外す"><X /></Button>
                  </li>
                ))}
              </ul>
              <div className="flex gap-2">
                <NativeSelect value={depPick} onChange={(e) => setDepPick(e.target.value)} aria-label="先行タスクを選択">
                  <option value="">先行タスクを選択…</option>
                  {others.map((o) => <option key={o.id} value={o.id}>{o.title}</option>)}
                </NativeSelect>
                <Button type="button" variant="outline" disabled={!depPick || pending} onClick={() => exec(() => addDependencyAction(task.id, depPick), { onOk: () => setDepPick("") })}>追加</Button>
              </div>
            </fieldset>
          )}

          <div className="flex items-center justify-between gap-2">
            {task ? (
              <Button
                type="button"
                variant="ghost"
                className="text-status-red"
                disabled={pending}
                onClick={() => {
                  if (confirm("このタスクを削除しますか？（子タスクは残り、親との紐づけだけ外れます）")) exec(() => deleteTaskAction(task.id), { onOk: onClose });
                }}
              >
                <Trash />削除
              </Button>
            ) : <span />}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose}>キャンセル</Button>
              <Button type="submit" disabled={pending}>{pending ? "保存中…" : "保存"}</Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
