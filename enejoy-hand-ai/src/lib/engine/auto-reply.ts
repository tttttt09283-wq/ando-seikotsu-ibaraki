import { getClinics } from "@/lib/clinics";
import type { GoogleApi } from "@/lib/google/client";
import { jstDayKey } from "@/lib/time";
import type { AutoReplyJob, AutoReplySettings, CompanyData, CustomerReview } from "@/lib/types";
import { COMMANDER_ID, TENANT } from "@/tenant";
import { audit, createApproval, EngineError, iso, log, newId, type EngineDeps } from "./engine";

/**
 * 口コミの自動返信。
 * - ルール（対象の★・待ち時間・1日の上限・返信文のひな形・止める言葉）を一度承認すると、条件に合う口コミに自動で返信する
 * - ★2以下・止める言葉のある口コミは、ルールに関係なく自動返信しない（従来どおり返信案 → 承認）
 * - 返信はすぐには投稿せず「予定」にする。待ち時間の間に、止める・書き換えることができる
 * - ルールを変えるときは承認し直す。止めるのは承認なしで、すぐにできる
 * - 返信文には口コミの本文（症状・来院日など）を引用しない
 */

export function defaultAutoReply(): AutoReplySettings {
  return {
    enabled: false,
    minRating: 4,
    includeNoComment: true,
    includeBacklog: false,
    delayHours: 3,
    dailyLimit: 10,
    templates: structuredClone(TENANT.autoReply.templates),
    stopWords: [...TENANT.autoReply.stopWords],
  };
}

export function autoReplySettings(data: Pick<CompanyData, "reputation">): AutoReplySettings {
  return data.reputation.autoReply ?? defaultAutoReply();
}

const reviewerName = (r: Pick<CustomerReview, "reviewerName">) => r.reviewerName.replace(/（架空）$/, "").trim() || "お客";

export function fillTemplate(tpl: string, review: Pick<CustomerReview, "reviewerName">, clinicName: string) {
  return tpl.replaceAll("{お名前}", reviewerName(review)).replaceAll("{院名}", clinicName);
}

/** この口コミが自動返信の対象か（対象外なら理由） */
export function autoReplyEligibility(s: AutoReplySettings, r: CustomerReview): { ok: true } | { ok: false; reason: string } {
  if (r.reply) return { ok: false, reason: "返信済み" };
  if (r.rating < 3 || r.rating < s.minRating) return { ok: false, reason: `★${r.rating}は人が確認して返信します` };
  if (!r.comment.trim() && !s.includeNoComment) return { ok: false, reason: "本文のない口コミは対象外の設定です" };
  const hit = s.stopWords.find((w) => w && r.comment.includes(w));
  if (hit) return { ok: false, reason: `「${hit}」を含むため人が確認します` };
  if (!s.includeBacklog && s.approvedAt && r.createTime < s.approvedAt) return { ok: false, reason: "自動返信を有効にする前の口コミです" };
  return { ok: true };
}

function summarize(s: AutoReplySettings) {
  return [
    `・対象：★${s.minRating}以上${s.includeNoComment ? "（★だけの口コミも含む）" : "（本文のある口コミだけ）"}。★2以下は必ず人が確認`,
    `・対象の期間：${s.includeBacklog ? "今ある未返信の口コミも含む" : "有効にした後に投稿された口コミだけ"}`,
    `・投稿までの待ち時間：${s.delayHours}時間（この間に止める・書き換えることができます）`,
    `・1日の上限：${s.dailyLimit}件`,
    `・自動返信しない言葉：${s.stopWords.join("、") || "なし"}`,
  ].join("\n");
}

/** ルールを保存して、有効化の承認を依頼する（承認されるまでは自動返信しない） */
export async function requestAutoReplyPolicy(deps: EngineDeps, actorId: string, input: Omit<AutoReplySettings, "enabled" | "approvedAt" | "approvalId" | "stoppedAt">) {
  return deps.store.transact((data) => {
    const now = deps.now();
    if (data.approvals.some((a) => a.status === "PENDING" && a.payload?.kind === "auto_reply_policy")) {
      throw new EngineError("自動返信のルールはすでに承認待ちです。承認画面で判断してから、もう一度依頼してください", "INVALID_STATE");
    }
    if (input.minRating < 3) throw new EngineError("★2以下は自動返信にできません", "INVALID_STATE");
    const settings: AutoReplySettings = { ...input, enabled: true };
    const sample = fillTemplate(settings.templates.high[0], { reviewerName: "山田" }, getClinics(data)[0]?.name ?? "院");
    const approval = createApproval(data, now, {
      mode: "live",
      category: "external_write",
      title: `口コミの自動返信を有効にする（★${settings.minRating}以上・1日${settings.dailyLimit}件まで）`,
      action: [
        "【ルール】",
        summarize(settings),
        "",
        `【返信文のひな形】★4〜5：${settings.templates.high.length}種類／★3：${settings.templates.mid.length}種類（順番に使います）`,
        "",
        "【返信の例】",
        sample,
      ].join("\n"),
      purpose: "条件に合う口コミ（評価の高いもの）に早く・漏れなく返信し、見ている方への信頼を高める。",
      expectedEffect: "返信までの時間が短くなり、返信率が上がる。人は評価の低い口コミの対応に集中できる。",
      costJpy: 0,
      risk:
        "承認後は、ルールに合う口コミへの返信が人の確認なしでGoogleマップに公開されます。同じような文面が並ぶと機械的に見えるため、ひな形は複数用意し、待ち時間の間に予定を確認することを推奨します。",
      commanderRecommendation:
        "会社の名前で公開される返信のルールなので、代表にも内容を確認してもらうことを推奨します。★2以下・不満の言葉がある口コミは、これまでどおり人が返信します。",
      requestedBy: actorId,
      payload: { kind: "auto_reply_policy", settings },
    });
    log(data, "live", now, { actorId: COMMANDER_ID, type: "approval", message: "口コミの自動返信ルールの承認を依頼" });
    return approval;
  });
}

/** 承認されたルールで自動返信を有効にする（承認の直後に呼ばれる） */
export async function applyAutoReplyPolicy(deps: EngineDeps, approvalId: string) {
  return deps.store.transact((data) => {
    const now = deps.now();
    const a = data.approvals.find((x) => x.id === approvalId);
    if (!a || a.status !== "APPROVED" || a.payload?.kind !== "auto_reply_policy" || a.execution) return null;
    data.reputation.autoReply = { ...a.payload.settings, enabled: true, approvedAt: iso(now), approvalId, stoppedAt: undefined };
    a.execution = { status: "done", at: iso(now), message: "口コミの自動返信を有効にしました" };
    audit(data, now, a.decidedBy ?? "system", "review.auto_reply.enable", a.title);
    log(data, "live", now, { actorId: COMMANDER_ID, type: "deliver", message: "口コミの自動返信を有効にしました" });
    return a.execution;
  });
}

/** すぐに止める（承認なし）。予定の返信もすべてやめる */
export async function stopAutoReply(deps: EngineDeps, actorId: string) {
  await deps.store.transact((data) => {
    const now = deps.now();
    const s = autoReplySettings(data);
    data.reputation.autoReply = { ...s, enabled: false, stoppedAt: iso(now) };
    let n = 0;
    for (const j of data.reputation.autoReplyJobs ?? []) {
      if (j.status === "scheduled") {
        j.status = "canceled";
        j.message = "自動返信を止めたため投稿しませんでした";
        n++;
      }
    }
    audit(data, now, actorId, "review.auto_reply.stop", `予定${n}件を取りやめ`);
  });
}

export async function cancelAutoReplyJob(deps: EngineDeps, actorId: string, id: string) {
  await deps.store.transact((data) => {
    const j = (data.reputation.autoReplyJobs ?? []).find((x) => x.id === id);
    if (!j) throw new EngineError("予定が見つかりません", "NOT_FOUND");
    if (j.status !== "scheduled") throw new EngineError("投稿前の予定だけ取りやめられます", "INVALID_STATE");
    j.status = "canceled";
    j.message = "人が取りやめました（必要なら返信案から承認制で返信してください）";
    audit(data, deps.now(), actorId, "review.auto_reply.cancel", j.reviewId);
  });
}

export async function editAutoReplyJob(deps: EngineDeps, actorId: string, id: string, comment: string) {
  await deps.store.transact((data) => {
    const j = (data.reputation.autoReplyJobs ?? []).find((x) => x.id === id);
    if (!j) throw new EngineError("予定が見つかりません", "NOT_FOUND");
    if (j.status !== "scheduled") throw new EngineError("投稿前の予定だけ書き換えられます", "INVALID_STATE");
    j.comment = comment.trim();
    audit(data, deps.now(), actorId, "review.auto_reply.edit", j.reviewId);
  });
}

/** 条件に合う口コミの返信を予定にする（ロックの中で呼ぶ） */
function scheduleJobs(data: CompanyData, now: Date): number {
  const s = autoReplySettings(data);
  if (!s.enabled) return 0;
  const jobs = (data.reputation.autoReplyJobs ??= []);
  const has = new Set(jobs.map((j) => j.reviewId));
  const pendingManual = new Set(data.approvals.filter((a) => a.status === "PENDING" && a.payload?.kind === "review_reply").map((a) => (a.payload as { reviewId: string }).reviewId));
  const clinics = getClinics(data);
  let n = 0;
  for (const r of [...data.reputation.reviews].sort((a, b) => a.createTime.localeCompare(b.createTime))) {
    if (has.has(r.id) || pendingManual.has(r.id) || !autoReplyEligibility(s, r).ok) continue;
    const list = r.rating >= 4 ? s.templates.high : s.templates.mid;
    if (!list.length) continue;
    const tpl = list[jobs.length % list.length];
    const clinicName = clinics.find((c) => c.id === r.clinicId)?.name ?? "当院";
    jobs.push({
      id: newId("arj"),
      reviewId: r.id,
      clinicId: r.clinicId,
      rating: r.rating,
      comment: fillTemplate(tpl, r, clinicName),
      createdAt: iso(now),
      dueAt: iso(new Date(now.getTime() + s.delayHours * 3_600_000)),
      status: "scheduled",
      mode: r.mode,
    });
    has.add(r.id);
    n++;
  }
  // 古い記録は500件まで
  if (jobs.length > 500) data.reputation.autoReplyJobs = jobs.slice(-500);
  return n;
}

/**
 * 自動返信の処理：新しい口コミを予定にし、待ち時間の過ぎた予定を投稿する。
 * 口コミの同期のあとと、一定間隔で呼ぶ。デモの口コミには投稿しない。
 */
export async function processAutoReplies(deps: EngineDeps, api: GoogleApi | null) {
  const scheduled = await deps.store.transact((data) => scheduleJobs(data, deps.now()));
  const snap = await deps.store.read();
  const s = autoReplySettings(snap);
  if (!s.enabled) return { scheduled, posted: 0, failed: 0 };
  const now = deps.now();
  const today = jstDayKey(now);
  let postedToday = (snap.reputation.autoReplyJobs ?? []).filter((j) => j.status === "posted" && j.postedAt && jstDayKey(new Date(j.postedAt)) === today).length;
  const due = (snap.reputation.autoReplyJobs ?? []).filter((j) => j.status === "scheduled" && j.dueAt <= iso(now));
  const results: { id: string; status: AutoReplyJob["status"] | "wait"; message: string; updateTime?: string }[] = [];
  for (const j of due) {
    const review = snap.reputation.reviews.find((r) => r.id === j.reviewId);
    if (!review) {
      results.push({ id: j.id, status: "skipped", message: "口コミが見つかりません（削除された可能性があります）" });
      continue;
    }
    if (review.reply) {
      results.push({ id: j.id, status: "skipped", message: "すでに返信があるため投稿しませんでした" });
      continue;
    }
    if (review.mode === "demo") {
      results.push({ id: j.id, status: "skipped", message: "DEMO（架空の口コミ）のため、Googleには投稿していません", updateTime: iso(now) });
      continue;
    }
    if (postedToday >= s.dailyLimit) {
      results.push({ id: j.id, status: "wait", message: `1日の上限（${s.dailyLimit}件）に達したため、明日以降に投稿します` });
      continue;
    }
    if (!api) {
      results.push({ id: j.id, status: "wait", message: "Googleアカウントが接続されていないため待機中です" });
      continue;
    }
    try {
      const r = await api.replyToReview(review.id, j.comment);
      postedToday++;
      results.push({ id: j.id, status: "posted", message: "Googleに返信を投稿しました", updateTime: r.updateTime });
    } catch (e) {
      results.push({ id: j.id, status: "failed", message: (e as Error).message });
    }
  }
  if (!results.length) return { scheduled, posted: 0, failed: 0 };
  return deps.store.transact((data) => {
    const t = deps.now();
    let posted = 0;
    let failed = 0;
    for (const res of results) {
      const j = (data.reputation.autoReplyJobs ?? []).find((x) => x.id === res.id);
      if (!j || j.status !== "scheduled") continue;
      j.message = res.message;
      if (res.status === "wait") continue;
      j.status = res.status;
      if (res.status === "posted" || (res.status === "skipped" && res.updateTime)) {
        const r = data.reputation.reviews.find((x) => x.id === j.reviewId);
        if (r && res.updateTime) r.reply = { comment: j.comment, updateTime: res.updateTime };
      }
      if (res.status === "posted") {
        j.postedAt = iso(t);
        posted++;
      }
      if (res.status === "failed") failed++;
      audit(data, t, "system", `review.auto_reply.${res.status}`, `${j.reviewId}：${res.message}`);
    }
    if (posted || failed) {
      log(data, "live", t, {
        actorId: COMMANDER_ID,
        type: failed ? "error" : "deliver",
        message: `口コミの自動返信：投稿 ${posted}件${failed ? `・失敗 ${failed}件` : ""}`,
      });
    }
    return { scheduled, posted, failed };
  });
}
