// PHASE 6：振休からアルバイト勤務への変更（二段階承認）のテスト
// 対応する検証項目：T-05（GM確認前は社長が最終承認できない）・変更確定まで振休のまま・確定で振休は「使ったこと」になる（Q-8）
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startDb } from "./db.mjs";
import { buildOrg } from "./fixtures.mjs";

let db, org, FUT;
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
// 振休を付与し、本人が申請して院長が承認 → 取得予定（leave_usage）を返す
async function plannedShift(staffKey, mgrKey, workDate, offDate) {
  await run("president", "select mgmt.add_leave_grant($1,'SHIFT',$2,1,'shift_earned',$2)", [org.u[staffKey], workDate]);
  const req = (await run(staffKey, "select mgmt.submit_leave_request($1,'SHIFT',$2::date[]) id", [org.u[staffKey], [offDate]]))[0].id;
  const s = (await q("select id from mgmt.approval_steps where leave_request_id = $1 and status = 'pending'", [req])).rows[0];
  await run(mgrKey, "select mgmt.decide_leave_step($1,'approve')", [s.id]);
  return { req, usage: (await q("select id from mgmt.leave_usage where leave_request_id = $1", [req])).rows[0].id };
}
const steps = async (id) => (await q("select id, step_kind, status, version from mgmt.approval_steps where holiday_change_request_id = $1 order by step_no", [id])).rows;
const reqRow = async (id) => (await q("select status from mgmt.holiday_change_requests where id = $1", [id])).rows[0];
const usageStatus = async (usage) => (await q("select status from mgmt.leave_usage where id = $1", [usage])).rows[0].status;
const shiftBal = async (staffKey) => (await run("president", "select mgmt.leave_balance($1,'SHIFT') b", [org.u[staffKey]]))[0].b;

before(async () => {
  db = await startDb();
  org = await buildOrg(q);
  // 今日以前の出勤日（振休の発生）と、今日以降の振休の日
  FUT = (await q("select (mgmt.jst_today() - 1)::text work, (mgmt.jst_today() + 5)::text off, (mgmt.jst_today() + 6)::text off2, (mgmt.jst_today() + 7)::text off3")).rows[0];
});
after(async () => { if (db) await db.stop(); });

test("T-05：GMの事前確認が終わるまで、社長は最終承認できない。確定まで振休のまま、確定で振休は使ったことになる", async () => {
  const { usage } = await plannedShift("staff_IBARAKI", "mgr_IBARAKI", FUT.work, FUT.off);
  const before = await shiftBal("staff_IBARAKI");
  const id = (await run("mgr_IBARAKI", "select mgmt.submit_holiday_change($1,$2,'10:00','15:00',30,'急な欠員の穴埋め') id", [org.store.IBARAKI, usage]))[0].id;
  let st = await steps(id);
  assert.deepEqual(st.map((s) => [s.step_kind, s.status]), [["gm_review", "pending"], ["president_final", "waiting"]]);
  // 社長が先に承認しようとしても拒否（待機中）
  await assert.rejects(run("president", "select mgmt.decide_holiday_change_step($1,'approve')", [st[1].id]), /GMの事前確認が終わっていない/);
  // GM以外（社長・院長）は事前確認できない
  await assert.rejects(run("president", "select mgmt.decide_holiday_change_step($1,'approve')", [st[0].id]), /GMです/);
  await assert.rejects(run("mgr_IBARAKI", "select mgmt.decide_holiday_change_step($1,'approve')", [st[0].id]), /GMです/);
  assert.equal(await usageStatus(usage), "planned", "確定前は振休のまま");
  // GMが確認 → 社長のステップが承認待ちに
  assert.equal((await run("gm", "select mgmt.decide_holiday_change_step($1,'approve','人員計画上問題なし') s", [st[0].id]))[0].s, "pending_president");
  st = await steps(id);
  assert.deepEqual(st.map((s) => s.status), ["approved", "pending"]);
  assert.equal(await usageStatus(usage), "planned", "社長の承認前も振休のまま");
  await assert.rejects(run("gm", "select mgmt.decide_holiday_change_step($1,'approve')", [st[1].id]), /社長だけ/);
  // 社長が最終承認 → 確定。振休は「勤務に変更（消費）」で、残数は戻らない
  assert.equal((await run("president", "select mgmt.decide_holiday_change_step($1,'approve') s", [st[1].id]))[0].s, "approved");
  assert.equal((await reqRow(id)).status, "approved");
  assert.equal(await usageStatus(usage), "converted");
  const after = await shiftBal("staff_IBARAKI");
  assert.equal(after.after_planned, before.after_planned, "利用可能残数は変わらない（戻らない）");
  assert.equal(after.taken, before.taken + 1, "使ったこととして数える");
  // 変更済みの振休を含む申請は取り消せない
  const leaveReq = (await q("select leave_request_id from mgmt.leave_usage where id = $1", [usage])).rows[0].leave_request_id;
  await assert.rejects(run("staff_IBARAKI", "select mgmt.cancel_leave_request($1,'やっぱり休みたい')", [leaveReq]), /変更済み/);
  // 申請者・対象者・GMに通知
  const notified = (await q("select user_id from mgmt.notifications where kind = 'holiday_change_decided'")).rows.map((r) => r.user_id).sort();
  assert.deepEqual(notified, [org.u.gm, org.u.mgr_IBARAKI, org.u.staff_IBARAKI].sort());
});

test("申請の条件：自院の院長だけ。振休の取得予定だけ。同じ振休に2件は出せない", async () => {
  const { usage } = await plannedShift("staff_KORIEN", "mgr_KORIEN", FUT.work, FUT.off);
  const sub = (key, store = "KORIEN", u = usage) => run(key, "select mgmt.submit_holiday_change($1,$2,'09:00','12:00',0,'土曜の繁忙対応') id", [org.store[store], u]);
  for (const key of ["mgr_IBARAKI", "staff_KORIEN", "gm", "president"]) await assert.rejects(sub(key), /院長です/, key);
  await assert.rejects(sub("mgr_IBARAKI", "IBARAKI"), /この院のスタッフの振休ではありません/);
  // 候補一覧に出る
  const cand = await run("mgr_KORIEN", "select usage_id from mgmt.holiday_change_candidates($1)", [org.store.KORIEN]);
  assert.ok(cand.some((c) => c.usage_id === usage));
  await sub("mgr_KORIEN");
  await assert.rejects(sub("mgr_KORIEN"), /すでに変更の申請があります/);
  assert.ok(!(await run("mgr_KORIEN", "select usage_id from mgmt.holiday_change_candidates($1)", [org.store.KORIEN])).some((c) => c.usage_id === usage));
  // 有給の取得予定は対象外
  await run("president", "select mgmt.add_leave_grant($1,'PAID','2026-04-01',10,'statutory')", [org.u.staff_KORIEN]);
  const paid = (await run("staff_KORIEN", "select mgmt.submit_leave_request($1,'PAID',$2::date[]) id", [org.u.staff_KORIEN, [FUT.off2]]))[0].id;
  const ps = (await q("select id from mgmt.approval_steps where leave_request_id = $1", [paid])).rows[0];
  await run("president", "select mgmt.decide_leave_step($1,'approve')", [ps.id]);
  const pu = (await q("select id from mgmt.leave_usage where leave_request_id = $1", [paid])).rows[0].id;
  await assert.rejects(sub("mgr_KORIEN", "KORIEN", pu), /振休（振替・祝振替）の取得予定だけ/);
});

test("GMの差戻し→再申請はGMの確認からやり直し。却下は理由必須。取下げ。見る権限", async () => {
  const { usage, req } = await plannedShift("staff_TSUDA", "mgr_TSUDA", FUT.work, FUT.off3);
  const id = (await run("mgr_TSUDA", "select mgmt.submit_holiday_change($1,$2,'10:00','14:00',0,'研修日の補充') id", [org.store.TSUDA, usage]))[0].id;
  let st = await steps(id);
  await assert.rejects(run("gm", "select mgmt.decide_holiday_change_step($1,'return')", [st[0].id]), /理由/);
  await run("gm", "select mgmt.decide_holiday_change_step($1,'return','時間を確認してください')", [st[0].id]);
  assert.equal((await reqRow(id)).status, "returned");
  st = await steps(id);
  assert.deepEqual(st.map((s) => s.status), ["returned", "cancelled"]);
  await run("mgr_TSUDA", "select mgmt.resubmit_holiday_change($1,'10:00','13:00',0,'研修日の補充（午前のみ）')", [id]);
  st = await steps(id);
  assert.deepEqual(st.map((s) => [s.step_kind, s.status]).slice(2), [["gm_review", "pending"], ["president_final", "waiting"]]);
  // 承認待ち一覧：GMには出る、社長には出ない（まだGM確認前）
  const gmQ = await run("gm", "select request_id, step_kind from mgmt.my_holiday_change_queue()");
  assert.ok(gmQ.some((x) => x.request_id === id && x.step_kind === "gm_review"));
  assert.ok(!(await run("president", "select request_id from mgmt.my_holiday_change_queue()")).some((x) => x.request_id === id));
  // 見る権限：自院の院長・GM・社長・本人は見える、他院の院長は見えない
  const seen = async (key) => (await run(key, "select count(*)::int c from mgmt.holiday_change_requests where id = $1", [id]))[0].c;
  assert.deepEqual(await Promise.all(["mgr_TSUDA", "gm", "president", "staff_TSUDA"].map(seen)), [1, 1, 1, 1]);
  assert.equal(await seen("mgr_IBARAKI"), 0);
  // 取下げ → 振休は取得予定のまま
  await run("mgr_TSUDA", "select mgmt.withdraw_holiday_change($1)", [id]);
  assert.equal((await reqRow(id)).status, "withdrawn");
  assert.equal(await usageStatus(usage), "planned");
  // 振休を取り消してから最終承認しようとすると拒否
  const id2 = (await run("mgr_TSUDA", "select mgmt.submit_holiday_change($1,$2,'10:00','13:00',0,'再度の申請') id", [org.store.TSUDA, usage]))[0].id;
  const s2 = await steps(id2);
  await run("gm", "select mgmt.decide_holiday_change_step($1,'approve')", [s2[0].id]);
  await run("staff_TSUDA", "select mgmt.cancel_leave_request($1,'予定がなくなった')", [req]);
  const pres = (await steps(id2))[1];
  await assert.rejects(run("president", "select mgmt.decide_holiday_change_step($1,'approve')", [pres.id]), /取消・変更されている/);
});
