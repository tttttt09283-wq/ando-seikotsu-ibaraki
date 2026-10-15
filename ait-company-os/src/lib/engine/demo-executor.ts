import { getMember, MEMBERS } from "@/config/company";
import type { ChadAnalysis } from "@/lib/types";
import {
  APPROVAL_CATEGORY_LABEL,
  classifyIntent,
  DEMO_DELIVERABLE_HEADER,
  extraConcern,
  findTemplate,
  INTENT_LABEL,
  PLAYBOOKS,
} from "./demo-playbook";
import type { CompanyContext, Executor, Plan, ReportInput, Usage, WorkInput } from "./executor";

export const DEMO_MODEL = "demo-template";

/** デモの使用量は文字数からの推定（実際のAPI呼び出しは行わない） */
function estimateUsage(inputChars: number, outputChars: number): Usage {
  return {
    model: DEMO_MODEL,
    inputTokens: Math.round(800 + inputChars * 1.2),
    outputTokens: Math.round(outputChars * 1.3),
  };
}

function isMostlyEnglish(text: string): boolean {
  const letters = text.replace(/[\s\d\p{P}]/gu, "");
  if (letters.length < 4) return false;
  const ascii = letters.replace(/[^A-Za-z]/g, "").length;
  return ascii / letters.length > 0.8;
}

function names(ids: string[]): string {
  return [...new Set(ids)].map((id) => getMember(id)?.name ?? id).join("・");
}

function planStaffing(text: string, ctx: CompanyContext): Plan {
  const analysis: ChadAnalysis = {
    intent: "staffing",
    intentLabel: INTENT_LABEL.staffing,
    understanding: "AI組織の人員配置を見直す指示と判断しました。",
    missionCheck: `MISSION 001の進捗：${ctx.missionProgressLabel}`,
    priority: "中",
    priorityReason: "業務量に対して人員が不足していれば売上づくりが止まるため。",
    concern: "増員は費用が発生するため、業務量の裏付けがある場合のみ提案します。",
  };
  const salesLoad = ["takahashi", "nakamura"].reduce((n, id) => n + (ctx.workloadByMember[id] ?? 0), 0);
  const candidate = MEMBERS.find(
    (m) => m.tier === "staff" && ctx.standbyMemberIds.includes(m.id) && !ctx.pendingStaffingMemberIds.includes(m.id),
  );
  const loadLine = `現在の未完了Task：営業部 ${salesLoad}件、会社全体 ${ctx.activeTaskCount + ctx.queuedTaskCount}件。`;

  if (ctx.pendingStaffingMemberIds.length > 0) {
    return {
      analysis,
      reply: `${loadLine}\n増員の提案はすでに承認待ちです。承認画面で判断をお願いします。重複した提案は出しません。`,
      tasks: [],
    };
  }
  if (!candidate) {
    return {
      analysis,
      reply: `${loadLine}\n待機中の増員候補はいません。今の人数で回せているので、追加費用をかける必要はありません。`,
      tasks: [],
    };
  }
  if (salesLoad < 3) {
    return {
      analysis,
      reply: `${loadLine}\n反対意見です。今の業務量なら増員は不要です。${candidate.name}（${candidate.title}）は待機のままにして、営業部の未完了Taskが3件を超えたら有効化を提案します。`,
      tasks: [],
    };
  }
  return {
    analysis,
    reply: `${loadLine}\n営業部に業務が集中しています。${candidate.name}（${candidate.title}）の有効化を提案し、CEO承認を依頼しました。承認されるまでは稼働させません。`,
    tasks: [],
    staffingProposal: {
      memberId: candidate.id,
      reason: `営業部の未完了Taskが${salesLoad}件あり、SNS運用が後回しになっている。`,
      expectedEffect: "SNS投稿の作成・運用を分担し、営業担当が提案活動に集中できる。",
      monthlyCostJpy: 1500,
    },
  };
}

export class DemoExecutor implements Executor {
  readonly mode = "demo" as const;

  async plan(text: string, ctx: CompanyContext) {
    const intent = classifyIntent(text);
    const english = isMostlyEnglish(text);
    let plan: Plan;

    if (intent === "status_report") {
      plan = {
        analysis: {
          intent,
          intentLabel: INTENT_LABEL.status_report,
          understanding: "現在の会社の状況報告を求める指示と判断しました。",
          missionCheck: `MISSION 001の進捗：${ctx.missionProgressLabel}`,
          priority: "高",
          priorityReason: "CEOの状況把握は最優先。新しいTaskは作らず、記録から即答します。",
        },
        reply: ctx.statusSummary,
        tasks: [],
      };
    } else if (intent === "staffing") {
      plan = planStaffing(text, ctx);
    } else {
      const pb = PLAYBOOKS[intent];
      const concern = [pb.concern, extraConcern(text)].filter(Boolean).join(" ") || undefined;
      const assignees = pb.tasks.map((t) => t.assigneeId);
      const approvals = pb.tasks
        .filter((t) => t.requiresApproval)
        .map((t) => APPROVAL_CATEGORY_LABEL[t.requiresApproval!]);
      plan = {
        analysis: {
          intent,
          intentLabel: pb.label,
          understanding: pb.understanding,
          missionCheck: `MISSION 001（月10万円・最初の1円）との関係を確認。現在の進捗：${ctx.missionProgressLabel}`,
          priority: pb.priority,
          priorityReason: pb.priorityReason,
          concern,
        },
        reply: [
          `了解です、CEO。${pb.understanding}`,
          `優先度は「${pb.priority}」。${pb.priorityReason}`,
          `「${pb.project!.title}」として${pb.tasks.length}件のTaskに分解し、${names(assignees)}に割り当てました。成果物は各マネージャーがレビューしてから私が集約します。`,
          ...(approvals.length > 0
            ? [`※「${approvals.join("・")}」はCEO承認なしには実行しません。`]
            : []),
          ...(concern ? [`ひとつ意見です：${concern}`] : []),
        ].join("\n"),
        project: pb.project,
        tasks: pb.tasks.map((t) => ({
          key: t.key,
          title: t.title,
          description: t.description,
          department: t.department,
          assigneeId: t.assigneeId,
          dependsOn: t.dependsOn ?? [],
          milestone: t.milestone,
          requiresApproval: t.requiresApproval,
          demoRevision: t.demoRevision,
        })),
      };
    }

    if (english) {
      plan.reply = `Understood, CEO. I'll reply in English when you write in English. (DEMO MODE: the plan below is generated from Japanese templates.)\n\n${plan.reply}`;
    }
    return { plan, usage: estimateUsage(text.length + ctx.statusSummary.length, plan.reply.length) };
  }

  async work(input: WorkInput) {
    const { task, upstream } = input;
    const tpl = findTemplate(task.intent, task.key);
    const body = tpl ? tpl.body(task.revisionCount) : `■ ${task.title}\n${task.description}`;
    const refs =
      upstream.length > 0 ? `参照した前工程：${upstream.map((u) => `「${u.title}」`).join("、")}\n\n` : "";
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
    const failed = tasks.filter((t) => t.status === "FAILED");
    const revised = tasks.filter((t) => t.reviews.some((r) => r.verdict === "REVISION"));
    const pending = approvals.filter((a) => a.status === "PENDING");

    const firstLine = (t: (typeof tasks)[number]) =>
      (t.deliverable ?? "")
        .split("\n")
        .map((l) => l.trim())
        .find((l) => l && !l.startsWith("【デモ成果物】") && !l.startsWith("参照した前工程")) ?? "";

    const text = [
      `【CHAD報告（デモ）】${project.title}`,
      "",
      `■ 結果：${tasks.length}件中 ${done.length}件完了${waiting.length ? `、${waiting.length}件がCEO承認待ち` : ""}${failed.length ? `、${failed.length}件失敗` : ""}`,
      "",
      "■ 主な成果",
      ...done.map((t) => `・${t.title}（${getMember(t.assigneeId)?.name}）：${firstLine(t)}`),
      ...(revised.length
        ? ["", "■ レビューで改善した点", ...revised.map((t) => `・${t.title}：${t.reviews.find((r) => r.verdict === "REVISION")?.comment}`)]
        : []),
      ...(pending.length
        ? ["", "■ CEOの判断が必要です", ...pending.map((a) => `・${a.title}（承認画面で確認できます）`)]
        : []),
      ...(failed.length ? ["", "■ 問題", ...failed.map((t) => `・${t.title}：${t.error ?? "失敗"}`)] : []),
      "",
      "■ 次の一手",
      pending.length
        ? "承認をいただければ、すぐ次の工程に進めます。"
        : "この成果をもとに、次の指示をお待ちしています。売上に一番近いところから進めましょう。",
    ].join("\n");
    return { text, usage: estimateUsage(tasks.reduce((n, t) => n + (t.deliverable?.length ?? 0), 0), text.length) };
  }
}
