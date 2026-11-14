// ローカルモード用ストア（開発専用）。データは .data/<userId>.json に保存する。
// DB の外部キー（cascade / set null）と一意制約を最低限エミュレートして、Supabase と同じ振る舞いにする。
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { TableName } from "../../types";
import { HAS_ID, ownerCol, type Match, type Row, type UserStore } from "./types";

type DB = Partial<Record<TableName, Record<string, unknown>[]>>;

const UNIQUE: Partial<Record<TableName, string[][]>> = {
  user_settings: [["user_id"]],
  profiles: [["id"]],
  mandala_goals: [["user_id", "position"], ["user_id", "code"]],
  mandala_actions: [["goal_id", "position"]],
  task_dependencies: [["task_id", "depends_on_task_id"]],
  business_revenue: [["user_id", "month", "business", "category"]],
  business_expenses: [["user_id", "month", "business", "category"]],
  clinic_metrics: [["user_id", "month"]],
  ai_business_metrics: [["user_id", "month"]],
  household_finances: [["user_id", "month"]],
  financial_scenarios: [["user_id", "kind"]],
  scenario_assumptions: [["scenario_id", "key"]],
  independence_criteria: [["user_id", "code"]],
  weekly_reviews: [["user_id", "week_start"]],
};

const TIMESTAMPED: TableName[] = [
  "profiles",
  "user_settings",
  "mandala_goals",
  "mandala_actions",
  "tasks",
  "milestones",
  "business_revenue",
  "business_expenses",
  "clinic_metrics",
  "ai_business_metrics",
  "household_finances",
  "financial_scenarios",
  "scenario_assumptions",
  "independence_criteria",
  "weekly_reviews",
];

const queues = new Map<string, Promise<unknown>>();
let auditSeq = 0;
/** 監査ログの連番（bigserial 相当。同じミリ秒でも重複しない） */
const nextAuditId = () => Date.now() * 1000 + (auditSeq++ % 1000);

export function dataDir(): string {
  return process.env.FREEDOM_DATA_DIR || path.join(process.cwd(), ".data");
}

export class LocalStore implements UserStore {
  readonly mode = "local" as const;
  private file: string;
  constructor(readonly userId: string, dir = dataDir()) {
    if (!/^[a-zA-Z0-9-]+$/.test(userId)) throw new Error("invalid user id");
    this.file = path.join(dir, `${userId}.json`);
  }

  private async read(): Promise<DB> {
    try {
      return JSON.parse(await fs.readFile(this.file, "utf8")) as DB;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return {};
      throw e;
    }
  }
  private async write(db: DB) {
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(db), "utf8");
    await fs.rename(tmp, this.file);
  }
  /** 書き込みは直列化する（同時保存で消えないように） */
  private tx<R>(fn: (db: DB) => R | Promise<R>): Promise<R> {
    const prev = queues.get(this.file) ?? Promise.resolve();
    const run = prev.then(async () => {
      const db = await this.read();
      const r = await fn(db);
      await this.write(db);
      return r;
    });
    queues.set(this.file, run.catch(() => undefined));
    return run;
  }

  private rows(db: DB, t: TableName) {
    return (db[t] ??= []);
  }
  private matches(r: Record<string, unknown>, m: Record<string, unknown>) {
    return Object.entries(m).every(([k, v]) => r[k] === v);
  }
  private checkUnique(db: DB, t: TableName, row: Record<string, unknown>, selfIndex = -1) {
    for (const cols of UNIQUE[t] ?? []) {
      const clash = this.rows(db, t).findIndex((r, i) => i !== selfIndex && cols.every((c) => r[c] === row[c]));
      if (clash >= 0) throw new Error(`duplicate key value violates unique constraint (${t}: ${cols.join(",")})`);
    }
  }
  private withDefaults(t: TableName, r: Record<string, unknown>) {
    const now = new Date().toISOString();
    const out: Record<string, unknown> = { ...r };
    out[ownerCol(t)] = this.userId;
    if (HAS_ID[t] && out.id == null && t !== "profiles") out.id = t === "audit_logs" ? nextAuditId() : randomUUID();
    if (out.created_at == null && t !== "user_settings" && t !== "scenario_assumptions" && t !== "independence_criteria") out.created_at = now;
    if (TIMESTAMPED.includes(t)) out.updated_at = now;
    return out;
  }

  async list<T extends TableName>(table: T): Promise<Row<T>[]> {
    const db = await (queues.get(this.file) ?? Promise.resolve()).then(() => this.read());
    const oc = ownerCol(table);
    return structuredClone((db[table] ?? []).filter((r) => r[oc] === this.userId)) as unknown as Row<T>[];
  }

  insert<T extends TableName>(table: T, rows: Partial<Row<T>>[]): Promise<Row<T>[]> {
    return this.tx((db) => {
      const out: Record<string, unknown>[] = [];
      for (const r of rows) {
        const row = this.withDefaults(table, r as Record<string, unknown>);
        this.checkFk(db, table, row);
        this.checkUnique(db, table, row);
        this.rows(db, table).push(row);
        out.push(row);
      }
      return structuredClone(out) as unknown as Row<T>[];
    });
  }

  update<T extends TableName>(table: T, match: Match<T>, patch: Partial<Row<T>>): Promise<Row<T>[]> {
    if (table === "audit_logs") return Promise.reject(new Error("audit_logs は変更できません"));
    return this.tx((db) => {
      const m = { ...(match as Record<string, unknown>), [ownerCol(table)]: this.userId };
      const out: Record<string, unknown>[] = [];
      const list = this.rows(db, table);
      list.forEach((r, i) => {
        if (!this.matches(r, m)) return;
        const next = { ...r, ...(patch as Record<string, unknown>), [ownerCol(table)]: this.userId };
        if (HAS_ID[table]) next.id = r.id;
        if (TIMESTAMPED.includes(table)) next.updated_at = new Date().toISOString();
        this.checkFk(db, table, next);
        this.checkUnique(db, table, next, i);
        list[i] = next;
        out.push(next);
      });
      return structuredClone(out) as unknown as Row<T>[];
    });
  }

  upsert<T extends TableName>(table: T, rows: Partial<Row<T>>[], conflict: string[], ignore = false): Promise<Row<T>[]> {
    return this.tx((db) => {
      const out: Record<string, unknown>[] = [];
      const list = this.rows(db, table);
      for (const r of rows) {
        const row = this.withDefaults(table, r as Record<string, unknown>);
        const idx = list.findIndex((x) => conflict.every((c) => x[c] === row[c]));
        if (idx >= 0) {
          if (ignore) continue;
          const next = { ...list[idx], ...(r as Record<string, unknown>), [ownerCol(table)]: this.userId };
          if (HAS_ID[table]) next.id = list[idx].id;
          if (list[idx].created_at) next.created_at = list[idx].created_at;
          if (TIMESTAMPED.includes(table)) next.updated_at = new Date().toISOString();
          this.checkFk(db, table, next);
          list[idx] = next;
          out.push(next);
        } else {
          this.checkFk(db, table, row);
          this.checkUnique(db, table, row);
          list.push(row);
          out.push(row);
        }
      }
      return structuredClone(out) as unknown as Row<T>[];
    });
  }

  remove<T extends TableName>(table: T, match: Match<T>): Promise<number> {
    if (table === "audit_logs") return Promise.reject(new Error("audit_logs は削除できません"));
    return this.tx((db) => this.removeIn(db, table, { ...(match as Record<string, unknown>), [ownerCol(table)]: this.userId }));
  }

  /** 全データ削除（監査ログも含む。アカウント削除相当） */
  purgeAll(): Promise<void> {
    return this.tx((db) => {
      for (const k of Object.keys(db) as TableName[]) db[k] = (db[k] ?? []).filter((r) => r[ownerCol(k)] !== this.userId);
    });
  }

  // ---- 外部キーのエミュレーション ----
  private checkFk(db: DB, t: TableName, row: Record<string, unknown>) {
    const exists = (tb: TableName, id: unknown) => id == null || this.rows(db, tb).some((r) => r.id === id && r.user_id === this.userId);
    const fail = (c: string) => {
      throw new Error(`violates foreign key constraint (${t}.${c})`);
    };
    if (t === "mandala_actions" && !exists("mandala_goals", row.goal_id)) fail("goal_id");
    if (t === "tasks") {
      if (!exists("mandala_actions", row.mandala_action_id)) fail("mandala_action_id");
      if (!exists("tasks", row.parent_id)) fail("parent_id");
    }
    if (t === "task_dependencies" && (!exists("tasks", row.task_id) || !exists("tasks", row.depends_on_task_id))) fail("task_id");
    if (t === "scenario_assumptions" && !exists("financial_scenarios", row.scenario_id)) fail("scenario_id");
  }

  private removeIn(db: DB, t: TableName, m: Record<string, unknown>): number {
    const list = this.rows(db, t);
    const gone = list.filter((r) => this.matches(r, m));
    if (!gone.length) return 0;
    db[t] = list.filter((r) => !this.matches(r, m));
    for (const g of gone) {
      const id = g.id;
      if (t === "mandala_goals") this.removeIn(db, "mandala_actions", { goal_id: id });
      if (t === "mandala_actions") for (const task of this.rows(db, "tasks")) if (task.mandala_action_id === id) task.mandala_action_id = null;
      if (t === "tasks") {
        for (const task of this.rows(db, "tasks")) if (task.parent_id === id) task.parent_id = null;
        db.task_dependencies = this.rows(db, "task_dependencies").filter((d) => d.task_id !== id && d.depends_on_task_id !== id);
      }
      if (t === "financial_scenarios") this.removeIn(db, "scenario_assumptions", { scenario_id: id });
    }
    return gone.length;
  }
}
