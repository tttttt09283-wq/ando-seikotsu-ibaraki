import { jstDayKey, jstMonthKey } from "@/lib/time";
import type { CompanyData, DataMode } from "@/lib/types";
import { TENANT } from "@/tenant";

/** 口コミ・競合の集計（保存データから算出する。通信はしない） */

/**
 * 自院の口コミ・プロフィールで使うデータの種類：Googleから取得した本番のデータがあればそれ、なければデモ。
 * 人が登録した競合・記録はいつも本番の記録として扱い、どちらのモードでも表示する。
 */
export function reputationMode(data: Pick<CompanyData, "reputation">): DataMode {
  return data.reputation.locations.some((l) => l.mode === "live") || data.reputation.reviews.some((r) => r.mode === "live") ? "live" : "demo";
}

// ---------------------------------------------------------------------------
// 集計
// ---------------------------------------------------------------------------

const daysBetween = (a: string, b: string) => (new Date(b).getTime() - new Date(a).getTime()) / 86_400_000;

/** 院ごとの口コミの状況（指定した種類のデータのみ） */
export function reviewStats(data: Pick<CompanyData, "reputation">, mode: DataMode, now: Date) {
  const month = jstMonthKey(now);
  const since90 = new Date(now.getTime() - 90 * 86_400_000).toISOString();
  const rep = data.reputation;
  const reviews = rep.reviews.filter((r) => r.mode === mode);
  const perClinic = TENANT.clinics.map((c) => {
    const mine = reviews.filter((r) => r.clinicId === c.id);
    const loc = rep.locations.find((l) => l.mode === mode && l.clinicId === c.id);
    const recent = mine.filter((r) => r.createTime >= since90);
    const replied = recent.filter((r) => r.reply);
    const replyDays = replied.map((r) => daysBetween(r.createTime, r.reply!.updateTime)).filter((d) => d >= 0).sort((a, b) => a - b);
    return {
      clinicId: c.id,
      name: c.short,
      connected: Boolean(loc),
      averageRating: loc?.averageRating ?? (mine.length ? Math.round((mine.reduce((n, r) => n + r.rating, 0) / mine.length) * 10) / 10 : null),
      totalReviewCount: loc?.totalReviewCount ?? (mine.length || null),
      newThisMonth: mine.filter((r) => jstMonthKey(new Date(r.createTime)) === month).length,
      unreplied: mine.filter((r) => !r.reply).length,
      lowUnreplied: mine.filter((r) => !r.reply && r.rating <= 2).length,
      replyRate90: recent.length ? Math.round((replied.length / recent.length) * 100) : null,
      medianReplyDays: replyDays.length ? Math.round(replyDays[Math.floor(replyDays.length / 2)] * 10) / 10 : null,
    };
  });
  return {
    perClinic,
    unreplied: perClinic.reduce((n, c) => n + c.unreplied, 0),
    lowUnreplied: perClinic.reduce((n, c) => n + c.lowUnreplied, 0),
    newThisMonth: perClinic.reduce((n, c) => n + c.newThisMonth, 0),
  };
}

/** 院ごとに、自院と競合の最新の星・件数と、1か月前からの増加 */
export function competitorComparison(data: Pick<CompanyData, "reputation">, mode: DataMode, now: Date) {
  const rep = data.reputation;
  // 本番の記録（人の記録・取得した数字）はいつも含める
  const snaps = rep.snapshots.filter((s) => s.mode === mode || s.mode === "live");
  const monthAgo = jstDayKey(new Date(now.getTime() - 31 * 86_400_000));
  const latestOf = (subjectId: string) => {
    const xs = snaps.filter((s) => s.subjectId === subjectId).sort((a, b) => a.date.localeCompare(b.date));
    const last = xs.at(-1);
    const base = [...xs].reverse().find((s) => s.date <= monthAgo && s.reviewCount != null);
    return {
      rating: last?.rating ?? null,
      reviewCount: last?.reviewCount ?? null,
      date: last?.date ?? null,
      source: last?.source ?? null,
      gainMonth: last?.reviewCount != null && base?.reviewCount != null ? last.reviewCount - base.reviewCount : null,
      history: xs.map((s) => ({ date: s.date, rating: s.rating ?? null, reviewCount: s.reviewCount ?? null })),
    };
  };
  return TENANT.clinics.map((c) => {
    const loc = rep.locations.find((l) => l.mode === mode && l.clinicId === c.id);
    const own = latestOf(`clinic:${c.id}`);
    return {
      clinicId: c.id,
      name: c.name,
      own: { ...own, rating: own.rating ?? loc?.averageRating ?? null, reviewCount: own.reviewCount ?? loc?.totalReviewCount ?? null },
      competitors: rep.competitors
        .filter((x) => (x.mode === mode || x.mode === "live") && x.clinicId === c.id)
        .map((x) => ({ id: x.id, name: x.name, address: x.address, mapsUri: x.mapsUri, placeId: x.placeId, note: x.note, demo: x.mode === "demo", ...latestOf(x.id) })),
    };
  });
}

