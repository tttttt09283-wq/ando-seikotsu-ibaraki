import "server-only";
import { join } from "node:path";
import { assertModeAllowed, config, dataMode } from "../config";
import { MemoryRepo } from "./memory";
import { PgRepo, createPool } from "./pg";
import type { Repo } from "./types";

const g = globalThis as unknown as { __iwanagaRepo?: Repo };

export function getRepo(): Repo {
  if (g.__iwanagaRepo) return g.__iwanagaRepo;
  assertModeAllowed();
  if (dataMode() === "postgres") {
    g.__iwanagaRepo = new PgRepo(createPool(config.databaseUrl!, { caCert: config.databaseCaCert }));
  } else {
    g.__iwanagaRepo = new MemoryRepo(process.env.LOCAL_DB_FILE ?? join(process.cwd(), ".data", "local-db.json"));
  }
  return g.__iwanagaRepo;
}

/** テスト用 */
export function setRepo(repo: Repo | undefined) {
  g.__iwanagaRepo = repo;
}
