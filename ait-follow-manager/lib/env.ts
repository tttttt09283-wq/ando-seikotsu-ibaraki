import "server-only";
import { z } from "zod";

/**
 * サーバー専用の環境変数。NEXT_PUBLIC_ を付けないことでブラウザへ出さない。
 * 値が不足している場合は起動時（初回参照時）にエラーにする。
 */
const schema = z.object({
  SUPABASE_URL: z.url(),
  SUPABASE_ANON_KEY: z.string().min(20),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  CRON_SECRET: z.string().min(16),
  APP_ENV: z.enum(["development", "staging", "production"]).default("development"),
  SITE_URL: z.url().default("http://localhost:3000"),
  REQUIRE_ADMIN_MFA: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function env(): Env {
  if (!cached) {
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      const keys = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
      throw new Error(`環境変数が不足または不正です: ${keys}`);
    }
    cached = parsed.data;
  }
  return cached;
}
