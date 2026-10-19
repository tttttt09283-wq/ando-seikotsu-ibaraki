/**
 * 簡易レート制限（直近の時間枠の回数で判定）。
 * MVP はサーバーのメモリ上で数える。複数台で動かす場合は Redis 等に置き換える。
 */
const buckets = new Map<string, number[]>();

export function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
  const xs = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (xs.length >= limit) {
    buckets.set(key, xs);
    return false;
  }
  xs.push(now);
  buckets.set(key, xs);
  if (buckets.size > 10_000) {
    for (const [k, v] of buckets) if (!v.some((t) => now - t < windowMs)) buckets.delete(k);
  }
  return true;
}
