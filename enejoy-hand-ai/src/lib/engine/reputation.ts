import type { ApiPlace, GoogleApi, PlacesApi } from "@/lib/google/client";
import { getClinics } from "@/lib/clinics";
import { buildDemoReputation } from "@/lib/google/demo";
import { matchClinic } from "@/lib/import/daily-report";
import { jstDayKey } from "@/lib/time";
import type { CompanyData, Competitor, DataMode, RatingSnapshot } from "@/lib/types";
import { COMMANDER_ID, TENANT } from "@/tenant";
import { applyBudgetConfirm } from "./budget";
import { applyPlanAdopt } from "./planning";
import { audit, createApproval, EngineError, iso, log, name, newId, type EngineDeps } from "./engine";

/**
 * 口コミ・Googleビジネスプロフィール・地域の競合。
 * - 自院の口コミ・表示回数は、院の持ち主のGoogleアカウントで接続して取得する（本番の記録 mode: "live"）
 * - 口コミへの返信は外部への書き込みなので、承認を経てから投稿する
 * - Places API で取得した競合の数字は Google Maps Platform の規約に合わせて30日で消す。
 *   長期の推移は、人が確認して記録した数字（manual）と、自院のプロフィールの数字（gbp）で残す
 */

/** Places API で取得した数字を保存できる日数 */
export const PLACES_RETENTION_DAYS = 30;

function prunePlaces(data: CompanyData, now: Date) {
  const cutoff = jstDayKey(new Date(now.getTime() - PLACES_RETENTION_DAYS * 86_400_000));
  data.reputation.snapshots = data.reputation.snapshots.filter((s) => s.source !== "places" || s.date >= cutoff);
}

function putSnapshot(data: CompanyData, s: RatingSnapshot) {
  const list = data.reputation.snapshots;
  const i = list.findIndex((x) => x.subjectId === s.subjectId && x.date === s.date && x.source === s.source && x.mode === s.mode);
  if (i >= 0) list[i] = s;
  else list.push(s);
}

// ---------------------------------------------------------------------------
// Googleアカウントの接続・同期
// ---------------------------------------------------------------------------

export async function markGoogleConnected(deps: EngineDeps, actorId: string, email?: string) {
  await deps.store.transact((data) => {
    const now = deps.now();
    data.reputation.google = { ...data.reputation.google, connectedAt: iso(now), email };
    audit(data, now, actorId, "google.connect", email ?? "");
  });
}

export async function markGoogleDisconnected(deps: EngineDeps, actorId: string) {
  await deps.store.transact((data) => {
    const now = deps.now();
    data.reputation.google = {};
    audit(data, now, actorId, "google.disconnect", "取得済みの口コミ・数字は残しています");
  });
}

/**
 * Googleビジネスプロフィールから、ロケーション・口コミ・表示回数を読み取って保存する（読み取りのみ）。
 * 通信はロックの外で行い、最後にまとめて書き込む。
 */
export async function syncGoogle(deps: EngineDeps, api: GoogleApi, opts: { actorId?: string } = {}) {
  const now = deps.now();
  const errors: string[] = [];
  let locations: Awaited<ReturnType<GoogleApi["listLocations"]>> = [];
  try {
    locations = await api.listLocations();
  } catch (e) {
    await deps.store.transact((data) => {
      data.reputation.google.lastSyncAt = iso(deps.now());
      data.reputation.google.lastStatus = "error";
      data.reputation.google.lastMessage = (e as Error).message;
    });
    throw new EngineError((e as Error).message, "INVALID_STATE");
  }

  const before = await deps.store.read();
  const clinicOf = (locName: string, title: string) =>
    before.reputation.locations.find((l) => l.name === locName)?.clinicId ?? matchClinic(title, getClinics(before))?.id;

  // 表示回数は、年度の初め（または13か月前の遅い方）から昨日まで
  const fyStart = new Date(`${TENANT.revenueTarget.fromMonth}-01T00:00:00Z`);
  const limit = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 12, 1));
  const from = fyStart > limit ? fyStart : limit;
  const to = new Date(now.getTime() - 86_400_000);

  type LocResult = {
    loc: (typeof locations)[number];
    clinicId?: string;
    reviews: Awaited<ReturnType<GoogleApi["listReviews"]>> | null;
    perf: Awaited<ReturnType<GoogleApi["fetchPerformance"]>> | null;
  };
  const results: LocResult[] = [];
  for (const loc of locations) {
    const clinicId = clinicOf(loc.name, loc.title);
    let reviews: Awaited<ReturnType<GoogleApi["listReviews"]>> | null = null;
    let perf: Awaited<ReturnType<GoogleApi["fetchPerformance"]>> | null = null;
    try {
      reviews = await api.listReviews(loc);
    } catch (e) {
      errors.push(`${loc.title}の口コミ：${(e as Error).message}`);
    }
    if (clinicId) {
      try {
        perf = await api.fetchPerformance(loc.name, from, to);
      } catch (e) {
        errors.push(`${loc.title}の表示回数：${(e as Error).message}`);
      }
    }
    results.push({ loc, clinicId, reviews, perf });
  }

  return deps.store.transact((data) => {
    const t = deps.now();
    const rep = data.reputation;
    const today = jstDayKey(t);
    let reviewCount = 0;
    for (const { loc, clinicId, reviews, perf } of results) {
      const existing = rep.locations.find((l) => l.name === loc.name);
      const next = {
        ...loc,
        clinicId,
        averageRating: reviews?.averageRating ?? existing?.averageRating,
        totalReviewCount: reviews?.totalReviewCount ?? existing?.totalReviewCount,
        mode: "live" as const,
      };
      if (existing) Object.assign(existing, next);
      else rep.locations.push(next);

      if (reviews) {
        rep.reviews = rep.reviews.filter((r) => !(r.mode === "live" && r.locationName === loc.name));
        for (const r of reviews.reviews) rep.reviews.push({ ...r, locationName: loc.name, clinicId, mode: "live" });
        reviewCount += reviews.reviews.length;
        if (clinicId) {
          putSnapshot(data, { subjectId: `clinic:${clinicId}`, date: today, rating: reviews.averageRating, reviewCount: reviews.totalReviewCount, source: "gbp", mode: "live" });
        }
      }
      if (perf && clinicId) {
        for (const [month, values] of Object.entries(perf)) {
          const cur = rep.performance.find((p) => p.mode === "live" && p.clinicId === clinicId && p.month === month);
          const v: Record<string, number> = {};
          for (const [k, n] of Object.entries(values)) v[k] = n ?? 0;
          if (cur) Object.assign(cur, { values: v, updatedAt: iso(t) });
          else rep.performance.push({ clinicId, month, values: v, mode: "live", updatedAt: iso(t) });
        }
      }
    }
    prunePlaces(data, t);
    rep.google.lastSyncAt = iso(t);
    rep.google.lastStatus = errors.length ? "error" : "ok";
    rep.google.lastMessage = errors.length
      ? errors.slice(0, 3).join(" ／ ")
      : `ロケーション${locations.length}件・口コミ${reviewCount}件を読み取りました`;
    if (opts.actorId) audit(data, t, opts.actorId, "google.sync", rep.google.lastMessage);
    return { locations: locations.length, reviews: reviewCount, errors };
  });
}

/** ロケーション（Googleのプロフィール）と院の対応付け */
export async function setLocationClinic(deps: EngineDeps, actorId: string, locationName: string, clinicId: string) {
  await deps.store.transact((data) => {
    if (clinicId && !getClinics(data).some((c) => c.id === clinicId)) throw new EngineError("院が正しくありません", "INVALID_STATE");
    const loc = data.reputation.locations.find((l) => l.name === locationName);
    if (!loc) throw new EngineError("ロケーションが見つかりません", "NOT_FOUND");
    loc.clinicId = clinicId || undefined;
    for (const r of data.reputation.reviews) if (r.locationName === locationName) r.clinicId = loc.clinicId;
    audit(data, deps.now(), actorId, "google.location.map", `${loc.title} → ${clinicId || "（対応なし）"}`);
  });
}

// ---------------------------------------------------------------------------
// 口コミへの返信（返信案 → 承認 → 投稿）
// ---------------------------------------------------------------------------

/** 返信文の承認を依頼する。承認されるまでGoogleには投稿しない */
export async function requestReviewReply(deps: EngineDeps, actorId: string, input: { reviewId: string; comment: string }) {
  return deps.store.transact((data) => {
    const now = deps.now();
    const review = data.reputation.reviews.find((r) => r.id === input.reviewId);
    if (!review) throw new EngineError("口コミが見つかりません", "NOT_FOUND");
    const dup = data.approvals.find((a) => a.status === "PENDING" && a.payload?.kind === "review_reply" && a.payload.reviewId === review.id);
    if (dup) throw new EngineError("この口コミへの返信は、すでに承認待ちです", "INVALID_STATE");
    const clinic = getClinics(data).find((c) => c.id === review.clinicId)?.name ?? "院";
    const live = review.mode === "live";
    const quote = review.comment.length > 160 ? `${review.comment.slice(0, 160)}…` : review.comment;
    const approval = createApproval(data, now, {
      mode: review.mode,
      category: "external_write",
      title: `口コミへの返信：${clinic}（★${review.rating}${review.reply ? "・返信の書き換え" : ""}）`,
      action: `【返信文】\n${input.comment}\n\n【元の口コミ】★${review.rating} ${review.reviewerName}\n${quote || "（本文なし）"}`,
      purpose: "口コミに丁寧に返信し、見ている方への信頼と、来院のきっかけを増やす。",
      expectedEffect: "返信のある院は、口コミを見た方の安心感が高まり、来院の後押しになる。",
      costJpy: 0,
      risk: live
        ? "Googleマップに公開され、誰でも読める。施術の効果の断定や、お客様が特定される内容（病名・来院日など）を書くと信用を損なう。"
        : "DEMO（架空の口コミ）のため、承認してもGoogleには投稿しない。",
      commanderRecommendation:
        review.rating <= 2
          ? "評価の低い口コミです。言い訳をせず、お詫びと改善の約束、直接の連絡先の案内に留めた文面を推奨します。"
          : "感謝と再来院のお誘いが入った、短く温かい文面を推奨します。",
      requestedBy: actorId,
      payload: { kind: "review_reply", reviewId: review.id, comment: input.comment },
    });
    log(data, review.mode, now, { actorId: COMMANDER_ID, type: "approval", message: `${clinic}の口コミ（★${review.rating}）への返信文の承認を依頼` });
    return approval;
  });
}

/**
 * 承認済みの外部への書き込みを実行する（承認の直後に呼ぶ）。
 * デモの口コミには投稿しない。本番の口コミは、接続済みなら Google に返信を投稿する。
 */
export async function executeApprovedAction(deps: EngineDeps, approvalId: string, api: GoogleApi | null) {
  const snap = await deps.store.read();
  const a = snap.approvals.find((x) => x.id === approvalId);
  if (!a || a.status !== "APPROVED" || !a.payload || a.execution) return null;
  // 予算の確定は社内の記録の更新なので、ここで反映する
  if (a.payload.kind === "budget_confirm") return applyBudgetConfirm(deps, approvalId);
  if (a.payload.kind === "plan_adopt") return applyPlanAdopt(deps, approvalId);
  const payload = a.payload;
  const review = snap.reputation.reviews.find((r) => r.id === payload.reviewId);

  let status: "done" | "failed" | "skipped";
  let message: string;
  let updateTime: string | undefined;
  if (!review) {
    status = "failed";
    message = "対象の口コミが見つかりません（削除された可能性があります）";
  } else if (review.mode === "demo") {
    status = "skipped";
    message = "DEMO（架空の口コミ）のため、Googleには投稿していません";
    updateTime = iso(deps.now());
  } else if (!api) {
    status = "failed";
    message = "Googleアカウントが接続されていないため投稿できませんでした。接続後に「投稿をやり直す」を押してください";
  } else {
    try {
      updateTime = (await api.replyToReview(review.id, payload.comment)).updateTime;
      status = "done";
      message = "Googleに返信を投稿しました";
    } catch (e) {
      status = "failed";
      message = (e as Error).message;
    }
  }

  return deps.store.transact((data) => {
    const now = deps.now();
    const ap = data.approvals.find((x) => x.id === approvalId);
    if (!ap) return null;
    ap.execution = { status, at: iso(now), message };
    const r = data.reputation.reviews.find((x) => x.id === payload.reviewId);
    if (r && updateTime) r.reply = { comment: payload.comment, updateTime };
    audit(data, now, "system", `review.reply.${status}`, `${ap.title}：${message}`);
    log(data, ap.mode, now, { actorId: COMMANDER_ID, type: status === "failed" ? "error" : "deliver", message: `口コミへの返信：${message}` });
    return ap.execution;
  });
}

/** 投稿に失敗した返信をやり直す */
export async function retryApprovedAction(deps: EngineDeps, approvalId: string, api: GoogleApi | null) {
  await deps.store.transact((data) => {
    const a = data.approvals.find((x) => x.id === approvalId);
    if (!a || a.status !== "APPROVED" || a.execution?.status !== "failed") throw new EngineError("やり直せる投稿がありません", "INVALID_STATE");
    a.execution = undefined;
  });
  return executeApprovedAction(deps, approvalId, api);
}

// ---------------------------------------------------------------------------
// 地域の競合
// ---------------------------------------------------------------------------

export async function addCompetitor(
  deps: EngineDeps,
  actorId: string,
  input: { clinicId: string; name: string; placeId?: string; address?: string; mapsUri?: string; note?: string },
  place?: ApiPlace,
): Promise<Competitor> {
  return deps.store.transact((data) => {
    const now = deps.now();
    if (!getClinics(data).some((c) => c.id === input.clinicId)) throw new EngineError("院が正しくありません", "INVALID_STATE");
    if (input.placeId && data.reputation.competitors.some((c) => c.mode === "live" && c.clinicId === input.clinicId && c.placeId === input.placeId)) {
      throw new EngineError("この競合はすでに登録されています", "INVALID_STATE");
    }
    const c: Competitor = { id: newId("cmp"), mode: "live", createdAt: iso(now), ...input };
    data.reputation.competitors.push(c);
    if (place && (place.rating != null || place.reviewCount != null)) {
      putSnapshot(data, { subjectId: c.id, date: jstDayKey(now), rating: place.rating, reviewCount: place.reviewCount, source: "places", mode: "live" });
    }
    audit(data, now, actorId, "competitor.add", `${getClinics(data).find((x) => x.id === input.clinicId)?.name}：${input.name}`);
    return c;
  });
}

export async function removeCompetitor(deps: EngineDeps, actorId: string, id: string) {
  await deps.store.transact((data) => {
    const c = data.reputation.competitors.find((x) => x.id === id);
    if (!c) throw new EngineError("競合が見つかりません", "NOT_FOUND");
    data.reputation.competitors = data.reputation.competitors.filter((x) => x.id !== id);
    data.reputation.snapshots = data.reputation.snapshots.filter((s) => s.subjectId !== id);
    audit(data, deps.now(), actorId, "competitor.remove", c.name);
  });
}

/** 登録した競合の星・口コミ件数を Places API で取り直す（30日保存） */
export async function refreshCompetitors(deps: EngineDeps, places: PlacesApi, opts: { actorId?: string } = {}) {
  const snap = await deps.store.read();
  const targets = snap.reputation.competitors.filter((c) => c.mode === "live" && c.placeId);
  const got: { id: string; place: ApiPlace }[] = [];
  const errors: string[] = [];
  for (const c of targets) {
    try {
      got.push({ id: c.id, place: await places.details(c.placeId!) });
    } catch (e) {
      errors.push(`${c.name}：${(e as Error).message}`);
    }
  }
  await deps.store.transact((data) => {
    const now = deps.now();
    for (const { id, place } of got) {
      putSnapshot(data, { subjectId: id, date: jstDayKey(now), rating: place.rating, reviewCount: place.reviewCount, source: "places", mode: "live" });
    }
    prunePlaces(data, now);
    if (opts.actorId) audit(data, now, opts.actorId, "competitor.refresh", `${got.length}件更新${errors.length ? `・${errors.length}件失敗` : ""}`);
  });
  return { updated: got.length, errors };
}

/** 人が確認した星・口コミ件数の記録（長期の推移用・今日の日付で上書き） */
export async function recordRatingSnapshot(deps: EngineDeps, actorId: string, input: { subjectId: string; rating?: number; reviewCount?: number }) {
  if (input.rating == null && input.reviewCount == null) throw new EngineError("星か口コミ件数を入力してください", "INVALID_STATE");
  await deps.store.transact((data) => {
    const now = deps.now();
    const isClinic = input.subjectId.startsWith("clinic:");
    const ok = isClinic
      ? getClinics(data).some((c) => `clinic:${c.id}` === input.subjectId)
      : data.reputation.competitors.some((c) => c.id === input.subjectId);
    if (!ok) throw new EngineError("記録する相手が見つかりません", "NOT_FOUND");
    // 人が確認した数字は本番の記録（デモの競合への記録だけはデモとして扱う）
    const mode = isClinic ? "live" : data.reputation.competitors.find((c) => c.id === input.subjectId)!.mode;
    putSnapshot(data, { subjectId: input.subjectId, date: jstDayKey(now), rating: input.rating, reviewCount: input.reviewCount, source: "manual", mode });
    audit(data, now, actorId, "rating.snapshot", `${input.subjectId} ★${input.rating ?? "-"} ${input.reviewCount ?? "-"}件`);
  });
}

/** デモ用のサンプル（架空）を入れ直す。本番の記録には触れない */
export async function loadDemoReputation(deps: EngineDeps, actorId: string) {
  await deps.store.transact((data) => {
    const now = deps.now();
    const rep = data.reputation;
    const keepLive = <T extends { mode: DataMode }>(xs: T[]) => xs.filter((x) => x.mode === "live");
    const demo = buildDemoReputation(getClinics(data), now);
    rep.locations = [...keepLive(rep.locations), ...demo.locations];
    rep.reviews = [...keepLive(rep.reviews), ...demo.reviews];
    rep.performance = [...keepLive(rep.performance), ...demo.performance];
    rep.competitors = [...keepLive(rep.competitors), ...demo.competitors];
    rep.snapshots = [...keepLive(rep.snapshots), ...demo.snapshots];
    audit(data, now, actorId, "reputation.demo", "口コミ・競合のデモデータ（架空）を作成");
  });
}

