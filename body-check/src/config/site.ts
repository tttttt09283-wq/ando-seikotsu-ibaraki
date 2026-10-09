/**
 * サイト全体の設定
 * 院名や予約URLなど、院ごとに変わる情報はここにまとめています。
 * 将来グループの他院に展開するときは、このファイルを院ごとに変えるだけで対応できます。
 */

/** 予約URLが「https://〜」の正しい形式かを確認する（不正な値ならボタンを無効にする） */
function readBookingUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  const value = raw.trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export const siteConfig = {
  serviceName: "あんど式 カラダ年齢チェック",
  clinicName: "あんど整骨院 香里園院",
  catchCopy: "あなたのカラダ、何歳レベル？",
  /**
   * WEB予約URL。環境変数 NEXT_PUBLIC_BOOKING_URL で設定します。
   * 未設定の場合は null になり、予約ボタンは無効化されます（仮URLは使いません）。
   */
  bookingUrl: readBookingUrl(process.env.NEXT_PUBLIC_BOOKING_URL),
  /** 匿名統計の送信を有効にするか（環境変数 NEXT_PUBLIC_STATS_ENABLED=true で有効） */
  statsEnabled: process.env.NEXT_PUBLIC_STATS_ENABLED === "true",
} as const;

export { readBookingUrl };
