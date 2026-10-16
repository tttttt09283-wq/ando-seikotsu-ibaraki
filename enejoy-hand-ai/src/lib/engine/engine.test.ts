import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { getLimits, type Limits } from "@/config/limits";
import { MemoryStore } from "@/lib/store/store";
import { buildPresidentSnapshot, buildSnapshot, deriveMemberViews } from "@/lib/view";
import { TENANT } from "@/tenant";
import { DemoExecutor } from "./demo-executor";
import {
  decideApproval,
  EngineError,
  recordSales,
  resetDemoData,
  submitCommand,
  tick,
  type EngineDeps,
} from "./engine";
import type { Executor } from "./executor";
import { revenueProgress } from "./metrics";

const TIMING = { analyzeMs: 1000, thinkMs: 1000, workMs: 1000, reviewMs: 1000, reportMs: 1000 };
const OPERATOR = "iwanaga";
const PRESIDENT = "murakami";

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
  const runUntilIdle = async (maxSteps = 300) => {
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

describe("AI部門のパイプライン（DEMO MODE）", () => {
  let env: ReturnType<typeof setup>;
  beforeEach(() => {
    env = setup();
  });

  it("MISSION 001：指示 → 分析 → Project → Task → 実行 → レビュー → 報告まで進み、確定は承認待ちで止まる", async () => {
    const { deps, runUntilIdle } = env;
    await submitCommand(deps, cmd("MISSION 001を進めて"));
    const data = await runUntilIdle();

    const command = data.commands[0];
    expect(command.analysis?.intent).toBe("mission");
    expect(command.status).toBe("COMPLETED");
    expect(data.projects).toHaveLength(1);
    expect(data.projects[0].issueIds).toContain("i-eval");
    expect(data.tasks).toHaveLength(7);

    // 評価・クラスの確定は承認待ちで止まり、勝手に確定しない
    const decide = data.tasks.find((t) => t.key === "decide")!;
    expect(decide.status).toBe("WAITING_APPROVAL");
    expect(data.tasks.filter((t) => t.status === "DONE")).toHaveLength(6);

    // 承認依頼：まず統括責任者に届き、司令塔は代表の決裁（必須）を推奨する
    const approval = data.approvals.find((a) => a.status === "PENDING")!;
    expect(approval.category).toBe("staff_evaluation");
    expect(approval.currentApprover).toBe("operator");
    expect(approval.recommendedApprover).toBe("president");
    expect(approval.presidentRequired).toBe(true);
    expect(approval.approverReason).toContain("代表の決裁が必要");
    expect(approval.history[0]).toMatchObject({ action: "REQUESTED", actor: "fujita" });

    // リーダーの修正依頼 → 修正 → 承認
    const axes = data.tasks.find((t) => t.key === "axes")!;
    expect(axes.reviewerId).toBe("morimoto");
    expect(axes.reviews.map((r) => r.verdict)).toEqual(["REVISION", "APPROVED"]);
    expect(axes.deliverable).toContain("【修正】");
    expect(axes.confidential).toBe(true);

    // 司令塔から統括責任者へ報告が届いている
    expect(data.messages.some((m) => m.role === "commander" && m.kind === "report")).toBe(true);
    // すべての記録がデモデータ。担当者はEnejoy Handの組織から割り当てられている
    for (const x of [...data.tasks, ...data.activities, ...data.usage, ...data.messages]) expect(x.mode).toBe("demo");
    expect(data.usage.every((u) => u.estimated)).toBe(true);
    const ids = new Set(TENANT.members.map((m) => m.id));
    for (const a of data.activities) expect(ids.has(a.actorId)).toBe(true);
    // デモの成果物は「デモ成果物」と明示される
    expect(data.tasks.filter((t) => t.deliverable).every((t) => t.deliverable!.startsWith("【デモ成果物】"))).toBe(true);
  });

  it("代表の決裁が必須の依頼は、統括責任者は承認できず、代表へ回して代表が承認すると確定する", async () => {
    const { deps, runUntilIdle } = env;
    await submitCommand(deps, cmd("MISSION 001を進めて"));
    let data = await runUntilIdle();
    const approval = data.approvals.find((a) => a.status === "PENDING")!;

    // 統括責任者は承認できない／代表は自分の番になるまで操作できない
    await expect(decideApproval(deps, approval.id, OPERATOR, "APPROVED")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(decideApproval(deps, approval.id, PRESIDENT, "APPROVED")).rejects.toMatchObject({ code: "FORBIDDEN" });

    await decideApproval(deps, approval.id, OPERATOR, "ESCALATE", "評価制度の確定をお願いします");
    data = await deps.store.read();
    expect(data.approvals[0].currentApprover).toBe("president");
    expect(data.approvals[0].status).toBe("PENDING");
    // 必須案件は代表から統括責任者に任せることはできない
    await expect(decideApproval(deps, approval.id, PRESIDENT, "RETURN")).rejects.toMatchObject({ code: "INVALID_STATE" });
    // 回した後は統括責任者は操作できない
    await expect(decideApproval(deps, approval.id, OPERATOR, "REJECTED")).rejects.toMatchObject({ code: "FORBIDDEN" });

    // 代表用の画面には自分宛ての依頼だけが出る
    expect(buildPresidentSnapshot(data, "demo", deps.now()).pending.map((a) => a.id)).toEqual([approval.id]);

    await decideApproval(deps, approval.id, PRESIDENT, "APPROVED");
    data = await deps.store.read();
    const a = data.approvals[0];
    expect(a.status).toBe("APPROVED");
    expect(a.decidedBy).toBe(PRESIDENT);
    expect(a.history.map((h) => `${h.actor}:${h.action}`)).toEqual([
      "fujita:REQUESTED",
      `${OPERATOR}:ESCALATED`,
      `${PRESIDENT}:APPROVED`,
    ]);
    expect(data.audit.filter((x) => x.action.startsWith("approval.")).map((x) => x.actor)).toEqual([OPERATOR, PRESIDENT]);
    expect(data.tasks.find((t) => t.key === "decide")!.status).toBe("DONE");
    expect(data.projects[0].status).toBe("COMPLETED");

    // 「代表の決裁で確定」のマイルストーンは、代表が承認した記録でのみ達成
    const snap = buildSnapshot(data, "demo", deps.now(), deps.limits);
    expect(snap.mission.achieved).toBe(5);
    expect(snap.mission.percent).toBe(100);
    // 二重承認はできない
    await expect(decideApproval(deps, approval.id, PRESIDENT, "APPROVED")).rejects.toBeInstanceOf(EngineError);
  });

  it("SNS投稿は統括責任者の判断を推奨。修正依頼で差し戻すと再作業して再度承認依頼が来る", async () => {
    const { deps, runUntilIdle } = env;
    await submitCommand(deps, cmd("SNSを続けられる仕組みを作って"));
    let data = await runUntilIdle();
    const approval = data.approvals.find((a) => a.status === "PENDING")!;
    expect(approval.category).toBe("sns_post");
    expect(approval.recommendedApprover).toBe("operator");
    expect(approval.presidentRequired).toBe(false);

    await decideApproval(deps, approval.id, OPERATOR, "CHANGES_REQUESTED", "表現をもう少し柔らかく");
    data = await runUntilIdle();
    const post = data.tasks.find((t) => t.key === "first-post")!;
    expect(post.status).toBe("WAITING_APPROVAL");
    expect(post.reviews.some((r) => r.reviewerId === OPERATOR)).toBe(true);
    const again = data.approvals.filter((a) => a.status === "PENDING");
    expect(again).toHaveLength(1);

    // 推奨が統括責任者でも、代表へ回して代表が統括責任者に任せ直すことができる
    await decideApproval(deps, again[0].id, OPERATOR, "ESCALATE");
    await decideApproval(deps, again[0].id, PRESIDENT, "RETURN", "岩永さんの判断で");
    await decideApproval(deps, again[0].id, OPERATOR, "APPROVED");
    data = await deps.store.read();
    expect(data.tasks.find((t) => t.key === "first-post")!.status).toBe("DONE");
    expect(data.messages.at(-1)?.text).toContain("DEMO MODE");
  });

  it("今日の仕事の報告は、Taskを作らず保存データから即答する", async () => {
    const { deps, runUntilIdle } = env;
    await submitCommand(deps, cmd("今日の仕事を報告して"));
    const data = await runUntilIdle();
    expect(data.commands[0].status).toBe("ANSWERED");
    expect(data.tasks).toHaveLength(0);
    const text = data.messages.at(-1)!.text;
    expect(text).toContain("司令塔 今日の報告");
    expect(text).toContain("売上の実績がまだ入力されていません");
    expect(text).toContain("承認待ち：統括責任者 0件 / 代表 0件");
  });

  it("指示の例を意図に分類する", () => {
    const classify = TENANT.playbook.classifyIntent;
    expect(classify("スタッフの評価制度を作って")).toBe("evaluation");
    expect(classify("クラス（等級）の案を出して")).toBe("grade");
    expect(classify("後継者育成の計画を立てて")).toBe("succession");
    expect(classify("今月の集客を考えて")).toBe("marketing");
    expect(classify("SNSを続けられる仕組みを作って")).toBe("sns");
    expect(classify("会社のお金の流れを整理して")).toBe("finance");
    expect(classify("事務作業のムダを洗い出して")).toBe("admin_ops");
    expect(classify("3億円達成までの計画を立てて")).toBe("revenue_plan");
    expect(classify("今日の仕事を報告して")).toBe("status_report");
    expect(classify("ＭＩＳＳＩＯＮ　００１を進めて")).toBe("mission");
    expect(classify("評価基準とクラスを確定させて")).toBe("mission");
    expect(classify("課題を洗い出して優先順位をつけて")).toBe("issues");
    expect(classify("法人向けの商品開発を始めて")).toBe("product");
    expect(classify("増員を検討して")).toBe("staffing");
    expect(classify("よろしく")).toBe("general");
  });

  it("指示の例はすべて最後まで進み、失敗しない", async () => {
    for (const text of TENANT.commandExamples) {
      const { deps, runUntilIdle } = setup();
      await submitCommand(deps, cmd(text));
      const data = await runUntilIdle();
      const c = data.commands[0];
      expect(["COMPLETED", "ANSWERED"], text).toContain(c.status);
      expect(data.tasks.filter((t) => t.status === "FAILED" || t.status === "CANCELLED"), text).toHaveLength(0);
      expect(data.safety.halted, text).toBe(false);
    }
  });

  it("部門別の内容を含むTaskには対象部門が付く", async () => {
    const { deps, runUntilIdle } = env;
    await submitCommand(deps, cmd("今月の集客を考えて"));
    const data = await runUntilIdle();
    const plan = data.tasks.find((t) => t.key === "plan")!;
    expect(plan.businessUnits).toEqual(["seikotsu", "beauty", "makizume"]);
  });
});

describe("承認者の推奨ルール", () => {
  const rec = TENANT.recommendApprover;
  it("費用・相手・機密性でケースバイケースに推奨する", () => {
    expect(rec({ category: "payment", costJpy: 10_000 })).toMatchObject({ approver: "operator", presidentRequired: false });
    expect(rec({ category: "payment", costJpy: 80_000 })).toMatchObject({ approver: "president", presidentRequired: false });
    expect(rec({ category: "payment", costJpy: 500_000 })).toMatchObject({ approver: "president", presidentRequired: true });
    expect(rec({ category: "customer_proposal", costJpy: 0 }).approver).toBe("operator");
    expect(rec({ category: "customer_proposal", costJpy: 0, corporate: true }).approver).toBe("president");
    expect(rec({ category: "sns_post", costJpy: 0, sensitive: true })).toMatchObject({ approver: "president", presidentRequired: true });
    expect(rec({ category: "contract", costJpy: 0 }).presidentRequired).toBe(true);
    expect(rec({ category: "data_deletion", costJpy: 0 }).presidentRequired).toBe(true);
    expect(rec({ category: "staff_evaluation", costJpy: 0 }).presidentRequired).toBe(true);
    expect(rec({ category: "new_agent", costJpy: 3000 }).approver).toBe("operator");
    expect(rec({ category: "new_agent", costJpy: 20_000 }).approver).toBe("president");
    for (const r of [rec({ category: "external_write", costJpy: 0 }), rec({ category: "budget_change", costJpy: 1 })]) {
      expect(r.reason.length).toBeGreaterThan(10);
    }
  });
});

describe("増員（待機中の社員）", () => {
  it("商品開発は担当が待機中のため、有効化の承認を依頼し、承認されるまで着手しない", async () => {
    const { deps, runUntilIdle } = setup();
    await submitCommand(deps, cmd("法人向けの商品開発を始めて"));
    let d = await runUntilIdle();
    // 担当待ちのTaskだけが残った時点で、いったん報告まで進む
    expect(d.commands[0].status).toBe("COMPLETED");
    expect(d.tasks.every((t) => t.status === "QUEUED")).toBe(true);
    expect(d.tasks[0].blockedReason).toContain("待機中");
    const proposal = d.approvals.find((a) => a.category === "new_agent")!;
    expect(proposal.memberId).toBe("nishimura");
    expect(proposal.recommendedApprover).toBe("operator");
    expect(deriveMemberViews(d, "demo").find((m) => m.id === "nishimura")?.status).toBe("STANDBY");

    await decideApproval(deps, proposal.id, OPERATOR, "APPROVED");
    for (let i = 0; i < 60; i++) {
      env_advance(deps);
      await tick(deps);
    }
    d = await deps.store.read();
    expect(deriveMemberViews(d, "demo").find((m) => m.id === "nishimura")?.active).toBe(true);
    expect(d.tasks.every((t) => t.status === "DONE")).toBe(true);
  });

  it("有効化が却下されたら、その担当のTaskは中止する", async () => {
    const { deps, runUntilIdle } = setup();
    await submitCommand(deps, cmd("法人向けの商品開発を始めて"));
    let d = await runUntilIdle();
    const proposal = d.approvals.find((a) => a.category === "new_agent")!;
    await decideApproval(deps, proposal.id, OPERATOR, "REJECTED", "今は評価制度を優先");
    d = await deps.store.read();
    expect(d.tasks.every((t) => t.status === "CANCELLED")).toBe(true);
    expect(d.projects[0].status).toBe("FAILED");
  });

  it("業務量が少なければ増員に反対する", async () => {
    const { deps, runUntilIdle } = setup();
    await submitCommand(deps, cmd("増員を検討して"));
    const d = await runUntilIdle();
    expect(d.messages.at(-1)!.text).toContain("増員は不要");
    expect(d.approvals).toHaveLength(0);
  });
});

/** テスト用：ストアの now を進める（setup外で使う簡易版） */
function env_advance(deps: EngineDeps) {
  const cur = deps.now();
  const next = new Date(cur.getTime() + 1000);
  (deps as { now: () => Date }).now = () => next;
}

describe("売上の実績（手入力）", () => {
  it("部門・月ごとに上書きし、目標の進捗は実績だけで計算する。デモの初期化では消えない", async () => {
    const { deps, runUntilIdle } = setup();
    await submitCommand(deps, cmd("3億円達成までの計画を立てて"));
    await runUntilIdle();
    // デモの成果物に数字があっても、売上の実績には入らない
    expect(revenueProgress(await deps.store.read(), deps.now()).actualJpy).toBe(0);

    await recordSales(deps, OPERATOR, { month: "2026-07", unitId: "seikotsu", amountJpy: 9_000_000, newPatients: 40 });
    await recordSales(deps, OPERATOR, { month: "2026-07", unitId: "beauty", amountJpy: 2_000_000 });
    await recordSales(deps, OPERATOR, { month: "2026-07", unitId: "seikotsu", amountJpy: 9_500_000 }); // 修正
    await recordSales(deps, OPERATOR, { month: "2026-05", unitId: "seikotsu", amountJpy: 1_000_000 }); // 期間外
    let d = await deps.store.read();
    const r = revenueProgress(d, deps.now());
    expect(r.actualJpy).toBe(11_500_000);
    expect(r.byUnit.find((u) => u.unitId === "seikotsu")?.actualJpy).toBe(9_500_000);
    expect(r.elapsedMonths).toBe(4); // 7〜10月
    expect(r.paceTargetJpy).toBe(100_000_000);
    expect(r.missingMonths).toEqual(["2026-08", "2026-09", "2026-10"]);
    expect(d.audit.filter((a) => a.action === "sales.update")).toHaveLength(1);

    await expect(recordSales(deps, OPERATOR, { month: "2026-07", unitId: "unknown", amountJpy: 1 })).rejects.toBeInstanceOf(EngineError);

    await resetDemoData(deps);
    d = await deps.store.read();
    expect(d.tasks).toHaveLength(0);
    expect(d.sales).toHaveLength(3);
  });
});

describe("安全対策", () => {
  it("同じ送信IDの二重送信を1件として扱う", async () => {
    const { deps } = setup();
    const input = cmd("今月の集客を考えて");
    const a = await submitCommand(deps, input);
    const b = await submitCommand(deps, input);
    expect(b.duplicate).toBe(true);
    expect(b.command.id).toBe(a.command.id);
    expect((await deps.store.read()).commands).toHaveLength(1);
  });

  it("会社全体の同時実行数の上限を超えない", async () => {
    const { deps, advance } = setup({ maxConcurrentTasks: 1 });
    await submitCommand(deps, cmd("今月の集客を考えて"));
    await submitCommand(deps, cmd("事務作業のムダを洗い出して"));
    for (let i = 0; i < 80; i++) {
      advance(500);
      await tick(deps);
      const d = await deps.store.read();
      const active = d.tasks.filter((t) => ["THINKING", "WORKING", "IN_REVIEW", "REVISION"].includes(t.status));
      expect(active.length).toBeLessThanOrEqual(1);
    }
  });

  it("同時に処理サイクルが走っても、同じTaskを二重に実行しない", async () => {
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
    await submitCommand(deps, cmd("会社のお金の流れを整理して"));
    for (let i = 0; i < 40; i++) {
      advance(1000);
      await Promise.all([tick(deps), tick(deps), tick(deps)]);
    }
    const d = await deps.store.read();
    expect(d.tasks.every((t) => t.status === "DONE")).toBe(true);
    // お金の整理は3Task・うち1件が1回修正 → 作業は4回だけ
    expect(workCalls).toBe(4);
  });

  it("1日の指示数・同時進行の指示数の上限を超える指示は受け付けない", async () => {
    const { deps } = setup({ maxCommandsPerDay: 2, maxActiveCommands: 5 });
    await submitCommand(deps, cmd("今月の集客を考えて"));
    await submitCommand(deps, cmd("後継者育成の計画を立てて"));
    await expect(submitCommand(deps, cmd("SNSを続けられる仕組みを作って"))).rejects.toMatchObject({ code: "LIMIT" });

    const env2 = setup({ maxActiveCommands: 1 });
    await submitCommand(env2.deps, cmd("今月の集客を考えて"));
    await expect(submitCommand(env2.deps, cmd("後継者育成の計画を立てて"))).rejects.toMatchObject({ code: "LIMIT" });
  });

  it("失敗したTaskは上限まで再試行し、連続エラーで会社全体を安全停止する", async () => {
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
    await submitCommand(deps, cmd("今月の集客を考えて"));
    for (let i = 0; i < 60; i++) {
      advance(5000);
      await tick(deps);
    }
    const d = await deps.store.read();
    expect(d.safety.halted).toBe(true);
    expect(d.tasks.some((t) => t.status === "FAILED")).toBe(true);
    // 依存先が失敗したTaskは実行されず中止される
    expect(d.tasks.filter((t) => t.status === "CANCELLED").length).toBeGreaterThan(0);
    await expect(submitCommand(deps, cmd("後継者育成の計画を立てて"))).rejects.toMatchObject({ code: "HALTED" });
    expect(deriveMemberViews(d, "demo").find((v) => v.id === "matsumoto")?.status).toBe("ERROR");
  });

  it("1日のAI予算に達したら安全停止する", async () => {
    const { deps, runUntilIdle } = setup({ dailyBudgetJpy: 1 });
    await submitCommand(deps, cmd("MISSION 001を進めて"));
    const d = await runUntilIdle().catch(async () => deps.store.read());
    expect(d.safety.halted).toBe(true);
    expect(d.safety.reason).toContain("予算");
  });

  it("レビューの差し戻しは上限で止まる（無限ループ防止）", async () => {
    const base = new DemoExecutor();
    const picky: Executor = {
      mode: "demo",
      plan: (t, c) => base.plan(t, c),
      work: (i) => base.work(i),
      report: (i) => base.report(i),
      review: async () => ({ verdict: "REVISION", comment: "やり直し", usage: { model: "x", inputTokens: 1, outputTokens: 1 } }),
    };
    const { deps, runUntilIdle } = setup({ maxRevisions: 2 }, picky);
    await submitCommand(deps, cmd("会社のお金の流れを整理して"));
    const d = await runUntilIdle();
    const first = d.tasks.find((t) => t.key === "items")!;
    expect(first.status).toBe("FAILED");
    expect(first.revisionCount).toBe(2);
  });
});

describe("稼働状況の表示", () => {
  it("THINKING / WORKING / REVIEWING は実際のTaskの状態から決まる", async () => {
    const { deps, advance } = setup();
    await submitCommand(deps, cmd("会社のお金の流れを整理して"));
    advance(1000);
    await tick(deps); // 計画 → 着手（THINKING）
    let d = await deps.store.read();
    expect(deriveMemberViews(d, "demo").find((m) => m.id === "ishikawa")?.status).toBe("THINKING");
    advance(1000);
    await tick(deps); // → WORKING
    d = await deps.store.read();
    expect(deriveMemberViews(d, "demo").find((m) => m.id === "ishikawa")?.status).toBe("WORKING");
    advance(1000);
    await tick(deps); // → レビュー中
    d = await deps.store.read();
    const views = deriveMemberViews(d, "demo");
    expect(views.find((m) => m.id === "morimoto")?.status).toBe("REVIEWING");
    expect(views.find((m) => m.id === "nomura")?.status).toBe("IDLE");
    expect(views.find((m) => m.id === "nishimura")?.status).toBe("STANDBY");
    expect(views.find((m) => m.id === "murakami")?.status).toBe("HUMAN");
  });
});
