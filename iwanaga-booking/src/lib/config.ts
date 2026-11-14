/**
 * 環境変数の読み取り（サーバー専用）。秘密情報は NEXT_PUBLIC_ を付けない＝クライアントに出さない。
 *
 * データ保存:
 *   postgres … DATABASE_URL がある（本番：Supabase の PostgreSQL）
 *   memory   … 無い。ローカル代替モード（.data/local-db.json に保存）
 * 管理者認証:
 *   supabase … NEXT_PUBLIC_SUPABASE_URL と NEXT_PUBLIC_SUPABASE_ANON_KEY がある（Supabase Auth）
 *   local    … 無い。ADMIN_LOCAL_PASSWORD による簡易ログイン（ローカル代替モード）
 * 本番（NODE_ENV=production）では、どちらもローカル代替モードでの起動を拒否する。
 */
import "server-only";
import { supabasePublic } from "./public-config";

function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() !== "" ? v.trim() : undefined;
}

export type DataMode = "postgres" | "memory";
export type AuthMode = "supabase" | "local";

export function dataMode(): DataMode {
  return env("DATABASE_URL") ? "postgres" : "memory";
}
export function authMode(): AuthMode {
  return supabasePublic() ? "supabase" : "local";
}
/** ローカル代替モードを本番で使うことを明示的に許可しているか（デモ用。通常は false） */
function localAllowedInProduction() {
  return env("ALLOW_LOCAL_MODE_IN_PRODUCTION") === "true";
}
export function assertModeAllowed(): void {
  if (process.env.NODE_ENV === "production" && !localAllowedInProduction()) {
    if (dataMode() === "memory") throw new Error("DATABASE_URL が未設定です。本番ではローカル代替モード（メモリ保存）は使えません。");
  }
}
export function assertAuthModeAllowed(): void {
  if (process.env.NODE_ENV === "production" && !localAllowedInProduction() && authMode() === "local") {
    throw new Error("Supabase Auth が未設定です。本番では簡易ログインは使えません。");
  }
}

export const config = {
  get siteUrl() {
    return env("NEXT_PUBLIC_SITE_URL") ?? "http://localhost:3000";
  },
  get databaseUrl() {
    return env("DATABASE_URL");
  },
  /** Supabase の SSL 証明書（PEM）。設定すると証明書を検証して接続する */
  get databaseCaCert() {
    const v = env("DATABASE_CA_CERT");
    return v ? v.replace(/\\n/g, "\n") : undefined;
  },
  get supabaseUrl() {
    return supabasePublic()?.url;
  },
  get supabaseAnonKey() {
    return supabasePublic()?.anonKey;
  },
  /** LINE Messaging API（個人の公式LINEアカウント） */
  get lineChannelSecret() {
    return env("LINE_CHANNEL_SECRET");
  },
  get lineChannelAccessToken() {
    return env("LINE_CHANNEL_ACCESS_TOKEN");
  },
  /** Webhook の destination（ボットのユーザーID, U で始まる）。送信元照合に使う */
  get lineBotUserId() {
    return env("LINE_BOT_USER_ID");
  },
  /** 公式LINEのベーシックID（@xxxx）。トーク画面への遷移に使う（公開情報） */
  get lineBasicId() {
    return env("NEXT_PUBLIC_LINE_BASIC_ID");
  },
  /** LINE Login チャネルID（LIFF の ID トークン検証用） */
  get lineLoginChannelId() {
    return env("LINE_LOGIN_CHANNEL_ID");
  },
  get liffId() {
    return env("NEXT_PUBLIC_LIFF_ID");
  },
  /** 管理者のLINEユーザーID（カンマ区切り）。管理者への新規仮予約通知に使う */
  get adminLineUserIds(): string[] {
    return (env("ADMIN_LINE_USER_IDS") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  },
  get adminLineNotify() {
    return env("ADMIN_LINE_NOTIFY") === "true";
  },
  /** メール通知（Resend API） */
  get resendApiKey() {
    return env("RESEND_API_KEY");
  },
  get adminNotifyEmails(): string[] {
    return (env("ADMIN_NOTIFY_EMAILS") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  },
  get mailFrom() {
    return env("MAIL_FROM");
  },
  get cronSecret() {
    return env("CRON_SECRET");
  },
  /** 個人情報の暗号化キー（32バイトを base64）。ローカルモードでは開発用キーで代替 */
  get dataEncryptionKey() {
    return env("DATA_ENCRYPTION_KEY");
  },
  /** 検索用ハッシュのペッパー */
  get hashPepper() {
    return env("HASH_PEPPER");
  },
  /** ローカルモードの管理者ログイン */
  get adminLocalPassword() {
    return env("ADMIN_LOCAL_PASSWORD");
  },
  get sessionSecret() {
    return env("SESSION_SECRET");
  },
  /** LINE送信待ちホールドの期限（分） */
  get lineHoldMinutes() {
    return Number(env("LINE_HOLD_MINUTES") ?? 30);
  },
  /** 管理者確認待ちホールドの期限（時間） */
  get reviewHoldHours() {
    return Number(env("REVIEW_HOLD_HOURS") ?? 48);
  },
  /** 日時変更提案の回答期限（時間） */
  get proposalHoldHours() {
    return Number(env("PROPOSAL_HOLD_HOURS") ?? 48);
  },
  /** 相談内容の保持日数（施術完了・キャンセル・期限切れ後） */
  get consultationRetentionDays() {
    return Number(env("CONSULTATION_RETENTION_DAYS") ?? 90);
  },
  /** 顧客情報の保持日数（最終予約日から） */
  get customerRetentionDays() {
    return Number(env("CUSTOMER_RETENTION_DAYS") ?? 365 * 3);
  },
};

export function lineMessagingConfigured(): boolean {
  return Boolean(config.lineChannelSecret && config.lineChannelAccessToken);
}
