import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { emptyCompanyData, type CompanyData } from "@/lib/types";
import { TENANT } from "@/tenant";

/**
 * 会社データの保存層。
 * すべての書き込みは transact() 内で直列化され、読み取り→変更→保存が競合しない。
 * 本番で Supabase 等に差し替える場合も、このインターフェースを満たせばよい。
 */
export interface CompanyStore {
  read(): Promise<CompanyData>;
  transact<T>(fn: (data: CompanyData) => T | Promise<T>): Promise<T>;
  reset(): Promise<void>;
  readonly description: string;
}

/** 記録が増え続けてもファイルが肥大化しないよう、古いログから切り詰める */
const RETENTION = { activities: 3000, audit: 2000, messages: 1000, usage: 5000 } as const;

function applyRetention(data: CompanyData): void {
  for (const key of Object.keys(RETENTION) as (keyof typeof RETENTION)[]) {
    const arr = data[key] as unknown[];
    const max = RETENTION[key];
    if (arr.length > max) arr.splice(0, arr.length - max);
  }
}

class Mutex {
  private tail: Promise<void> = Promise.resolve();
  run<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.tail.then(fn);
    this.tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}

export class MemoryStore implements CompanyStore {
  readonly description = "メモリ（再起動で消去）";
  private data: CompanyData;
  private mutex = new Mutex();

  constructor(initial?: CompanyData) {
    this.data = initial ?? emptyCompanyData();
  }

  async read(): Promise<CompanyData> {
    return structuredClone(this.data);
  }

  transact<T>(fn: (data: CompanyData) => T | Promise<T>): Promise<T> {
    return this.mutex.run(async () => {
      // 失敗時に中途半端な変更が残らないよう、コピーに対して処理してから確定する
      const draft = structuredClone(this.data);
      const result = await fn(draft);
      applyRetention(draft);
      this.data = draft;
      return result;
    });
  }

  async reset(): Promise<void> {
    await this.mutex.run(async () => {
      this.data = emptyCompanyData();
    });
  }
}

export class FileStore implements CompanyStore {
  readonly description: string;
  private cache: CompanyData | null = null;
  private mutex = new Mutex();

  constructor(private readonly filePath: string) {
    this.description = `ファイル（${path.basename(path.dirname(filePath))}/${path.basename(filePath)}）`;
  }

  private async load(): Promise<CompanyData> {
    if (this.cache) return this.cache;
    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as CompanyData;
      const base = emptyCompanyData();
      this.cache = {
        ...base,
        ...parsed,
        reputation: { ...base.reputation, ...(parsed.reputation ?? {}) },
        budget: { ...base.budget, ...(parsed.budget ?? {}) },
        clinicSetup: { ...base.clinicSetup, ...(parsed.clinicSetup ?? {}) },
      };
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") {
        // 壊れたファイルは上書きせず退避してから新規作成する
        await fs.rename(this.filePath, `${this.filePath}.broken-${Date.now()}`).catch(() => {});
      }
      this.cache = emptyCompanyData();
    }
    return this.cache;
  }

  private async save(data: CompanyData): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(data), "utf8");
    await fs.rename(tmp, this.filePath);
  }

  read(): Promise<CompanyData> {
    return this.mutex.run(async () => structuredClone(await this.load()));
  }

  transact<T>(fn: (data: CompanyData) => T | Promise<T>): Promise<T> {
    return this.mutex.run(async () => {
      const draft = structuredClone(await this.load());
      const result = await fn(draft);
      applyRetention(draft);
      await this.save(draft);
      this.cache = draft;
      return result;
    });
  }

  async reset(): Promise<void> {
    await this.mutex.run(async () => {
      const fresh = emptyCompanyData();
      await this.save(fresh);
      this.cache = fresh;
    });
  }
}

export function resolveDataDir(): string {
  if (process.env.EH_DATA_DIR) return process.env.EH_DATA_DIR;
  // Vercel 等のサーバーレス環境ではプロジェクト直下に書き込めないため一時領域を使う
  if (process.env.VERCEL) return path.join(os.tmpdir(), "enejoy-hand-ai");
  return path.join(process.cwd(), ".data");
}

const globalForStore = globalThis as unknown as { __ehStore?: CompanyStore };

/** プロセス内で1つだけのストアを返す（開発時のホットリロードでも共有） */
export function getStore(): CompanyStore {
  if (!globalForStore.__ehStore) {
    globalForStore.__ehStore = new FileStore(path.join(resolveDataDir(), `${TENANT.id}.json`));
  }
  return globalForStore.__ehStore;
}
