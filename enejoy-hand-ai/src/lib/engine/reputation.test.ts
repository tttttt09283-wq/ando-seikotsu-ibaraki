import { describe, expect, it } from "vitest";
import { getLimits } from "@/config/limits";
import type { GoogleApi, PlacesApi } from "@/lib/google/client";
import { demoReplyDraft } from "@/lib/google/demo";
import { MemoryStore } from "@/lib/store/store";
import { buildPresidentSnapshot, buildSnapshot } from "@/lib/view";
import { DemoExecutor } from "./demo-executor";
import { decideApproval, EngineError, resetDemoData, type EngineDeps } from "./engine";
import {
  addCompetitor,
  executeApprovedAction,
  loadDemoReputation,
  PLACES_RETENTION_DAYS,
  recordRatingSnapshot,
  refreshCompetitors,
  requestReviewReply,
  retryApprovedAction,
  setLocationClinic,
  syncGoogle,
} from "./reputation";
import { competitorComparison, reputationMode, reviewStats } from "./reputation-metrics";

const OPERATOR = "iwanaga";

function setup() {
  let now = new Date("2026-10-16T03:00:00Z");
  const deps: EngineDeps = {
    store: new MemoryStore(),
    executor: new DemoExecutor(),
    limits: getLimits(),
    timing: { analyzeMs: 1, thinkMs: 1, workMs: 1, reviewMs: 1, reportMs: 1 },
    now: () => now,
    costOf: () => 0,
  };
  return { deps, advanceDays: (d: number) => (now = new Date(now.getTime() + d * 86_400_000)) };
}

function mockApi(overrides: Partial<GoogleApi> = {}) {
  const replies: { id: string; comment: string }[] = [];
  const api: GoogleApi = {
    async listLocations() {
      return [
        { accountName: "accounts/1", name: "locations/11", title: "あんど整骨院 交野院", placeId: "p11" },
        { accountName: "accounts/1", name: "locations/22", title: "本部（院ではない）" },
      ];
    },
    async listReviews(loc) {
      if (loc.name !== "locations/11") return { reviews: [] };
      return {
        averageRating: 4.6,
        totalReviewCount: 120,
        reviews: [
          { id: "accounts/1/locations/11/reviews/a", reviewerName: "山田", rating: 5, comment: "とても良い", createTime: "2026-10-10T00:00:00Z", updateTime: "2026-10-10T00:00:00Z" },
          { id: "accounts/1/locations/11/reviews/b", reviewerName: "佐藤", rating: 2, comment: "待ち時間が長い", createTime: "2026-10-12T00:00:00Z", updateTime: "2026-10-12T00:00:00Z" },
          {
            id: "accounts/1/locations/11/reviews/c",
            reviewerName: "鈴木",
            rating: 4,
            comment: "",
            createTime: "2026-09-01T00:00:00Z",
            updateTime: "2026-09-01T00:00:00Z",
            reply: { comment: "ありがとうございます", updateTime: "2026-09-03T00:00:00Z" },
          },
        ],
      };
    },
    async fetchPerformance() {
      return { "2026-09": { searchViews: 1200, calls: 30 }, "2026-10": { searchViews: 500, calls: 12 } };
    },
    async replyToReview(id, comment) {
      replies.push({ id, comment });
      return { updateTime: "2026-10-16T04:00:00Z" };
    },
    ...overrides,
  };
  return { api, replies };
}

describe("Googleビジネスプロフィールの同期", () => {
  it("ロケーションを院に自動で対応付け、口コミ・表示回数・自院の星を保存する", async () => {
    const { deps } = setup();
    const { api } = mockApi();
    const r = await syncGoogle(deps, api, { actorId: OPERATOR });
    expect(r).toMatchObject({ locations: 2, reviews: 3, errors: [] });
    const d = await deps.store.read();
    expect(d.reputation.locations.find((l) => l.name === "locations/11")?.clinicId).toBe("katano");
    expect(d.reputation.locations.find((l) => l.name === "locations/22")?.clinicId).toBeUndefined();
    expect(d.reputation.reviews.every((x) => x.mode === "live" && x.clinicId === "katano")).toBe(true);
    expect(d.reputation.performance.find((p) => p.month === "2026-09")?.values.searchViews).toBe(1200);
    expect(reputationMode(d)).toBe("live");

    const stats = reviewStats(d, "live", deps.now()).perClinic.find((c) => c.clinicId === "katano")!;
    expect(stats).toMatchObject({ averageRating: 4.6, totalReviewCount: 120, newThisMonth: 2, unreplied: 2, lowUnreplied: 1, medianReplyDays: 2 });
    expect(d.audit.some((a) => a.action === "google.sync")).toBe(true);

    // 手動の対応付けは、次の同期でも保たれる
    await setLocationClinic(deps, OPERATOR, "locations/11", "tsuda");
    await syncGoogle(deps, api);
    const d2 = await deps.store.read();
    expect(d2.reputation.locations.find((l) => l.name === "locations/11")?.clinicId).toBe("tsuda");
    expect(d2.reputation.reviews).toHaveLength(3); // 重複しない
  });

  it("APIが使えないときはエラーを記録して止まる", async () => {
    const { deps } = setup();
    const { api } = mockApi({ listLocations: async () => Promise.reject(new Error("利用申請が必要です")) });
    await expect(syncGoogle(deps, api)).rejects.toBeInstanceOf(EngineError);
    expect((await deps.store.read()).reputation.google).toMatchObject({ lastStatus: "error", lastMessage: "利用申請が必要です" });
  });
});

describe("口コミへの返信（承認してから投稿）", () => {
  it("返信文は承認されるまで投稿せず、承認後に投稿して記録する", async () => {
    const { deps } = setup();
    const { api, replies } = mockApi();
    await syncGoogle(deps, api);
    const reviewId = "accounts/1/locations/11/reviews/b";
    const draft = demoReplyDraft({ rating: 2, reviewerName: "佐藤" }, "交野院");
    expect(draft).toContain("申し訳ございません");

    const a = await requestReviewReply(deps, OPERATOR, { reviewId, comment: draft });
    expect(a).toMatchObject({ mode: "live", category: "external_write", recommendedApprover: "operator", presidentRequired: false });
    expect(replies).toHaveLength(0);
    await expect(requestReviewReply(deps, OPERATOR, { reviewId, comment: "二重" })).rejects.toBeInstanceOf(EngineError);

    // アプリ全体は DEMO MODE でも、本番の口コミの承認依頼は画面に出る
    let d = await deps.store.read();
    expect(buildSnapshot(d, "demo", deps.now(), deps.limits).approvals.map((x) => x.id)).toContain(a.id);

    await decideApproval(deps, a.id, OPERATOR, "APPROVED");
    const exec = await executeApprovedAction(deps, a.id, api);
    expect(exec?.status).toBe("done");
    expect(replies).toEqual([{ id: reviewId, comment: draft }]);
    d = await deps.store.read();
    expect(d.reputation.reviews.find((r) => r.id === reviewId)?.reply?.comment).toBe(draft);
    // 二重に投稿しない
    expect(await executeApprovedAction(deps, a.id, api)).toBeNull();
    expect(replies).toHaveLength(1);
  });

  it("未接続なら失敗を記録し、接続後にやり直せる。却下なら投稿しない", async () => {
    const { deps } = setup();
    const { api, replies } = mockApi();
    await syncGoogle(deps, api);
    const a = await requestReviewReply(deps, OPERATOR, { reviewId: "accounts/1/locations/11/reviews/a", comment: "ありがとうございます" });
    await decideApproval(deps, a.id, OPERATOR, "APPROVED");
    expect((await executeApprovedAction(deps, a.id, null))?.status).toBe("failed");
    expect((await retryApprovedAction(deps, a.id, api))?.status).toBe("done");

    const b = await requestReviewReply(deps, OPERATOR, { reviewId: "accounts/1/locations/11/reviews/b", comment: "すみません" });
    await decideApproval(deps, b.id, OPERATOR, "REJECTED", "文面を考え直す");
    expect(await executeApprovedAction(deps, b.id, api)).toBeNull();
    expect(replies).toHaveLength(1);
  });

  it("代表へ回した返信の依頼は、代表の画面に出る", async () => {
    const { deps } = setup();
    const { api } = mockApi();
    await syncGoogle(deps, api);
    const a = await requestReviewReply(deps, OPERATOR, { reviewId: "accounts/1/locations/11/reviews/b", comment: "お詫び" });
    await decideApproval(deps, a.id, OPERATOR, "ESCALATE");
    expect(buildPresidentSnapshot(await deps.store.read(), "demo", deps.now()).pending.map((x) => x.id)).toEqual([a.id]);
  });

  it("デモの口コミは承認しても投稿しない", async () => {
    const { deps } = setup();
    const { api, replies } = mockApi();
    await loadDemoReputation(deps, OPERATOR);
    const d = await deps.store.read();
    expect(reputationMode(d)).toBe("demo");
    const review = d.reputation.reviews.find((r) => !r.reply)!;
    const a = await requestReviewReply(deps, OPERATOR, { reviewId: review.id, comment: "テスト" });
    expect(a.mode).toBe("demo");
    await decideApproval(deps, a.id, OPERATOR, "APPROVED");
    expect((await executeApprovedAction(deps, a.id, api))?.status).toBe("skipped");
    expect(replies).toHaveLength(0);

    await resetDemoData(deps);
    const after = await deps.store.read();
    expect(after.reputation.reviews).toHaveLength(0);
  });
});

describe("地域の競合", () => {
  it("Places の数字は30日で消し、手入力の記録は残す。1か月の増加を比べる", async () => {
    const { deps, advanceDays } = setup();
    let count = 100;
    const places: PlacesApi = {
      search: async () => [],
      details: async (id) => ({ placeId: id, name: "ひかり整骨院", rating: 4.4, reviewCount: (count += 10) }),
    };
    const c = await addCompetitor(deps, OPERATOR, { clinicId: "honin", name: "ひかり整骨院", placeId: "pX" }, { placeId: "pX", name: "ひかり整骨院", rating: 4.3, reviewCount: 100 });
    await expect(addCompetitor(deps, OPERATOR, { clinicId: "honin", name: "重複", placeId: "pX" })).rejects.toBeInstanceOf(EngineError);
    await recordRatingSnapshot(deps, OPERATOR, { subjectId: c.id, rating: 4.3, reviewCount: 98 });
    await recordRatingSnapshot(deps, OPERATOR, { subjectId: "clinic:honin", rating: 4.7, reviewCount: 200 });

    advanceDays(PLACES_RETENTION_DAYS + 5);
    await refreshCompetitors(deps, places);
    const d = await deps.store.read();
    const snaps = d.reputation.snapshots.filter((s) => s.subjectId === c.id);
    expect(snaps.filter((s) => s.source === "places")).toHaveLength(1); // 古い取得分は消えた
    expect(snaps.filter((s) => s.source === "manual")).toHaveLength(1); // 手入力は残る

    const cmp = competitorComparison(d, "live", deps.now()).find((x) => x.clinicId === "honin")!;
    expect(cmp.competitors[0]).toMatchObject({ name: "ひかり整骨院", reviewCount: 110, rating: 4.4, gainMonth: 12 });
    expect(cmp.own).toMatchObject({ rating: 4.7, reviewCount: 200 });
  });

  it("手入力で登録した競合は本番の記録として、デモ表示中でも並べて表示し、デモの初期化でも消えない", async () => {
    const { deps } = setup();
    await loadDemoReputation(deps, OPERATOR);
    const c = await addCompetitor(deps, OPERATOR, { clinicId: "honin", name: "実在の競合" });
    await recordRatingSnapshot(deps, OPERATOR, { subjectId: c.id, rating: 4.1, reviewCount: 50 });
    let d = await deps.store.read();
    expect(reputationMode(d)).toBe("demo");
    const names = competitorComparison(d, "demo", deps.now()).find((x) => x.clinicId === "honin")!.competitors.map((x) => x.name);
    expect(names).toContain("実在の競合");
    expect(names.length).toBe(3);
    await resetDemoData(deps);
    d = await deps.store.read();
    expect(d.reputation.competitors.map((x) => x.name)).toEqual(["実在の競合"]);
    expect(d.reputation.snapshots).toHaveLength(1);
  });
});
