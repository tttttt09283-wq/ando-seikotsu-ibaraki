// PHASE 10：本番の戻し方（supabase/production/99_rollback.sql）が動き、POS の表が元のまま使えること
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { startDb } from "./db.mjs";
import { buildOrg } from "./fixtures.mjs";

let db, org;
const q = (sql, p) => db.client.query(sql, p);
before(async () => { db = await startDb(); org = await buildOrg(q); });
after(async () => { if (db) await db.stop(); });

test("戻し方の SQL：mgmt と POS に足した列・トリガーが消え、POS の会議・行動計画はそのまま使える", async () => {
  // 新システムで会議を作り、議事録を出した状態から戻す
  await q("begin"); await q("set local role authenticated");
  await q("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: org.u.mgr_IBARAKI, role: "authenticated" })]);
  const id = (await q("select mgmt.create_meeting($1, current_date - 1, '進捗会議') id", [org.store.IBARAKI])).rows[0].id;
  await q("commit");
  await q("insert into public.action_items (title, meeting_id) values ('POSの行動計画', $1)", [id]);
  const sql = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "production", "99_rollback.sql"), "utf8");
  await q(sql);
  assert.equal((await q("select to_regnamespace('mgmt') is null gone")).rows[0].gone, true);
  const cols = (await q("select column_name from information_schema.columns where table_schema = 'public' and table_name = 'meetings' order by ordinal_position")).rows.map((r) => r.column_name);
  assert.deepEqual(cols, ["id", "held_on", "title", "notes", "store_id", "created_by", "created_at", "photos"], "POS の元の列だけに戻る");
  // POS の操作がそのまま動く
  const m = (await q("insert into public.meetings (title) values ('POSの会議') returning id")).rows[0].id;
  await q("insert into public.action_items (title, meeting_id) values ('x', $1)", [m]);
  await q("update public.action_items set status = 'done' where meeting_id = $1", [m]);
  await q("delete from public.meetings where id = $1", [id]);
  assert.equal((await q("select count(*)::int c from public.meetings")).rows[0].c, 1);
});
