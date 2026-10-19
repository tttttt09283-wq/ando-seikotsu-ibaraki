import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";

/**
 * Supabase の auth スキーマの最小限の代わり（テスト専用）。
 * auth.uid() は Supabase と同じく request.jwt.claim.sub から読む。
 */
const AUTH_STUB = `
create role anon nologin;
create role authenticated nologin;
create schema auth;
create table auth.users (id uuid primary key, email text unique);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
grant usage on schema public to anon, authenticated;
`;

export async function createDb() {
  const db = new PGlite();
  await db.exec(AUTH_STUB);
  const dir = join(__dirname, "../../supabase/migrations");
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(join(dir, f), "utf8"));
  }
  return db;
}

export type Db = Awaited<ReturnType<typeof createDb>>;

export async function addUser(db: Db, id: string, email: string) {
  await db.query("reset role");
  await db.query("insert into auth.users (id, email) values ($1, $2)", [id, email]);
}

/** ログイン中のユーザーとして SQL を実行する（RLS が効く）。userId = null は未ログイン（anon） */
export async function as<T>(db: Db, userId: string | null, fn: () => Promise<T>): Promise<T> {
  await db.query("reset role");
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId ?? ""]);
  await db.query(userId ? "set role authenticated" : "set role anon");
  try {
    return await fn();
  } finally {
    await db.query("reset role");
  }
}
