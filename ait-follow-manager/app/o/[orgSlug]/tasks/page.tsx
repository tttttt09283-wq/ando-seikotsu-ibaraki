import Link from "next/link";
import { EmptyState, PageHeader, Tabs } from "@/components/page";
import { TaskRow, TASK_SELECT, type TaskListItem } from "@/components/task-row";
import { Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { getOrgContext } from "@/lib/auth/context";
import { createClient } from "@/lib/db/server";
import { todayInTimeZone } from "@/lib/dates";

export const metadata = { title: "フォロータスク" };

const TABS = [
  { key: "today", label: "今日" },
  { key: "overdue", label: "期限切れ" },
  { key: "open", label: "未対応" },
  { key: "on_hold", label: "保留" },
  { key: "done", label: "完了" },
  { key: "closed", label: "対象外" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export default async function TasksPage({ params, searchParams }: PageProps<"/o/[orgSlug]/tasks">) {
  const { orgSlug } = await params;
  const sp = await searchParams;
  const ctx = await getOrgContext(orgSlug);
  const today = todayInTimeZone(ctx.org.timezone);
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const tab = (TABS.some((t) => t.key === one(sp.tab)) ? one(sp.tab) : "today") as TabKey;
  const mine = one(sp.mine) === "1";
  const store = ctx.accessibleStoreIds.includes(one(sp.store)) ? one(sp.store) : "";
  const kind = ["contact", "internal"].includes(one(sp.kind)) ? one(sp.kind) : "";

  const supabase = await createClient();
  let q = supabase.from("followup_tasks").select(TASK_SELECT, { count: "exact" }).eq("organization_id", ctx.org.id);
  if (tab === "today") q = q.eq("status", "open").eq("due_on", today);
  if (tab === "overdue") q = q.eq("status", "open").lt("due_on", today);
  if (tab === "open") q = q.eq("status", "open");
  if (tab === "on_hold") q = q.eq("status", "on_hold");
  if (tab === "done") q = q.eq("status", "done");
  if (tab === "closed") q = q.eq("status", "not_applicable");
  if (mine) q = q.eq("assigned_to", ctx.userId);
  if (store) q = q.eq("store_id", store);
  if (kind) q = q.eq("task_kind", kind as "contact" | "internal");
  q = ["done", "closed"].includes(tab) ? q.order("updated_at", { ascending: false }) : q.order("due_on").order("priority");
  const { data, count } = await q.limit(100);
  const tasks = (data ?? []) as unknown as TaskListItem[];

  const keep = (extra: Record<string, string>) => {
    const p = new URLSearchParams({ tab, ...(mine ? { mine: "1" } : {}), ...(store ? { store } : {}), ...(kind ? { kind } : {}), ...extra });
    for (const [k, v] of [...p.entries()]) if (!v) p.delete(k);
    return `/o/${orgSlug}/tasks?${p}`;
  };

  return (
    <>
      <PageHeader title="フォロータスク" />
      <Tabs current={tab} items={TABS.map((t) => ({ key: t.key, label: t.label, href: keep({ tab: t.key }) }))} />

      <form className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4" action={`/o/${orgSlug}/tasks`}>
        <input type="hidden" name="tab" value={tab} />
        <Select name="mine" defaultValue={mine ? "1" : ""} aria-label="担当">
          <option value="">全員のタスク</option>
          <option value="1">自分の担当のみ</option>
        </Select>
        <Select name="kind" defaultValue={kind} aria-label="種別">
          <option value="">すべての種別</option>
          <option value="contact">連絡</option>
          <option value="internal">社内作業</option>
        </Select>
        {ctx.accessibleStoreIds.length > 1 && (
          <Select name="store" defaultValue={store} aria-label="店舗">
            <option value="">すべての店舗</option>
            {ctx.stores
              .filter((s) => ctx.accessibleStoreIds.includes(s.id))
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
          </Select>
        )}
        <Button type="submit" variant="outline">
          絞り込む
        </Button>
      </form>

      <p className="mb-2 text-sm text-muted-foreground">{count ?? 0} 件{(count ?? 0) > 100 && "（先頭100件を表示）"}</p>
      {tasks.length ? (
        <ul className="grid gap-2">
          {tasks.map((t) => (
            <TaskRow key={t.id} task={t} today={today} orgSlug={orgSlug} showStore={ctx.accessibleStoreIds.length > 1} />
          ))}
        </ul>
      ) : (
        <EmptyState>該当するタスクはありません。</EmptyState>
      )}
      <p className="mt-4 text-xs text-muted-foreground">
        タスクは毎朝自動で抽出されます。条件は
        <Link href={`/o/${orgSlug}/settings/rules`} className="mx-1 text-primary underline">
          フォロー条件
        </Link>
        で設定できます。
      </p>
    </>
  );
}
