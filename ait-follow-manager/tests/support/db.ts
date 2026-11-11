import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import pg from "pg";
import type { Database } from "@/lib/db/database.types";

export const PASSWORD = "DemoPass1234";

export const IDS = {
  users: {
    platform: "00000000-0000-4000-a000-000000000001",
    admin: "00000000-0000-4000-a000-000000000002",
    manager: "00000000-0000-4000-a000-000000000003",
    staff: "00000000-0000-4000-a000-000000000004",
    staff2: "00000000-0000-4000-a000-000000000005",
    otherAdmin: "00000000-0000-4000-a000-000000000006",
  },
  orgs: { demo: "00000000-0000-4000-b000-000000000001", other: "00000000-0000-4000-b000-000000000002" },
  stores: {
    hq: "00000000-0000-4000-c000-000000000001",
    eki: "00000000-0000-4000-c000-000000000002",
    otherMain: "00000000-0000-4000-c000-000000000003",
  },
} as const;

export const EMAILS = {
  platform: "platform@example.com",
  admin: "admin@example.com",
  manager: "manager@example.com",
  staff: "staff@example.com",
  staff2: "staff2@example.com",
  otherAdmin: "other-admin@example.com",
} as const;

export type Client = SupabaseClient<Database>;

export function anonClient(): Client {
  return createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function adminClient(): Client {
  return createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const sessions = new Map<string, Client>();

export async function signIn(who: keyof typeof EMAILS): Promise<Client> {
  const cached = sessions.get(who);
  if (cached) return cached;
  const c = anonClient();
  const { error } = await c.auth.signInWithPassword({ email: EMAILS[who], password: PASSWORD });
  if (error) throw error;
  sessions.set(who, c);
  return c;
}

let pool: pg.Pool | undefined;
/** スーパーユーザー接続（テストデータの準備・後片付け専用） */
export function sql() {
  pool ??= new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
  return pool;
}

export function uniq(prefix = "T") {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`.toUpperCase();
}
