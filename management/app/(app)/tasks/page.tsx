import type { Metadata } from "next";
import Link from "next/link";
import { myTasks, storeTasks, storesWith, storeMembers, type TaskRow } from "@/server/meetings";
import { updateTaskProgress, createTask, deleteTask } from "./actions";
import { TASK_STATUS, PRIORITY, isTaskOverdue } from "@/lib/meetings";
import { formatDate, jstToday } from "@/lib/time";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input, Select, Field } from "@/components/ui/input";
import { SubmitButton } from "@/components/submit-button";
import { Flash } from "@/components/flash";

export const metadata: Metadata = { title: "タスク" };

function TaskItem({ t, today, backTo, manage }: { t: TaskRow; today: string; backTo: string; manage?: boolean }) {
  const overdue = isTaskOverdue(t.due_date, t.status, today);
  return (
    <li className="grid gap-2 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        {t.is_decision ? <Badge tone="brand">会議の決定事項</Badge> : null}
        <b className={t.status === "done" ? "text-stone-500 line-through" : ""}>{t.title}</b>
        <Badge tone={t.status === "done" ? "ok" : t.status === "doing" ? "brand" : "neutral"}>{TASK_STATUS[t.status]}{t.status === "doing" ? ` ${t.progress}%` : ""}</Badge>
        {t.priority === "high" ? <Badge tone="danger">優先度 高</Badge> : null}
        <span className={`ml-auto text-xs ${overdue ? "font-bold text-red-700" : "text-stone-500"}`}>期限 {formatDate(t.due_date)}{overdue ? "（期限切れ）" : ""}</span>
      </div>
      {t.detail ? <p className="text-sm text-stone-700">{t.detail}</p> : null}
      <p className="text-xs text-stone-500">
        {t.owner_name ? `担当：${t.owner_name}　` : ""}{t.store_name ? `${t.store_name}　` : ""}
        {t.meeting_id ? <Link href={`/meetings/${t.meeting_id}`} className="text-brand-700">{t.meeting_title}</Link> : null}
        {t.progress_note ? `　メモ：${t.progress_note}` : ""}
      </p>
      {t.status !== "done" ? (
        <form action={updateTaskProgress} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="id" value={t.id} /><input type="hidden" name="back_to" value={backTo} />
          <div className="w-28"><Field label="状態"><Select name="status" defaultValue={t.status === "todo" ? "doing" : t.status}>{(["todo", "doing", "done"] as const).map((s) => <option key={s} value={s}>{TASK_STATUS[s]}</option>)}</Select></Field></div>
          <div className="w-24"><Field label="進み具合%"><Input type="number" name="progress" min={0} max={100} step={10} defaultValue={t.progress} /></Field></div>
          <div className="min-w-40 grow"><Field label="メモ（任意）"><Input name="note" maxLength={300} /></Field></div>
          <SubmitButton variant="outline" size="sm">更新</SubmitButton>
        </form>
      ) : null}
      {manage && !t.is_decision ? (
        <form action={deleteTask}><input type="hidden" name="id" value={t.id} /><input type="hidden" name="back_to" value={backTo} /><SubmitButton variant="ghost" size="sm" className="text-red-700">削除</SubmitButton></form>
      ) : null}
    </li>
  );
}

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ store?: string; ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const today = jstToday();
  const [mine, manageable] = await Promise.all([myTasks(), storesWith("task.manage.store")]);
  const storeId = manageable.find((s) => s.id === sp.store)?.id ?? manageable[0]?.id;
  const [storeRows, members] = storeId ? await Promise.all([storeTasks(storeId), storeMembers(storeId)]) : [[], []];
  const backTo = storeId ? `/tasks?store=${storeId}` : "/tasks";
  return (
    <>
      <h1 className="text-xl font-black text-brand-800">タスク</h1>
      <Flash ok={sp.ok} err={sp.err} />
      <Card>
        <CardHeader><CardTitle>自分のタスク（{mine.filter((t) => t.status !== "done").length}件）</CardTitle></CardHeader>
        <CardContent className="p-0">
          <ul className="divide-y divide-stone-100">
            {mine.map((t) => <TaskItem key={t.id} t={t} today={today} backTo={backTo} />)}
            {mine.length === 0 ? <li className="px-4 py-4 text-sm text-stone-500">担当のタスクはありません</li> : null}
          </ul>
        </CardContent>
      </Card>
      {storeId ? (
        <>
          {manageable.length > 1 ? (
            <nav className="flex flex-wrap gap-1 text-sm">
              {manageable.map((s) => <Link key={s.id} href={`/tasks?store=${s.id}`} className={`rounded-full border px-3 py-1 ${s.id === storeId ? "border-brand-700 bg-brand-50 font-bold" : "border-stone-300"}`}>{s.name}</Link>)}
            </nav>
          ) : null}
          <Card>
            <CardHeader><CardTitle>院のタスクを登録</CardTitle></CardHeader>
            <CardContent>
              <form action={createTask} className="grid gap-3 sm:grid-cols-2">
                <input type="hidden" name="store_id" value={storeId} /><input type="hidden" name="back_to" value={backTo} />
                <Field label="タスク"><Input name="title" required minLength={2} maxLength={200} placeholder="例：受付の棚を整理する" /></Field>
                <Field label="内容（任意）"><Input name="detail" maxLength={1000} /></Field>
                <Field label="担当者"><Select name="owner_user_id" required defaultValue=""><option value="" disabled>選択</option>{members.map((m) => <option key={m.user_id} value={m.user_id}>{m.name}</option>)}</Select></Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="期限"><Input type="date" name="due_date" min={today} /></Field>
                  <Field label="優先度"><Select name="priority" defaultValue="mid">{(["high", "mid", "low"] as const).map((p) => <option key={p} value={p}>{PRIORITY[p]}</option>)}</Select></Field>
                </div>
                <div className="sm:col-span-2"><SubmitButton>登録する</SubmitButton></div>
              </form>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>{manageable.find((s) => s.id === storeId)?.name}のタスク（未完了 {storeRows.filter((t) => t.status !== "done").length}件）</CardTitle></CardHeader>
            <CardContent className="p-0">
              <ul className="divide-y divide-stone-100">
                {storeRows.map((t) => <TaskItem key={t.id} t={t} today={today} backTo={backTo} manage />)}
                {storeRows.length === 0 ? <li className="px-4 py-4 text-sm text-stone-500">ありません</li> : null}
              </ul>
            </CardContent>
          </Card>
        </>
      ) : null}
    </>
  );
}
