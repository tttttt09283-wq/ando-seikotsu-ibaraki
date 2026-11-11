import Link from "next/link";
import { notFound } from "next/navigation";
import { Phone } from "lucide-react";
import { assignTask, recordTaskAction } from "../actions";
import { ChipGroup } from "@/components/chips";
import { CopyButton } from "@/components/copy-button";
import { ActionForm, SubmitButton } from "@/components/forms";
import { PageHeader } from "@/components/page";
import {
  AppointmentText,
  CHANNEL_LABELS,
  CLOSE_REASON_LABELS,
  ContactStatusBadge,
  DueBadge,
  OUTCOME_LABELS,
  PRIORITY_LABELS,
  TaskStatusBadge,
  type ContactStatus,
  type TaskStatus,
} from "@/components/status";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Select, Textarea } from "@/components/ui/input";
import { ctxCan, getOrgContext } from "@/lib/auth/context";
import { customerName, renderForCustomer } from "@/lib/customer-vars";
import { createClient } from "@/lib/db/server";
import { formatJpDate, formatJpDateTime, todayInTimeZone } from "@/lib/dates";
import { TEMPLATE_CATEGORIES } from "@/lib/templates";

export const metadata = { title: "タスク詳細" };

export default async function TaskDetailPage({ params, searchParams }: PageProps<"/o/[orgSlug]/tasks/[taskId]">) {
  const { orgSlug, taskId } = await params;
  const sp = await searchParams;
  const ctx = await getOrgContext(orgSlug);
  if (!/^[0-9a-f-]{36}$/.test(taskId)) notFound();
  const supabase = await createClient();
  const today = todayInTimeZone(ctx.org.timezone);

  const { data: task } = await supabase
    .from("followup_tasks")
    .select(
      "*, customer:customers(id, family_name, given_name, customer_code, phone, contact_status, last_visit_on, first_visit_on), assignee:users!followup_tasks_assigned_to_fkey(id, display_name), store:stores(id, name), rule:followup_rules(name, rule_type)",
    )
    .eq("id", taskId)
    .eq("organization_id", ctx.org.id)
    .maybeSingle();
  if (!task || !task.customer) notFound();

  const [{ data: overview }, { data: templates }, { data: logs }, { data: staff }] = await Promise.all([
    supabase.from("customer_overview").select("next_appointment_at").eq("id", task.customer.id).maybeSingle(),
    supabase
      .from("message_templates")
      .select("id, name, category, body")
      .eq("organization_id", ctx.org.id)
      .eq("is_archived", false)
      .order("category"),
    supabase
      .from("contact_logs")
      .select("id, channel, outcome, content, contacted_at, staff:users!contact_logs_staff_id_fkey(display_name)")
      .eq("customer_id", task.customer.id)
      .order("contacted_at", { ascending: false })
      .limit(10),
    ctxCan(ctx, "task.assign_others", task.store_id)
      ? supabase.from("memberships").select("user_id, role, store_id, user:users(display_name)").eq("organization_id", ctx.org.id).eq("status", "active")
      : Promise.resolve({ data: null }),
  ]);

  const selectedId = typeof sp.template === "string" ? sp.template : (task.template_id ?? templates?.[0]?.id);
  const template = templates?.find((t) => t.id === selectedId) ?? templates?.[0];
  const message = template
    ? renderForCustomer(template.body, {
        customer: task.customer,
        storeName: task.store?.name,
        staffName: task.assignee?.display_name ?? ctx.displayName,
        nextAppointmentAt: overview?.next_appointment_at,
        timeZone: ctx.org.timezone,
      })
    : "";
  const contactBlocked = task.customer.contact_status === "unsubscribed" || task.customer.contact_status === "not_allowed";
  const canAct = ctxCan(ctx, "task.act", task.store_id);
  const assignable = [
    ...new Map(
      (staff ?? [])
        .filter((m) => m.role === "org_admin" || m.store_id === task.store_id)
        .map((m) => [m.user_id, (m.user as { display_name: string } | null)?.display_name ?? ""]),
    ).entries(),
  ];

  return (
    <>
      <PageHeader title={task.title} back={`/o/${orgSlug}/tasks`} />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <TaskStatusBadge status={task.status as TaskStatus} />
        <DueBadge dueOn={task.due_on} today={today} status={task.status as TaskStatus} />
        <Badge variant="muted">期限 {formatJpDate(task.due_on)}</Badge>
        <Badge variant="muted">優先度 {PRIORITY_LABELS[task.priority as keyof typeof PRIORITY_LABELS]}</Badge>
        {task.task_kind === "internal" && <Badge variant="muted">社内作業</Badge>}
        {task.close_reason && <Badge variant="outline">{CLOSE_REASON_LABELS[task.close_reason]}</Badge>}
      </div>

      {contactBlocked && (
        <p role="alert" className="mb-3 rounded-md bg-danger-soft px-3 py-2 text-sm font-semibold text-danger">
          この顧客は{task.customer.contact_status === "unsubscribed" ? "配信停止" : "連絡不可"}です。連絡はしないでください。
        </p>
      )}

      <Card className="mb-3">
        <CardContent className="grid gap-2 pt-4 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/o/${orgSlug}/customers/${task.customer.id}`} className="text-lg font-bold text-primary hover:underline">
              {customerName(task.customer)}
            </Link>
            <span className="text-muted-foreground">#{task.customer.customer_code}</span>
            <ContactStatusBadge status={task.customer.contact_status as ContactStatus} />
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            <dt className="text-muted-foreground">店舗</dt>
            <dd>{task.store?.name}</dd>
            <dt className="text-muted-foreground">最終来店</dt>
            <dd>{formatJpDate(task.customer.last_visit_on)}</dd>
            <dt className="text-muted-foreground">次回予約</dt>
            <dd>
              <AppointmentText nextAt={overview?.next_appointment_at ?? null} timeZone={ctx.org.timezone} />
            </dd>
            <dt className="text-muted-foreground">担当</dt>
            <dd>{task.assignee?.display_name ?? "未割当"}</dd>
          </dl>
          {task.customer.phone && !contactBlocked && (
            <a href={`tel:${task.customer.phone.replace(/[^0-9+]/g, "")}`} className="inline-flex h-11 items-center gap-2 font-semibold text-primary">
              <Phone className="size-4" aria-hidden />
              {task.customer.phone}
            </a>
          )}
        </CardContent>
      </Card>

      {!contactBlocked && template && (
        <Card className="mb-3">
          <CardHeader>
            <CardTitle>メッセージ文面</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <form className="flex gap-2" action={`/o/${orgSlug}/tasks/${task.id}`}>
              <Select name="template" defaultValue={template.id} aria-label="テンプレート">
                {templates!.map((t) => (
                  <option key={t.id} value={t.id}>
                    {TEMPLATE_CATEGORIES[t.category as keyof typeof TEMPLATE_CATEGORIES]}：{t.name}
                  </option>
                ))}
              </Select>
              <button type="submit" className="shrink-0 rounded-md border px-3 text-sm font-semibold">
                切替
              </button>
            </form>
            <pre className="whitespace-pre-wrap rounded-md bg-muted p-3 font-sans text-sm">{message}</pre>
            <CopyButton text={message} size="lg" className="w-full" />
            <p className="text-xs text-muted-foreground">
              このシステムからは送信されません。コピーした文面を LINE 等で送信した後、下の「対応を記録」で記録してください。
            </p>
          </CardContent>
        </Card>
      )}

      {canAct && (
        <Card className="mb-3">
          <CardHeader>
            <CardTitle>対応を記録</CardTitle>
          </CardHeader>
          <CardContent>
            <ActionForm action={recordTaskAction}>
              <input type="hidden" name="orgSlug" value={orgSlug} />
              <input type="hidden" name="taskId" value={task.id} />
              <input type="hidden" name="templateId" value={template?.id ?? ""} />
              <ChipGroup
                name="channel"
                legend="連絡手段"
                options={["phone", "line_manual", "email_manual", "sms_manual", "in_person", "other"].map((v) => ({ value: v, label: CHANNEL_LABELS[v] }))}
              />
              <ChipGroup
                name="outcome"
                legend="結果"
                options={["sent", "reached", "no_answer", "replied", "appointment_reported", "declined", "other"].map((v) => ({
                  value: v,
                  label: OUTCOME_LABELS[v],
                }))}
              />
              <Field label="対応内容（任意）" htmlFor="content">
                <Textarea id="content" name="content" maxLength={2000} placeholder="送信した内容や会話の要点。症状などの医療情報は記入しないでください。" />
              </Field>
              <Field label="メモ・対象外の理由" htmlFor="note">
                <Textarea id="note" name="note" maxLength={1000} defaultValue={task.result_note ?? ""} className="min-h-16" />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <SubmitButton name="status" value="done" size="lg" className="col-span-2">
                  対応済みにする
                </SubmitButton>
                <SubmitButton name="status" value="on_hold" variant="outline">
                  保留
                </SubmitButton>
                <SubmitButton name="status" value="not_applicable" variant="outline">
                  対象外
                </SubmitButton>
                {task.status !== "open" && (
                  <SubmitButton name="status" value="open" variant="ghost" className="col-span-2">
                    未対応に戻す
                  </SubmitButton>
                )}
              </div>
            </ActionForm>
          </CardContent>
        </Card>
      )}

      {canAct && (
        <Card className="mb-3">
          <CardHeader>
            <CardTitle>担当者</CardTitle>
          </CardHeader>
          <CardContent>
            <ActionForm action={assignTask} className="flex flex-wrap gap-2">
              <input type="hidden" name="orgSlug" value={orgSlug} />
              <input type="hidden" name="taskId" value={task.id} />
              {assignable.length > 0 ? (
                <>
                  <Select name="assignee" defaultValue={task.assigned_to ?? ""} className="flex-1" aria-label="担当者">
                    <option value="">未割当</option>
                    {assignable.map(([id, name]) => (
                      <option key={id} value={id}>
                        {name}
                      </option>
                    ))}
                  </Select>
                  <SubmitButton variant="outline">変更</SubmitButton>
                </>
              ) : (
                <>
                  <input type="hidden" name="assignee" value="me" />
                  <SubmitButton variant="outline" disabled={task.assigned_to === ctx.userId}>
                    自分を担当にする
                  </SubmitButton>
                </>
              )}
            </ActionForm>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>この顧客への連絡履歴</CardTitle>
        </CardHeader>
        <CardContent>
          {logs?.length ? (
            <ul className="grid gap-2 text-sm">
              {logs.map((l) => (
                <li key={l.id} className="rounded-md border p-2">
                  <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <span>{formatJpDateTime(l.contacted_at, ctx.org.timezone)}</span>
                    <span>{CHANNEL_LABELS[l.channel]}</span>
                    <span>{OUTCOME_LABELS[l.outcome]}</span>
                    <span>{(l.staff as { display_name: string } | null)?.display_name}</span>
                  </div>
                  {l.content && <p className="mt-1 whitespace-pre-wrap">{l.content}</p>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">連絡履歴はまだありません。</p>
          )}
        </CardContent>
      </Card>
    </>
  );
}
