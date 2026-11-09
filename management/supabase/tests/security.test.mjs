// PHASE 10：セキュリティ・POSとの共用・性能のテスト（ローカルの PostgreSQL で実行）
// docs/test-plan.md §6（セキュリティ検証）・T-18（POSとの共用）・§7（性能）
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { startDb } from "./db.mjs";
import { buildOrg } from "./fixtures.mjs";

let db, org;
const q = (sql, p) => db.client.query(sql, p);
async function as(sub, sql, params = [], role = "authenticated") {
  await q("begin");
  try {
    await q(`set local role ${role}`);
    await q("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(sub ? { sub, role } : { role })]);
    const r = await q(sql, params);
    await q("commit");
    return r.rows;
  } catch (e) { await q("rollback"); throw e; }
}
const run = (k, sql, p) => as(org.u[k], sql, p);

before(async () => {
  db = await startDb();
  org = await buildOrg(q);
});
after(async () => { if (db) await db.stop(); });

test("RLS・権限の網羅：全テーブルで RLS 有効、anon は表も関数も使えない、SECURITY DEFINER は search_path 固定", async () => {
  const noRls = (await q("select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'mgmt' and c.relkind = 'r' and not c.relrowsecurity")).rows;
  assert.deepEqual(noRls, []);
  const anonTables = (await q("select table_name from information_schema.role_table_grants where table_schema = 'mgmt' and grantee in ('anon','PUBLIC')")).rows;
  assert.deepEqual(anonTables, []);
  const anonFns = (await q("select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'mgmt' and has_function_privilege('anon', p.oid, 'execute')")).rows;
  assert.deepEqual(anonFns, []);
  const noPath = (await q(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'mgmt' and p.prosecdef
    and not exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%')`)).rows;
  assert.deepEqual(noPath, []);
});

test("直接の書き込みは、社長が使うマスタ・取り込み・付与の表と、通知の既読だけ（ほかは関数を通す）", async () => {
  const w = (await q(`select table_name, string_agg(distinct privilege_type, ',' order by privilege_type) p from information_schema.role_table_grants
    where table_schema = 'mgmt' and grantee = 'authenticated' and privilege_type in ('INSERT','UPDATE','DELETE') group by table_name order by table_name`)).rows;
  assert.deepEqual(w.map((r) => r.table_name), ["areas", "import_batches", "import_rows", "leave_adjustments", "leave_grants", "leave_policies", "stores", "user_roles", "user_store_assignments", "users"]);
  // それらの表は RLS で社長（master.manage / leave.adjust / leave.import）に限られる
  for (const [t, cols] of [["stores", "(code, name, display_order) values ('X1','x',99)"], ["areas", "(name) values ('x')"]]) {
    await assert.rejects(run("gm", `insert into mgmt.${t} ${cols}`), /row-level security|permission denied/, t);
  }
  // 申請・承認・取得の表は社長でも直接は変えられない
  for (const sql of ["update mgmt.leave_requests set status = 'approved'", "update mgmt.approval_steps set status = 'approved'",
    "update mgmt.leave_usage set status = 'taken'", "delete from mgmt.notifications", "update mgmt.company_rule_versions set status = 'published'"]) {
    await assert.rejects(run("president", sql), /permission denied/, sql);
  }
  // 通知は既読の時刻だけ、自分の分だけ変えられる
  await assert.rejects(run("staff_IBARAKI", "update mgmt.notifications set title = 'x'"), /permission denied/);
});

test("監査ログ・承認の履歴は、誰も（データベースの管理者でも）変更・削除できない", async () => {
  await run("president", "select mgmt.update_setting('shift_cutoff_day','20')");
  await q("insert into mgmt.approval_events (request_kind, request_id, action) values ('leave', gen_random_uuid(), 'submit')");
  for (const t of ["audit_logs", "approval_events"]) {
    await assert.rejects(q(`update mgmt.${t} set occurred_at = now()`), /変更・削除できません/, t);
    await assert.rejects(q(`delete from mgmt.${t}`), /変更・削除できません/, t);
  }
});

test("入力値：長すぎる・範囲外の値は DB が拒否する。HTML は文字としてそのまま保存（画面ではエスケープして表示）", async () => {
  await assert.rejects(run("mgr_IBARAKI", "select mgmt.create_meeting($1,'2026-11-01',$2)", [org.store.IBARAKI, "x"]), /会議名/);
  await assert.rejects(run("mgr_IBARAKI", "select mgmt.create_task($1,'t',null,$2,null,'urgent')", [org.store.IBARAKI, org.u.staff_IBARAKI]), /タスクの内容|優先度/);
  await assert.rejects(run("mgr_IBARAKI", "select mgmt.submit_part_time_request($1,'plan',mgmt.jst_today() + 40,'10:00','15:00',500,'理由です',null,null)", [org.store.IBARAKI]), /休憩|break|check/i);
  const id = (await run("mgr_IBARAKI", "select mgmt.create_meeting($1,'2026-11-01',$2) id", [org.store.IBARAKI, "<script>alert(1)</script>"]))[0].id;
  assert.equal((await q("select title from public.meetings where id = $1", [id])).rows[0].title, "<script>alert(1)</script>");
});

test("T-18：POSの画面（POSのスタッフとしてログイン）から会議・行動計画を今までどおり登録・更新・削除できる", async () => {
  const posUid = randomUUID();
  await q("insert into auth.users (id, email) values ($1, 'pos@x')", [posUid]);
  await q("insert into public.stores (id, name) values (1, '香里園駅前院') on conflict do nothing");
  await q("update mgmt.stores set pos_store_id = 1 where code = 'KORIEN'");
  await q("insert into public.clinic_staff (id, name, email, store_ids, auth_uid) values (70, 'POS院長', 'p70@x', '{1}', $1)", [posUid]);
  // POS の画面と同じ操作（index.html の sb.insert / sb.update / sb.delete）
  const m = (await as(posUid, "insert into public.meetings (held_on, title, notes, created_by) values (current_date - 1, '院内ミーティング', 'メモ', 70) returning id, mgmt_store_id, minutes_status"))[0];
  assert.equal(m.mgmt_store_id, org.store.KORIEN, "作成者の所属から院が決まる");
  assert.equal(m.minutes_status, "awaiting_minutes");
  await as(posUid, "insert into public.action_items (title, owner_staff_id, due_date, priority, meeting_id, source, created_by) values ('POP', 70, current_date + 7, 'mid', $1, 'meeting', 70)", [m.id]);
  await as(posUid, "update public.action_items set status = 'done', progress = 100, updated_at = now() where meeting_id = $1", [m.id]);
  await as(posUid, "update public.meetings set title = '院内ミーティング（修正）', photos = '[]' where id = $1", [m.id]);
  // 新システムで議事録を提出 → POS の会議の行に状態が入る
  await run("mgr_KORIEN", "select mgmt.save_minutes($1,'議題','内容です',$2,'{}','[]',true,true)", [m.id, [org.u.mgr_KORIEN]]);
  const pos = (await as(posUid, "select title, minutes_status from public.meetings where id = $1", [m.id]))[0];
  assert.deepEqual(pos, { title: "院内ミーティング（修正）", minutes_status: "submitted" });
  // POS で会議を削除しても（議事録ごと）エラーにならない
  await as(posUid, "delete from public.meetings where id = $1", [m.id]);
  assert.equal((await q("select count(*)::int c from mgmt.meeting_minutes where meeting_id = $1", [m.id])).rows[0].c, 0);
  // POS のスタッフでない人（新システムだけの利用者）は POS の表を直接は読めない（POS の RLS のまま）
  assert.deepEqual(await run("staff_IBARAKI", "select id from public.meetings"), []);
});

test("退職：その院の院長がいなくなり、承認待ちの振休が残ると、社長・GMに「承認者不在」を通知", async () => {
  await run("president", "select mgmt.add_leave_grant($1,'SHIFT',mgmt.jst_today(),1,'shift_earned',mgmt.jst_today())", [org.u.staff_OWADA]);
  await run("staff_OWADA", "select mgmt.submit_leave_request($1,'SHIFT',array[mgmt.jst_today() + 1]::date[])", [org.u.staff_OWADA]);
  const pending = (await q("select count(*)::int c from mgmt.leave_requests r join mgmt.users u on u.id = r.user_id where u.id = $1 and r.status = 'pending'", [org.u.staff_OWADA])).rows[0].c;
  assert.equal(pending, 1);
  await q("update mgmt.users set status = 'retired', retired_at = mgmt.jst_today() where id = $1", [org.u.mgr_OWADA]);
  const n = (await q("select user_id from mgmt.notifications where kind = 'approver_missing'")).rows.map((r) => r.user_id).sort();
  assert.deepEqual(n, [org.u.gm, org.u.president].sort());
  // 所属の終了（異動）で院長がいなくなった場合も同じ
  await run("president", "select mgmt.add_leave_grant($1,'SHIFT',mgmt.jst_today(),1,'shift_earned',mgmt.jst_today())", [org.u.staff_TSUDA]);
  await run("staff_TSUDA", "select mgmt.submit_leave_request($1,'SHIFT',array[mgmt.jst_today() + 1]::date[])", [org.u.staff_TSUDA]);
  await q("update mgmt.user_store_assignments set ends_on = mgmt.jst_today() - 1 where user_id = $1", [org.u.mgr_TSUDA]);
  assert.equal((await q("select count(*)::int c from mgmt.notifications where kind = 'approver_missing'")).rows[0].c, 4);
});

test("性能：7院・100名・申請と会議のデータで、KPI の集計が速い", async () => {
  const stores = Object.values(org.store);
  const staffRole = org.role.STAFF;
  // 100名に増やして、それぞれ有給を付与
  for (let i = 0; i < 85; i++) {
    const id = randomUUID();
    await q("insert into auth.users (id, email) values ($1, $2)", [id, `perf${i}@x`]);
    await q("insert into mgmt.users (id, staff_code, login_id, name) values ($1, $2, $3, $4)", [id, `P${i}`, `perf${i}`, `性能${i}`]);
    await q("insert into mgmt.user_store_assignments (user_id, store_id, role_id, is_primary, starts_on) values ($1,$2,$3,true,'2026-01-01')", [id, stores[i % 7], staffRole]);
    await q(`insert into mgmt.leave_grants (user_id, leave_type_id, grant_date, expires_on, days, source, counts_toward_5day)
      select $1, id, current_date - 100, current_date + 600, 10, 'statutory', true from mgmt.leave_types where code = 'PAID'`, [id]);
  }
  for (let i = 0; i < 120; i++) await q("insert into public.meetings (held_on, title, mgmt_store_id) values (current_date - ($1 % 40), '会議', $2)", [i, stores[i % 7]]);
  const users = (await q("select count(*)::int c from mgmt.users where status = 'active'")).rows[0].c;
  assert.ok(users >= 100, `${users}`);
  const t = Date.now();
  const rows = await run("gm", "select * from mgmt.store_kpis()");
  const ms = Date.now() - t;
  assert.equal(rows.length, 7);
  assert.ok(ms < 1000, `store_kpis ${ms}ms`);
  const t2 = Date.now(); await run("gm", "select mgmt.my_nav()"); assert.ok(Date.now() - t2 < 500, "my_nav");
  console.log(`# store_kpis(100名) ${ms}ms`);
});
