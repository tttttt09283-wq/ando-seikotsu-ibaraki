// PHASE 9：ダッシュボードの KPI と定期処理（通知）のテスト（ローカルの PostgreSQL で実行）
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startDb } from "./db.mjs";
import { buildOrg } from "./fixtures.mjs";

let db, org, D;
const q = (sql, p) => db.client.query(sql, p);
async function as(userKey, sql, params = [], role = "authenticated") {
  await q("begin");
  try {
    await q(`set local role ${role}`);
    await q("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(userKey ? { sub: org.u[userKey], role } : { role })]);
    const r = await q(sql, params);
    await q("commit");
    return r.rows;
  } catch (e) { await q("rollback"); throw e; }
}
const run = (k, sql, p) => as(k, sql, p);
const service = (sql, p) => as(null, sql, p, "service_role");

before(async () => {
  db = await startDb();
  org = await buildOrg(q);
  D = (await q(`select mgmt.jst_today()::text today, (mgmt.jst_today() + 1)::text tomorrow, (mgmt.jst_today() - 1)::text yesterday,
    (mgmt.jst_today() - 10)::text old, (mgmt.jst_today() + 30)::text due,
    ((mgmt.jst_today() - interval '2 years')::date + 30)::text paid_old, (mgmt.jst_today() - 300)::text paid_recent,
    (date_trunc('month', mgmt.jst_today()) - interval '1 month')::date::text shift_last_month,
    date_trunc('month', mgmt.jst_today())::date::text mon, (mgmt.jst_today() + 3)::text late,
    date_trunc('month', mgmt.jst_today() + 3)::date::text late_month`)).rows[0];
  const grant = (k, code, date, days) => run("president", "select mgmt.add_leave_grant($1,$2,$3,$4,$5,$6)",
    [org.u[k], code, date, days, code === "PAID" ? "statutory" : "shift_earned", code === "PAID" ? null : date]);
  await grant("staff_IBARAKI", "PAID", D.paid_old, 10);      // もうすぐ有効期限（あと約1か月）
  await grant("staff_IBARAKI", "PAID", D.paid_recent, 10);   // 年5日の期間の残りが約2か月・取得0日 → 警告
  await grant("staff_IBARAKI", "SHIFT", D.shift_last_month, 1); // 先月の振休 → 期限切れ
  await grant("staff_KORIEN", "SHIFT", D.today, 1);
});
after(async () => { if (db) await db.stop(); });

test("KPI は見られる院だけ：GM・社長は全院、BMは担当エリア、院長は自院、スタッフはなし", async () => {
  const n = async (k) => (await run(k, "select count(*)::int c from mgmt.store_kpis()"))[0].c;
  const counts = [];
  for (const k of ["gm", "president", "bmSouth", "mgr_IBARAKI", "staff_IBARAKI"]) counts.push(await n(k));  // 1つの接続なので順番に
  assert.deepEqual(counts, [7, 7, 3, 1, 0]);
  const mine = await run("mgr_IBARAKI", "select store_id from mgmt.store_kpis()");
  assert.equal(mine[0].store_id, org.store.IBARAKI);
});

test("KPI：議事録の提出率・期限超過・決定事項・アルバイト申請・休暇・規定の未確認", async () => {
  // 会議：今日開催して期限内に提出（決定事項1件）、10日前の会議は未提出（期限超過）
  const m1 = (await run("mgr_IBARAKI", "select mgmt.create_meeting($1,$2,'進捗会議') id", [org.store.IBARAKI, D.today]))[0].id;
  await run("mgr_IBARAKI", "select mgmt.save_minutes($1,'議題です','内容です',$2,'{}',$3,false,true)",
    [m1, [org.u.mgr_IBARAKI], JSON.stringify([{ title: "POPを作る", detail: "受付に置く", owner_user_id: org.u.staff_IBARAKI, due_date: D.today }])]);
  await run("mgr_IBARAKI", "select mgmt.create_meeting($1,$2,'問題解決会議')", [org.store.IBARAKI, D.old]);
  // アルバイト：シフト確定後のヘルプ（例外申請）
  await run("mgr_IBARAKI", "select mgmt.submit_part_time_request($1,'help',$2,'10:00','15:00',0,'急な欠勤',null,'当日の連絡のため')", [org.store.IBARAKI, D.late]);
  const k = (await run("gm", "select * from mgmt.store_kpis() where store_id = $1", [org.store.IBARAKI]))[0];
  assert.equal(k.meetings_held, 1); assert.equal(k.minutes_submitted, 1); assert.equal(k.minutes_on_time, 1);
  assert.equal(k.minutes_overdue_now, 1);
  assert.equal(k.decisions_due, 1); assert.equal(k.decisions_done, 0);
  assert.equal(Number(k.paid_granted), 20); assert.equal(Number(k.paid_taken), 0);
  assert.equal(k.five_day_risk, 1);
  assert.equal(Number(k.shift_expired), 1); assert.equal(Number(k.shift_remaining), 0);
  const pt = (await run("gm", "select parttime_total, parttime_help, parttime_exception, president_pending from mgmt.store_kpis($1) where store_id = $2", [D.late_month, org.store.IBARAKI]))[0];
  assert.deepEqual(pt, { parttime_total: 1, parttime_help: 1, parttime_exception: 1, president_pending: 1 });
  // 規定：公開すると対象者全員が未確認、確認すると減る
  const r = await run("president", "select mgmt.create_rule('099','テスト規定','## 目的\\nテストのための規定です。','{}',$1,false,null) id", [D.today]);
  await run("president", "select mgmt.submit_rule_version($1)", [r[0].id]);
  const s = (await q("select id from mgmt.approval_steps where rule_version_id = $1", [r[0].id])).rows[0];
  await run("president", "select mgmt.decide_rule_step($1,'approve')", [s.id]);
  await run("president", "select mgmt.publish_rule_version($1)", [r[0].id]);
  const before = (await run("gm", "select rule_unack, staff_count from mgmt.store_kpis() where store_id = $1", [org.store.IBARAKI]))[0];
  assert.equal(before.rule_unack, before.staff_count);
  await run("staff_IBARAKI", "select mgmt.acknowledge_rule($1)", [r[0].id]);
  assert.equal((await run("gm", "select rule_unack from mgmt.store_kpis() where store_id = $1", [org.store.IBARAKI]))[0].rule_unack, before.rule_unack - 1);
});

test("毎日の処理：有給の期限接近・期限切れの振休・タスクの期限・週次の年5日。2回動いても通知は1回", async () => {
  await assert.rejects(run("president", "select mgmt.run_daily_jobs(true)"), /permission denied/);
  await run("mgr_KORIEN", "select mgmt.create_task($1,'受付の整理',null,$2,$3)", [org.store.KORIEN, org.u.staff_KORIEN, D.yesterday]);
  await run("mgr_KORIEN", "select mgmt.create_task($1,'POPの差し替え',null,$2,$3)", [org.store.KORIEN, org.u.staff_KORIEN, D.tomorrow]);
  const r1 = (await service("select mgmt.run_daily_jobs(true) r"))[0].r;
  assert.ok(r1.paid_expiring >= 2, JSON.stringify(r1));   // 本人＋院長
  assert.ok(r1.shift_expired >= 3, JSON.stringify(r1));   // 本人＋院長＋GM
  assert.ok(r1.tasks >= 3, JSON.stringify(r1));            // 明日期限（担当）＋期限超過（担当・院長）＋会議の決定事項
  assert.ok(r1.five_day >= 4, JSON.stringify(r1));         // 本人・院長・GM・社長
  const kinds = async (k) => (await q("select kind from mgmt.notifications where user_id = $1 order by kind", [org.u[k]])).rows.map((x) => x.kind);
  const staffKinds = await kinds("staff_IBARAKI");
  for (const kind of ["leave_expiring", "shift_expired", "five_day"]) assert.ok(staffKinds.includes(kind), kind);
  assert.ok((await kinds("gm")).includes("shift_expired"));
  assert.ok((await kinds("president")).includes("five_day"));
  assert.ok((await kinds("mgr_KORIEN")).includes("task_overdue"));
  assert.ok((await kinds("staff_KORIEN")).includes("task_due"));
  const r2 = (await service("select mgmt.run_daily_jobs(true) r"))[0].r;
  assert.deepEqual([r2.paid_expiring, r2.shift_expired, r2.tasks, r2.five_day], [0, 0, 0, 0]);
  // 実行の記録（社長が見られる）
  const last = (await run("president", "select job, result is not null ok, error from mgmt.last_job_run()"))[0];
  assert.deepEqual(last, { job: "daily", ok: true, error: null });
  assert.deepEqual(await run("staff_IBARAKI", "select * from mgmt.last_job_run()"), []);
});

test("メニュー用の権限と件数を1回で返す", async () => {
  const boss = (await run("president", "select mgmt.my_nav() n"))[0].n;
  assert.ok(boss.perms.includes("leave.paid.final_approve") && boss.perms.includes("rule.approve"));
  assert.ok(boss.approvals >= 1, "アルバイト勤務の承認待ち");
  const staff = (await run("staff_IBARAKI", "select mgmt.my_nav() n"))[0].n;
  assert.ok(!staff.perms.includes("leave.paid.final_approve") && staff.perms.includes("leave.request.self"));
  assert.equal(staff.approvals, 0);
  assert.ok(staff.unread > 0);
});
