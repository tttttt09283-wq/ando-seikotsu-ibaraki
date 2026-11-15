import postgres from "postgres";

// Supabase の PostgreSQL に直接つなぐ（DATABASE_URL は Supabase の「Connection pooling（Transaction）」の URL）。
// サーバーだけが使う。ブラウザからは mn_ テーブルを一切読めない（RLS・権限の取り消し済み）。
let client: postgres.Sql | null = null;

export function sql(): postgres.Sql {
  if (client) return client;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("サーバー側に DATABASE_URL が設定されていません");
  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
  client = postgres(url, {
    prepare: false, // Supabase の接続プール（Transaction モード）では使えない
    max: local ? 1 : 3,
    idle_timeout: 20,
    ssl: local ? false : "require",
    connection: { TimeZone: "Asia/Tokyo" },
  });
  return client;
}

// テスト用：用意した接続を使う
export function useSql(c: postgres.Sql | null) {
  client = c;
}

export type Tx = postgres.TransactionSql;

// 書き込みは必ずこれを通す。監査ログの「誰が」は mn.actor から入る
export async function tx<T>(actorId: string | null, fn: (q: Tx) => Promise<T>): Promise<T> {
  return (await sql().begin(async (q) => {
    await q`select set_config('mn.actor', ${actorId ?? "system"}, true)`;
    return fn(q);
  })) as T;
}
