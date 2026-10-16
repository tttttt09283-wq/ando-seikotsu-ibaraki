/**
 * Googleビジネスプロフィール API と Places API（地域の競合）の呼び出し。
 * エンジンからはこのインターフェース越しに使い、テスト・デモでは差し替える。
 */

export type ApiLocation = {
  accountName: string;
  name: string;
  title: string;
  address?: string;
  placeId?: string;
  mapsUri?: string;
};

export type ApiReview = {
  id: string;
  reviewerName: string;
  rating: number;
  comment: string;
  createTime: string;
  updateTime: string;
  reply?: { comment: string; updateTime: string };
};

export type ApiPlace = {
  placeId: string;
  name: string;
  address?: string;
  rating?: number;
  reviewCount?: number;
  mapsUri?: string;
};

/** 表示回数などの指標 key（画面の表示名は PERFORMANCE_METRICS） */
export type PerformanceKey = "searchViews" | "mapsViews" | "calls" | "directions" | "websiteClicks" | "bookings";

export const PERFORMANCE_METRICS: { key: PerformanceKey; label: string }[] = [
  { key: "searchViews", label: "検索での表示" },
  { key: "mapsViews", label: "マップでの表示" },
  { key: "calls", label: "電話" },
  { key: "directions", label: "ルート検索" },
  { key: "websiteClicks", label: "ウェブサイト" },
  { key: "bookings", label: "予約" },
];

export interface GoogleApi {
  listLocations(): Promise<ApiLocation[]>;
  listReviews(loc: { accountName: string; name: string }): Promise<{ reviews: ApiReview[]; averageRating?: number; totalReviewCount?: number }>;
  /** 期間の数字を月ごとに合計して返す（YYYY-MM → 指標） */
  fetchPerformance(locationName: string, from: Date, to: Date): Promise<Record<string, Partial<Record<PerformanceKey, number>>>>;
  replyToReview(reviewId: string, comment: string): Promise<{ updateTime: string }>;
}

export interface PlacesApi {
  search(query: string): Promise<ApiPlace[]>;
  details(placeId: string): Promise<ApiPlace>;
}

const STAR: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };

const DAILY_METRICS: Record<string, PerformanceKey> = {
  BUSINESS_IMPRESSIONS_DESKTOP_SEARCH: "searchViews",
  BUSINESS_IMPRESSIONS_MOBILE_SEARCH: "searchViews",
  BUSINESS_IMPRESSIONS_DESKTOP_MAPS: "mapsViews",
  BUSINESS_IMPRESSIONS_MOBILE_MAPS: "mapsViews",
  CALL_CLICKS: "calls",
  BUSINESS_DIRECTION_REQUESTS: "directions",
  WEBSITE_CLICKS: "websiteClicks",
  BUSINESS_BOOKINGS: "bookings",
};

async function gfetch<T>(token: string, url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (res.status === 403 && /has not been used|disabled|quota/i.test(body)) {
      throw new Error("Googleビジネスプロフィール APIが使えません。Google Cloud で API を有効にし、利用申請（承認）が済んでいるか確認してください。");
    }
    if (res.status === 403) throw new Error("このGoogleアカウントにはビジネスプロフィールの管理権限がありません（オーナーか管理者で接続してください）。");
    if (res.status === 429) throw new Error("Googleの利用回数の上限に達しました。時間をおいて再度お試しください。");
    throw new Error(`Google API の呼び出しに失敗しました（${res.status}）`);
  }
  return (res.status === 204 ? {} : await res.json()) as T;
}

/** 本番：Googleビジネスプロフィール API（OAuth のアクセストークンを使う） */
export function createGoogleApi(getToken: () => Promise<string>): GoogleApi {
  return {
    async listLocations() {
      const token = await getToken();
      const accounts: { name: string }[] = [];
      let pageToken = "";
      do {
        const r = await gfetch<{ accounts?: { name: string }[]; nextPageToken?: string }>(
          token,
          `https://mybusinessaccountmanagement.googleapis.com/v1/accounts?pageSize=20${pageToken ? `&pageToken=${pageToken}` : ""}`,
        );
        accounts.push(...(r.accounts ?? []));
        pageToken = r.nextPageToken ?? "";
      } while (pageToken);

      const out: ApiLocation[] = [];
      for (const acc of accounts) {
        let pt = "";
        do {
          const r = await gfetch<{
            locations?: {
              name: string;
              title: string;
              storefrontAddress?: { addressLines?: string[]; locality?: string; administrativeArea?: string };
              metadata?: { placeId?: string; mapsUri?: string };
            }[];
            nextPageToken?: string;
          }>(
            token,
            `https://mybusinessbusinessinformation.googleapis.com/v1/${acc.name}/locations?readMask=name,title,storefrontAddress,metadata&pageSize=100${pt ? `&pageToken=${pt}` : ""}`,
          );
          for (const l of r.locations ?? []) {
            const a = l.storefrontAddress;
            out.push({
              accountName: acc.name,
              name: l.name,
              title: l.title,
              address: a ? [a.administrativeArea, a.locality, ...(a.addressLines ?? [])].filter(Boolean).join("") : undefined,
              placeId: l.metadata?.placeId,
              mapsUri: l.metadata?.mapsUri,
            });
          }
          pt = r.nextPageToken ?? "";
        } while (pt);
      }
      return out;
    },

    async listReviews(loc) {
      const token = await getToken();
      const reviews: ApiReview[] = [];
      let averageRating: number | undefined;
      let totalReviewCount: number | undefined;
      let pt = "";
      let pages = 0;
      do {
        const r = await gfetch<{
          reviews?: {
            name: string;
            reviewer?: { displayName?: string };
            starRating?: string;
            comment?: string;
            createTime: string;
            updateTime: string;
            reviewReply?: { comment: string; updateTime: string };
          }[];
          averageRating?: number;
          totalReviewCount?: number;
          nextPageToken?: string;
        }>(token, `https://mybusiness.googleapis.com/v4/${loc.accountName}/${loc.name}/reviews?pageSize=50&orderBy=updateTime%20desc${pt ? `&pageToken=${pt}` : ""}`);
        averageRating ??= r.averageRating;
        totalReviewCount ??= r.totalReviewCount;
        for (const x of r.reviews ?? []) {
          reviews.push({
            id: x.name,
            reviewerName: x.reviewer?.displayName ?? "（名前なし）",
            rating: STAR[x.starRating ?? ""] ?? 0,
            comment: x.comment ?? "",
            createTime: x.createTime,
            updateTime: x.updateTime,
            reply: x.reviewReply ? { comment: x.reviewReply.comment, updateTime: x.reviewReply.updateTime } : undefined,
          });
        }
        pt = r.nextPageToken ?? "";
        pages++;
      } while (pt && pages < 40);
      return { reviews, averageRating, totalReviewCount };
    },

    async fetchPerformance(locationName, from, to) {
      const token = await getToken();
      const q = new URLSearchParams();
      for (const m of Object.keys(DAILY_METRICS)) q.append("dailyMetrics", m);
      const d = (prefix: string, x: Date) => {
        q.set(`dailyRange.${prefix}.year`, String(x.getUTCFullYear()));
        q.set(`dailyRange.${prefix}.month`, String(x.getUTCMonth() + 1));
        q.set(`dailyRange.${prefix}.day`, String(x.getUTCDate()));
      };
      d("start_date", from);
      d("end_date", to);
      const r = await gfetch<{
        multiDailyMetricTimeSeries?: {
          dailyMetricTimeSeries?: { dailyMetric: string; timeSeries?: { datedValues?: { date: { year: number; month: number }; value?: string }[] } }[];
        }[];
      }>(token, `https://businessprofileperformance.googleapis.com/v1/${locationName}:fetchMultiDailyMetricsTimeSeries?${q}`);
      const out: Record<string, Partial<Record<PerformanceKey, number>>> = {};
      for (const group of r.multiDailyMetricTimeSeries ?? []) {
        for (const s of group.dailyMetricTimeSeries ?? []) {
          const key = DAILY_METRICS[s.dailyMetric];
          if (!key) continue;
          for (const v of s.timeSeries?.datedValues ?? []) {
            const month = `${v.date.year}-${String(v.date.month).padStart(2, "0")}`;
            const cur = (out[month] ??= {});
            cur[key] = (cur[key] ?? 0) + Number(v.value ?? 0);
          }
        }
      }
      return out;
    },

    async replyToReview(reviewId, comment) {
      const token = await getToken();
      const r = await gfetch<{ updateTime?: string }>(token, `https://mybusiness.googleapis.com/v4/${reviewId}/reply`, {
        method: "PUT",
        body: JSON.stringify({ comment }),
      });
      return { updateTime: r.updateTime ?? new Date().toISOString() };
    },
  };
}

/** 本番：Places API (New)。地域の競合の検索と、星の平均・口コミ件数の取得 */
export function createPlacesApi(apiKey: string): PlacesApi {
  const FIELDS = "id,displayName,formattedAddress,rating,userRatingCount,googleMapsUri";
  const toPlace = (p: { id: string; displayName?: { text?: string }; formattedAddress?: string; rating?: number; userRatingCount?: number; googleMapsUri?: string }): ApiPlace => ({
    placeId: p.id,
    name: p.displayName?.text ?? "",
    address: p.formattedAddress,
    rating: p.rating,
    reviewCount: p.userRatingCount,
    mapsUri: p.googleMapsUri,
  });
  const call = async <T,>(url: string, init: RequestInit): Promise<T> => {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(20_000) });
    if (res.status === 403) throw new Error("Places API が使えません。APIキーと、Google Cloud での Places API (New) の有効化・請求設定を確認してください。");
    if (!res.ok) throw new Error(`Places API の呼び出しに失敗しました（${res.status}）`);
    return (await res.json()) as T;
  };
  return {
    async search(query) {
      const r = await call<{ places?: Parameters<typeof toPlace>[0][] }>("https://places.googleapis.com/v1/places:searchText", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": FIELDS.split(",").map((f) => `places.${f}`).join(",") },
        body: JSON.stringify({ textQuery: query, languageCode: "ja", regionCode: "JP", pageSize: 20 }),
      });
      return (r.places ?? []).map(toPlace);
    },
    async details(placeId) {
      const r = await call<Parameters<typeof toPlace>[0]>(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?languageCode=ja`, {
        headers: { "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": FIELDS },
      });
      return toPlace(r);
    },
  };
}
