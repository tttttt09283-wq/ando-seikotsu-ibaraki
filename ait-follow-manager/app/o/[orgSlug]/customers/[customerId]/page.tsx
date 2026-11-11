import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil, Plus } from "lucide-react";
import {
  addAppointment,
  addNote,
  addVisit,
  anonymizeCustomer,
  deleteVisit,
  recordConsent,
  setTags,
  updateAppointmentStatus,
} from "../actions";
import { createManualTask } from "../../tasks/actions";
import { ChipGroup } from "@/components/chips";
import { ActionForm, SubmitButton } from "@/components/forms";
import { EmptyState, PageHeader, Tabs } from "@/components/page";
import {
  AppointmentText,
  CHANNEL_LABELS,
  CLOSE_REASON_LABELS,
  CONTACT_STATUS_LABELS,
  ContactStatusBadge,
  OUTCOME_LABELS,
  TaskStatusBadge,
  type ContactStatus,
  type TaskStatus,
} from "@/components/status";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { ctxCan, getOrgContext } from "@/lib/auth/context";
import { createClient } from "@/lib/db/server";
import { addDays, formatJpDate, formatJpDateTime, todayInTimeZone } from "@/lib/dates";
import { listStaff, listTags, storeName } from "@/lib/org-data";

export const metadata = { title: "顧客詳細" };

const TABS = [
  { key: "basic", label: "基本情報" },
  { key: "visits", label: "来店" },
  { key: "appointments", label: "予約" },
  { key: "followups", label: "フォロー履歴" },
  { key: "notes", label: "メモ" },
  { key: "consent", label: "連絡同意" },
] as const;

const APPT_STATUS: Record<string, string> = {
  scheduled: "予約済",
  confirmed: "確定",
  cancelled: "キャンセル",
  completed: "来店済",
  no_show: "無断キャンセル",
};
const CONSENT_LABEL: Record<string, string> = { granted: "同意", not_allowed: "連絡不可", unsubscribed: "配信停止" };
const CONSENT_SOURCE: Record<string, string> = {
  in_store_form: "店頭の書面",
  verbal: "口頭",
  csv: "CSV取込",
  customer_request: "本人からの申し出",
  other: "その他",
};

export default async function CustomerDetailPage({ params, searchParams }: PageProps<"/o/[orgSlug]/customers/[customerId]">) {
  const { orgSlug, customerId } = await params;
  const sp = await searchParams;
  const ctx = await getOrgContext(orgSlug);
  if (!/^[0-9a-f-]{36}$/.test(customerId)) notFound();
  const tab = TABS.some((t) => t.key === sp.tab) ? (sp.tab as string) : "basic";
  const supabase = await createClient();
  const today = todayInTimeZone(ctx.org.timezone);

  const { data: c } = await supabase.from("customer_overview").select("*").eq("id", customerId).eq("organization_id", ctx.org.id).maybeSingle();
  if (!c) notFound();

  const [staff, tags] = await Promise.all([listStaff(ctx, supabase), listTags(ctx, supabase)]);
  const staffName = (id: string | null) => (id ? (staff.find((s) => s.id === id)?.name ?? "—") : "未設定");
  const base = `/o/${orgSlug}/customers/${c.id}`;
  const hidden = (
    <>
      <input type="hidden" name="orgSlug" value={orgSlug} />
      <input type="hidden" name="customerId" value={c.id} />
    </>
  );
  const canWrite = ctxCan(ctx, "customer.write", c.store_id);
  const blocked = c.contact_status === "unsubscribed" || c.contact_status === "not_allowed";

  return (
    <>
      <PageHeader
        title={`${c.family_name} ${c.given_name}`}
        back={`/o/${orgSlug}/customers`}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span>{[c.family_name_kana, c.given_name_kana].join(" ").trim()}</span>
            <span>#{c.customer_code}</span>
            <ContactStatusBadge status={c.contact_status as ContactStatus} />
          </span>
        }
        actions={
          canWrite && (
            <Link href={`${base}/edit`} className={buttonVariants({ variant: "outline", size: "sm" })}>
              <Pencil /> 編集
            </Link>
          )
        }
      />
      {blocked && (
        <p role="alert" className="mb-3 rounded-md bg-danger-soft px-3 py-2 text-sm font-semibold text-danger">
          {CONTACT_STATUS_LABELS[c.contact_status as ContactStatus]}の顧客です。連絡タスクは作成されません。
        </p>
      )}
      <Tabs current={tab} items={TABS.map((t) => ({ key: t.key, label: t.label, href: `${base}?tab=${t.key}` }))} />

      {tab === "basic" && (
        <div className="grid gap-3">
          <Card>
            <CardContent className="pt-4">
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                <dt className="text-muted-foreground">所属店舗</dt>
                <dd>{storeName(ctx, c.store_id)}</dd>
                <dt className="text-muted-foreground">担当スタッフ</dt>
                <dd>{staffName(c.assigned_staff_id)}</dd>
                <dt className="text-muted-foreground">電話番号</dt>
                <dd>{c.phone ?? "—"}</dd>
                <dt className="text-muted-foreground">メール</dt>
                <dd className="break-all">{c.email ?? "—"}</dd>
                <dt className="text-muted-foreground">初回来店</dt>
                <dd>{formatJpDate(c.first_visit_on)}</dd>
                <dt className="text-muted-foreground">最終来店</dt>
                <dd>{formatJpDate(c.last_visit_on)}</dd>
                <dt className="text-muted-foreground">次回予約</dt>
                <dd>
                  <AppointmentText nextAt={c.next_appointment_at} timeZone={ctx.org.timezone} />
                </dd>
                <dt className="text-muted-foreground">フォロー状況</dt>
                <dd>
                  {(c.overdue_task_count ?? 0) > 0 ? (
                    <Badge variant="danger">期限切れ {c.overdue_task_count}件</Badge>
                  ) : (c.open_task_count ?? 0) > 0 ? (
                    <Badge>未対応 {c.open_task_count}件</Badge>
                  ) : (
                    "未対応なし"
                  )}
                </dd>
              </dl>
            </CardContent>
          </Card>

          {canWrite && (
            <Card>
              <CardHeader>
                <CardTitle>タグ</CardTitle>
              </CardHeader>
              <CardContent>
                <ActionForm action={setTags}>
                  {hidden}
                  <div className="flex flex-wrap gap-2">
                    {tags.map((t) => (
                      <label key={t.id} className="cursor-pointer">
                        <input type="checkbox" name="tagIds" value={t.id} defaultChecked={c.tag_ids?.includes(t.id)} className="peer sr-only" />
                        <span className="inline-flex h-9 items-center rounded-full border px-3 text-sm peer-checked:border-primary peer-checked:bg-info-soft peer-checked:text-primary">
                          {t.name}
                        </span>
                      </label>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Input name="newTag" maxLength={30} placeholder="新しいタグ" aria-label="新しいタグ" />
                    <SubmitButton variant="outline">保存</SubmitButton>
                  </div>
                </ActionForm>
              </CardContent>
            </Card>
          )}

          {ctxCan(ctx, "task.act", c.store_id) && (
            <Card>
              <CardHeader>
                <CardTitle>フォロータスクを手動で作成</CardTitle>
              </CardHeader>
              <CardContent>
                <ActionForm action={createManualTask}>
                  {hidden}
                  <Field label="タスク名" htmlFor="title">
                    <Input id="title" name="title" required maxLength={80} defaultValue="個別フォロー" />
                  </Field>
                  <div className="grid grid-cols-3 gap-2">
                    <Field label="期限" htmlFor="dueOn">
                      <Input id="dueOn" name="dueOn" type="date" required defaultValue={addDays(today, 3)} />
                    </Field>
                    <Field label="種別" htmlFor="kind">
                      <Select id="kind" name="kind" defaultValue={blocked ? "internal" : "contact"}>
                        {!blocked && <option value="contact">連絡</option>}
                        <option value="internal">社内作業</option>
                      </Select>
                    </Field>
                    <Field label="優先度" htmlFor="priority">
                      <Select id="priority" name="priority" defaultValue="normal">
                        <option value="high">高</option>
                        <option value="normal">中</option>
                        <option value="low">低</option>
                      </Select>
                    </Field>
                  </div>
                  <SubmitButton variant="outline">
                    <Plus /> 作成
                  </SubmitButton>
                </ActionForm>
              </CardContent>
            </Card>
          )}

          {ctxCan(ctx, "customer.delete", null) && (
            <details className="rounded-lg border border-danger/30 bg-card p-4">
              <summary className="cursor-pointer text-sm font-semibold text-danger">個人情報の削除</summary>
              <p className="my-2 text-sm text-muted-foreground">
                氏名・連絡先・メモ等を削除（匿名化）します。件数の集計のみ残ります。元に戻せません。
              </p>
              <ActionForm action={anonymizeCustomer}>
                {hidden}
                <Field label="確認のため「削除」と入力" htmlFor="confirm">
                  <Input id="confirm" name="confirm" required autoComplete="off" />
                </Field>
                <SubmitButton variant="danger">削除する</SubmitButton>
              </ActionForm>
            </details>
          )}
        </div>
      )}

      {tab === "visits" && <VisitsTab ctxStoreCanManage={ctxCan(ctx, "store.update", c.store_id)} customerId={c.id} hidden={hidden} today={today} canRecord={ctxCan(ctx, "visit.record", c.store_id)} staffName={staffName} />}
      {tab === "appointments" && <AppointmentsTab customerId={c.id} hidden={hidden} canRecord={ctxCan(ctx, "visit.record", c.store_id)} timeZone={ctx.org.timezone} />}
      {tab === "followups" && <FollowupsTab customerId={c.id} orgSlug={orgSlug} timeZone={ctx.org.timezone} staffName={staffName} />}
      {tab === "notes" && <NotesTab customerId={c.id} hidden={hidden} canWrite={canWrite} timeZone={ctx.org.timezone} staffName={staffName} />}
      {tab === "consent" && <ConsentTab customerId={c.id} hidden={hidden} canRecord={ctxCan(ctx, "consent.record", c.store_id)} timeZone={ctx.org.timezone} staffName={staffName} />}
    </>
  );
}

async function VisitsTab({
  customerId,
  hidden,
  today,
  canRecord,
  ctxStoreCanManage,
  staffName,
}: {
  customerId: string;
  hidden: React.ReactNode;
  today: string;
  canRecord: boolean;
  ctxStoreCanManage: boolean;
  staffName: (id: string | null) => string;
}) {
  const supabase = await createClient();
  const { data: visits } = await supabase
    .from("visits")
    .select("id, visited_on, menu_label, staff_id, source")
    .eq("customer_id", customerId)
    .order("visited_on", { ascending: false })
    .limit(100);
  return (
    <div className="grid gap-3">
      {canRecord && (
        <Card>
          <CardContent className="pt-4">
            <ActionForm action={addVisit} className="grid grid-cols-[1fr_1fr] items-end gap-2 sm:grid-cols-[1fr_2fr_auto]">
              {hidden}
              <Field label="来店日" htmlFor="visitedOn">
                <Input id="visitedOn" name="visitedOn" type="date" max={today} defaultValue={today} required />
              </Field>
              <Field label="メニュー（任意）" htmlFor="menuLabel">
                <Input id="menuLabel" name="menuLabel" maxLength={100} />
              </Field>
              <SubmitButton className="col-span-2 sm:col-span-1">来店を記録</SubmitButton>
            </ActionForm>
          </CardContent>
        </Card>
      )}
      {visits?.length ? (
        <ul className="grid gap-2">
          {visits.map((v) => (
            <li key={v.id} className="flex items-center gap-2 rounded-lg border bg-card p-3 text-sm">
              <span className="font-semibold tabular-nums">{formatJpDate(v.visited_on)}</span>
              <span className="text-muted-foreground">{v.menu_label}</span>
              <span className="ml-auto text-xs text-muted-foreground">
                {staffName(v.staff_id)}
                {v.source === "csv" && "（CSV）"}
              </span>
              {ctxStoreCanManage && (
                <ActionForm action={deleteVisit} confirmMessage="この来店記録を削除しますか？" className="contents">
                  {hidden}
                  <input type="hidden" name="visitId" value={v.id} />
                  <SubmitButton variant="ghost" size="sm" className="text-danger">
                    削除
                  </SubmitButton>
                </ActionForm>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState>来店記録はまだありません。</EmptyState>
      )}
    </div>
  );
}

async function AppointmentsTab({ customerId, hidden, canRecord, timeZone }: { customerId: string; hidden: React.ReactNode; canRecord: boolean; timeZone: string }) {
  const supabase = await createClient();
  const { data: appts } = await supabase
    .from("appointments")
    .select("id, scheduled_at, status, source, note")
    .eq("customer_id", customerId)
    .order("scheduled_at", { ascending: false })
    .limit(50);
  return (
    <div className="grid gap-3">
      <p className="text-sm text-muted-foreground">
        このシステムに登録された予約のみ表示します。予約がない場合は「予約未確認」と表示し、予約がないとは判断しません。
      </p>
      {canRecord && (
        <Card>
          <CardContent className="pt-4">
            <ActionForm action={addAppointment} className="grid gap-2 sm:grid-cols-[2fr_1fr_auto] sm:items-end">
              {hidden}
              <Field label="予約日時" htmlFor="scheduledAt">
                <Input id="scheduledAt" name="scheduledAt" type="datetime-local" required />
              </Field>
              <Field label="状態" htmlFor="apptStatus">
                <Select id="apptStatus" name="status" defaultValue="scheduled">
                  <option value="scheduled">予約済</option>
                  <option value="confirmed">確定</option>
                </Select>
              </Field>
              <SubmitButton>予約を登録</SubmitButton>
            </ActionForm>
          </CardContent>
        </Card>
      )}
      {appts?.length ? (
        <ul className="grid gap-2">
          {appts.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3 text-sm">
              <span className="font-semibold">{formatJpDateTime(a.scheduled_at, timeZone)}</span>
              <Badge variant={a.status === "cancelled" || a.status === "no_show" ? "muted" : "default"}>{APPT_STATUS[a.status]}</Badge>
              {canRecord && (
                <ActionForm action={updateAppointmentStatus} className="ml-auto flex gap-1">
                  {hidden}
                  <input type="hidden" name="appointmentId" value={a.id} />
                  <Select name="status" defaultValue={a.status} className="h-9 w-32 text-sm" aria-label="予約の状態">
                    {Object.entries(APPT_STATUS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </Select>
                  <SubmitButton size="sm" variant="outline">
                    更新
                  </SubmitButton>
                </ActionForm>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState>予約未確認（登録された予約はありません）</EmptyState>
      )}
    </div>
  );
}

async function FollowupsTab({
  customerId,
  orgSlug,
  timeZone,
  staffName,
}: {
  customerId: string;
  orgSlug: string;
  timeZone: string;
  staffName: (id: string | null) => string;
}) {
  const supabase = await createClient();
  const [{ data: tasks }, { data: logs }] = await Promise.all([
    supabase.from("followup_tasks").select("id, title, status, due_on, close_reason").eq("customer_id", customerId).order("created_at", { ascending: false }).limit(50),
    supabase.from("contact_logs").select("id, channel, outcome, content, contacted_at, staff_id").eq("customer_id", customerId).order("contacted_at", { ascending: false }).limit(50),
  ]);
  return (
    <div className="grid gap-4">
      <section>
        <h2 className="mb-2 font-bold">タスク</h2>
        {tasks?.length ? (
          <ul className="grid gap-2">
            {tasks.map((t) => (
              <li key={t.id}>
                <Link href={`/o/${orgSlug}/tasks/${t.id}`} className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3 text-sm hover:bg-muted/50">
                  <span className="font-semibold">{t.title}</span>
                  <TaskStatusBadge status={t.status as TaskStatus} />
                  {t.close_reason && <span className="text-xs text-muted-foreground">{CLOSE_REASON_LABELS[t.close_reason]}</span>}
                  <span className="ml-auto text-xs text-muted-foreground">期限 {formatJpDate(t.due_on)}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState>フォロータスクはありません。</EmptyState>
        )}
      </section>
      <section>
        <h2 className="mb-2 font-bold">連絡記録</h2>
        {logs?.length ? (
          <ul className="grid gap-2">
            {logs.map((l) => (
              <li key={l.id} className="rounded-lg border bg-card p-3 text-sm">
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span>{formatJpDateTime(l.contacted_at, timeZone)}</span>
                  <span>{CHANNEL_LABELS[l.channel]}</span>
                  <span>{OUTCOME_LABELS[l.outcome]}</span>
                  <span>{staffName(l.staff_id)}</span>
                </div>
                {l.content && <p className="mt-1 whitespace-pre-wrap">{l.content}</p>}
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState>連絡記録はありません。</EmptyState>
        )}
      </section>
    </div>
  );
}

async function NotesTab({
  customerId,
  hidden,
  canWrite,
  timeZone,
  staffName,
}: {
  customerId: string;
  hidden: React.ReactNode;
  canWrite: boolean;
  timeZone: string;
  staffName: (id: string | null) => string;
}) {
  const supabase = await createClient();
  const { data: notes } = await supabase.from("customer_notes").select("id, body, author_id, created_at").eq("customer_id", customerId).order("created_at", { ascending: false }).limit(100);
  return (
    <div className="grid gap-3">
      {canWrite && (
        <ActionForm action={addNote} resetOnSuccess>
          {hidden}
          <Field label="対応メモ" htmlFor="body" hint="症状・傷病名などの医療情報は記入しないでください。">
            <Textarea id="body" name="body" maxLength={2000} required />
          </Field>
          <SubmitButton variant="outline">メモを追加</SubmitButton>
        </ActionForm>
      )}
      {notes?.length ? (
        <ul className="grid gap-2">
          {notes.map((n) => (
            <li key={n.id} className="rounded-lg border bg-card p-3 text-sm">
              <div className="text-xs text-muted-foreground">
                {formatJpDateTime(n.created_at, timeZone)}・{staffName(n.author_id)}
              </div>
              <p className="mt-1 whitespace-pre-wrap">{n.body}</p>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState>メモはありません。</EmptyState>
      )}
    </div>
  );
}

async function ConsentTab({
  customerId,
  hidden,
  canRecord,
  timeZone,
  staffName,
}: {
  customerId: string;
  hidden: React.ReactNode;
  canRecord: boolean;
  timeZone: string;
  staffName: (id: string | null) => string;
}) {
  const supabase = await createClient();
  const { data: records } = await supabase
    .from("consent_records")
    .select("id, channel, status, source, note, recorded_by, recorded_at")
    .eq("customer_id", customerId)
    .order("recorded_at", { ascending: false });
  return (
    <div className="grid gap-3">
      {canRecord && (
        <Card>
          <CardHeader>
            <CardTitle>連絡同意・配信停止を記録</CardTitle>
          </CardHeader>
          <CardContent>
            <ActionForm action={recordConsent} resetOnSuccess>
              {hidden}
              <ChipGroup
                name="status"
                legend="状態"
                required
                options={[
                  { value: "granted", label: "同意あり" },
                  { value: "unsubscribed", label: "配信停止" },
                  { value: "not_allowed", label: "連絡不可" },
                ]}
              />
              <Field label="確認方法" htmlFor="source">
                <Select id="source" name="source" defaultValue="verbal">
                  <option value="in_store_form">店頭の書面</option>
                  <option value="verbal">口頭</option>
                  <option value="customer_request">本人からの申し出</option>
                  <option value="other">その他</option>
                </Select>
              </Field>
              <Field label="備考（任意）" htmlFor="note">
                <Input id="note" name="note" maxLength={200} />
              </Field>
              <SubmitButton>記録する</SubmitButton>
            </ActionForm>
          </CardContent>
        </Card>
      )}
      <h2 className="font-bold">記録の履歴</h2>
      {records?.length ? (
        <ul className="grid gap-2">
          {records.map((r) => (
            <li key={r.id} className="rounded-lg border bg-card p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={r.status === "granted" ? "success" : "danger"}>{CONSENT_LABEL[r.status]}</Badge>
                <span className="text-xs text-muted-foreground">
                  {formatJpDateTime(r.recorded_at, timeZone)}・{CONSENT_SOURCE[r.source]}・{staffName(r.recorded_by)}
                </span>
              </div>
              {r.note && <p className="mt-1">{r.note}</p>}
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState>記録はありません（同意未確認）。</EmptyState>
      )}
    </div>
  );
}
