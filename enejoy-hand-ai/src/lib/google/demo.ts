import type { Clinic } from "@/lib/tenant-types";
import type { Competitor, GbpLocation, PerformanceMonth, RatingSnapshot, ReputationData, CustomerReview } from "@/lib/types";

/**
 * DEMO MODE 用の口コミ・プロフィール・競合のサンプル。
 * 名前・本文・数字はすべて架空で、実在のお客様・店舗とは関係ない。
 */

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const COMMENTS: Record<number, string[]> = {
  5: [
    "腰の痛みで来院しました。説明が丁寧で安心して通えています。",
    "スタッフの皆さんが明るく、毎回元気をもらっています。",
    "予約が取りやすく、仕事帰りに通えて助かります。",
    "巻き爪の相談をしました。痛みがなくなり歩くのが楽になりました。",
    "美容鍼を受けました。施術後の顔のすっきり感に驚きました。",
  ],
  4: ["丁寧に対応してもらえました。待ち時間が少しあったので星4つです。", "施術は満足です。駐車場がもう少し広いと嬉しいです。"],
  3: ["施術は良かったのですが、説明がもう少し欲しかったです。"],
  2: ["予約していたのに少し待たされました。"],
  1: ["電話対応がそっけなく感じました。"],
};

const INITIALS = ["K.T", "M.S", "Y.N", "A.H", "R.I", "S.O", "T.K", "E.M", "H.Y", "N.F"];

export function buildDemoReputation(clinics: Clinic[], now: Date): Omit<ReputationData, "google"> {
  const r = rng(20261016);
  const locations: GbpLocation[] = [];
  const reviews: CustomerReview[] = [];
  const performance: PerformanceMonth[] = [];
  const competitors: Competitor[] = [];
  const snapshots: RatingSnapshot[] = [];
  const iso = now.toISOString();

  clinics.forEach((c, ci) => {
    const name = `locations/demo-${c.id}`;
    const count = c.openedMonth ? 6 : 14 + Math.floor(r() * 8);
    let sum = 0;
    for (let i = 0; i < count; i++) {
      const rating = r() < 0.72 ? 5 : r() < 0.6 ? 4 : r() < 0.6 ? 3 : r() < 0.5 ? 2 : 1;
      sum += rating;
      const daysAgo = Math.floor(r() * 120);
      const t = new Date(now.getTime() - daysAgo * 86_400_000).toISOString();
      const pool = COMMENTS[rating];
      const replied = daysAgo > 10 && r() < 0.65;
      reviews.push({
        id: `accounts/demo/locations/demo-${c.id}/reviews/${i}`,
        locationName: name,
        clinicId: c.id,
        reviewerName: `${INITIALS[Math.floor(r() * INITIALS.length)]}（架空）`,
        rating,
        comment: pool[Math.floor(r() * pool.length)],
        createTime: t,
        updateTime: t,
        reply: replied
          ? { comment: "口コミをありがとうございます。またのご来院をお待ちしております。", updateTime: new Date(new Date(t).getTime() + (1 + Math.floor(r() * 4)) * 86_400_000).toISOString() }
          : undefined,
        mode: "demo",
      });
    }
    locations.push({
      name,
      accountName: "accounts/demo",
      title: `あんど整骨院 ${c.name}（デモ）`,
      clinicId: c.id,
      averageRating: Math.round((sum / count) * 10) / 10,
      totalReviewCount: count + 40 + Math.floor(r() * 60),
      mode: "demo",
    });

    for (let back = 3; back >= 0; back--) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1));
      const month = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
      if (c.openedMonth && month < c.openedMonth) continue;
      const scale = (c.openedMonth ? 0.4 : 1) * (back === 0 ? 0.5 : 1);
      performance.push({
        clinicId: c.id,
        month,
        values: {
          searchViews: Math.round((1800 + r() * 900) * scale),
          mapsViews: Math.round((2400 + r() * 1200) * scale),
          calls: Math.round((40 + r() * 30) * scale),
          directions: Math.round((90 + r() * 60) * scale),
          websiteClicks: Math.round((60 + r() * 50) * scale),
          bookings: Math.round((8 + r() * 10) * scale),
        },
        mode: "demo",
        updatedAt: iso,
      });
    }

    for (let k = 0; k < 2; k++) {
      const id = `cmp_demo_${c.id}_${k}`;
      competitors.push({
        id,
        clinicId: c.id,
        name: `${["ひかり", "さくら", "みどり", "あおば"][(ci + k) % 4]}整骨院 ${c.short}（架空）`,
        address: `${c.short}駅 徒歩${3 + k * 4}分（架空）`,
        mode: "demo",
        createdAt: iso,
      });
      let total = 30 + Math.floor(r() * 120);
      const rating = Math.round((3.8 + r() * 1.1) * 10) / 10;
      for (let back = 5; back >= 0; back--) {
        const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1));
        total += Math.floor(r() * 9);
        snapshots.push({
          subjectId: id,
          date: d.toISOString().slice(0, 10),
          rating,
          reviewCount: total,
          source: "manual",
          mode: "demo",
        });
      }
    }
    const own = locations.at(-1)!;
    for (let back = 5; back >= 0; back--) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1));
      snapshots.push({
        subjectId: `clinic:${c.id}`,
        date: d.toISOString().slice(0, 10),
        rating: own.averageRating,
        reviewCount: Math.max(0, (own.totalReviewCount ?? 0) - back * 4),
        source: "gbp",
        mode: "demo",
      });
    }
  });
  return { locations, reviews, performance, competitors, snapshots };
}

/** デモの返信案（テンプレート）。実際の返信は人が確認・修正してから承認する */
export function demoReplyDraft(review: Pick<CustomerReview, "rating" | "reviewerName">, clinicName: string): string {
  const name = review.reviewerName.replace(/（架空）$/, "");
  if (review.rating >= 4) {
    return `${name}様\nこのたびは${clinicName}にご来院いただき、また温かい口コミをありがとうございます。スタッフ一同とても励みになります。これからも「心も体も豊かに、笑顔で過ごせる毎日」のお手伝いができるよう努めてまいります。またのご来院を心よりお待ちしております。`;
  }
  if (review.rating === 3) {
    return `${name}様\nご来院いただき、また率直なご意見をありがとうございます。いただいたご意見はスタッフ全員で共有し、より分かりやすいご説明と快適な院づくりに努めてまいります。次回のご来院時もお気軽にお声がけください。`;
  }
  return `${name}様\nこのたびはご不快な思いをおかけし、誠に申し訳ございません。いただいたご指摘を真摯に受け止め、スタッフ全員で改善に取り組んでまいります。よろしければ院まで直接ご連絡いただけましたら、詳しくお話を伺わせてください。`;
}
