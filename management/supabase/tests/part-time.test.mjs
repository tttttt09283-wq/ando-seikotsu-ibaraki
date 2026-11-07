// PHASE 5：アルバイト勤務申請のテスト（ローカルの PostgreSQL で実行）
// 対応する検証項目：T-06（社長以外は最終承認できない）・シフト確定の基準日（前月20日：Q-20）・例外申請・勤務者の後入力（Q-8）
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startDb } from "./db.mjs";
import { buildOrg } from "./fixtures.mjs";

let db, org, D;
const q = (sql, p) => db.client.query(sql, p);
async function run(userKey, sql, params = []) {
  await q("begin");
  try {
    await q("set local role authenticated");
    await q("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: org.u[userKey], role: "authenticated" })]);
    const r = await q(sql, params);
    await q("commit");
    return r.rows;
  } catch (e) { await q("rollback"); throw e; }
}
before(async () => {
  db = await startDb();
  org = await buildOrg(q);
  await q("update mgmt.users set employment_type = 'アルバイト' where id = $1", [org.u.parttimer]);
  // 今日から見た日付（テストがいつ実行されても同じ意味になるように）
  D = (await q(`select
      (date_trunc('month', mgmt.jst_today()) + interval '2 month')::date::text as normal,           -- 再来月1日：基準日（来月20日）より前に申請 → 計画どおり
      (mgmt.jst_today() + 3)::text as late,                                                          -- 3日後：基準日（前月20日）を過ぎている → 例外申請
      mgmt.shift_cutoff_for((date_trunc('month', mgmt.jst_today()) + interval '2 month')::date)::text as normal_cutoff`)).rows[0];
});
after(async () => { if (db) await db.stop(); });

const submit = async (who, store, { category = "plan", date = D.normal, start = "10:00", end = "15:00", brk = 30, reason = "スタッフの研修で人手が足りない", worker = null, exc = null } = {}) =>
  (await run(who, "select mgmt.submit_part_time_request($1,$2,$3,$4,$5,$6,$7,$8,$9) id", [org.store[store], category, date, start, end, brk, reason, worker ? org.u[worker] : null, exc]))[0].id;
const stepOf = async (id) => (await q("select id, version from mgmt.approval_steps where part_time_request_id = $1 and status = 'pending'", [id])).rows[0];
const decide = async (who, id, action, reason = null) => {
  const s = await stepOf(id);
  return (await run(who, "select mgmt.decide_part_time_step($1,$2,$3,$4) st", [s.id, action, reason, s.version]))[0].st;
};
const row = async (id) => (await q("select status, is_exception, cutoff_date::text, worker_user_id from mgmt.part_time_requests where id = $1", [id])).rows[0];

test("シフト確定の基準日は勤務する月の前月20日（設定で変更できる）", async () => {
  const r = (await q("select mgmt.shift_cutoff_for('2026-12-05')::text a, mgmt.shift_cutoff_for('2027-01-31')::text b, mgmt.shift_cutoff_for('2028-03-01')::text c")).rows[0];
  assert.deepEqual(r, { a: "2026-11-20", b: "2026-12-20", c: "2028-02-20" });
  await assert.rejects(run("mgr_IBARAKI", "select mgmt.update_setting('shift_cutoff_day', '15')"), /社長だけ/);
  await assert.rejects(run("president", "select mgmt.update_setting('shift_cutoff_day', '31')"), /1〜28日/);
  await run("president", "select mgmt.update_setting('shift_cutoff_day', '15')");
  assert.equal((await q("select mgmt.shift_cutoff_for('2026-12-05')::text c")).rows[0].c, "2026-11-15");
  await run("president", "select mgmt.update_setting('shift_cutoff_day', '20')");
});

test("院長が自院の勤務を申請。基準日前は計画どおり、基準日後は例外申請で理由が必須", async () => {
  const id = await submit("mgr_IBARAKI", "IBARAKI");
  assert.deepEqual(await row(id), { status: "pending", is_exception: false, cutoff_date: D.normal_cutoff, worker_user_id: null });
  await assert.rejects(submit("mgr_IBARAKI", "IBARAKI", { date: D.late }), /例外申請の理由/);
  const late = await submit("mgr_IBARAKI", "IBARAKI", { date: D.late, category: "help", exc: "急な欠勤が出たため" });
  assert.equal((await row(late)).is_exception, true);
  // 他院の院長・スタッフ・社長は申請できない（社長は承認する側）
  for (const key of ["mgr_KORIEN", "staff_IBARAKI", "president"]) {
    await assert.rejects(submit(key, "IBARAKI"), /院長です/, key);
  }
  await assert.rejects(submit("mgr_IBARAKI", "IBARAKI", { start: "15:00", end: "10:00" }), /終了時刻/);
  await assert.rejects(submit("mgr_IBARAKI", "IBARAKI", { reason: "" }), /申請理由/);
  // 緊急の申請は承認待ちの先頭に、社長への通知は【緊急】付きで
  const queue = await run("president", "select request_id, category from mgmt.my_part_time_queue()");
  assert.equal(queue[0].request_id, late);
  const n = (await q("select title from mgmt.notifications where user_id = $1 and kind = 'approval_request' and link = $2", [org.u.president, `/part-time/${late}`])).rows[0];
  assert.match(n.title, /^【緊急】/);
});

test("T-06：アルバイト勤務の最終承認は社長だけ。承認で勤務予定に確定", async () => {
  const id = await submit("mgr_KORIEN", "KORIEN", { worker: "parttimer" });
  const step = await stepOf(id);
  for (const key of ["gm", "bmSouth", "mgr_KORIEN", "mgr_IBARAKI"]) {
    await assert.rejects(decide(key, id, "approve"), /社長だけ/, key);
  }
  assert.equal(await decide("president", id, "approve"), "approved");
  // 勤務する人（アルバイト）と申請した院長に通知
  const toWorker = (await q("select count(*)::int c from mgmt.notifications where user_id = $1 and kind = 'part_time_confirmed'", [org.u.parttimer])).rows[0].c;
  assert.equal(toWorker, 1);
  await assert.rejects(run("president", "select mgmt.decide_part_time_step($1,'approve')", [step.id]), /すでに処理されています/, "二重承認はできない");
});

test("勤務する人は後から設定できる（アルバイト雇用の人だけ）。承認後の設定は社長に通知", async () => {
  const id = await submit("mgr_KORIEN", "KORIEN", { date: D.normal, start: "16:00", end: "20:00", brk: 0, category: "busy" });
  await decide("president", id, "approve");
  await assert.rejects(run("mgr_KORIEN", "select mgmt.assign_part_time_worker($1,$2)", [id, org.u.staff_KORIEN]), /アルバイト雇用の人/);
  await assert.rejects(run("mgr_IBARAKI", "select mgmt.assign_part_time_worker($1,$2)", [id, org.u.parttimer]), /権限がありません/);
  await run("mgr_KORIEN", "select mgmt.assign_part_time_worker($1,$2)", [id, org.u.parttimer]);
  assert.equal((await row(id)).worker_user_id, org.u.parttimer);
  const ev = (await q("select action from mgmt.approval_events where request_id = $1 order by id", [id])).rows.map((r) => r.action);
  assert.deepEqual(ev, ["submit", "approve", "assign_worker"]);
  const toPresident = (await q("select count(*)::int c from mgmt.notifications where user_id = $1 and kind = 'part_time_worker'", [org.u.president])).rows[0].c;
  assert.equal(toPresident, 1);
});

test("差戻し→再申請、却下は理由必須、取下げ・取消、見る権限", async () => {
  const id = await submit("mgr_TSUDA", "TSUDA");
  await assert.rejects(decide("president", id, "return"), /理由/);
  assert.equal(await decide("president", id, "return", "時間を短くしてください"), "returned");
  await run("mgr_TSUDA", "select mgmt.resubmit_part_time_request($1,'plan',$2,'10:00','13:00',0,'午前だけお願いしたい')", [id, D.normal]);
  assert.equal((await row(id)).status, "pending");
  assert.equal(await decide("president", id, "approve"), "approved");
  await assert.rejects(run("mgr_TSUDA", "select mgmt.cancel_part_time_request($1,'')", [id]), /理由/);
  await run("mgr_TSUDA", "select mgmt.cancel_part_time_request($1,'欠員が解消したため')", [id]);
  assert.equal((await row(id)).status, "cancelled");

  const id2 = await submit("mgr_TSUDA", "TSUDA");
  await run("mgr_TSUDA", "select mgmt.withdraw_part_time_request($1)", [id2]);
  assert.equal((await row(id2)).status, "withdrawn");
  assert.equal((await run("president", "select count(*)::int c from mgmt.my_part_time_queue() where request_id = $1", [id2]))[0].c, 0);

  // 見る権限：自院の院長・社長・GMは見える。他院の院長・スタッフは見えない
  const seen = async (key) => (await run(key, "select count(*)::int c from mgmt.part_time_requests where id = $1", [id]))[0].c;
  assert.deepEqual(await Promise.all(["mgr_TSUDA", "president", "gm"].map(seen)), [1, 1, 1]);
  assert.deepEqual(await Promise.all(["mgr_IBARAKI", "staff_TSUDA"].map(seen)), [0, 0]);
  // 直接の書き込みはできない
  await assert.rejects(run("president", "update mgmt.part_time_requests set status = 'approved' where id = $1", [id2]), /permission denied/);
});

test("履歴は操作した人の名前つきで、申請を見られる人だけが取得できる", async () => {
  const id = await submit("mgr_OWADA", "OWADA");
  await decide("president", id, "approve");
  const h = await run("mgr_OWADA", "select action, actor_name from mgmt.request_history('part_time', $1)", [id]);
  assert.deepEqual(h.map((x) => [x.action, x.actor_name]), [["submit", "テストmgr_OWADA"], ["approve", "テストpresident"]]);
  assert.deepEqual(await run("mgr_IBARAKI", "select * from mgmt.request_history('part_time', $1)", [id]), []);
});
