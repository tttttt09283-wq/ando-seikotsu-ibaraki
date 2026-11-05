// PHASE 2：権限・店舗スコープ・RLS・監査ログのテスト（ローカルの PostgreSQL で実行）
// 対応する検証項目：T-12（複数店舗所属）・T-13（7院の混在防止）・T-19（anon から読めない）・監査ログ
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startDb, as, asAnon } from "./db.mjs";
import { buildOrg } from "./fixtures.mjs";

let db, org;
const q = (sql, p) => db.client.query(sql, p);
const STORES = ["HIRAKATA", "TAGUCHIYAMA", "TSUDA", "KATANO", "IBARAKI", "OWADA", "KORIEN"];

before(async () => {
  db = await startDb();
  org = await buildOrg(q);
});
after(async () => { if (db) await db.stop(); });

const ids = (rows) => rows.map((r) => r.id).sort();
const userIdsVisibleTo = (key) => as(db.client, org.u[key], async (x) => ids((await x("select id from mgmt.users")).rows));
const assignedTo = async (code) => ids((await q(
  "select distinct a.user_id as id from mgmt.user_store_assignments a join mgmt.stores s on s.id = a.store_id where s.code = $1 and a.starts_on <= mgmt.jst_today() and (a.ends_on is null or a.ends_on >= mgmt.jst_today())", [code])).rows);

test("初期マスタ：7院・6役職がある", async () => {
  assert.equal((await q("select count(*)::int n from mgmt.stores")).rows[0].n, 7);
  assert.deepEqual((await q("select code from mgmt.roles order by rank")).rows.map((r) => r.code), ["PRESIDENT", "GM", "BM", "MANAGER", "STAFF", "PART_TIMER"]);
});

test("T-19：公開ページの鍵（anon）では mgmt のどのテーブルも読めない", async () => {
  const tables = (await q("select tablename from pg_tables where schemaname = 'mgmt'")).rows.map((r) => r.tablename);
  assert.ok(tables.length >= 9);
  for (const t of tables) {
    await assert.rejects(asAnon(db.client, (x) => x(`select * from mgmt.${t} limit 1`)), /permission denied/, t);
  }
  await assert.rejects(asAnon(db.client, (x) => x("select mgmt.can('master.manage')")), /permission denied/);
});

test("全テーブルで RLS が有効", async () => {
  const off = (await q("select tablename from pg_tables where schemaname = 'mgmt' and not rowsecurity")).rows;
  assert.deepEqual(off, []);
});

test("T-13：7院の院長は、自院に所属する人（と自分）しか見えない", async () => {
  for (const code of STORES) {
    const seen = await userIdsVisibleTo(`mgr_${code}`);
    const expected = [...new Set([...(await assignedTo(code)), org.u[`mgr_${code}`]])].sort();
    assert.deepEqual(seen, expected, code);
    // 他院の院長・スタッフは見えない
    for (const other of STORES.filter((c) => c !== code)) {
      if (other === "IBARAKI" && code === "KATANO") continue; // 兼務者（dual）は交野院の院長として見える
      assert.ok(!seen.includes(org.u[`staff_${other}`]), `${code} の院長に ${other} のスタッフが見える`);
    }
  }
});

test("T-13：一般スタッフ・アルバイトは自分しか見えない", async () => {
  for (const key of ["staff_IBARAKI", "staff_HIRAKATA", "parttimer"]) {
    assert.deepEqual(await userIdsVisibleTo(key), [org.u[key]], key);
  }
  const a = await as(db.client, org.u.staff_IBARAKI, async (x) => (await x("select user_id from mgmt.user_store_assignments")).rows);
  assert.ok(a.every((r) => r.user_id === org.u.staff_IBARAKI));
});

test("BMは担当エリアの院の人だけ見える、社長・GMは全員見える", async () => {
  const seen = await userIdsVisibleTo("bmSouth");
  for (const c of ["IBARAKI", "OWADA", "KORIEN"]) assert.ok(seen.includes(org.u[`staff_${c}`]), c);
  for (const c of ["HIRAKATA", "TAGUCHIYAMA", "TSUDA", "KATANO"]) assert.ok(!seen.includes(org.u[`staff_${c}`]), c);
  const all = ids((await q("select id from mgmt.users")).rows);
  assert.deepEqual(await userIdsVisibleTo("president"), all);
  assert.deepEqual(await userIdsVisibleTo("gm"), all);
});

test("T-12：複数店舗所属（交野院の院長＋茨木院のスタッフ）は、院ごとの役職の権限だけを持つ", async () => {
  const r = await as(db.client, org.u.dual, async (x) => (await x(
    "select mgmt.can('leave.shift.approve', $1) katano, mgmt.can('leave.shift.approve', $2) ibaraki, mgmt.can('staff.view.store', $2) view_ibaraki, mgmt.can('master.manage') master",
    [org.store.KATANO, org.store.IBARAKI])).rows[0]);
  assert.deepEqual(r, { katano: true, ibaraki: false, view_ibaraki: false, master: false });
  const seen = await userIdsVisibleTo("dual");
  assert.ok(seen.includes(org.u.staff_KATANO));
  assert.ok(!seen.includes(org.u.staff_IBARAKI), "茨木院ではスタッフなので、ほかの茨木院スタッフは見えない");
  const stores = await as(db.client, org.u.dual, async (x) => (await x("select s.code from mgmt.visible_store_ids() v join mgmt.stores s on s.id = v order by 1")).rows.map((r) => r.code));
  assert.deepEqual(stores, ["IBARAKI", "KATANO"]);
});

test("権限の判定：院長は自院の振休だけ承認できる、社長・GMは全院の閲覧", async () => {
  const r = await as(db.client, org.u.mgr_IBARAKI, async (x) => (await x(
    "select mgmt.can('leave.shift.approve', $1) own, mgmt.can('leave.shift.approve', $2) other, mgmt.can('leave.paid.final_approve', $1) paid, mgmt.can_anywhere('leave.shift.approve') anywhere",
    [org.store.IBARAKI, org.store.KORIEN])).rows[0]);
  assert.deepEqual(r, { own: true, other: false, paid: false, anywhere: true });
  const p = await as(db.client, org.u.president, async (x) => (await x(
    "select mgmt.can('leave.paid.final_approve') paid, mgmt.can('leave.shift.approve', $1) shift, mgmt.can('master.manage') master", [org.store.IBARAKI])).rows[0]);
  assert.deepEqual(p, { paid: true, shift: false, master: true }, "社長は振休を閲覧のみ（承認は院長）");
  const g = await as(db.client, org.u.gm, async (x) => (await x("select mgmt.can('leave.paid.final_approve') paid, mgmt.can('holidaychange.gm_review') review, mgmt.can('leave.view.store', $1) view", [org.store.TSUDA])).rows[0]);
  assert.deepEqual(g, { paid: false, review: true, view: true });
});

test("退職者は何も見えず、権限も無い", async () => {
  const r = await as(db.client, org.u.retired, async (x) => ({
    me: (await x("select mgmt.current_user_id() id, mgmt.me() me")).rows[0],
    stores: (await x("select count(*)::int n from mgmt.stores")).rows[0].n,
    users: (await x("select count(*)::int n from mgmt.users")).rows[0].n,
  }));
  assert.deepEqual(r, { me: { id: null, me: null }, stores: 0, users: 0 });
});

test("異動：終了した所属は効かない", async () => {
  const stores = await as(db.client, org.u.moved, async (x) => (await x("select s.code from mgmt.visible_store_ids() v join mgmt.stores s on s.id = v")).rows.map((r) => r.code));
  assert.deepEqual(stores, ["TSUDA"]);
  assert.ok(!(await userIdsVisibleTo("mgr_HIRAKATA")).includes(org.u.moved));
  assert.ok((await userIdsVisibleTo("mgr_TSUDA")).includes(org.u.moved));
});

test("マスタの変更は社長だけ（GM・院長・スタッフは不可）", async () => {
  const addStore = (x) => x("insert into mgmt.stores (code, name) values ('TEST8', 'テスト院') returning id");
  const ok = await as(db.client, org.u.president, async (x) => (await addStore(x)).rows.length);
  assert.equal(ok, 1);
  for (const key of ["gm", "bmSouth", "mgr_IBARAKI", "staff_IBARAKI"]) {
    await assert.rejects(as(db.client, org.u[key], addStore), /row-level security/, key);
  }
  // 院長が自分を社長にする（権限の昇格）はできない
  await assert.rejects(as(db.client, org.u.mgr_IBARAKI, (x) => x("insert into mgmt.user_roles (user_id, role_id) values ($1, $2)", [org.u.mgr_IBARAKI, org.role.PRESIDENT])), /row-level security/);
  // 院長が他人の所属を書き換えることもできない（見えない行は更新されない）
  const n = await as(db.client, org.u.mgr_IBARAKI, async (x) => (await x("update mgmt.user_store_assignments set store_id = $1 where user_id = $2", [org.store.IBARAKI, org.u.staff_KORIEN])).rowCount);
  assert.equal(n, 0);
  // 削除は誰もできない（論理削除・終了日で管理）
  await assert.rejects(as(db.client, org.u.president, (x) => x("delete from mgmt.stores where code = 'KORIEN'")), /permission denied/);
});

test("役職と表の組み合わせの確認", async () => {
  await assert.rejects(q("insert into mgmt.user_store_assignments (user_id, store_id, role_id) values ($1,$2,$3)", [org.u.staff_TSUDA, org.store.OWADA, org.role.PRESIDENT]), /院長・一般スタッフ・アルバイト/);
  await assert.rejects(q("insert into mgmt.user_roles (user_id, role_id) values ($1,$2)", [org.u.gm, org.role.BM]), /担当エリア/);
  await assert.rejects(q("insert into mgmt.user_roles (user_id, role_id) values ($1,$2)", [org.u.gm, org.role.MANAGER]), /店舗の所属/);
  // 同じ人・同じ院で期間が重なる所属は登録できない
  await assert.rejects(q("insert into mgmt.user_store_assignments (user_id, store_id, role_id, starts_on) values ($1,$2,$3,'2026-06-01')", [org.u.staff_TSUDA, org.store.TSUDA, org.role.MANAGER]), /conflicting key value|exclusion/);
});

test("監査ログ：変更が記録され、誰も変更・削除できない。閲覧は社長・GMのみ", async () => {
  await as(db.client, org.u.president, async (x) => {
    await x("update mgmt.stores set display_order = 99 where code = 'KORIEN'");
    const log = (await x("select actor_user_id, action, after->>'display_order' ord from mgmt.audit_logs where table_name = 'stores' order by id desc limit 1")).rows[0];
    assert.deepEqual(log, { actor_user_id: org.u.president, action: "UPDATE", ord: "99" });
  });
  const seenByStaff = await as(db.client, org.u.staff_IBARAKI, async (x) => (await x("select count(*)::int n from mgmt.audit_logs")).rows[0].n);
  assert.equal(seenByStaff, 0);
  assert.ok(await as(db.client, org.u.gm, async (x) => (await x("select count(*)::int n from mgmt.audit_logs")).rows[0].n) > 0);
  await assert.rejects(as(db.client, org.u.president, (x) => x("update mgmt.audit_logs set action = 'X'")), /permission denied/);
  await assert.rejects(q("delete from mgmt.audit_logs"), /監査ログは変更・削除できません/, "管理者（スーパーユーザー）でも削除できない");
});

test("有効な社長が0人になる変更はできない", async () => {
  await q("begin");
  await q("update mgmt.user_roles set ends_on = '2026-01-01' where user_id = $1", [org.u.president]);
  await assert.rejects(q("commit"), /有効な社長が1人もいなくなる/);
  await q("rollback").catch(() => {});
  assert.equal((await q("select count(*)::int n from mgmt.user_roles where user_id = $1 and ends_on is null", [org.u.president])).rows[0].n, 1);
});

test("me()：自分の役職と所属が返る。PASS変更の記録は本人だけ", async () => {
  const me = await as(db.client, org.u.dual, async (x) => (await x("select mgmt.me() me")).rows[0].me);
  assert.equal(me.must_change_password, true);
  assert.deepEqual(me.stores.map((s) => [s.role, s.is_primary]).sort(), [["MANAGER", true], ["STAFF", false]]);
  await as(db.client, org.u.dual, async (x) => {
    await x("select mgmt.mark_password_changed()");
    const r = (await x("select id, must_change_password from mgmt.users where id = $1", [org.u.dual])).rows[0];
    assert.equal(r.must_change_password, false);
    // 本人でも、自分のほかの列（役職・状態）は直接変更できない
    const n = (await x("update mgmt.users set status = 'active', name = '書き換え' where id = $1", [org.u.dual])).rowCount;
    assert.equal(n, 0);
  });
});
