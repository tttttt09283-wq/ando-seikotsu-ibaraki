// テスト用のローカル PostgreSQL を一時ディレクトリに立ち上げ、スタブ・マイグレーション・初期マスタを適用する
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const PG_BIN = process.env.PG_BIN || "/usr/lib/postgresql/16/bin";

export async function startDb() {
  const dir = mkdtempSync(join(process.env.TEST_TMPDIR || tmpdir(), "mgmt-pg-"));
  const data = join(dir, "data");
  const port = 55000 + Math.floor(Math.random() * 5000);
  // PostgreSQL は root では起動できないため、root のときは postgres ユーザーで実行する
  const isRoot = typeof process.getuid === "function" && process.getuid() === 0;
  if (isRoot) execFileSync("chown", ["-R", "postgres:postgres", dir]);
  const asPg = (cmd, args) => isRoot
    ? execFileSync("runuser", ["-u", "postgres", "--", join(PG_BIN, cmd), ...args], { stdio: "pipe" })
    : execFileSync(join(PG_BIN, cmd), args, { stdio: "pipe" });
  asPg("initdb", ["-D", data, "-U", "postgres", "--auth=trust", "--encoding=UTF8", "--locale=C"]);
  asPg("pg_ctl", ["-D", data, "-o", `-p ${port} -k ${dir} -c listen_addresses=''`, "-l", join(dir, "log"), "-w", "start"]);
  const client = new pg.Client({ host: dir, port, user: "postgres", database: "postgres" });
  await client.connect();
  await client.query(readFileSync(join(here, "supabase-stub.sql"), "utf8"));
  for (const f of readdirSync(join(root, "migrations")).sort()) await client.query(readFileSync(join(root, "migrations", f), "utf8"));
  for (const f of readdirSync(join(root, "seed")).sort()) await client.query(readFileSync(join(root, "seed", f), "utf8"));
  const stop = async () => {
    await client.end().catch(() => {});
    try { asPg("pg_ctl", ["-D", data, "-m", "immediate", "stop"]); } catch {}
    rmSync(dir, { recursive: true, force: true });
  };
  return { client, stop };
}

// ログイン中のユーザー（authenticated ロール＋JWTの sub）として SQL を実行する。終わったら元に戻す
export async function as(client, userId, fn) {
  await client.query("begin");
  try {
    await client.query("set local role authenticated");
    await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(userId ? { sub: userId, role: "authenticated" } : {})]);
    const r = await fn((sql, params) => client.query(sql, params));
    await client.query("rollback");
    return r;
  } catch (e) {
    await client.query("rollback").catch(() => {});
    throw e;
  }
}
export async function asAnon(client, fn) {
  await client.query("begin");
  try {
    await client.query("set local role anon");
    const r = await fn((sql, params) => client.query(sql, params));
    await client.query("rollback");
    return r;
  } catch (e) { await client.query("rollback").catch(() => {}); throw e; }
}
