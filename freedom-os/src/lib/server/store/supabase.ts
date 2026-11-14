import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { TableName } from "../../types";
import { ownerCol, type Match, type Row, type UserStore } from "./types";

const PAGE = 1000;

/** Supabase（PostgreSQL + RLS）ストア。RLS に加えて、念のためアプリ側でも user_id で絞る */
export class SupabaseStore implements UserStore {
  readonly mode = "supabase" as const;
  constructor(readonly userId: string, private sb: SupabaseClient) {}

  async list<T extends TableName>(table: T): Promise<Row<T>[]> {
    const out: Row<T>[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await this.sb.from(table).select("*").eq(ownerCol(table), this.userId).range(from, from + PAGE - 1);
      if (error) throw new Error(`${table} の読み込みに失敗しました：${error.message}`);
      out.push(...((data ?? []) as Row<T>[]));
      if (!data || data.length < PAGE) break;
    }
    return out;
  }

  async insert<T extends TableName>(table: T, rows: Partial<Row<T>>[]): Promise<Row<T>[]> {
    if (!rows.length) return [];
    const payload = rows.map((r) => ({ ...r, [ownerCol(table)]: this.userId }));
    const { data, error } = await this.sb.from(table).insert(payload).select("*");
    if (error) throw new Error(`${table} の保存に失敗しました：${error.message}`);
    return (data ?? []) as Row<T>[];
  }

  async update<T extends TableName>(table: T, match: Match<T>, patch: Partial<Row<T>>): Promise<Row<T>[]> {
    const clean = { ...(patch as Record<string, unknown>) };
    delete clean[ownerCol(table)];
    delete clean.id;
    let q = this.sb.from(table).update(clean).eq(ownerCol(table), this.userId);
    for (const [k, v] of Object.entries(match as Record<string, unknown>)) q = v === null ? q.is(k, null) : q.eq(k, v as string);
    const { data, error } = await q.select("*");
    if (error) throw new Error(`${table} の更新に失敗しました：${error.message}`);
    return (data ?? []) as Row<T>[];
  }

  async upsert<T extends TableName>(table: T, rows: Partial<Row<T>>[], conflict: string[], ignore = false): Promise<Row<T>[]> {
    if (!rows.length) return [];
    const payload = rows.map((r) => ({ ...r, [ownerCol(table)]: this.userId }));
    const { data, error } = await this.sb.from(table).upsert(payload, { onConflict: conflict.join(","), ignoreDuplicates: ignore }).select("*");
    if (error) throw new Error(`${table} の保存に失敗しました：${error.message}`);
    return (data ?? []) as Row<T>[];
  }

  async remove<T extends TableName>(table: T, match: Match<T>): Promise<number> {
    let q = this.sb.from(table).delete({ count: "exact" }).eq(ownerCol(table), this.userId);
    for (const [k, v] of Object.entries(match as Record<string, unknown>)) q = v === null ? q.is(k, null) : q.eq(k, v as string);
    const { error, count } = await q;
    if (error) throw new Error(`${table} の削除に失敗しました：${error.message}`);
    return count ?? 0;
  }
}
