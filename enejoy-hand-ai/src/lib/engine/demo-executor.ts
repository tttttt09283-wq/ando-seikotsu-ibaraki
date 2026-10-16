import { APPROVAL_CATEGORY_LABEL } from "@/config/approvals";
import type { IntentPlaybook, TaskTemplate } from "@/lib/tenant-types";
import type { CommanderAnalysis } from "@/lib/types";
import { getMember, TENANT } from "@/tenant";
import type { CompanyContext, Executor, Plan, ReportInput, StaffingProposal, Usage, WorkInput } from "./executor";

/**
 * DEMO MODE の司令塔・AI社員。会社ごとの判断ルール・成果物テンプレート（TENANT.playbook）から内容を作る。
 * 実際のAPI呼び出しは行わず、生成物はすべて「デモデータ」と明示する。
 */

export const DEMO_MODEL = "demo-template";

export const DEMO_DELIVERABLE_HEADER =
  "【デモ成果物】DEMO MODEのテンプレート出力です。実際の調査・分析結果ではありません（数字はすべて架空）。";

/** デモの使用量は文字数からの推定 */
function estimateUsage(inputChars: number, outputChars: number): Usage {
  return {
    model: DEMO_MODEL,
    inputTokens: Math.round(800 + inputChars * 1.2),
    outputTokens: Math.round(outputChars * 1.3),
  };
}

function names(ids: string[]): string {
  return [...new Set(ids)].map((id) => getMember(id)?.name ?? id).join("・");
}

const PB = TENANT.playbook;
const OPERATOR_FAMILY_NAME = (getMember(TENANT.people.operatorId)?.name ?? "").split(" ")[0];

export function findTemplate(intent: string, key: string): TaskTemplate | undefined {
  return PB.playbooks[intent]?.tasks.find((t) => t.key === key);
}

function teamLoad(ctx: CompanyContext, teamId: string): number {
  return TENANT.members
    .filter((m) => m.teamId === teamId)
    .reduce((n, m) => n + (ctx.workloadByMember[m.id] ?? 0), 0);
}

/** 増員の提案：業務量または指示の種類に裏付けがある場合のみ */
function staffingProposalFor(intent: string, ctx: CompanyContext): StaffingProposal | undefined {
  for (const rule of PB.staffing) {
    if (!ctx.standbyMemberIds.includes(rule.memberId)) continue;
    if (ctx.pendingStaffingMemberIds.includes(rule.memberId)) continue;
    const byIntent = rule.triggerIntents.includes(intent);
    const byLoad =
      intent === "staffing" && rule.loadTeamId != null && teamLoad(ctx, rule.loadTeamId) >= (rule.loadThreshold ?? Infinity);
    if (byIntent || byLoad) {
      return { memberId: rule.memberId, reason: rule.reason, expectedEffect: rule.expectedEffect, monthlyCostJpy: rule.monthlyCostJpy };
    }
  }
  return undefined;
}

function planStaffing(ctx: CompanyContext): Plan {
  const analysis: CommanderAnalysis = {
    intent: "staffing",
    intentLabel: PB.intentLabels.staffing ?? "人員配置の検討",
    understanding: "AI部門の人員配置を見直す指示と判断しました。",
    missionCheck: `MISSION 001の進捗：${ctx.missionProgressLabel}`,
    priority: "中",
    priorityReason: "業務量に対して人員が足りなければ、会社の土台づくりが止まるため。",
    concern: "増員は費用が発生するため、業務量の裏付けがある場合のみ提案します。",
  };
  const loads = TENANT.teams
    .filter((t) => t.id !== "hq")
    .map((t) => `${t.short} ${teamLoad(ctx, t.id)}件`)
    .join("、");
  const loadLine = `現在の未完了Task：${loads}（全体 ${ctx.activeTaskCount + ctx.queuedTaskCount}件）。`;

  if (ctx.pendingStaffingMemberIds.length > 0) {
    return { analysis, reply: `${loadLine}\n増員の提案はすでに承認待ちです。重複した提案は出しません。`, tasks: [] };
  }
  const proposal = staffingProposalFor("staffing", ctx);
  if (!proposal) {
    const standby = ctx.standbyMemberIds.map((id) => getMember(id)?.name).filter(Boolean);
    return {
      analysis,
      reply: [
        loadLine,
        standby.length
          ? `反対意見です。今の業務量なら増員は不要です。${standby.join("・")}は待機のままにして、業務量が増えたら有効化を提案します。`
          : "待機中の増員候補はいません。今の人数で回せているので、追加費用をかける必要はありません。",
      ].join("\n"),
      tasks: [],
    };
  }
  const m = getMember(proposal.memberId);
  return {
    analysis,
    reply: `${loadLine}\n業務が集中しています。${m?.name}（${m?.title}）の有効化を提案し、承認を依頼しました。承認されるまでは稼働させません。`,
    tasks: [],
    staffingProposal: proposal,
  };
}

function planFromPlaybook(text: string, pb: IntentPlaybook, ctx: CompanyContext): Plan {
  const concern = [pb.concern, PB.extraConcern(text)].filter(Boolean).join(" ") || undefined;
  const approvals = [...new Set(pb.tasks.filter((t) => t.requiresApproval).map((t) => APPROVAL_CATEGORY_LABEL[t.requiresApproval!]))];
  const standbyAssignees = [...new Set(pb.tasks.map((t) => t.assigneeId))].filter((id) => ctx.standbyMemberIds.includes(id));
  const staffingProposal = staffingProposalFor(pb.intent, ctx);
  const units = [...new Set(pb.tasks.flatMap((t) => t.businessUnits ?? []))]
    .map((id) => TENANT.businessUnits.find((u) => u.id === id)?.short)
    .filter(Boolean);

  return {
    analysis: {
      intent: pb.intent,
      intentLabel: pb.label,
      understanding: pb.understanding,
      missionCheck: `MISSION 001（評価基準とクラスの確定）と${TENANT.revenueTarget.label}との関係を確認。MISSION進捗：${ctx.missionProgressLabel}`,
      priority: pb.priority,
      priorityReason: pb.priorityReason,
      concern,
    },
    reply: [
      `了解です、${OPERATOR_FAMILY_NAME}さん。${pb.understanding}`,
      `優先度は「${pb.priority}」。${pb.priorityReason}`,
      `「${pb.project.title}」として${pb.tasks.length}件のTaskに分け、${names(pb.tasks.map((t) => t.assigneeId))}に割り当てました。成果物はリーダーがレビューしてから私がまとめて報告します。`,
      ...(units.length ? [`部門別（${units.join("／")}）に分けて扱います。`] : []),
      ...(approvals.length ? [`※「${approvals.join("・")}」は承認なしには実行・確定しません。`] : []),
      ...(standbyAssignees.length
        ? [`※ 担当の${names(standbyAssignees)}は待機中のため、承認されるまで着手しません。`]
        : []),
      ...(concern ? [`ひとつ意見です：${concern}`] : []),
    ].join("\n"),
    project: { ...pb.project, issueIds: pb.issueIds ?? [] },
    tasks: pb.tasks.map((t) => ({
      key: t.key,
      title: t.title,
      description: t.description,
      teamId: t.teamId,
      assigneeId: t.assigneeId,
      dependsOn: t.dependsOn ?? [],
      milestone: t.milestone,
      requiresApproval: t.requiresApproval,
      approvalMeta: t.approvalMeta,
      businessUnits: t.businessUnits,
      confidential: t.confidential,
      demoRevision: t.demoRevision,
    })),
    staffingProposal,
  };
}

export class DemoExecutor implements Executor {
  readonly mode = "demo" as const;

  async plan(text: string, ctx: CompanyContext) {
    const intent = PB.classifyIntent(text);
    let plan: Plan;

    if (intent === "status_report") {
      plan = {
        analysis: {
          intent,
          intentLabel: PB.intentLabels.status_report ?? "状況報告",
          understanding: "今日のAI部門の仕事の報告を求める指示と判断しました。",
          missionCheck: `MISSION 001の進捗：${ctx.missionProgressLabel}`,
          priority: "高",
          priorityReason: "統括責任者の状況把握は最優先。新しいTaskは作らず、記録から即答します。",
        },
        reply: ctx.statusSummary,
        tasks: [],
      };
    } else if (intent === "staffing") {
      plan = planStaffing(ctx);
    } else {
      plan = planFromPlaybook(text, PB.playbooks[intent] ?? PB.playbooks.general, ctx);
    }
    return { plan, usage: estimateUsage(text.length + ctx.statusSummary.length, plan.reply.length) };
  }

  async work(input: WorkInput) {
    const { task, upstream } = input;
    const tpl = findTemplate(task.intent, task.key);
    const body = tpl ? tpl.body(task.revisionCount) : `■ ${task.title}\n${task.description}`;
    const refs = upstream.length > 0 ? `参照した前工程：${upstream.map((u) => `「${u.title}」`).join("、")}\n\n` : "";
    const text = `${DEMO_DELIVERABLE_HEADER}\n\n${refs}${body}`;
    const upstreamChars = upstream.reduce((n, u) => n + u.deliverable.length, 0);
    return { text, usage: estimateUsage(task.description.length + upstreamChars, text.length) };
  }

  async review(task: Parameters<Executor["review"]>[0]) {
    const tpl = findTemplate(task.intent, task.key);
    const needsRevision = Boolean(task.demoRevision && task.revisionCount === 0 && tpl?.revisionComment);
    const comment = needsRevision ? tpl!.revisionComment! : (tpl?.approveComment ?? "内容を確認しました。承認します。");
    return {
      verdict: needsRevision ? ("REVISION" as const) : ("APPROVED" as const),
      comment,
      usage: estimateUsage((task.deliverable ?? "").length, comment.length),
    };
  }

  async report(input: ReportInput) {
    const { project, tasks, approvals } = input;
    const done = tasks.filter((t) => t.status === "DONE");
    const waiting = tasks.filter((t) => t.status === "WAITING_APPROVAL");
    const failed = tasks.filter((t) => t.status === "FAILED" || t.status === "CANCELLED");
    const queued = tasks.filter((t) => t.status === "QUEUED");
    const revised = tasks.filter((t) => t.reviews.some((r) => r.verdict === "REVISION"));
    const pending = approvals.filter((a) => a.status === "PENDING");

    const firstLine = (t: (typeof tasks)[number]) =>
      (t.deliverable ?? "")
        .split("\n")
        .map((l) => l.trim())
        .find((l) => l && !l.startsWith("【デモ成果物】") && !l.startsWith("参照した前工程")) ?? "";

    const text = [
      `【司令塔報告（デモ）】${project.title}`,
      "",
      `■ 結果：${tasks.length}件中 ${done.length}件完了${waiting.length ? `、${waiting.length}件が承認待ち` : ""}${queued.length ? `、${queued.length}件が着手待ち` : ""}${failed.length ? `、${failed.length}件が未完了` : ""}`,
      "",
      "■ 主な成果",
      ...(done.length ? done.map((t) => `・${t.title}（${getMember(t.assigneeId)?.name}）：${firstLine(t)}`) : ["・まだ完了したTaskはありません"]),
      ...(revised.length
        ? ["", "■ レビューで改善した点", ...revised.map((t) => `・${t.title}：${t.reviews.find((r) => r.verdict === "REVISION")?.comment}`)]
        : []),
      ...(pending.length
        ? [
            "",
            "■ 判断をお願いします",
            ...pending.map(
              (a) =>
                `・${a.title}（推奨承認者：${a.recommendedApprover === "president" ? "代表 村上" : "統括責任者"}${a.presidentRequired ? "・代表の決裁が必須" : ""}）`,
            ),
          ]
        : []),
      ...(failed.length ? ["", "■ 問題", ...failed.map((t) => `・${t.title}：${t.error ?? "未完了"}`)] : []),
      "",
      "■ 次の一手",
      pending.length
        ? "承認をいただければ、すぐ次の工程に進めます。"
        : "この成果をもとに次の指示をお待ちしています。会社の土台（評価制度）とお金の見える化から順に進めましょう。",
    ].join("\n");
    return { text, usage: estimateUsage(tasks.reduce((n, t) => n + (t.deliverable?.length ?? 0), 0), text.length) };
  }
}
