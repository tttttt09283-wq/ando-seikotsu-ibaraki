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
  catchCopy: "あなたの姿勢・体幹は何歳？",
  /**
   * WEB予約URL。環境変数 NEXT_PUBLIC_BOOKING_URL で設定します。
   * 未設定の場合は null になり、予約ボタンは無効化されます（仮URLは使いません）。
   */
  bookingUrl: readBookingUrl(process.env.NEXT_PUBLIC_BOOKING_URL),
  /** 匿名統計の送信を有効にするか（環境変数 NEXT_PUBLIC_STATS_ENABLED=true で有効） */
  statsEnabled: process.env.NEXT_PUBLIC_STATS_ENABLED === "true",
  /** 公開URL（シェアのリンクに使う）。環境変数 NEXT_PUBLIC_SITE_URL で変えられます */
  siteUrl: (process.env.NEXT_PUBLIC_SITE_URL || "https://ando-body-check.vercel.app").replace(/\/$/, ""),

  // ===== 来院特典・シェア・LINE =====
  /**
   * ★来院したときの特典の文言（結果画面と、シェアされたページに表示します）。
   *   内容が決まったら、ここを書き換えてください（例：「初回の施術料 1,000円引き」）。
   */
  benefit: {
    title: "来院特典",
    text: "このチェックの結果画面を受付で見せていただくと、特典をご用意しています。内容は受付でご案内します。",
    note: "※チェックをした日から1か月以内のご来院が対象です",
  },
  /** LINE公式アカウントの友だち追加URL（予約ページなどと同じもの） */
  lineAddFriendUrl: "https://lin.ee/UmNuuyy",
  /**
   * シェアされた人に「LINE友だち追加」を必須にするための LIFF ID（LINE Developers で作るアプリのID）。
   *   LINEログイン＋友だちかどうかの確認をしてからでないと始められません（空にすると「友だち追加してから始める」流れ）。
   */
  liffId: (process.env.NEXT_PUBLIC_LIFF_ID || "2010529910-aRlaZ403").trim(), // エンドポイント https://ando-body-check.vercel.app/s
} as const;

export { readBookingUrl };
