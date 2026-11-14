import type { AuditLog, TableName } from "../../types";
import type { Match, Row, UserStore } from "./types";

const SKIP: TableName[] = ["audit_logs"];

function recordId(r: Record<string, unknown> | undefined): string {
  if (!r) return "";
  return String(r.id ?? r.user_id ?? r.task_id ?? "");
}

/** すべての更新・削除を audit_logs に追記するラッパー（変更前・変更後を保存） */
export class AuditedStore implements UserStore {
  constructor(private inner: UserStore) {}
  get userId() {
    return this.inner.userId;
  }
  get mode() {
    return this.inner.mode;
  }
  list<T extends TableName>(table: T) {
    return this.inner.list(table);
  }

  private async log(entries: Partial<AuditLog>[]) {
    if (!entries.length) return;
    try {
      await this.inner.insert("audit_logs", entries);
    } catch (e) {
      // 監査ログの失敗で本来の保存を止めない（ただしサーバーログには残す）
      console.error("audit log failed", e);
    }
  }

  async logEvent(action: AuditLog["action"], table: string, after: unknown, recordIdValue = "") {
    await this.log([{ action, table_name: table, record_id: recordIdValue, before: null, after: after as never }]);
  }

  async insert<T extends TableName>(table: T, rows: Partial<Row<T>>[]) {
    const out = await this.inner.insert(table, rows);
    if (!SKIP.includes(table)) await this.log(out.map((r) => ({ action: "insert" as const, table_name: table, record_id: recordId(r as never), before: null, after: r as never })));
    return out;
  }

  private async before<T extends TableName>(table: T, match: Match<T>) {
    const all = await this.inner.list(table);
    return all.filter((r) => Object.entries(match as Record<string, unknown>).every(([k, v]) => (r as unknown as Record<string, unknown>)[k] === v));
  }

  async update<T extends TableName>(table: T, match: Match<T>, patch: Partial<Row<T>>) {
    const before = SKIP.includes(table) ? [] : await this.before(table, match);
    const out = await this.inner.update(table, match, patch);
    if (!SKIP.includes(table))
      await this.log(
        out.map((r) => {
          const b = before.find((x) => recordId(x as never) === recordId(r as never));
          return { action: "update" as const, table_name: table, record_id: recordId(r as never), before: (b ?? null) as never, after: r as never };
        }),
      );
    return out;
  }

  async upsert<T extends TableName>(table: T, rows: Partial<Row<T>>[], conflict: string[], ignore?: boolean) {
    const out = await this.inner.upsert(table, rows, conflict, ignore);
    if (!SKIP.includes(table)) await this.log(out.map((r) => ({ action: "update" as const, table_name: table, record_id: recordId(r as never), before: null, after: r as never })));
    return out;
  }

  async remove<T extends TableName>(table: T, match: Match<T>) {
    const before = SKIP.includes(table) ? [] : await this.before(table, match);
    const n = await this.inner.remove(table, match);
    if (n > 0) await this.log(before.map((b) => ({ action: "delete" as const, table_name: table, record_id: recordId(b as never), before: b as never, after: null })));
    return n;
  }

  get raw() {
    return this.inner;
  }
}
