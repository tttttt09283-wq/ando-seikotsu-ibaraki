/**
 * ===== 販売ページ（/for-clinics）の設定 =====
 * 他院への販売用の情報はここにまとめています。
 * 料金・お問い合わせ先が決まったら、このファイル（または環境変数）を書き換えてください。
 */

function readHttpsUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw.trim());
    return u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

export const salesConfig = {
  productName: "あんど式 カラダ年齢チェック",
  /** 開発・提供元 */
  vendorName: "あんど整骨院",
  /** このアプリの公開URL（デモ・テンプレート内のURLの初期値に使う） */
  appUrl: readHttpsUrl(process.env.NEXT_PUBLIC_SITE_URL) ?? "https://ando-body-check.vercel.app",
  /** 導入のお問い合わせ先（LINE公式アカウントのURLや申込フォームのURL）。未設定なら「準備中」 */
  contactUrl: readHttpsUrl(process.env.NEXT_PUBLIC_SALES_CONTACT_URL),
  /** 導入のお問い合わせ用メールアドレス（任意） */
  contactEmail: process.env.NEXT_PUBLIC_SALES_CONTACT_EMAIL?.trim() || null,
  /**
   * 料金。null の項目は「お問い合わせください」と表示します。
   * 例）initialFee: "33,000円（税込）", monthlyFee: "5,500円（税込）／月"
   */
  pricing: {
    initialFee: null as string | null,
    monthlyFee: null as string | null,
    note: "院の数・カスタマイズ内容により異なります。まずはお気軽にご相談ください。",
  },
  /** 料金に含まれるもの */
  included: [
    "4つのチェック（カラダ年齢・AI姿勢・骨格タイプ・体幹）を選べる、貴院専用のチェックページ（URL発行）",
    "LINEリッチメニュー・QRコードからすぐに使える設定",
    "チェック結果（カラダ年齢・姿勢の点数・骨格タイプ・体幹スコア）を予約フォームへ引き継ぐ連携",
    "店頭POP・受付トーク・SNS投稿文などの販促テンプレート一式",
    "導入ガイドと、スタッフ向けの説明資料",
    "（任意）匿名の利用統計：チェック数・予約ボタンの押下数",
  ],
} as const;
