import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { getLimits, type Limits } from "@/config/limits";
import { MemoryStore } from "@/lib/store/store";
import { buildSnapshot, deriveMemberViews } from "@/lib/view";
import { DemoExecutor } from "./demo-executor";
import { decideApproval, EngineError, resetDemoData, submitCommand, tick, type EngineDeps } from "./engine";
import type { Executor } from "./executor";

const TIMING = { analyzeMs: 1000, thinkMs: 1000, workMs: 1000, reviewMs: 1000, reportMs: 1000 };

function setup(overrides: Partial<Limits> = {}, executor: Executor = new DemoExecutor()) {
  let now = new Date("2026-10-15T00:00:00Z");
  const deps: EngineDeps = {
    store: new MemoryStore(),
    executor,
    limits: { ...getLimits(), ...overrides },
    timing: TIMING,
    now: () => now,
    costOf: (u) => (u.inputTokens + u.outputTokens) * 0.001,
  };
  const advance = (ms: number) => {
    now = new Date(now.getTime() + ms);
  };
  /** 時間を進めながら、状態が落ち着くまで処理を回す */
  const runUntilIdle = async (maxSteps = 200) => {
    for (let i = 0; i < maxSteps; i++) {
      advance(1000);
      await tick(deps);
      const d = await deps.store.read();
      const open = d.commands.some((c) => ["ANALYZING", "RUNNING", "REPORTING"].includes(c.status));
      if (!open) return d;
    }
    throw new Error("did not settle");
  };
  return { deps, advance, runUntilIdle };
}

const cmd = (text: string) => ({ text, clientRequestId: randomUUID() });

describe("CHAD CORE pipeline (DEMO MODE)", () => {
  let env: ReturnType<typeof setup>;
  beforeEach(() => {
    env = setup();
  });

  it("runs CEO指示 → 分析 → Project → Task → 実行 → レビュー → 報告 end to end", async () => {
    const { deps, runUntilIdle } = env;
    await submitCommand(deps, cmd("チャド、MISSION 001を進めて"));
    const data = await runUntilIdle();

    const command = data.commands[0];
    expect(command.analysis?.intent).toBe("mission");
    expect(command.status).toBe("COMPLETED");
    expect(data.projects).toHaveLength(1);
    expect(data.tasks).toHaveLength(6);

    // 外部送信を伴うTaskはCEO承認待ちで止まり、勝手に実行されない
    const sendTask = data.tasks.find((t) => t.key === "first-contact")!;
    expect(sendTask.status).toBe("WAITING_APPROVAL");
    expect(data.approvals.filter((a) => a.status === "PENDING")).toHaveLength(1);
    expect(data.tasks.filter((t) => t.status === "DONE")).toHaveLength(5);

    // マネージャーの修正依頼 → 修正 → 承認 が行われている
    const offer = data.tasks.find((t) => t.key === "offer")!;
    expect(offer.reviews.map((r) => r.verdict)).toEqual(["REVISION", "APPROVED"]);
    expect(offer.deliverable).toContain("【修正】");

    // 報告がCEOへ届いている
    expect(data.messages.some((m) => m.role === "chad" && m.kind === "report")).toBe(true);
    // すべての記録がデモデータとして記録されている
    for (const x of [...data.tasks, ...data.activities, ...data.usage, ...data.messages]) expect(x.mode).toBe("demo");
    expect(data.usage.every((u) => u.estimated)).toBe(true);
  });

  it("completes the project only after CEO approval, and does not count first-yen", async () => {
    const { deps, runUntilIdle } = env;
    await submitCommand(deps, cmd("MISSION 001を進めて"));
    let data = await runUntilIdle();
    expect(data.projects[0].status).toBe("ACTIVE");
    const approval = data.approvals[0];
    await decideApproval(deps, approval.id, "APPROVED");
    data = await deps.store.read();
    expect(data.tasks.find((t) => t.key === "first-contact")!.status).toBe("DONE");
    expect(data.projects[0].status).toBe("COMPLETED");
    const snap = buildSnapshot(data, "demo", deps.now(), deps.limits);
    expect(snap.mission.progress.achieved).toBe(4);
    expect(snap.mission.firstYenAchieved).toBe(false);
    // 二重承認はできない
    await expect(decideApproval(deps, approval.id, "APPROVED")).rejects.toBeInstanceOf(EngineError);
  });

  it("sends the task back for rework when CEO requests changes", async () => {
    const { deps, runUntilIdle } = env;
    await submitCommand(deps, cmd("SNSの集客方法を分析して"));
    let data = await runUntilIdle();
    const approval = data.approvals.find((a) => a.status === "PENDING")!;
    expect(approval.category).toBe("sns_post");
    await decideApproval(deps, approval.id, "CHANGES_REQUESTED", "表現をもう少し柔らかく");
    data = await runUntilIdle();
    const post = data.tasks.find((t) => t.key === "first-post")!;
    expect(post.status).toBe("WAITING_APPROVAL");
    expect(post.reviews.some((r) => r.reviewerId === "ceo")).toBe(true);
    expect(data.approvals.filter((a) => a.status === "PENDING")).toHaveLength(1);
  });

  it("answers status reports directly from saved data without creating tasks", async () => {
    const { deps, runUntilIdle } = env;
    await submitCommand(deps, cmd("今日の仕事を報告して"));
    const data = await runUntilIdle();
    expect(data.commands[0].status).toBe("ANSWERED");
    expect(data.tasks).toHaveLength(0);
    expect(data.messages.at(-1)?.text).toContain("CHAD 状況報告");
  });

  it("classifies the CEO example commands", async () => {
    const { classifyIntent } = await import("./demo-playbook");
    expect(classifyIntent("今日の会社を動かして")).toBe("mission");
    expect(classifyIntent("新しい商品を考えて")).toBe("product");
    expect(classifyIntent("営業戦略を立てて")).toBe("sales");
    expect(classifyIntent("AI業務改善サービスを作って")).toBe("automation");
    expect(classifyIntent("SNSの集客方法を分析して")).toBe("sns");
    expect(classifyIntent("今日の仕事を報告して")).toBe("status_report");
    expect(classifyIntent("ＭＩＳＳＩＯＮ　００１を進めて")).toBe("mission");
  });
});

describe("safety limits", () => {
  it("deduplicates the same clientRequestId (double submit)", async () => {
    const { deps } = setup();
    const input = cmd("営業戦略を立てて");
    const a = await submitCommand(deps, input);
    const b = await submitCommand(deps, input);
    expect(b.duplicate).toBe(true);
    expect(b.command.id).toBe(a.command.id);
    expect((await deps.store.read()).commands).toHaveLength(1);
  });

  it("never exceeds the company-wide concurrency limit", async () => {
    const { deps, advance } = setup({ maxConcurrentTasks: 1 });
    await submitCommand(deps, cmd("営業戦略を立てて"));
    await submitCommand(deps, cmd("AI業務改善サービスを作って"));
    for (let i = 0; i < 80; i++) {
      advance(500);
      await tick(deps);
      const d = await deps.store.read();
      const active = d.tasks.filter((t) => ["THINKING", "WORKING", "IN_REVIEW", "REVISION"].includes(t.status));
      expect(active.length).toBeLessThanOrEqual(1);
    }
  });

  it("does not process the same task twice when ticks run concurrently", async () => {
    let workCalls = 0;
    const base = new DemoExecutor();
    const counting: Executor = {
      mode: "demo",
      plan: (t, c) => base.plan(t, c),
      review: (t) => base.review(t),
      report: (i) => base.report(i),
      work: async (i) => {
        workCalls++;
        await new Promise((r) => setTimeout(r, 5));
        return base.work(i);
      },
    };
    const { deps, advance } = setup({}, counting);
    await submitCommand(deps, cmd("お金の状況を確認して"));
    for (let i = 0; i < 40; i++) {
      advance(1000);
      await Promise.all([tick(deps), tick(deps), tick(deps)]);
    }
    const d = await deps.store.read();
    expect(d.tasks.every((t) => t.status === "DONE")).toBe(true);
    // 財務プレイブックは2Task・修正なし → 作業は2回だけ
    expect(workCalls).toBe(2);
  });

  it("rejects commands beyond the daily limit and the active-command limit", async () => {
    const { deps } = setup({ maxCommandsPerDay: 2, maxActiveCommands: 5 });
    await submitCommand(deps, cmd("営業戦略を立てて"));
    await submitCommand(deps, cmd("新しい商品を考えて"));
    await expect(submitCommand(deps, cmd("SNSを分析して"))).rejects.toMatchObject({ code: "LIMIT" });

    const env2 = setup({ maxActiveCommands: 1 });
    await submitCommand(env2.deps, cmd("営業戦略を立てて"));
    await expect(submitCommand(env2.deps, cmd("新しい商品を考えて"))).rejects.toMatchObject({ code: "LIMIT" });
  });

  it("retries a failing task with a cap, then halts the company after consecutive failures", async () => {
    const base = new DemoExecutor();
    const broken: Executor = {
      mode: "demo",
      plan: (t, c) => base.plan(t, c),
      review: (t) => base.review(t),
      report: (i) => base.report(i),
      work: async () => {
        throw new Error("API timeout");
      },
    };
    const { deps, advance } = setup({ maxAttempts: 2, haltAfterConsecutiveFailures: 2 }, broken);
    await submitCommand(deps, cmd("営業戦略を立てて"));
    for (let i = 0; i < 60; i++) {
      advance(5000);
      await tick(deps);
    }
    const d = await deps.store.read();
    expect(d.safety.halted).toBe(true);
    expect(d.tasks.some((t) => t.status === "FAILED")).toBe(true);
    // 依存先が失敗したTaskは実行されず中止される
    expect(d.tasks.filter((t) => t.status === "CANCELLED").length).toBeGreaterThan(0);
    await expect(submitCommand(deps, cmd("新しい商品を考えて"))).rejects.toMatchObject({ code: "HALTED" });
    const views = deriveMemberViews(d, "demo");
    expect(views.find((v) => v.id === "takahashi")?.status).toBe("ERROR");
  });

  it("halts when the daily budget is reached", async () => {
    const { deps, runUntilIdle } = setup({ dailyBudgetJpy: 1 });
    await submitCommand(deps, cmd("MISSION 001を進めて"));
    const d = await runUntilIdle().catch(async () => deps.store.read());
    expect(d.safety.halted).toBe(true);
    expect(d.safety.reason).toContain("予算");
  });

  it("stops review loops at the revision cap", async () => {
    const base = new DemoExecutor();
    const picky: Executor = {
      mode: "demo",
      plan: (t, c) => base.plan(t, c),
      work: (i) => base.work(i),
      report: (i) => base.report(i),
      review: async (t) => ({ verdict: "REVISION", comment: "やり直し", usage: { model: "x", inputTokens: 1, outputTokens: 1 } }),
    };
    const { deps, runUntilIdle } = setup({ maxRevisions: 2 }, picky);
    await submitCommand(deps, cmd("お金の状況を確認して"));
    const d = await runUntilIdle();
    const first = d.tasks.find((t) => t.key === "status")!;
    expect(first.status).toBe("FAILED");
    expect(first.revisionCount).toBe(2);
  });
});

describe("staffing and member status", () => {
  it("keeps standby employees in STANDBY and requires CEO approval to activate", async () => {
    const { deps, runUntilIdle } = setup();
    // 業務量を作ってから増員を相談する
    await submitCommand(deps, cmd("営業戦略を立てて"));
    await submitCommand(deps, cmd("SNSの集客方法を分析して"));
    await tick(deps);
    let d = await deps.store.read();
    expect(deriveMemberViews(d, "demo").find((m) => m.id === "kato")?.status).toBe("STANDBY");

    d = await runUntilIdle();
    await submitCommand(deps, cmd("営業部の人手が足りないなら増員して"));
    d = await runUntilIdle();
    const reply = d.messages.at(-1)!.text;
    // 業務が片付いた後なので、CHADは反対意見を述べ増員しない
    expect(reply).toContain("増員は不要");
    expect(d.approvals.filter((a) => a.category === "new_agent")).toHaveLength(0);
  });

  it("proposes activation when sales is overloaded and activates only after approval", async () => {
    const { deps, advance } = setup({ maxConcurrentTasks: 1 });
    await submitCommand(deps, cmd("MISSION 001を進めて"));
    advance(1500);
    await tick(deps); // 計画のみ（営業部に多数のTaskが積まれる）
    await submitCommand(deps, cmd("増員を検討して"));
    advance(1500);
    await tick(deps);
    let d = await deps.store.read();
    const proposal = d.approvals.find((a) => a.category === "new_agent");
    expect(proposal?.memberId).toBe("kato");
    expect(deriveMemberViews(d, "demo").find((m) => m.id === "kato")?.status).toBe("STANDBY");
    await decideApproval(deps, proposal!.id, "APPROVED");
    d = await deps.store.read();
    expect(deriveMemberViews(d, "demo").find((m) => m.id === "kato")?.active).toBe(true);
  });

  it("derives WORKING / REVIEWING from real task state, and reset clears demo data", async () => {
    const { deps, advance } = setup();
    await submitCommand(deps, cmd("お金の状況を確認して"));
    advance(1000);
    await tick(deps); // plan → THINKING
    let d = await deps.store.read();
    expect(deriveMemberViews(d, "demo").find((m) => m.id === "watanabe")?.status).toBe("THINKING");
    advance(1000);
    await tick(deps); // → WORKING
    d = await deps.store.read();
    expect(deriveMemberViews(d, "demo").find((m) => m.id === "watanabe")?.status).toBe("WORKING");
    advance(1000);
    await tick(deps); // → IN_REVIEW
    d = await deps.store.read();
    const views = deriveMemberViews(d, "demo");
    expect(views.find((m) => m.id === "yamamoto")?.status).toBe("REVIEWING");
    expect(views.find((m) => m.id === "sato")?.status).toBe("IDLE");

    await resetDemoData(deps);
    d = await deps.store.read();
    expect(d.tasks).toHaveLength(0);
    expect(d.audit.some((a) => a.action === "demo.reset")).toBe(true);
  });
});
