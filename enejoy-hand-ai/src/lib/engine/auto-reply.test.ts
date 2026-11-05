import { describe, expect, it } from "vitest";
import { getLimits } from "@/config/limits";
import type { GoogleApi } from "@/lib/google/client";
import { MemoryStore } from "@/lib/store/store";
import type { CustomerReview } from "@/lib/types";
import { defaultAutoReply, processAutoReplies, requestAutoReplyPolicy, stopAutoReply, cancelAutoReplyJob } from "./auto-reply";
import { DemoExecutor } from "./demo-executor";
import { decideApproval, EngineError, type EngineDeps } from "./engine";
import { executeApprovedAction } from "./reputation";

const OPERATOR = "iwanaga";
let clock = new Date("2026-11-05T01:00:00Z");

function setup() {
  clock = new Date("2026-11-05T01:00:00Z");
  const deps: EngineDeps = {
    store: new MemoryStore(),
    executor: new DemoExecutor(),
    limits: getLimits(),
    timing: { analyzeMs: 1, thinkMs: 1, workMs: 1, reviewMs: 1, reportMs: 1 },
    now: () => clock,
    costOf: () => 0,
  };
  const posted: { id: string; comment: string }[] = [];
  const api = {
    replyToReview: async (id: string, comment: string) => {
      posted.push({ id, comment });
      return { updateTime: clock.toISOString() };
    },
  } as unknown as GoogleApi;
  return { deps, api, posted };
}

const review = (id: string, rating: number, comment: string, createTime: string, mode: "live" | "demo" = "live"): CustomerReview => ({
  id: `accounts/1/locations/1/reviews/${id}`,
  locationName: "accounts/1/locations/1",
  clinicId: "ibaraki",
  reviewerName: "山田 花子",
  rating,
  comment,
  createTime,
  updateTime: createTime,
  mode,
});

async function addReviews(deps: EngineDeps, rs: CustomerReview[]) {
  await deps.store.transact((d) => {
    d.reputation.reviews.push(...rs);
  });
}

async function enable(deps: EngineDeps, patch: Partial<ReturnType<typeof defaultAutoReply>> = {}) {
  const { enabled: _e, ...base } = { ...defaultAutoReply(), ...patch };
  void _e;
  const a = await requestAutoReplyPolicy(deps, OPERATOR, base);
  return a;
}

describe("口コミの自動返信", () => {
  it("ルールは承認されるまで有効にならない。★2以下は自動返信にできない", async () => {
    const { deps, api } = setup();
    await addReviews(deps, [review("a", 5, "とても良かったです", "2026-11-05T02:00:00Z")]);
    const a = await enable(deps);
    expect(a).toMatchObject({ category: "external_write", payload: { kind: "auto_reply_policy" } });
    expect(a.action).toContain("山田様");
    await expect(enable(deps)).rejects.toBeInstanceOf(EngineError);
    expect(await processAutoReplies(deps, api)).toEqual({ scheduled: 0, posted: 0, failed: 0 });
    await expect(requestAutoReplyPolicy(deps, OPERATOR, { ...defaultAutoReply(), minRating: 2 })).rejects.toBeInstanceOf(EngineError);
  });

  it("承認後：条件に合う口コミだけ予定にし、待ち時間が過ぎたら投稿する", async () => {
    const { deps, api, posted } = setup();
    // 有効にする前の口コミ（対象外）
    await addReviews(deps, [review("old", 5, "前からの口コミ", "2026-10-01T00:00:00Z")]);
    const a = await enable(deps, { delayHours: 3 });
    await decideApproval(deps, a.id, OPERATOR, "APPROVED");
    expect((await executeApprovedAction(deps, a.id, null))?.status).toBe("done");
    expect((await deps.store.read()).reputation.autoReply).toMatchObject({ enabled: true, approvalId: a.id });

    clock = new Date("2026-11-05T02:00:00Z");
    await addReviews(deps, [
      review("ok", 5, "先生が丁寧でした", "2026-11-05T01:30:00Z"),
      review("star", 4, "", "2026-11-05T01:40:00Z"),
      review("stop", 5, "まだ痛みが残っています", "2026-11-05T01:41:00Z"),
      review("low", 2, "待ち時間が長い", "2026-11-05T01:42:00Z"),
      review("mid", 3, "普通でした", "2026-11-05T01:43:00Z"),
    ]);
    const r1 = await processAutoReplies(deps, api);
    expect(r1).toEqual({ scheduled: 2, posted: 0, failed: 0 });
    expect(posted).toHaveLength(0);

    // 待ち時間（3時間）が過ぎたら投稿
    clock = new Date("2026-11-05T05:01:00Z");
    const r2 = await processAutoReplies(deps, api);
    expect(r2).toMatchObject({ posted: 2, failed: 0 });
    expect(posted.map((p) => p.id.split("/").pop())).toEqual(["ok", "star"]);
    expect(posted[0].comment).toContain("山田 花子様");
    expect(posted[0].comment).toContain("茨木院");
    expect(posted[0].comment).not.toContain("先生が丁寧");
    // ひな形は順番に使う
    expect(posted[0].comment).not.toBe(posted[1].comment);
    const d = await deps.store.read();
    expect(d.reputation.reviews.find((r) => r.id.endsWith("/ok"))?.reply?.comment).toBe(posted[0].comment);
    expect(d.reputation.reviews.find((r) => r.id.endsWith("/stop"))?.reply).toBeUndefined();
    expect(d.audit.some((x) => x.action === "review.auto_reply.posted")).toBe(true);
    // 2回目以降は同じ口コミに返信しない
    expect((await processAutoReplies(deps, api)).scheduled).toBe(0);
  });

  it("1日の上限・取りやめ・停止・デモの口コミには投稿しない", async () => {
    const { deps, api, posted } = setup();
    const a = await enable(deps, { delayHours: 0, dailyLimit: 1, includeBacklog: true });
    await decideApproval(deps, a.id, OPERATOR, "APPROVED");
    await executeApprovedAction(deps, a.id, null);
    await addReviews(deps, [
      review("x1", 5, "良い", "2026-11-04T00:00:00Z"),
      review("x2", 5, "良い", "2026-11-04T00:01:00Z"),
      review("x3", 5, "良い", "2026-11-04T00:02:00Z"),
      review("demo", 5, "良い（架空）", "2026-11-04T00:03:00Z", "demo"),
    ]);
    const r = await processAutoReplies(deps, api);
    expect(r.posted).toBe(1);
    expect(posted).toHaveLength(1);
    let jobs = (await deps.store.read()).reputation.autoReplyJobs!;
    expect(jobs.find((j) => j.reviewId.endsWith("/demo"))).toMatchObject({ status: "skipped" });
    expect(jobs.filter((j) => j.status === "scheduled").every((j) => j.message?.includes("上限"))).toBe(true);
    // 1件は人が取りやめ、残りは停止で取りやめ
    await cancelAutoReplyJob(deps, OPERATOR, jobs.find((j) => j.reviewId.endsWith("/x2"))!.id);
    await stopAutoReply(deps, OPERATOR);
    jobs = (await deps.store.read()).reputation.autoReplyJobs!;
    expect(jobs.filter((j) => j.status === "canceled")).toHaveLength(2);
    clock = new Date("2026-11-06T03:00:00Z");
    expect(await processAutoReplies(deps, api)).toMatchObject({ posted: 0 });
    expect(posted).toHaveLength(1);
  });

  it("Google未接続のときは投稿せず待機する", async () => {
    const { deps } = setup();
    const a = await enable(deps, { delayHours: 0, includeBacklog: true });
    await decideApproval(deps, a.id, OPERATOR, "APPROVED");
    await executeApprovedAction(deps, a.id, null);
    await addReviews(deps, [review("w", 5, "良い", "2026-11-04T00:00:00Z")]);
    expect(await processAutoReplies(deps, null)).toMatchObject({ posted: 0, failed: 0 });
    const j = (await deps.store.read()).reputation.autoReplyJobs![0];
    expect(j).toMatchObject({ status: "scheduled" });
    expect(j.message).toContain("接続されていない");
  });
});
