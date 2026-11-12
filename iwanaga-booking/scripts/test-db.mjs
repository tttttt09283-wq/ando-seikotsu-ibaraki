#!/usr/bin/env node
/**
 * 実際の PostgreSQL でマイグレーションと DB 関数（重複予約防止・競合・期限切れ・RLS）をテストする。
 *
 *   npm run test:db
 *
 * - TEST_DATABASE_URL があればそのDBを使う（中身は作り直すので本番DBを指定しないこと）
 * - 無ければ、ローカルの PostgreSQL（initdb / pg_ctl）で一時クラスタを作って使い、終了後に削除する
 * Supabase 固有の auth スキーマ・ロール（anon / authenticated）は、無ければ最小限のスタブを作る。
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
let url = process.env.TEST_DATABASE_URL;
let cleanup = () => {};

function findPgBin() {
  const base = "/usr/lib/postgresql";
  if (!existsSync(base)) return null;
  const versions = readdirSync(base).sort().reverse();
  for (const v of versions) if (existsSync(join(base, v, "bin", "pg_ctl"))) return join(base, v, "bin");
  return null;
}

if (!url) {
  const bin = findPgBin();
  if (!bin) {
    console.error("PostgreSQL が見つかりません。TEST_DATABASE_URL を指定してください。");
    process.exit(1);
  }
  const dir = mkdtempSync(join(tmpdir(), "iwanaga-pg-"));
  chmodSync(dir, 0o777);
  const asRoot = process.getuid?.() === 0;
  const run = (cmd, args) => {
    const full = asRoot ? ["runuser", ["-u", "postgres", "--", join(bin, cmd), ...args]] : [join(bin, cmd), args];
    execFileSync(full[0], full[1], { stdio: "pipe" });
  };
  const data = join(dir, "data");
  run("initdb", ["-D", data, "-U", "postgres", "--auth=trust", "-E", "UTF8"]);
  const port = 55432 + Math.floor(Math.random() * 1000);
  run("pg_ctl", ["-D", data, "-l", join(dir, "pg.log"), "-o", `-p ${port} -k ${dir} -c listen_addresses=''`, "-w", "start"]);
  url = `postgresql://postgres@/postgres?host=${encodeURIComponent(dir)}&port=${port}`;
  cleanup = () => {
    try {
      run("pg_ctl", ["-D", data, "-m", "fast", "-w", "stop"]);
    } catch {}
    rmSync(dir, { recursive: true, force: true });
  };
}

async function setup() {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  await client.query(`
    drop schema if exists public cascade;
    create schema public;
    do $$ begin
      if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
      if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
    end $$;
    create schema if not exists auth;
    create or replace function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema public to anon, authenticated;
    grant usage on schema auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
  `);
  const dir = join(root, "supabase", "migrations");
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    process.stdout.write(`apply ${f} ... `);
    await client.query(readFileSync(join(dir, f), "utf8"));
    console.log("ok");
  }
  await client.end();
}

let code = 1;
try {
  await setup();
  const r = spawnSync("npx", ["vitest", "run", "src/lib/repo/pg.test.ts"], {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, TEST_DATABASE_URL: url },
  });
  code = r.status ?? 1;
} catch (e) {
  console.error(e);
} finally {
  cleanup();
}
process.exit(code);
