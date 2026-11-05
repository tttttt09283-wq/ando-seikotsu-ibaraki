// スタッフ登録（mgmt.register_user）のテスト
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { startDb, as } from "./db.mjs";
import { buildOrg } from "./fixtures.mjs";

let db, org;
const q = (sql, p) => db.client.query(sql, p);
before(async () => { db = await startDb(); org = await buildOrg(q); });
after(async () => { if (db) await db.stop(); });

const call = (x, id, extra = {}) => x(
  "select mgmt.register_user($1,$2,$3,$4,null,'正社員','2026-04-01',null,true,$5,$6,'2026-11-01') id",
  [id, extra.code ?? "N001", extra.login ?? "newstaff", "新人テスト", extra.store ?? org.store.IBARAKI, extra.role ?? "STAFF"]);

test("社長はプロフィールと最初の所属をまとめて登録でき、監査ログに残る", async () => {
  const id = randomUUID();
  await q("insert into auth.users (id, email) values ($1, 'newstaff@ando.jp')", [id]);
  await as(db.client, org.u.president, async (x) => {
    await call(x, id);
    const a = (await x("select r.code, s.code store, a.is_primary from mgmt.user_store_assignments a join mgmt.roles r on r.id = a.role_id join mgmt.stores s on s.id = a.store_id where a.user_id = $1", [id])).rows;
    assert.deepEqual(a, [{ code: "STAFF", store: "IBARAKI", is_primary: true }]);
    const u = (await x("select created_by, must_change_password from mgmt.users where id = $1", [id])).rows[0];
    assert.deepEqual(u, { created_by: org.u.president, must_change_password: true });
    const logs = (await x("select table_name from mgmt.audit_logs where record_id is not null and actor_user_id = $1 order by id", [org.u.president])).rows.map((r) => r.table_name);
    assert.ok(logs.includes("users") && logs.includes("user_store_assignments"));
  });
});

test("社長以外は登録できない", async () => {
  const id = randomUUID();
  await q("insert into auth.users (id, email) values ($1, 'x2@ando.jp')", [id]);
  for (const key of ["gm", "mgr_IBARAKI", "staff_IBARAKI"]) {
    await assert.rejects(as(db.client, org.u[key], (x) => call(x, id, { code: "N002", login: "xx2" })), /権限がありません/, key);
  }
});

test("途中で失敗したら何も残らない（所属の役職が不正）", async () => {
  const id = randomUUID();
  await q("insert into auth.users (id, email) values ($1, 'x3@ando.jp')", [id]);
  await assert.rejects(as(db.client, org.u.president, (x) => call(x, id, { code: "N003", login: "xx3", role: "GM" })), /店舗での役職/);
  assert.equal((await q("select count(*)::int n from mgmt.users where id = $1", [id])).rows[0].n, 0);
});

test("同じスタッフID・ログインIDは登録できない", async () => {
  const id = randomUUID();
  await q("insert into auth.users (id, email) values ($1, 'x4@ando.jp')", [id]);
  await assert.rejects(as(db.client, org.u.president, (x) => call(x, id, { code: "T001", login: "xx4" })), /duplicate key/);
});
