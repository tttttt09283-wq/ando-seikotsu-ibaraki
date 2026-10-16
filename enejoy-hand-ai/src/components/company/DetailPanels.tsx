"use client";

import Link from "next/link";
import { getMember, TENANT } from "@/tenant";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { formatDateTime, formatJpyPrecise, relativeFromNow } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { Task } from "@/lib/types";
import { ActivityStream } from "./ActivityStream";
import { AGENT_STATUS_JA, TASK_STATUS_META } from "./labels";
import { Avatar, StatusChip } from "./MemberParts";
import { useCompany, useNow } from "./StateProvider";

export function TaskStatusChip({ status }: { status: Task["status"] }) {
  const meta = TASK_STATUS_META[status];
  return <span className={cn("inline-flex rounded-md px-1.5 py-0.5 text-[11px] font-semibold", meta.chip)}>{meta.label}</span>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-muted-foreground text-xs font-semibold tracking-wider">{title}</h3>
      {children}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="bg-secondary/60 rounded-lg px-3 py-2">
      <div className="text-muted-foreground text-[11px]">{label}</div>
      <div className="font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function MemberPanel({ id }: { id: string }) {
  const { snapshot, openTask } = useCompany();
  const now = useNow(5000);
  const m = snapshot.members.find((x) => x.id === id);
  if (!m) return null;
  const boss = m.reportsTo ? getMember(m.reportsTo) : undefined;
  const tasks = snapshot.tasks
    .filter((t) => t.assigneeId === id || t.reviewerId === id)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const taskIds = new Set(tasks.map((t) => t.id));

  return (
    <>
      <SheetHeader>
        <div className="flex items-center gap-3">
          <Avatar member={m} size="lg" />
          <div className="min-w-0">
            <SheetTitle>{m.name}</SheetTitle>
            <SheetDescription>
              {m.kana && <span className="mr-2">{m.kana}</span>}
              {m.title}
            </SheetDescription>
          </div>
        </div>
      </SheetHeader>
      <div className="flex-1 space-y-6 overflow-y-auto p-5">
        {!m.isHuman && (
          <div className="flex flex-wrap items-center gap-2">
            <StatusChip status={m.status} />
            <span className="text-sm">
              {m.status !== "HUMAN" && AGENT_STATUS_JA[m.status]}：{m.statusDetail}
            </span>
          </div>
        )}
        {m.status === "STANDBY" && (
          <p className="rounded-lg border border-dashed p-3 text-sm">
            この社員は待機中です。有効化には追加費用が発生するため、<strong>承認が必須</strong>です。司令塔に「増員を検討して」と指示すると、業務量を分析して必要な場合のみ提案します。
          </p>
        )}

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Stat label="所属" value={m.teamName} />
          <Stat label="上長" value={boss?.name ?? "—"} />
          <Stat label="完了Task" value={m.completedCount} />
          <Stat label="実行中Task" value={m.activeTaskCount} />
          <Stat label="最終活動" value={m.lastActiveAt ? relativeFromNow(m.lastActiveAt, now) : "—"} />
          {!m.isHuman && <Stat label="1日のTask上限" value={`${m.dailyTaskLimit}件`} />}
          {!m.isHuman && <Stat label="API使用量" value={`${m.usage.tokens.toLocaleString("ja-JP")} tok`} />}
          {!m.isHuman && (
            <Stat label={`AIコスト${snapshot.mode === "demo" ? "（推定）" : ""}`} value={formatJpyPrecise(m.usage.costJpy)} />
          )}
        </div>

        {m.persona && (
          <Section title="人物像">
            <p className="text-sm leading-relaxed">{m.persona}</p>
          </Section>
        )}

        <Section title="担当領域">
          <div className="flex flex-wrap gap-1.5">
            {m.skills.map((s) => (
              <Badge key={s} variant="secondary">
                {s}
              </Badge>
            ))}
          </div>
        </Section>

        {!m.isHuman && (
          <Section title={`関わっているTask（${tasks.length}）`}>
            {tasks.length === 0 ? (
              <p className="text-muted-foreground text-sm">まだTaskはありません。</p>
            ) : (
              <ul className="divide-y rounded-lg border">
                {tasks.slice(0, 12).map((t) => (
                  <li key={t.id}>
                    <button type="button" onClick={() => openTask(t.id)} className="hover:bg-accent flex w-full items-center gap-2 px-3 py-2 text-left text-sm">
                      <TaskStatusChip status={t.status} />
                      <span className="min-w-0 flex-1 truncate">{t.title}</span>
                      <span className="text-muted-foreground shrink-0 text-[11px]">
                        {t.assigneeId === id ? "担当" : "レビュー"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        )}

        <Section title="活動ログ">
          <ActivityStream limit={30} filter={(a) => a.actorId === id || (a.taskId ? taskIds.has(a.taskId) : false)} />
        </Section>
      </div>
    </>
  );
}

function TaskPanel({ id }: { id: string }) {
  const { snapshot, openMember } = useCompany();
  const t = snapshot.tasks.find((x) => x.id === id);
  if (!t) {
    return (
      <SheetHeader>
        <SheetTitle>Taskが見つかりません</SheetTitle>
        <SheetDescription>表示期間外の古いTaskの可能性があります。</SheetDescription>
      </SheetHeader>
    );
  }
  const project = snapshot.projects.find((p) => p.id === t.projectId);
  const approval = snapshot.approvals.find((a) => a.taskId === t.id && a.status === "PENDING");
  const deps = snapshot.tasks.filter((x) => x.commandId === t.commandId && t.dependsOn.includes(x.key));
  const people = [
    { role: "担当", id: t.assigneeId },
    { role: "レビュー", id: t.reviewerId },
  ];
  const units = (t.businessUnits ?? []).map((u) => TENANT.businessUnits.find((x) => x.id === u)?.short).filter(Boolean);

  return (
    <>
      <SheetHeader>
        <div className="flex flex-wrap items-center gap-2">
          <TaskStatusChip status={t.status} />
          {t.mode === "demo" && <Badge variant="demo">DEMO</Badge>}
          {t.requiresApproval && <Badge variant="outline">承認必須</Badge>}
          {t.confidential && <Badge variant="outline">機密（閲覧制限）</Badge>}
        </div>
        <SheetTitle>{t.title}</SheetTitle>
        <SheetDescription>{project?.title}</SheetDescription>
      </SheetHeader>
      <div className="flex-1 space-y-6 overflow-y-auto p-5">
        <p className="text-sm">{t.description}</p>
        {units.length > 0 && <p className="text-muted-foreground text-xs">対象部門：{units.join("／")}</p>}
        <div className="grid grid-cols-2 gap-2">
          {people.map((p) => {
            const m = getMember(p.id);
            return (
              <button key={p.role} type="button" onClick={() => openMember(p.id)} className="bg-secondary/60 hover:bg-accent rounded-lg px-3 py-2 text-left">
                <div className="text-muted-foreground text-[11px]">{p.role}</div>
                <div className="truncate text-sm font-semibold">{m?.name}</div>
              </button>
            );
          })}
        </div>

        {deps.length > 0 && (
          <Section title="前工程">
            <ul className="space-y-1 text-sm">
              {deps.map((d) => (
                <li key={d.id} className="flex items-center gap-2">
                  <TaskStatusChip status={d.status} /> {d.title}
                </li>
              ))}
            </ul>
          </Section>
        )}

        {t.blockedReason && t.status === "QUEUED" && (
          <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">待機理由：{t.blockedReason}</p>
        )}
        {t.error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">{t.error}</p>}

        <Section title="成果物">
          {t.deliverable ? (
            <pre className="bg-secondary/50 rounded-lg p-4 font-sans text-sm leading-relaxed whitespace-pre-wrap">{t.deliverable}</pre>
          ) : (
            <p className="text-muted-foreground text-sm">まだ提出されていません。</p>
          )}
        </Section>

        {t.reviews.length > 0 && (
          <Section title="レビュー履歴">
            <ul className="space-y-2">
              {t.reviews.map((r, i) => (
                <li key={i} className="rounded-lg border p-3 text-sm">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="font-semibold">{getMember(r.reviewerId)?.name}</span>
                    <Badge variant={r.verdict === "APPROVED" ? "secondary" : "outline"}>{r.verdict === "APPROVED" ? "承認" : "修正依頼"}</Badge>
                    <span className="text-muted-foreground ml-auto text-xs">{formatDateTime(r.at)}</span>
                  </div>
                  {r.comment}
                </li>
              ))}
            </ul>
          </Section>
        )}

        {approval && (
          <Link href="/approvals" className="block rounded-lg border border-amber-400 bg-amber-50 p-3 text-sm font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-100">
            承認待ちです → 承認画面を開く
          </Link>
        )}

        <Section title="処理ログ">
          <ActivityStream limit={50} filter={(a) => a.taskId === t.id} />
        </Section>
        <div className="text-muted-foreground text-xs">
          作成 {formatDateTime(t.createdAt)}
          {t.completedAt && ` ・ 完了 ${formatDateTime(t.completedAt)}`} ・ 修正 {t.revisionCount}回 ・ ID {t.id}
        </div>
      </div>
    </>
  );
}

export function DetailPanels() {
  const { selection, closePanel } = useCompany();
  return (
    <Sheet open={selection !== null} onOpenChange={(o) => !o && closePanel()}>
      <SheetContent>
        {selection?.kind === "member" && <MemberPanel id={selection.id} />}
        {selection?.kind === "task" && <TaskPanel id={selection.id} />}
      </SheetContent>
    </Sheet>
  );
}
