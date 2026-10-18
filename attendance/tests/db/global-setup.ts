import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import type { TestProject } from "vitest/node";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/**
 * テスト用DBを作り直し、Supabase互換の前提（shim）→ マイグレーション → seed の順に適用する。
 * 接続先は TEST_DATABASE_URL（既定：ローカルの postgres://postgres@127.0.0.1:54329/postgres）。
 */
export default async function setup(project: TestProject) {
  const baseUrl = process.env.TEST_DATABASE_URL ?? "postgres://postgres@127.0.0.1:54329/postgres";
  const dbName = "attendance_test";

  const admin = new pg.Client({ connectionString: baseUrl });
  try {
    await admin.connect();
  } catch (error) {
    throw new Error(
      `テスト用PostgreSQLに接続できません（${baseUrl}）。README の「DBテスト」を参照してください: ${String(error)}`,
    );
  }
  await admin.query(`drop database if exists ${dbName} with (force)`);
  await admin.query(`create database ${dbName}`);
  await admin.end();

  const url = new URL(baseUrl);
  url.pathname = `/${dbName}`;
  const client = new pg.Client({ connectionString: url.toString() });
  await client.connect();

  const migrationsDir = path.join(root, "supabase/migrations");
  const migrations = (await readdir(migrationsDir)).filter((f) => f.endsWith(".sql")).sort();
  const files = [
    path.join(root, "tests/db/supabase-shim.sql"),
    ...migrations.map((f) => path.join(migrationsDir, f)),
    path.join(root, "supabase/seed.sql"),
  ];
  for (const file of files) {
    try {
      await client.query(await readFile(file, "utf8"));
    } catch (error) {
      throw new Error(`${path.relative(root, file)} の適用に失敗しました: ${String(error)}`);
    }
  }
  await client.end();

  project.provide("dbUrl", url.toString());
}

declare module "vitest" {
  export interface ProvidedContext {
    dbUrl: string;
  }
}
